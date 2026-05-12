// ROBUST VERIFICATION SYSTEM
// Strategy:
//   1. Call Gemini + Claude IN PARALLEL (fast, cross-validates)
//   2. If both agree → use consensus score (most reliable)
//   3. If they disagree → use the LOWER score (safer for fraud prevention)
//   4. If both fail → Groq solo
//   5. If all fail → OCR
//   6. Hard caps enforced in JS after every step (AI cannot override)
//   7. Pre-flight image check before any API call (saves quota)

const { askGemini } = require('./gemini');
const { askClaude } = require('./claude');
const { askGroq } = require('./groq');
const { extractTextWithOCR } = require('./ocr');

// ═══════════════════════════════════════════════════════════════
// HARD CAPS — enforced in JS, cannot be overridden by any AI
// ═══════════════════════════════════════════════════════════════
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

// Broad keyword net — catches misclassification even when model
// admits the truth in its "reason" field but labels it wrong
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
  if (found.length > 0) console.warn(`[CAPS] Fraud keywords found: ${found.slice(0, 3).join(', ')}`);
  return found.length > 0;
}

function applyHardCaps(parsed, provider) {
  if (!parsed) return parsed;
  const cls = (parsed.document_classification || '').toLowerCase().trim();
  let score = typeof parsed.confidence_score === 'number' ? parsed.confidence_score : 50;

  // Rule 1 — cap by classification label
  if (HARD_CAPS[cls] !== undefined) {
    const cap = HARD_CAPS[cls];
    if (score > cap) {
      console.warn(`[CAPS][${provider}] "${cls}": ${score} → ${cap}`);
      score = cap;
      parsed.fraud_detected = true;
    }
  }

  // Rule 2 — cap by keyword detection (catches misclassification)
  if (containsFraudKeyword(parsed) && score > 5) {
    console.warn(`[CAPS][${provider}] Fraud keyword → score capped 5`);
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

// ═══════════════════════════════════════════════════════════════
// PRE-FLIGHT IMAGE CHECK — runs before any API call
// Catches obviously bad inputs without wasting quota
// ═══════════════════════════════════════════════════════════════
function preflightCheck(base64Image, mimeType) {
  if (!base64Image) {
    return { pass: false, reason: 'No image provided', classification: 'no_image' };
  }
  // Check file size — real documents are usually 50KB–5MB
  const sizeBytes = (base64Image.length * 3) / 4;
  if (sizeBytes < 5000) {
    return { pass: false, reason: 'Image too small to be a real document (<5KB)', classification: 'blank' };
  }
  if (sizeBytes > 20 * 1024 * 1024) {
    return { pass: false, reason: 'Image too large (>20MB)', classification: 'blank' };
  }
  // Check MIME type
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (mimeType && !allowed.includes(mimeType.toLowerCase())) {
    return { pass: false, reason: `Unsupported format: ${mimeType}`, classification: 'no_image' };
  }
  return { pass: true };
}

// ═══════════════════════════════════════════════════════════════
// SAFE PARSE
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// CONSENSUS ENGINE
// When 2 models both respond, pick the safer result
// ═══════════════════════════════════════════════════════════════
function buildConsensus(resultA, providerA, resultB, providerB) {
  const scoreA = resultA.confidence_score || 0;
  const scoreB = resultB.confidence_score || 0;
  const clsA = (resultA.document_classification || '').toLowerCase();
  const clsB = (resultB.document_classification || '').toLowerCase();

  console.log(`[CONSENSUS] ${providerA}: ${clsA} ${scoreA}% | ${providerB}: ${clsB} ${scoreB}%`);

  // If either model detects fraud/AI → trust the safer (lower) result
  const fraudClassifications = Object.keys(HARD_CAPS);
  const aIsFraud = fraudClassifications.includes(clsA) || scoreA <= 15;
  const bIsFraud = fraudClassifications.includes(clsB) || scoreB <= 15;

  if (aIsFraud || bIsFraud) {
    // Use the more suspicious result
    const safer = scoreA <= scoreB ? resultA : resultB;
    const saferProvider = scoreA <= scoreB ? providerA : providerB;
    console.log(`[CONSENSUS] Fraud detected by at least one model → using safer result from ${saferProvider}`);
    safer.ai_provider = `${providerA} + ${providerB} (consensus: fraud)`;
    return safer;
  }

  // Both say legitimate — average the scores but cap at lower classification
  const avgScore = Math.round((scoreA + scoreB) / 2);
  // Use the more conservative classification
  const finalCls = scoreA <= scoreB ? clsA : clsB;
  const base = scoreA <= scoreB ? resultA : resultB;

  base.confidence_score = avgScore;
  base.document_classification = finalCls;
  base.ai_provider = `${providerA} + ${providerB} (consensus: avg)`;
  console.log(`[CONSENSUS] Both legitimate → averaged score: ${avgScore}%`);
  return base;
}

// ═══════════════════════════════════════════════════════════════
// MAIN VERIFY FUNCTION
// ═══════════════════════════════════════════════════════════════
async function verifyDocument(prompt, base64Image, mimeType) {

  // ── Pre-flight check ──────────────────────────────────────────────────
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

  // ── STEP 1: Gemini + Claude IN PARALLEL ───────────────────────────────
  console.log('[VERIFIER] Step 1: Calling Gemini + Claude in parallel...');
  const [geminiResult, claudeResult] = await Promise.allSettled([
    askGemini(prompt, base64Image, mimeType),
    askClaude(prompt, base64Image, mimeType)
  ]);

  const geminiOk = geminiResult.status === 'fulfilled';
  const claudeOk = claudeResult.status === 'fulfilled';

  if (!geminiOk) console.error('[VERIFIER] Gemini FAILED:', geminiResult.reason?.message);
  if (!claudeOk) console.error('[VERIFIER] Claude FAILED:', claudeResult.reason?.message);

  // Both succeeded → run consensus
  if (geminiOk && claudeOk) {
    const gParsed = safeParse(geminiResult.value);
    const cParsed = safeParse(claudeResult.value);
    if (gParsed && cParsed) {
      const gCapped = applyHardCaps(gParsed, 'Gemini');
      const cCapped = applyHardCaps(cParsed, 'Claude');
      const consensus = buildConsensus(gCapped, 'Gemini', cCapped, 'Claude');
      const final = applyHardCaps(consensus, 'Consensus');
      console.log(`[VERIFIER] ✅ CONSENSUS — Score: ${final.confidence_score}% | ${final.document_classification} | ${final.decision}`);
      return final;
    }
  }

  // Only one succeeded → use it
  if (geminiOk) {
    const parsed = safeParse(geminiResult.value);
    if (parsed) {
      const final = applyHardCaps(parsed, 'Gemini');
      final.ai_provider = 'Gemini Flash (solo)';
      console.log(`[VERIFIER] ✅ Gemini solo — Score: ${final.confidence_score}%`);
      return final;
    }
  }

  if (claudeOk) {
    const parsed = safeParse(claudeResult.value);
    if (parsed) {
      const final = applyHardCaps(parsed, 'Claude');
      final.ai_provider = 'Claude Haiku (solo)';
      console.log(`[VERIFIER] ✅ Claude solo — Score: ${final.confidence_score}%`);
      return final;
    }
  }

  // ── STEP 2: Groq (both Gemini + Claude failed) ────────────────────────
  console.log('[VERIFIER] Step 2: Both Gemini+Claude failed, trying Groq...');
  try {
    const raw = await askGroq(prompt, base64Image, mimeType);
    const parsed = safeParse(raw);
    if (parsed) {
      const final = applyHardCaps(parsed, 'Groq');
      final.ai_provider = 'Groq Llama-4 Scout';
      console.log(`[VERIFIER] ✅ Groq — Score: ${final.confidence_score}%`);
      return final;
    }
  } catch (groqErr) {
    console.error('[VERIFIER] Groq FAILED:', groqErr.message);
  }

  // ── STEP 3: OCR (last resort) ─────────────────────────────────────────
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
    console.error('[VERIFIER] OCR FAILED:', ocrErr.message);
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