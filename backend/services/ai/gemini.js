const { GoogleGenerativeAI } = require('@google/generative-ai');
const { buildVerificationPrompt } = require('./prompt');

const MODEL_CASCADE = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-preview-04-17',
];

// ══════════════════════════════════════════════════════════
// HARD CAPS — enforced in JS code, AI cannot override these
// ══════════════════════════════════════════════════════════
const CLASS_CAPS = {
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

// Keyword net — catches misclassification where model admits AI in reason
const FRAUD_KEYWORDS = [
  'ai-generated','ai generated','artificially generated','digitally generated',
  'digitally created','computer generated','dall-e','midjourney','stable diffusion',
  'diffusion model','diffusion artifact','gan artifact','synthetic image',
  'machine generated','not a real document','no paper texture','no physical',
  'smooth background','perfect lighting','too perfect','overly perfect',
  'rendered text','embedded text','digital mockup','no grain','no imperfection',
  'no scan','no noise','surreal quality','artistic quality',
  'template','mockup','stock image','stock photo','watermark',
  'photoshop','composited','digitally placed','pixel perfect',
];

function containsFraudKeyword(parsed) {
  const str   = JSON.stringify(parsed).toLowerCase();
  const found = FRAUD_KEYWORDS.filter(kw => str.includes(kw));
  if (found.length > 0) console.warn(`[GEMINI CAPS] Fraud keywords: ${found.slice(0,3).join(', ')}`);
  return found.length > 0;
}

function applyHardCaps(parsed, provider) {
  if (!parsed) return parsed;
  const cls   = (parsed.document_classification || '').toLowerCase().trim();
  let   score = typeof parsed.confidence_score === 'number' ? parsed.confidence_score : 0;

  // Cap by classification
  if (CLASS_CAPS[cls] !== undefined) {
    const cap = CLASS_CAPS[cls];
    if (score > cap) {
      console.warn(`[${provider} CAPS] "${cls}": ${score} → ${cap}`);
      score = cap;
      parsed.fraud_detected = true;
    }
  }

  // Cap by AI keyword detection
  if (containsFraudKeyword(parsed) && score > 5) {
    console.warn(`[${provider} CAPS] Fraud keyword detected → score capped to 5`);
    score = 5;
    parsed.document_classification = 'ai_generated_image';
    parsed.fraud_detected = true;
  }

  // Forensic hard rules
  const fa = parsed.forensic_analysis || {};
  if ((fa.ai_generation_probability || 0) >= 75) {
    score = Math.min(score, 10);
    parsed.fraud_detected = true;
    console.warn(`[${provider} CAPS] AI prob >= 75% → capped to 10`);
  }
  if ((fa.tampering_probability || 0) >= 60) {
    score = Math.min(score, 20);
    parsed.fraud_detected = true;
    console.warn(`[${provider} CAPS] Tampering >= 60% → capped to 20`);
  }

  // Flag-based caps
  if (parsed.fraud_detected === true)    score = Math.min(score, 5);
  if (parsed.is_relevant === false)      score = Math.min(score, 10);
  if (parsed.matches_campaign === false) score = Math.min(score, 20);

  // Hard cap at 93 (no doc is perfect)
  score = Math.min(score, 93);

  parsed.confidence_score = score;

  // Threshold: 75+ = admin review, below = rejected
  parsed.status   = score >= 75 ? 'pending_admin_review' : 'rejected';
  parsed.decision = score >= 75 ? 'manual_review'        : 'reject';

  // Risk label
  if      (score <= 20) parsed.risk_label = 'HIGH_RISK_FRAUD';
  else if (score <= 40) parsed.risk_label = 'POSSIBLE_AI_GENERATED';
  else if (score <= 60) parsed.risk_label = 'SUSPICIOUS';
  else if (score <= 74) parsed.risk_label = 'LOW_TRUST';
  else if (score <= 85) parsed.risk_label = 'PENDING_ADMIN_REVIEW';
  else                  parsed.risk_label = 'VERIFIED';

  return parsed;
}

function safeParse(text) {
  if (!text) return null;
  try {
    const cleaned = text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : cleaned);
  } catch { return null; }
}

function getGeminiKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY)   keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY_2) keys.push(process.env.GEMINI_API_KEY_2);
  if (process.env.GEMINI_API_KEY_3) keys.push(process.env.GEMINI_API_KEY_3);
  if (process.env.GEMINI_API_KEY_4) keys.push(process.env.GEMINI_API_KEY_4);
  const unique = [...new Set(keys.filter(Boolean))];
  console.log(`[GEMINI] Found ${unique.length} key(s)`);
  return unique;
}

async function tryKeyWithModel(key, keyIdx, modelName, prompt, base64Image, mimeType) {
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: modelName });

  const parts = [];
  if (base64Image && mimeType) {
    parts.push({ inlineData: { data: base64Image, mimeType } });
  }
  parts.push({ text: prompt });

  console.log(`[GEMINI] Key ${keyIdx} | Model: ${modelName} ...`);
  const result = await model.generateContent(parts);
  const text   = result.response.text();
  if (!text || !text.trim()) throw new Error('EMPTY_RESPONSE');

  const parsed = safeParse(text);
  if (parsed) {
    const capped = applyHardCaps(parsed, 'Gemini');
    console.log(`[GEMINI] ✅ Key ${keyIdx}+${modelName} | class:${capped.document_classification} | score:${capped.confidence_score} | risk:${capped.risk_label}`);
    return JSON.stringify(capped);
  }
  return text;
}

async function askGemini(prompt, base64Image = null, mimeType = null) {
  const keys       = getGeminiKeys();
  const fullPrompt = buildVerificationPrompt(prompt);
  if (keys.length === 0) throw new Error('GEMINI_KEY_MISSING');

  for (let ki = 0; ki < keys.length; ki++) {
    for (const modelName of MODEL_CASCADE) {
      try {
        return await tryKeyWithModel(keys[ki], ki+1, modelName, fullPrompt, base64Image, mimeType);
      } catch (err) {
        const m        = (err.message || '').toLowerCase();
        const modelGone = m.includes('not found')||m.includes('404')||m.includes('unsupported')||m.includes('does not exist')||m.includes('is not supported');
        const keyDead   = m.includes('expired')||m.includes('api_key_invalid')||m.includes('api key')||m.includes('permission denied')||m.includes('403');
        const quota     = m.includes('429')||m.includes('quota')||m.includes('rate limit')||m.includes('resource_exhausted');
        console.error(`[GEMINI] Key ${ki+1} + ${modelName} FAILED: ${err.message}`);
        if (modelGone)         continue;
        if (keyDead || quota)  break;
      }
    }
  }
  throw new Error('ALL_GEMINI_COMBINATIONS_FAILED');
}

module.exports = { askGemini, applyHardCaps };