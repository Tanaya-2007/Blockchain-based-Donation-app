const axios = require('axios');

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

  if (HARD_CAPS[cls] !== undefined) {
    const cap = HARD_CAPS[cls];
    if ((parsed.confidence_score || 0) > cap) {
      console.warn(`[GROQ CAPS] "${cls}" capped: ${parsed.confidence_score} → ${cap}`);
      parsed.confidence_score = cap;
      parsed.fraud_detected = true;
    }
  }

  if (containsAIKeyword(parsed) && (parsed.confidence_score || 0) > 5) {
    console.warn(`[GROQ CAPS] AI keyword in response → capped to 5`);
    parsed.confidence_score = 5;
    parsed.document_classification = 'ai_generated_image';
    parsed.fraud_detected = true;
  }

  if (parsed.fraud_detected === true) parsed.confidence_score = Math.min(parsed.confidence_score || 0, 5);
  if (parsed.is_relevant === false) parsed.confidence_score = Math.min(parsed.confidence_score || 0, 10);
  if (parsed.matches_campaign === false) parsed.confidence_score = Math.min(parsed.confidence_score || 0, 20);

  const score = parsed.confidence_score || 0;
  parsed.status = score >= 75 ? 'approved' : 'rejected';
  parsed.decision = score >= 75 ? 'manual_review' : 'reject';
  return parsed;
}

function safeParse(raw) {
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : cleaned);
  } catch { return null; }
}

const SYSTEM_PROMPT = `You are a ZERO-TRUST anti-fraud document verification AI for an Indian NGO donation platform. Real donors lose money if you approve fraud.

YOUR FIRST JOB — DETECT AI-GENERATED IMAGES:
Classify as "ai_generated_image" (score MUST be 0) if ANY of these are true:
✗ Background is smooth, gradient, or abstract — no real physical environment
✗ Text looks digitally rendered/embedded rather than physically printed on paper
✗ Lighting is perfect, uniform, studio-quality — no natural shadows or inconsistencies
✗ Image quality is "too perfect" — hyper-realistic, surreal, or artistic quality
✗ No paper grain, no fold marks, no scan artifacts, no physical imperfections
✗ Colors are oversaturated or unnaturally vivid for a real document
✗ Visible AI watermarks, AI-tool logos, or known AI generation artifacts
✗ Document looks like a "digital mockup" or "template" rather than a real scan

CLASSIFICATION OPTIONS:
correct_document    → Real physical Indian NGO cert/bill/invoice with visible paper texture
wrong_document      → Real but wrong document type — max score 15
ai_generated_image  → AI-created — score MUST be 0, no exceptions
screenshot          → Digital screenshot — max score 5
code_image          → Code/terminal — score 0
unrelated_image     → Photo/nature/people — score 0
blank               → Empty/corrupted — score 0

SCORING FOR correct_document ONLY:
Minor issues:   30-55
Good proof:     55-74
Strong proof:   75-88
Excellent:      88-93
(Never 100)

KEY INSIGHT: Real Indian NGO documents are IMPERFECT — uneven stamps, hand signatures, slightly skewed printing, yellowed paper, scan lines. If a document looks suspiciously clean, professional, or digitally perfect → it is AI-generated.

Respond ONLY with valid JSON:
{
  "document_classification": "correct_document|wrong_document|ai_generated_image|unrelated_image|code_image|screenshot|blank",
  "confidence_score": <integer 0-100>,
  "is_relevant": <true|false>,
  "matches_campaign": <true|false>,
  "fraud_detected": <true|false>,
  "reason": "<specific one sentence — mention exactly what visual evidence you used>",
  "red_flags": ["<specific visual observation>"],
  "status": "approved|rejected",
  "decision": "manual_review|reject"
}`;

async function askGroq(prompt, base64Image = null, mimeType = null) {
  console.log('[GROQ] Starting Groq/Llama-4 Verification...');
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.error('[GROQ] ❌ GROQ_API_KEY missing');
    throw new Error('GROQ_KEY_MISSING');
  }
  console.log('[GROQ] ✅ Key found, calling API...');

  const userContent = [];
  if (base64Image && mimeType) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64Image}` }
    });
  }
  userContent.push({
    type: 'text',
    text: `Campaign context:\n${prompt}\n\nAnalyze the image above using the system rules. Return ONLY valid JSON.`
  });

  let raw;
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ],
        max_tokens: 600,
        temperature: 0.0
      },
      {
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    raw = response.data?.choices?.[0]?.message?.content;
    if (!raw || !raw.trim()) throw new Error('GROQ_EMPTY_RESPONSE');
    console.log('[GROQ] Response received, length:', raw.length);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error('[GROQ] API FAILED:', msg);
    throw new Error(msg);
  }

  const parsed = safeParse(raw);
  if (!parsed) {
    console.error('[GROQ] Could not parse JSON:', raw.slice(0, 150));
    throw new Error('GROQ_PARSE_FAILED');
  }

  const final = enforceAllCaps(parsed);
  console.log(`[GROQ] ✅ Final → class: "${final.document_classification}" | score: ${final.confidence_score} | decision: ${final.decision}`);
  return JSON.stringify(final);
}

module.exports = { askGroq };