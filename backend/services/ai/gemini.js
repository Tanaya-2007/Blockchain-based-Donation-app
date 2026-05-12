const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL_CASCADE = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-preview-04-17',
];

// ═══ HARD CAPS — JS code enforces these, AI cannot override ═══
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

// Extra keyword triggers — if AI mentions these in reason/red_flags, cap score
const AI_IMAGE_KEYWORDS = [
  'ai-generated', 'ai generated', 'artificially generated', 'digitally generated',
  'gemini', 'dall-e', 'midjourney', 'stable diffusion', 'artificial intelligence generated',
  'generated image', 'synthetic image', 'machine generated', 'not a real document',
  'no paper texture', 'no physical document', 'smooth background', 'perfect lighting',
  'too perfect', 'rendered text', 'embedded text', 'digital artifact', 'watermark',
  'no grain', 'surreal', 'illustration', 'artwork', 'painting', 'drawing'
];

function containsAIKeyword(parsed) {
  const searchStr = JSON.stringify(parsed).toLowerCase();
  return AI_IMAGE_KEYWORDS.some(kw => searchStr.includes(kw));
}

function enforceAllCaps(parsed) {
  if (!parsed) return parsed;

  const cls = (parsed.document_classification || '').toLowerCase().trim();

  // Cap by classification label
  if (HARD_CAPS[cls] !== undefined) {
    const cap = HARD_CAPS[cls];
    if ((parsed.confidence_score || 0) > cap) {
      console.warn(`[GEMINI CAPS] "${cls}" capped: ${parsed.confidence_score} → ${cap}`);
      parsed.confidence_score = cap;
      parsed.fraud_detected = true;
    }
  }

  // Cap by AI keywords found anywhere in response — catches misclassification
  if (containsAIKeyword(parsed) && (parsed.confidence_score || 0) > 5) {
    console.warn(`[GEMINI CAPS] AI keyword detected in response → capped to 5`);
    parsed.confidence_score = 5;
    parsed.document_classification = 'ai_generated_image';
    parsed.fraud_detected = true;
  }

  // Flag-based caps
  if (parsed.fraud_detected === true) parsed.confidence_score = Math.min(parsed.confidence_score || 0, 5);
  if (parsed.is_relevant === false) parsed.confidence_score = Math.min(parsed.confidence_score || 0, 10);
  if (parsed.matches_campaign === false) parsed.confidence_score = Math.min(parsed.confidence_score || 0, 20);

  // Recompute final decision — threshold 75
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

// ═══ STRICT PROMPT — injected with every request ═══
const STRICT_PROMPT_SUFFIX = `

═══════════════════════════════════════════════════
MANDATORY VERIFICATION RULES — READ BEFORE SCORING
═══════════════════════════════════════════════════

STEP 1 — DETECT AI-GENERATED IMAGES FIRST (HIGHEST PRIORITY):
If ANY of these are true → classify "ai_generated_image", score MUST be 0:
✗ Background is smooth, gradient, or abstract (no real environment visible)
✗ Text in image appears rendered/embedded digitally, not physically printed on paper
✗ Lighting is uniform, perfect, studio-quality with no real shadows
✗ Image has a painterly, illustrative, or hyper-realistic "too perfect" quality
✗ No paper grain, fold marks, scan lines, or physical document imperfections
✗ Colors are oversaturated or unnaturally vivid for a document scan
✗ Visible AI watermarks (Gemini logo, DALL-E artifacts, etc.)
✗ Document looks like "a digital mockup of a document" rather than a real scanned/photographed paper
✗ Any artistic quality whatsoever — real documents look mundane and imperfect

STEP 2 — CLASSIFY:
correct_document    → Real photographed/scanned Indian NGO cert, hospital bill, invoice, receipt with VISIBLE paper texture
wrong_document      → Real doc but wrong type (PAN, Aadhaar, bank statement)
ai_generated_image  → Created by ANY AI tool — SCORE MUST BE 0
screenshot          → Screenshot of any digital interface — score max 5
code_image          → Code/terminal/IDE — score 0
unrelated_image     → Photos of people, nature, products — score 0
blank               → Empty/corrupted — score 0

STEP 3 — SCORE (only for correct_document):
Minor issues        → 30-55
Acceptable proof    → 55-74
Strong real proof   → 75-88
Perfect proof       → 88-93
(Never give 100)

CRITICAL: If image looks "too clean", "too professional", or "digitally perfect" for a real Indian NGO document → it is AI-generated. Real Indian NGO documents have imperfections, stamps that bleed slightly, handwriting, uneven printing.

Return ONLY this JSON:
{
  "document_classification": "correct_document|wrong_document|ai_generated_image|unrelated_image|code_image|screenshot|blank",
  "confidence_score": <integer 0-100>,
  "is_relevant": <true|false>,
  "matches_campaign": <true|false>,
  "fraud_detected": <true|false>,
  "reason": "<specific one sentence — mention exactly what you saw>",
  "red_flags": ["<specific visual observation>"],
  "status": "approved|rejected",
  "decision": "manual_review|reject"
}`;

async function tryKeyWithModel(key, keyIdx, modelName, prompt, base64Image, mimeType) {
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: modelName });

  const parts = [];
  if (base64Image && mimeType) {
    parts.push({ inlineData: { data: base64Image, mimeType } });
  }
  parts.push({ text: prompt + STRICT_PROMPT_SUFFIX });

  console.log(`[GEMINI] Key ${keyIdx} | Model: ${modelName} ...`);
  const result = await model.generateContent(parts);
  const text = result.response.text();
  if (!text || !text.trim()) throw new Error('EMPTY_RESPONSE');

  const parsed = safeParse(text);
  if (parsed) {
    const capped = enforceAllCaps(parsed);
    console.log(`[GEMINI] ✅ Key ${keyIdx} + ${modelName} | class: ${capped.document_classification} | score: ${capped.confidence_score}`);
    return JSON.stringify(capped);
  }
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
          m.includes('unsupported') || m.includes('does not exist') ||
          m.includes('is not supported');
        const isKeyDead = m.includes('expired') || m.includes('api_key_invalid') ||
          m.includes('api key') || m.includes('permission denied') ||
          m.includes('403');
        const isQuota = m.includes('429') || m.includes('quota') ||
          m.includes('rate limit') || m.includes('resource_exhausted');

        console.error(`[GEMINI] Key ${ki + 1} + ${modelName} FAILED: ${err.message}`);
        if (isModelGone) continue; // try next model
        if (isKeyDead || isQuota) break;    // try next key
      }
    }
  }
  throw new Error('ALL_GEMINI_COMBINATIONS_FAILED');
}

module.exports = { askGemini };