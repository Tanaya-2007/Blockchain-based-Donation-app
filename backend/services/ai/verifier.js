// Chain: Gemini (parallel keys) → Groq Llama-4 → OCR
// Claude removed — insufficient credits
// Gemini keys rotate automatically inside askGemini()
// Hard caps enforced at every layer + final safety net here

const { askGemini } = require('./gemini');
const { askGroq } = require('./groq');
const { extractTextWithOCR } = require('./ocr');

// ═══ FINAL HARD CAPS — 3rd safety net after all providers ═══
const HARD_CAPS = {
  ai_generated_image: 0,
  ai_generated: 0,
  unrelated_image: 0,
  illustration: 0,
  artwork: 0,
  code_image: 0,
  screenshot: 5,
  wrong_document: 15,
  blank: 0,
  no_image: 0,
};

const FRAUD_KEYWORDS = [
  'ai-generated', 'ai generated', 'artificially generated', 'digitally generated',
  'digitally created', 'computer generated', 'computer-generated',
  'gemini generated', 'dall-e', 'midjourney', 'stable diffusion',
  'generated image', 'synthetic image', 'machine generated',
  'not a real document', 'not real', 'no paper texture', 'no physical',
  'smooth background', 'perfect lighting', 'too perfect', 'overly perfect',
  'rendered text', 'embedded text', 'digital artifact', 'digital mockup',
  'no grain', 'no imperfection', 'surreal quality', 'artistic quality',
  'illustration', 'artwork', 'painting', 'drawing', 'watermark',
  'template', 'mockup', 'stock image', 'stock photo'
];

function containsFraudKeyword(parsed) {
  const str = JSON.stringify(parsed).toLowerCase();
  const found = FRAUD_KEYWORDS.filter(kw => str.includes(kw));
  if (found.length > 0) console.warn(`[CAPS] Fraud keywords: ${found.slice(0, 3).join(', ')}`);
  return found.length > 0;
}

function applyHardCaps(parsed, provider) {
  if (!parsed) return parsed;
  const cls = (parsed.document_classification || '').toLowerCase().trim();
  let score = typeof parsed.confidence_score === 'number' ? parsed.confidence_score : 50;

  // Rule 1 — cap by classification
  if (HARD_CAPS[cls] !== undefined) {
    const cap = HARD_CAPS[cls];
    if (score > cap) {
      console.warn(`[CAPS][${provider}] "${cls}": ${score} → ${cap}`);
      score = cap;
      parsed.fraud_detected = true;
    }
  }

  // Rule 2 — cap by fraud keyword detection (catches misclassification)
  if (containsFraudKeyword(parsed) && score > 5) {
    console.warn(`[CAPS][${provider}] Fraud keyword → score capped to 5`);
    score = 5;
    parsed.document_classification = 'ai_generated_image';
    parsed.fraud_detected = true;
  }

  // Rule 3 — flag-based caps
  if (parsed.fraud_detected === true) score = Math.min(score, 5);
  if (parsed.is_relevant === false) score = Math.min(score, 10);
  if (parsed.matches_campaign === false) score = Math.min(score, 20);

  parsed.confidence_score = score;
  parsed.status = score >= 75 ? 'approved' : 'rejected';
  parsed.decision = score >= 75 ? 'manual_review' : 'reject';
  return parsed;
}

// ═══ PRE-FLIGHT CHECK ═══
function preflightCheck(base64Image, mimeType) {
  if (!base64Image) {
    return { pass: false, reason: 'No image provided', classification: 'no_image' };
  }
  const sizeBytes = (base64Image.length * 3) / 4;
  if (sizeBytes < 5000) {
    return { pass: false, reason: 'Image too small (<5KB)', classification: 'blank' };
  }
  if (sizeBytes > 20 * 1024 * 1024) {
    return { pass: false, reason: 'Image too large (>20MB)', classification: 'blank' };
  }
  return { pass: true };
}

function safeParse(text) {
  if (!text) return null;
  try {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : cleaned);
  } catch {
    return null;
  }
}

async function verifyDocument(prompt, base64Image, mimeType) {

  // ── Pre-flight ────────────────────────────────────────────────────────
  const preflight = preflightCheck(base64Image, mimeType);
  if (!preflight.pass) {
    console.warn(`[VERIFIER] Pre-flight FAILED: ${preflight.reason}`);
    return applyHardCaps({
      status: 'rejected',
      confidence_score: 0,
      reason: preflight.reason,
      ai_provider: 'Pre-flight Check',
      document_classification: preflight.classification,
      decision: 'reject',
      is_relevant: false,
      matches_campaign: false,
      fraud_detected: true
    }, 'Pre-flight');
  }

  // ── STEP 1: Gemini (rotates all keys × all models internally) ─────────
  console.log('[VERIFIER] Step 1: Calling Gemini...');
  try {
    const raw = await askGemini(prompt, base64Image, mimeType);
    const parsed = safeParse(raw);
    if (parsed) {
      const final = applyHardCaps(parsed, 'Gemini');
      final.ai_provider = 'Gemini Flash';
      console.log(`[VERIFIER] ✅ Gemini — Score: ${final.confidence_score}% | ${final.document_classification} | ${final.decision}`);
      return final;
    }
  } catch (geminiErr) {
    console.error('[VERIFIER] ❌ Gemini FAILED:', geminiErr.message);
  }

  // ── STEP 2: Groq Llama-4 Scout ────────────────────────────────────────
  console.log('[VERIFIER] Step 2: Gemini failed, trying Groq...');
  try {
    const raw = await askGroq(prompt, base64Image, mimeType);
    const parsed = safeParse(raw);
    if (parsed) {
      const final = applyHardCaps(parsed, 'Groq');
      final.ai_provider = 'Groq Llama-4 Scout';
      console.log(`[VERIFIER] ✅ Groq — Score: ${final.confidence_score}% | ${final.document_classification} | ${final.decision}`);
      return final;
    }
  } catch (groqErr) {
    console.error('[VERIFIER] ❌ Groq FAILED:', groqErr.message);
  }

  // ── STEP 3: OCR (local, zero network dependency) ──────────────────────
  console.log('[VERIFIER] Step 3: All AI failed, trying OCR...');
  try {
    const raw = await extractTextWithOCR(base64Image);
    const parsed = safeParse(raw);
    if (parsed) {
      const final = applyHardCaps(parsed, 'OCR');
      final.ai_provider = 'Tesseract OCR (fallback)';
      console.log(`[VERIFIER] ✅ OCR — Score: ${final.confidence_score}%`);
      return final;
    }
  } catch (ocrErr) {
    console.error('[VERIFIER] ❌ OCR FAILED:', ocrErr.message);
  }

  // ── All failed ────────────────────────────────────────────────────────
  return {
    status: 'pending_retry',
    confidence_score: 0,
    reason: 'All AI providers unavailable. Queued for automatic retry.',
    ai_provider: 'Service Outage',
    document_classification: 'unknown',
    decision: 'pending_retry',
    is_relevant: true,
    matches_campaign: true,
    fraud_detected: false
  };
}

module.exports = { verifyDocument };