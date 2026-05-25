// PROMPT FLOW (correct as of ProofUpload.jsx fix):
//   Frontend → sends ONLY campaignContext (short string)
//   ai.js    → calls verifyDocument(campaignContext, image, mime)
//   HERE     → builds full forensic prompt via buildVerificationPrompt()
//   gemini   → receives full prompt (never truncated)

const { askGemini }               = require('./gemini');
const { askGroq }                 = require('./groq');
const { extractTextWithOCR }      = require('./ocr');
const { buildVerificationPrompt } = require('./prompt');

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

function calculateScore(parsed) {
  const fs  = parsed.forensic_signals || {};
  const cls = (parsed.document_classification||'').toLowerCase().trim();

  if (CLASS_CAPS[cls] !== undefined)
    return { score: CLASS_CAPS[cls], pen: [`"${cls}" capped to ${CLASS_CAPS[cls]}`], pos: [] };

  if (fs.is_ai_generated || (fs.ai_generation_probability||0) >= 75)
    return { score:0, pen:[`AI generated (${fs.ai_generation_probability}%)`], pos:[] };

  if (hasFraudKW(parsed))
    return { score:5, pen:['Fraud keywords detected'], pos:[] };

  let score=0; const pen=[], pos=[];

  if (fs.has_paper_texture===true)                { score+=15; pos.push('+15 paper texture'); }
  if (fs.has_scan_artifacts===true)               { score+=10; pos.push('+10 scan artifacts'); }
  if (fs.has_natural_imperfections===true)        { score+=10; pos.push('+10 imperfections'); }
  if (fs.has_ink_variation===true)                { score+=8;  pos.push('+8 ink variation'); }
  if (fs.has_realistic_shadows===true)            { score+=7;  pos.push('+7 shadows'); }
  if (fs.text_looks_printed_not_rendered===true)  { score+=10; pos.push('+10 printed text'); }
  if (fs.stamp_looks_authentic===true)            { score+=8;  pos.push('+8 stamp'); }
  if (fs.signature_looks_authentic===true)        { score+=7;  pos.push('+7 signature'); }
  if (parsed.is_relevant===true)                  { score+=8;  pos.push('+8 relevant'); }
  if (parsed.matches_campaign===true)             { score+=7;  pos.push('+7 matches campaign'); }

  if (fs.background_is_smooth_gradient===true)    { score-=30; pen.push('-30 smooth bg'); }
  if (fs.lighting_is_too_perfect===true)          { score-=25; pen.push('-25 perfect lighting'); }
  if (fs.fonts_are_perfectly_uniform===true)      { score-=20; pen.push('-20 uniform fonts'); }
  if (fs.has_paper_texture===false)               { score-=20; pen.push('-20 no paper'); }
  if (fs.has_scan_artifacts===false)              { score-=10; pen.push('-10 no scan'); }
  if (fs.has_natural_imperfections===false)       { score-=15; pen.push('-15 no imperfections'); }
  if (fs.text_looks_printed_not_rendered===false) { score-=30; pen.push('-30 rendered text'); }
  if (fs.stamp_looks_authentic===false)           { score-=35; pen.push('-35 fake stamp'); }
  if (fs.signature_looks_authentic===false)       { score-=25; pen.push('-25 fake sig'); }
  if (parsed.fraud_detected===true)               { score-=40; pen.push('-40 fraud'); }

  const t=fs.tampering_probability||0;
  if (t>=60)      { score-=45; pen.push(`-45 tamper(${t}%)`); }
  else if (t>=40) { score-=20; pen.push(`-20 tamper(${t}%)`); }

  const ai=fs.ai_generation_probability||0;
  if (ai>=50)      { score-=35; pen.push(`-35 aiProb(${ai}%)`); }
  else if (ai>=30) { score-=15; pen.push(`-15 aiProb(${ai}%)`); }

  const auth=[fs.has_paper_texture, fs.has_scan_artifacts,
              fs.has_natural_imperfections, fs.has_ink_variation].filter(v=>v===true).length;
  if (!auth) { score-=20; pen.push('-20 zero auth signals'); }

  return { score: Math.max(0,Math.min(93,score)), pen, pos };
}

function buildFinalResult(parsed, provider) {
  const { score, pen, pos } = calculateScore(parsed);
  const fs = parsed.forensic_signals || {};

  const risk =
    score<=20?'HIGH_RISK_FRAUD': score<=40?'POSSIBLE_AI_GENERATED':
    score<=60?'SUSPICIOUS':      score<=74?'LOW_TRUST':
    score<=85?'PENDING_ADMIN_REVIEW':'VERIFIED';

  const status   = score >= 75 ? 'pending_admin_review' : 'rejected';
  const decision = score >= 75 ? 'manual_review'        : 'reject';

  // ── Rich terminal log — never reaches browser ────────────────────────────
  console.log('┌─────────────────────────────────────────────────');
  console.log(`│ [AI RESULT] Provider  : ${provider}`);
  console.log(`│ [AI RESULT] Class     : ${parsed.document_classification}`);
  console.log(`│ [AI RESULT] Score     : ${score}/93`);
  console.log(`│ [AI RESULT] Risk      : ${risk}`);
  console.log(`│ [AI RESULT] Decision  : ${decision}`);
  console.log(`│ [AI RESULT] AI prob   : ${fs.ai_generation_probability||0}%`);
  console.log(`│ [AI RESULT] Tamper    : ${fs.tampering_probability||0}%`);
  console.log(`│ [AI RESULT] Reason    : ${(parsed.reason||'').slice(0,80)}`);
  if (pen.length) console.log(`│ [AI RESULT] Penalties : ${pen.slice(0,4).join(' | ')}`);
  if (pos.length) console.log(`│ [AI RESULT] Positives : ${pos.slice(0,4).join(' | ')}`);
  console.log('└─────────────────────────────────────────────────');

  return {
    document_classification: parsed.document_classification,
    confidence_score: score, risk_label: risk, status, decision,
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
    score_breakdown: {
      starting_score:0,
      positive_additions: pos.reduce((a,p)=>a+(parseInt(p)||0),0),
      penalties_applied:  pen.reduce((a,p)=>a+Math.abs(parseInt(p)||0),0),
      final_score: score,
    },
    penalties: pen, positive_signals: pos,
    red_flags:   parsed.red_flags||[],
    reason:      parsed.reason||'',
    ai_provider: provider, // stripped by ai.js before reaching browser
  };
}

function preflight(b64, mime) {
  if (!b64) return { pass:false, reason:'No image', cls:'no_image' };
  const bytes=(b64.length*3)/4;
  if (bytes<5000)         return { pass:false, reason:'Too small (<5KB)', cls:'blank' };
  if (bytes>20*1024*1024) return { pass:false, reason:'Too large (>20MB)', cls:'blank' };
  const ok=['image/jpeg','image/jpg','image/png','image/webp'];
  if (mime && !ok.includes(mime.toLowerCase()))
    return { pass:false, reason:`Bad format: ${mime}`, cls:'no_image' };
  return { pass:true };
}

function sp(text) {
  if (!text) return null;
  try {
    const c=text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const m=c.match(/\{[\s\S]*\}/);
    return JSON.parse(m?m[0]:c);
  } catch { return null; }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
// `campaignContext` = short string from frontend like:
//   "Campaign: "Ram's kidney operation" | Milestone 2 | Amount: ₹15,000"
// buildVerificationPrompt() wraps it into the full forensic prompt for Gemini
async function verifyDocument(campaignContext, base64Image, mimeType) {
  const pf = preflight(base64Image, mimeType);
  if (!pf.pass) {
    console.warn(`[VERIFIER] Preflight failed: ${pf.reason}`);
    return buildFinalResult({
      document_classification: pf.cls, is_relevant:false,
      matches_campaign:false, fraud_detected:true,
      forensic_signals:{ ai_generation_probability:0, tampering_probability:0 },
      red_flags:[pf.reason], reason:pf.reason,
    }, 'Preflight');
  }

  // Build the full forensic prompt here — only place it's constructed
  const fullPrompt = buildVerificationPrompt(campaignContext);
  console.log(`[VERIFIER] Prompt built: ${fullPrompt.length} chars | Image: ${base64Image?Math.round((base64Image.length*3/4)/1024)+'KB':'none'}`);

  // Step 1 — Gemini (all keys × v1 + v1beta models, auto-retry on rate-limit)
  console.log('[VERIFIER] ▶ Trying Gemini...');
  try {
    const raw = await askGemini(fullPrompt, base64Image, mimeType);
    const p   = sp(raw);
    if (p) { console.log('[VERIFIER] ✅ Gemini succeeded'); return buildFinalResult(p, 'Gemini Flash'); }
  } catch(e) { console.error('[VERIFIER] ❌ Gemini exhausted:', e.message); }

  // Step 2 — Groq
  console.log('[VERIFIER] ▶ Trying Groq...');
  try {
    const raw = await askGroq(fullPrompt, base64Image, mimeType);
    const p   = sp(raw);
    if (p) { console.log('[VERIFIER] ✅ Groq succeeded'); return buildFinalResult(p, 'Groq Llama-4 Scout'); }
  } catch(e) { console.error('[VERIFIER] ❌ Groq failed:', e.message); }

  // Step 3 — OCR fallback
  console.log('[VERIFIER] ▶ Trying OCR fallback...');
  try {
    const raw = await extractTextWithOCR(base64Image);
    const p   = sp(raw);
    if (p) { console.log('[VERIFIER] ✅ OCR succeeded'); return buildFinalResult(p, 'Tesseract OCR'); }
  } catch(e) { console.error('[VERIFIER] ❌ OCR failed:', e.message); }

  return {
    status:'pending_retry', confidence_score:0, risk_label:'HIGH_RISK_FRAUD',
    reason:'All AI providers unavailable.',
    ai_provider:'Service Outage', document_classification:'unknown',
    decision:'pending_retry', is_relevant:true, matches_campaign:true, fraud_detected:false,
  };
}

module.exports = { verifyDocument };