
const { askGemini }          = require('./gemini');
const { askGroq }            = require('./groq');
const { extractTextWithOCR } = require('./ocr');

const CLASS_HARD_CAPS = {
  ai_generated_image : 0,
  ai_generated       : 0,
  unrelated_image    : 0,
  illustration       : 0,
  artwork            : 0,
  code_image         : 0,
  screenshot         : 5,
  wrong_document     : 15,
  blank              : 0,
  no_image           : 0,
};

const FRAUD_KEYWORDS = [
  'ai-generated','ai generated','artificially generated','digitally generated',
  'computer generated','dall-e','midjourney','stable diffusion','diffusion model',
  'gan artifact','synthetic','not a real document','no paper texture',
  'smooth background','perfect lighting','too perfect','rendered text',
  'embedded text','digital mockup','no grain','template','mockup','composited',
];

function containsFraudKeyword(parsed) {
  const str   = JSON.stringify(parsed).toLowerCase();
  const found = FRAUD_KEYWORDS.filter(kw => str.includes(kw));
  if (found.length > 0) console.warn(`[SCORER] Fraud keywords: ${found.slice(0,3).join(', ')}`);
  return found.length > 0;
}

function calculateScore(parsed) {
  const fs  = parsed.forensic_signals || {};
  const cls = (parsed.document_classification || '').toLowerCase().trim();

  if (CLASS_HARD_CAPS[cls] !== undefined) {
    return {
      score: CLASS_HARD_CAPS[cls],
      penalties: [`"${cls}" hard capped to ${CLASS_HARD_CAPS[cls]}`],
      positives: [],
    };
  }
  if (fs.is_ai_generated === true || (fs.ai_generation_probability || 0) >= 75) {
    return { score: 0, penalties: [`AI generated (${fs.ai_generation_probability}%)`], positives: [] };
  }
  if (containsFraudKeyword(parsed)) {
    return { score: 5, penalties: ['Fraud keywords detected'], positives: [] };
  }

  let score = 0;
  const pen = [], pos = [];

  if (fs.has_paper_texture === true)                { score += 15; pos.push('+15 paper texture'); }
  if (fs.has_scan_artifacts === true)               { score += 10; pos.push('+10 scan artifacts'); }
  if (fs.has_natural_imperfections === true)        { score += 10; pos.push('+10 natural imperfections'); }
  if (fs.has_ink_variation === true)                { score += 8;  pos.push('+8 ink variation'); }
  if (fs.has_realistic_shadows === true)            { score += 7;  pos.push('+7 realistic shadows'); }
  if (fs.text_looks_printed_not_rendered === true)  { score += 10; pos.push('+10 printed text'); }
  if (fs.stamp_looks_authentic === true)            { score += 8;  pos.push('+8 authentic stamp'); }
  if (fs.signature_looks_authentic === true)        { score += 7;  pos.push('+7 authentic signature'); }
  if (parsed.is_relevant === true)                  { score += 8;  pos.push('+8 relevant'); }
  if (parsed.matches_campaign === true)             { score += 7;  pos.push('+7 matches campaign'); }

  if (fs.background_is_smooth_gradient === true)    { score -= 30; pen.push('-30 smooth bg'); }
  if (fs.lighting_is_too_perfect === true)          { score -= 25; pen.push('-25 perfect lighting'); }
  if (fs.fonts_are_perfectly_uniform === true)      { score -= 20; pen.push('-20 uniform fonts'); }
  if (fs.has_paper_texture === false)               { score -= 20; pen.push('-20 no paper texture'); }
  if (fs.has_scan_artifacts === false)              { score -= 10; pen.push('-10 no scan artifacts'); }
  if (fs.has_natural_imperfections === false)       { score -= 15; pen.push('-15 no imperfections'); }
  if (fs.text_looks_printed_not_rendered === false) { score -= 30; pen.push('-30 rendered text'); }
  if (fs.stamp_looks_authentic === false)           { score -= 35; pen.push('-35 fake stamp'); }
  if (fs.signature_looks_authentic === false)       { score -= 25; pen.push('-25 fake signature'); }
  if (parsed.fraud_detected === true)               { score -= 40; pen.push('-40 fraud detected'); }

  const tamp = fs.tampering_probability || 0;
  if (tamp >= 60)      { score -= 45; pen.push(`-45 high tamper (${tamp}%)`); }
  else if (tamp >= 40) { score -= 20; pen.push(`-20 mod tamper (${tamp}%)`); }

  const aiProb = fs.ai_generation_probability || 0;
  if (aiProb >= 50)      { score -= 35; pen.push(`-35 high AI prob (${aiProb}%)`); }
  else if (aiProb >= 30) { score -= 15; pen.push(`-15 mod AI prob (${aiProb}%)`); }

  const authCount = [fs.has_paper_texture, fs.has_scan_artifacts,
                     fs.has_natural_imperfections, fs.has_ink_variation]
                     .filter(v => v === true).length;
  if (authCount === 0) { score -= 20; pen.push('-20 zero authenticity signals'); }

  return { score: Math.max(0, Math.min(93, score)), penalties: pen, positives: pos };
}

function buildFinalResult(parsed, provider) {
  const { score, penalties, positives } = calculateScore(parsed);
  const fs = parsed.forensic_signals || {};

  const risk_label =
    score <= 20 ? 'HIGH_RISK_FRAUD'       :
    score <= 40 ? 'POSSIBLE_AI_GENERATED' :
    score <= 60 ? 'SUSPICIOUS'            :
    score <= 74 ? 'LOW_TRUST'             :
    score <= 85 ? 'PENDING_ADMIN_REVIEW'  : 'VERIFIED';

  const status   = score >= 75 ? 'pending_admin_review' : 'rejected';
  const decision = score >= 75 ? 'manual_review'        : 'reject';

  console.log(`[SCORER] ${provider} | class:${parsed.document_classification} | score:${score} | ${risk_label}`);

  return {
    document_classification: parsed.document_classification,
    confidence_score:        score,
    risk_label, status, decision,
    is_relevant:             parsed.is_relevant,
    matches_campaign:        parsed.matches_campaign,
    fraud_detected:          parsed.fraud_detected,
    forensic_analysis: {
      ai_generation_probability: fs.ai_generation_probability || 0,
      tampering_probability:     fs.tampering_probability     || 0,
      has_paper_texture:         fs.has_paper_texture,
      has_scan_artifacts:        fs.has_scan_artifacts,
      has_natural_imperfections: fs.has_natural_imperfections,
      stamp_looks_authentic:     fs.stamp_looks_authentic,
      signature_looks_authentic: fs.signature_looks_authentic,
    },
    score_breakdown: {
      starting_score:     0,
      positive_additions: positives.reduce((s,p)=>s+(parseInt(p)||0),0),
      penalties_applied:  penalties.reduce((s,p)=>s+Math.abs(parseInt(p)||0),0),
      final_score:        score,
    },
    penalties, positive_signals: positives,
    red_flags:   parsed.red_flags || [],
    reason:      parsed.reason    || '',
    ai_provider: provider,
  };
}

function preflightCheck(base64Image, mimeType) {
  if (!base64Image) return { pass: false, reason: 'No image', classification: 'no_image' };
  const bytes = (base64Image.length * 3) / 4;
  if (bytes < 5000)            return { pass: false, reason: 'Image too small', classification: 'blank' };
  if (bytes > 20*1024*1024)    return { pass: false, reason: 'Image too large', classification: 'blank' };
  const allowed = ['image/jpeg','image/jpg','image/png','image/webp'];
  if (mimeType && !allowed.includes(mimeType.toLowerCase()))
    return { pass: false, reason: `Bad format: ${mimeType}`, classification: 'no_image' };
  return { pass: true };
}

function safeParse(text) {
  if (!text) return null;
  try {
    const cleaned = text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : cleaned);
  } catch { return null; }
}

// ── IMPORTANT: `prompt` here is already the FULL prompt from the frontend.
// Do NOT call buildVerificationPrompt() — that would destroy the prompt
// by slicing it to 200 chars and re-wrapping it.
async function verifyDocument(prompt, base64Image, mimeType) {

  const pf = preflightCheck(base64Image, mimeType);
  if (!pf.pass) {
    console.warn(`[VERIFIER] Pre-flight failed: ${pf.reason}`);
    return buildFinalResult({
      document_classification: pf.classification,
      is_relevant: false, matches_campaign: false, fraud_detected: true,
      forensic_signals: { ai_generation_probability: 0, tampering_probability: 0 },
      red_flags: [pf.reason], reason: pf.reason,
    }, 'Pre-flight');
  }

  console.log(`[VERIFIER] Prompt: ${prompt.length} chars | Image: ${base64Image ? Math.round((base64Image.length*3/4)/1024)+'KB' : 'none'}`);

  // ── Step 1: Gemini (retries rate-limited combos automatically) ────────────
  console.log('[VERIFIER] ▶ Step 1: Gemini...');
  try {
    const raw    = await askGemini(prompt, base64Image, mimeType);
    const parsed = safeParse(raw);
    if (parsed) {
      console.log('[VERIFIER] ✅ Gemini succeeded');
      return buildFinalResult(parsed, 'Gemini Flash');
    }
  } catch (err) {
    console.error('[VERIFIER] ❌ Gemini exhausted:', err.message);
  }

  // ── Step 2: Groq ──────────────────────────────────────────────────────────
  console.log('[VERIFIER] ▶ Step 2: Groq...');
  try {
    const raw    = await askGroq(prompt, base64Image, mimeType);
    const parsed = safeParse(raw);
    if (parsed) {
      console.log('[VERIFIER] ✅ Groq succeeded');
      return buildFinalResult(parsed, 'Groq Llama-4 Scout');
    }
  } catch (err) {
    console.error('[VERIFIER] ❌ Groq failed:', err.message);
  }

  // ── Step 3: OCR ───────────────────────────────────────────────────────────
  console.log('[VERIFIER] ▶ Step 3: OCR fallback...');
  try {
    const raw    = await extractTextWithOCR(base64Image);
    const parsed = safeParse(raw);
    if (parsed) {
      console.log('[VERIFIER] ✅ OCR succeeded');
      return buildFinalResult(parsed, 'Tesseract OCR');
    }
  } catch (err) {
    console.error('[VERIFIER] ❌ OCR failed:', err.message);
  }

  return {
    status: 'pending_retry', confidence_score: 0,
    reason: 'All AI providers unavailable.',
    ai_provider: 'Service Outage', document_classification: 'unknown',
    decision: 'pending_retry', is_relevant: true, matches_campaign: true, fraud_detected: false,
  };
}

module.exports = { verifyDocument };