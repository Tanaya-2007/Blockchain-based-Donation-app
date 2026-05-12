const { GoogleGenerativeAI } = require('@google/generative-ai');

// Tries newest → oldest. First model your free account supports wins.
const MODEL_CASCADE = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
];

// ═══ Same hard caps as groq.js — double safety net ═══
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

function enforceAllCaps(parsed) {
  if (!parsed) return parsed;
  const cls = (parsed.document_classification || '').toLowerCase().trim();
  if (HARD_CAPS[cls] !== undefined) {
    const cap = HARD_CAPS[cls];
    if ((parsed.confidence_score || 0) > cap) {
      console.warn(`[GEMINI CAPS] "${cls}" capped: ${parsed.confidence_score} → ${cap}`);
      parsed.confidence_score = cap;
    }
  }
  if (parsed.fraud_detected === true) {
    parsed.confidence_score = Math.min(parsed.confidence_score || 0, 5);
  }
  if (parsed.is_relevant === false) {
    parsed.confidence_score = Math.min(parsed.confidence_score || 0, 10);
  }
  if (parsed.matches_campaign === false) {
    parsed.confidence_score = Math.min(parsed.confidence_score || 0, 20);
  }
  const score = parsed.confidence_score || 0;
  parsed.status = score >= 75 ? 'approved' : 'rejected';
  parsed.decision = score >= 75 ? 'manual_review' : 'reject';
  return parsed;
}

function safeParse(text) {
  if (!text) return null;
  try {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : cleaned);
  } catch { return null; }
}

function getGeminiKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY_2) keys.push(process.env.GEMINI_API_KEY_2);
  if (process.env.GEMINI_API_KEY_3) keys.push(process.env.GEMINI_API_KEY_3);
  if (process.env.GEMINI_API_KEY_4) keys.push(process.env.GEMINI_API_KEY_4);
  const unique = [...new Set(keys.filter(Boolean))];
  console.log(`[GEMINI] Found ${unique.length} key(s) in .env`);
  return unique;
}

async function tryKeyWithModel(key, keyIdx, modelName, prompt, base64Image, mimeType) {
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: modelName });

  const parts = [];
  if (base64Image && mimeType) {
    parts.push({ inlineData: { data: base64Image, mimeType } });
  }
  parts.push({
    text: prompt + `\n\n
STRICT RULES:
- AI-generated images MUST score 0. No exceptions.
- Unrelated photos/illustrations MUST score 0-5.
- Only real photographed/scanned paper documents can score above 40.
- Threshold for admin review is 75. Below 75 = rejected.

Respond ONLY in valid JSON with these fields:
{
  "document_classification": "correct_document|wrong_document|ai_generated_image|unrelated_image|code_image|screenshot|blank",
  "confidence_score": <0-100>,
  "is_relevant": <true|false>,
  "matches_campaign": <true|false>,
  "fraud_detected": <true|false>,
  "reason": "<one sentence>",
  "red_flags": ["<observation>"],
  "status": "approved|rejected",
  "decision": "manual_review|reject"
}`
  });

  console.log(`[GEMINI] Key ${keyIdx} | Model: ${modelName} ...`);
  const result = await model.generateContent(parts);
  const text = result.response.text();
  if (!text || !text.trim()) throw new Error('EMPTY_RESPONSE');

  // Parse and apply hard caps immediately
  const parsed = safeParse(text);
  if (parsed) {
    const capped = enforceAllCaps(parsed);
    console.log(`[GEMINI] ✅ Key ${keyIdx} + ${modelName} SUCCESS | class: ${capped.document_classification} | score: ${capped.confidence_score}`);
    return JSON.stringify(capped);
  }

  // If parse fails return raw — verifier will handle
  console.log(`[GEMINI] ✅ Key ${keyIdx} + ${modelName} SUCCESS (raw)`);
  return text;
}

async function askGemini(prompt, base64Image = null, mimeType = null) {
  const keys = getGeminiKeys();
  if (keys.length === 0) throw new Error('GEMINI_KEY_MISSING');

  for (let ki = 0; ki < keys.length; ki++) {
    for (const modelName of MODEL_CASCADE) {
      try {
        return await tryKeyWithModel(keys[ki], ki + 1, modelName, prompt, base64Image, mimeType);
      } catch (err) {
        const m = (err.message || '').toLowerCase();
        const isModelGone = m.includes('not found') || m.includes('404') ||
          m.includes('unsupported') || m.includes('not supported') ||
          m.includes('does not exist');
        const isKeyDead = m.includes('expired') || m.includes('api_key_invalid') ||
          m.includes('api key') || m.includes('permission denied') ||
          m.includes('403');
        const isQuota = m.includes('429') || m.includes('quota') ||
          m.includes('rate limit') || m.includes('resource_exhausted');

        console.error(`[GEMINI] Key ${ki + 1} + ${modelName} FAILED: ${err.message}`);

        if (isModelGone) break;       // this model not on account → try next model
        if (isKeyDead || isQuota) break;       // key dead/quota → try next key entirely
        // any other error → try next model
      }
    }
  }

  throw new Error('ALL_GEMINI_COMBINATIONS_FAILED');
}

module.exports = { askGemini };