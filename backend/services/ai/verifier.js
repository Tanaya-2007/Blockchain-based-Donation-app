// prompt arrives ALREADY built — do NOT call buildVerificationPrompt()
const { askGemini }          = require('./gemini');
const { askGroq }            = require('./groq');
const { extractTextWithOCR } = require('./ocr');

const CLASS_CAPS = {
  ai_generated_image:0, ai_generated:0, unrelated_image:0,
  illustration:0, artwork:0, code_image:0, screenshot:5,
  wrong_document:15, blank:0, no_image:0,
};
const FRAUD_KW = [
  'ai-generated','ai generated','digitally generated','computer generated',
  'dall-e','midjourney','stable diffusion','diffusion model','gan artifact',
  'synthetic','not a real document','no paper texture','smooth background',
  'perfect lighting','too perfect','rendered text','digital mockup',
  'no grain','template','mockup','composited',
];

function hasFraudKW(p) {
  const s = JSON.stringify(p).toLowerCase();
  return FRAUD_KW.some(k => s.includes(k));
}

function score(parsed) {
  const fs  = parsed.forensic_signals || {};
  const cls = (parsed.document_classification||'').toLowerCase().trim();

  if (CLASS_CAPS[cls] !== undefined)
    return { s: CLASS_CAPS[cls], pen: [`"${cls}" capped`], pos: [] };

  if (fs.is_ai_generated || (fs.ai_generation_probability||0) >= 75)
    return { s: 0, pen: [`AI generated (${fs.ai_generation_probability}%)`], pos: [] };

  if (hasFraudKW(parsed))
    return { s: 5, pen: ['Fraud keywords detected'], pos: [] };

  let s = 0; const pen = [], pos = [];

  if (fs.has_paper_texture===true)               { s+=15; pos.push('+15 paper'); }
  if (fs.has_scan_artifacts===true)              { s+=10; pos.push('+10 scan'); }
  if (fs.has_natural_imperfections===true)       { s+=10; pos.push('+10 imperfections'); }
  if (fs.has_ink_variation===true)               { s+=8;  pos.push('+8 ink'); }
  if (fs.has_realistic_shadows===true)           { s+=7;  pos.push('+7 shadows'); }
  if (fs.text_looks_printed_not_rendered===true) { s+=10; pos.push('+10 printed'); }
  if (fs.stamp_looks_authentic===true)           { s+=8;  pos.push('+8 stamp'); }
  if (fs.signature_looks_authentic===true)       { s+=7;  pos.push('+7 sig'); }
  if (parsed.is_relevant===true)                 { s+=8;  pos.push('+8 relevant'); }
  if (parsed.matches_campaign===true)            { s+=7;  pos.push('+7 campaign'); }

  if (fs.background_is_smooth_gradient===true)   { s-=30; pen.push('-30 smooth bg'); }
  if (fs.lighting_is_too_perfect===true)         { s-=25; pen.push('-25 lighting'); }
  if (fs.fonts_are_perfectly_uniform===true)     { s-=20; pen.push('-20 fonts'); }
  if (fs.has_paper_texture===false)              { s-=20; pen.push('-20 no paper'); }
  if (fs.has_scan_artifacts===false)             { s-=10; pen.push('-10 no scan'); }
  if (fs.has_natural_imperfections===false)      { s-=15; pen.push('-15 no imperfections'); }
  if (fs.text_looks_printed_not_rendered===false){ s-=30; pen.push('-30 rendered'); }
  if (fs.stamp_looks_authentic===false)          { s-=35; pen.push('-35 fake stamp'); }
  if (fs.signature_looks_authentic===false)      { s-=25; pen.push('-25 fake sig'); }
  if (parsed.fraud_detected===true)              { s-=40; pen.push('-40 fraud'); }

  const t = fs.tampering_probability||0;
  if (t>=60) { s-=45; pen.push(`-45 tamper(${t}%)`); }
  else if (t>=40) { s-=20; pen.push(`-20 tamper(${t}%)`); }

  const ai = fs.ai_generation_probability||0;
  if (ai>=50) { s-=35; pen.push(`-35 aiProb(${ai}%)`); }
  else if (ai>=30) { s-=15; pen.push(`-15 aiProb(${ai}%)`); }

  const auth = [fs.has_paper_texture, fs.has_scan_artifacts,
                fs.has_natural_imperfections, fs.has_ink_variation].filter(v=>v===true).length;
  if (!auth) { s-=20; pen.push('-20 no auth signals'); }

  return { s: Math.max(0, Math.min(93, s)), pen, pos };
}

function finalResult(parsed, provider) {
  const { s, pen, pos } = score(parsed);
  const fs = parsed.forensic_signals || {};

  const risk =
    s<=20?'HIGH_RISK_FRAUD': s<=40?'POSSIBLE_AI_GENERATED':
    s<=60?'SUSPICIOUS':      s<=74?'LOW_TRUST':
    s<=85?'PENDING_ADMIN_REVIEW':'VERIFIED';

  const status   = s >= 75 ? 'pending_admin_review' : 'rejected';
  const decision = s >= 75 ? 'manual_review'        : 'reject';

  console.log(`[SCORER] ${provider} | class:${parsed.document_classification} | score:${s} | ${risk}`);

  return {
    document_classification: parsed.document_classification,
    confidence_score: s, risk_label: risk, status, decision,
    is_relevant:      parsed.is_relevant,
    matches_campaign: parsed.matches_campaign,
    fraud_detected:   parsed.fraud_detected,
    forensic_analysis: {
      ai_generation_probability: fs.ai_generation_probability||0,
      tampering_probability:     fs.tampering_probability||0,
      has_paper_texture:         fs.has_paper_texture,
      has_scan_artifacts:        fs.has_scan_artifacts,
      has_natural_imperfections: fs.has_natural_imperfections,
      stamp_looks_authentic:     fs.stamp_looks_authentic,
      signature_looks_authentic: fs.signature_looks_authentic,
    },
    score_breakdown: { starting_score:0,
      positive_additions: pos.reduce((a,p)=>a+(parseInt(p)||0),0),
      penalties_applied:  pen.reduce((a,p)=>a+Math.abs(parseInt(p)||0),0),
      final_score: s },
    penalties: pen, positive_signals: pos,
    red_flags:   parsed.red_flags||[],
    reason:      parsed.reason||'',
    ai_provider: provider,
  };
}

function preflight(b64, mime) {
  if (!b64) return { pass:false, reason:'No image', cls:'no_image' };
  const bytes = (b64.length*3)/4;
  if (bytes < 5000)        return { pass:false, reason:'Too small', cls:'blank' };
  if (bytes > 20*1024*1024) return { pass:false, reason:'Too large', cls:'blank' };
  const ok = ['image/jpeg','image/jpg','image/png','image/webp'];
  if (mime && !ok.includes(mime.toLowerCase()))
    return { pass:false, reason:`Bad format: ${mime}`, cls:'no_image' };
  return { pass:true };
}

function sp(text) {
  if (!text) return null;
  try {
    const c = text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const m = c.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : c);
  } catch { return null; }
}

// ── MAIN: prompt is already the FULL prompt — never re-wrap it ────────────────
async function verifyDocument(prompt, base64Image, mimeType) {
  const pf = preflight(base64Image, mimeType);
  if (!pf.pass) {
    console.warn(`[VERIFIER] Preflight: ${pf.reason}`);
    return finalResult({
      document_classification: pf.cls, is_relevant:false,
      matches_campaign:false, fraud_detected:true,
      forensic_signals:{ ai_generation_probability:0, tampering_probability:0 },
      red_flags:[pf.reason], reason: pf.reason,
    }, 'Preflight');
  }

  console.log(`[VERIFIER] prompt=${prompt.length}chars | img=${base64Image ? Math.round((base64Image.length*3/4)/1024)+'KB' : 'none'}`);

  // Step 1: Gemini
  console.log('[VERIFIER] ▶ Gemini...');
  try {
    const raw = await askGemini(prompt, base64Image, mimeType);
    const p   = sp(raw);
    if (p) { console.log('[VERIFIER] ✅ Gemini'); return finalResult(p, 'Gemini Flash'); }
  } catch(e) { console.error('[VERIFIER] Gemini exhausted:', e.message); }

  // Step 2: Groq
  console.log('[VERIFIER] ▶ Groq...');
  try {
    const raw = await askGroq(prompt, base64Image, mimeType);
    const p   = sp(raw);
    if (p) { console.log('[VERIFIER] ✅ Groq'); return finalResult(p, 'Groq Llama-4 Scout'); }
  } catch(e) { console.error('[VERIFIER] Groq failed:', e.message); }

  // Step 3: OCR
  console.log('[VERIFIER] ▶ OCR...');
  try {
    const raw = await extractTextWithOCR(base64Image);
    const p   = sp(raw);
    if (p) { console.log('[VERIFIER] ✅ OCR'); return finalResult(p, 'Tesseract OCR'); }
  } catch(e) { console.error('[VERIFIER] OCR failed:', e.message); }

  return {
    status:'pending_retry', confidence_score:0, risk_label:'HIGH_RISK_FRAUD',
    reason:'All providers unavailable.', ai_provider:'Service Outage',
    document_classification:'unknown', decision:'pending_retry',
    is_relevant:true, matches_campaign:true, fraud_detected:false,
  };
}

module.exports = { verifyDocument };