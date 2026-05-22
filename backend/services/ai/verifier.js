// VERIFICATION CHAIN: Gemini → Groq → OCR
//
// KEY DESIGN:
//  1. The prompt is built ONCE here (in verifyDocument) using buildVerificationPrompt.
//  2. The fully-built prompt is passed directly to askGemini / askGroq.
//  3. AI modules NEVER call buildVerificationPrompt themselves — no double-wrapping.
//  4. All scoring is deterministic JS — no AI bias/randomness in scores.

const { askGemini }              = require('./gemini');
const { askGroq }                = require('./groq');
const { extractTextWithOCR }     = require('./ocr');
const { buildVerificationPrompt } = require('./prompt');

// ══════════════════════════════════════════════════════════
// HARD CAPS BY CLASSIFICATION
// ══════════════════════════════════════════════════════════
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
  'digitally created','computer generated','dall-e','midjourney','stable diffusion',
  'diffusion model','gan artifact','synthetic','not a real document',
  'no paper texture','smooth background','perfect lighting','too perfect',
  'rendered text','embedded text','digital mockup','no grain','no imperfection',
  'template','mockup','stock image','watermark','photoshop','composited',
];

function containsFraudKeyword(parsed) {
  const str   = JSON.stringify(parsed).toLowerCase();
  const found = FRAUD_KEYWORDS.filter(kw => str.includes(kw));
  if (found.length > 0) console.warn(`[SCORER] Fraud keywords: ${found.slice(0, 3).join(', ')}`);
  return found.length > 0;
}

// ══════════════════════════════════════════════════════════
// DETERMINISTIC SCORER
// ══════════════════════════════════════════════════════════
function calculateScore(parsed) {
  const fs  = parsed.forensic_signals || {};
  const cls = (parsed.document_classification || '').toLowerCase().trim();

  if (CLASS_HARD_CAPS[cls] !== undefined) {
    return {
      score: CLASS_HARD_CAPS[cls],
      penalties: [`Classification "${cls}" → hard capped to ${CLASS_HARD_CAPS[cls]}`],
      positives: [],
    };
  }

  if (fs.is_ai_generated === true || (fs.ai_generation_probability || 0) >= 75) {
    return {
      score: 0,
      penalties: [`AI generation detected (prob: ${fs.ai_generation_probability}%) → score 0`],
      positives: [],
    };
  }

  if (containsFraudKeyword(parsed)) {
    return {
      score: 5,
      penalties: ['Fraud keywords detected in AI response → capped to 5'],
      positives: [],
    };
  }

  let score = 0;
  const pen = [];
  const pos = [];

  // Positive signals
  if (fs.has_paper_texture === true)                { score += 15; pos.push('+15 Paper texture visible'); }
  if (fs.has_scan_artifacts === true)               { score += 10; pos.push('+10 Scan artifacts present'); }
  if (fs.has_natural_imperfections === true)        { score += 10; pos.push('+10 Natural imperfections'); }
  if (fs.has_ink_variation === true)                { score += 8;  pos.push('+8 Ink variation detected'); }
  if (fs.has_realistic_shadows === true)            { score += 7;  pos.push('+7 Realistic shadows'); }
  if (fs.text_looks_printed_not_rendered === true)  { score += 10; pos.push('+10 Text looks physically printed'); }
  if (fs.stamp_looks_authentic === true)            { score += 8;  pos.push('+8 Stamp appears authentic'); }
  if (fs.signature_looks_authentic === true)        { score += 7;  pos.push('+7 Signature appears authentic'); }
  if (parsed.is_relevant === true)                  { score += 8;  pos.push('+8 Relevant to campaign'); }
  if (parsed.matches_campaign === true)             { score += 7;  pos.push('+7 Matches campaign details'); }

  // Negative signals
  if (fs.background_is_smooth_gradient === true)    { score -= 30; pen.push('-30 Smooth gradient background (AI symptom)'); }
  if (fs.lighting_is_too_perfect === true)          { score -= 25; pen.push('-25 Perfect lighting (AI symptom)'); }
  if (fs.fonts_are_perfectly_uniform === true)      { score -= 20; pen.push('-20 Perfectly uniform fonts (AI symptom)'); }
  if (fs.has_paper_texture === false)               { score -= 20; pen.push('-20 No paper texture'); }
  if (fs.has_scan_artifacts === false)              { score -= 10; pen.push('-10 No scan artifacts'); }
  if (fs.has_natural_imperfections === false)       { score -= 15; pen.push('-15 No natural imperfections'); }
  if (fs.text_looks_printed_not_rendered === false) { score -= 30; pen.push('-30 Text looks rendered not printed'); }
  if (fs.stamp_looks_authentic === false)           { score -= 35; pen.push('-35 Stamp looks fake/digital'); }
  if (fs.signature_looks_authentic === false)       { score -= 25; pen.push('-25 Signature looks artificial'); }
  if (parsed.fraud_detected === true)               { score -= 40; pen.push('-40 Fraud explicitly detected'); }

  const tamp = fs.tampering_probability || 0;
  if (tamp >= 60)      { score -= 45; pen.push(`-45 High tampering probability (${tamp}%)`); }
  else if (tamp >= 40) { score -= 20; pen.push(`-20 Moderate tampering probability (${tamp}%)`); }

  const aiProb = fs.ai_generation_probability || 0;
  if (aiProb >= 50)      { score -= 35; pen.push(`-35 High AI probability (${aiProb}%)`); }
  else if (aiProb >= 30) { score -= 15; pen.push(`-15 Moderate AI probability (${aiProb}%)`); }

  const authSignals = [
    fs.has_paper_texture, fs.has_scan_artifacts,
    fs.has_natural_imperfections, fs.has_ink_variation,
  ].filter(v => v === true).length;

  if (authSignals === 0) {
    score -= 20;
    pen.push('-20 Zero authenticity signals confirmed');
  }

  return { score: Math.max(0, Math.min(93, score)), penalties: pen, positives: pos };
}

function buildFinalResult(parsed, provider) {
  const { score, penalties, positives } = calculateScore(parsed);
  const fs = parsed.forensic_signals || {};

  let risk_label;
  if      (score <= 20) risk_label = 'HIGH_RISK_FRAUD';
  else if (score <= 40) risk_label = 'POSSIBLE_AI_GENERATED';
  else if (score <= 60) risk_label = 'SUSPICIOUS';
  else if (score <= 74) risk_label = 'LOW_TRUST';
  else if (score <= 85) risk_label = 'PENDING_ADMIN_REVIEW';
  else                  risk_label = 'VERIFIED';

  const status   = score >= 75 ? 'pending_admin_review' : 'rejected';
  const decision = score >= 75 ? 'manual_review'        : 'reject';

  console.log(`[SCORER] ✅ ${provider} | class:${parsed.document_classification} | score:${score} | risk:${risk_label} | ${decision}`);

  return {
    document_classification: parsed.document_classification,
    confidence_score:        score,
    risk_label,
    status,
    decision,
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
      positive_additions: positives.reduce((s, p) => s + (parseInt(p) || 0), 0),
      penalties_applied:  penalties.reduce((s, p) => s + Math.abs(parseInt(p) || 0), 0),
      final_score:        score,
    },
    penalties,
    positive_signals: positives,
    red_flags:   parsed.red_flags  || [],
    reason:      parsed.reason     || '',
    ai_provider: provider,
  };
}

// ══════════════════════════════════════════════════════════
// PRE-FLIGHT CHECK
// ══════════════════════════════════════════════════════════
function preflightCheck(base64Image, mimeType) {
  if (!base64Image)
    return { pass: false, reason: 'No image provided', classification: 'no_image' };

  const sizeBytes = (base64Image.length * 3) / 4;
  if (sizeBytes < 5000)
    return { pass: false, reason: 'Image too small (<5KB)', classification: 'blank' };
  if (sizeBytes > 20 * 1024 * 1024)
    return { pass: false, reason: 'Image too large (>20MB)', classification: 'blank' };

  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (mimeType && !allowed.includes(mimeType.toLowerCase()))
    return { pass: false, reason: `Unsupported format: ${mimeType}`, classification: 'no_image' };

  return { pass: true };
}

function safeParse(text) {
  if (!text) return null;
  try {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : cleaned);
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════
// MAIN VERIFY FUNCTION
// ══════════════════════════════════════════════════════════
async function verifyDocument(campaignContext, base64Image, mimeType) {

  // Pre-flight
  const pf = preflightCheck(base64Image, mimeType);
  if (!pf.pass) {
    console.warn(`[VERIFIER] Pre-flight FAILED: ${pf.reason}`);
    return buildFinalResult({
      document_classification: pf.classification,
      is_relevant: false,
      matches_campaign: false,
      fraud_detected: true,
      forensic_signals: { ai_generation_probability: 0, tampering_probability: 0 },
      red_flags: [pf.reason],
      reason: pf.reason,
    }, 'Pre-flight');
  }

  // Build the full prompt ONCE here — AI modules receive the finished prompt directly
  const fullPrompt = buildVerificationPrompt(campaignContext);

  // ── STEP 1: Gemini (all keys × all models) ───────────────
  console.log('[VERIFIER] ▶ Step 1: Trying Gemini...');
  try {
    const raw    = await askGemini(fullPrompt, base64Image, mimeType);
    const parsed = safeParse(raw);
    if (parsed) {
      console.log('[VERIFIER] ✅ Gemini succeeded');
      return buildFinalResult(parsed, 'Gemini Flash');
    }
  } catch (err) {
    console.error('[VERIFIER] ❌ ALL Gemini combinations failed:', err.message);
  }

  // ── STEP 2: Groq ──────────────────────────────────────────
  console.log('[VERIFIER] ▶ Step 2: Gemini exhausted, trying Groq...');
  try {
    const raw    = await askGroq(fullPrompt, base64Image, mimeType);
    const parsed = safeParse(raw);
    if (parsed) {
      console.log('[VERIFIER] ✅ Groq succeeded');
      return buildFinalResult(parsed, 'Groq Llama-4 Scout');
    }
  } catch (err) {
    console.error('[VERIFIER] ❌ Groq FAILED:', err.message);
  }

  // ── STEP 3: OCR fallback ──────────────────────────────────
  console.log('[VERIFIER] ▶ Step 3: All AI failed, trying OCR fallback...');
  try {
    const raw    = await extractTextWithOCR(base64Image);
    const parsed = safeParse(raw);
    if (parsed) {
      console.log('[VERIFIER] ✅ OCR succeeded');
      return buildFinalResult(parsed, 'Tesseract OCR (fallback)');
    }
  } catch (err) {
    console.error('[VERIFIER] ❌ OCR FAILED:', err.message);
  }

  // All failed
  console.error('[VERIFIER] 🔴 All providers failed — returning pending_retry');
  return {
    status:                  'pending_retry',
    confidence_score:        0,
    risk_label:              'HIGH_RISK_FRAUD',
    reason:                  'All AI providers unavailable. Queued for retry.',
    ai_provider:             'Service Outage',
    document_classification: 'unknown',
    decision:                'pending_retry',
    is_relevant:             true,
    matches_campaign:        true,
    fraud_detected:          false,
  };
}

module.exports = { verifyDocument };