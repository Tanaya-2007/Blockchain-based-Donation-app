const axios = require('axios');

// ═══ HARD CAPS — same as gemini.js and groq.js ═══
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
  'too perfect', 'rendered text', 'embedded text', 'digital artifact',
  'no grain', 'surreal', 'illustration', 'artwork', 'painting', 'drawing'
];

function containsAIKeyword(parsed) {
  const str = JSON.stringify(parsed).toLowerCase();
  return AI_IMAGE_KEYWORDS.some(kw => str.includes(kw));
}

function enforceAllCaps(parsed) {
  if (!parsed) return parsed;
  const cls = (parsed.document_classification || '').toLowerCase().trim();

  if (HARD_CAPS[cls] !== undefined) {
    const cap = HARD_CAPS[cls];
    if ((parsed.confidence_score || 0) > cap) {
      console.warn(`[CLAUDE CAPS] "${cls}" capped: ${parsed.confidence_score} → ${cap}`);
      parsed.confidence_score = cap;
      parsed.fraud_detected = true;
    }
  }

  if (containsAIKeyword(parsed) && (parsed.confidence_score || 0) > 5) {
    console.warn(`[CLAUDE CAPS] AI keyword detected → capped to 5`);
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

function safeParse(text) {
  if (!text) return null;
  try {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : cleaned);
  } catch { return null; }
}

const STRICT_SYSTEM_PROMPT = `You are a ZERO-TRUST anti-fraud document verification AI for an Indian NGO donation platform. Real donors lose money if you approve fraud.

YOUR FIRST JOB — DETECT AI-GENERATED IMAGES (HIGHEST PRIORITY):
Classify as "ai_generated_image" (score MUST be 0) if ANY of these are true:
✗ Background is smooth, gradient, or abstract — no real physical environment visible
✗ Text looks digitally rendered/embedded rather than physically printed on paper
✗ Lighting is perfect, uniform, studio-quality — no natural shadows or inconsistencies  
✗ Image is "too perfect" — hyper-realistic, surreal, or has artistic quality
✗ No paper grain, fold marks, scan lines, or physical document imperfections
✗ Colors are oversaturated or unnaturally vivid for a real scanned document
✗ Visible AI watermarks or known AI generation artifacts
✗ Document looks like a "digital mockup" or "template" rather than a real photograph/scan

KEY INSIGHT: Real Indian NGO documents are IMPERFECT — uneven stamps, hand signatures, slightly skewed printing, yellowed paper, scan lines. If a document looks suspiciously clean, professional, or digitally perfect → it is AI-generated.

CLASSIFICATION:
correct_document    → Real photographed/scanned paper with VISIBLE imperfections/texture
wrong_document      → Real but wrong document type — max score 15
ai_generated_image  → AI-created by any tool — score MUST be 0
screenshot          → Any digital interface screenshot — max score 5
code_image          → Code/terminal/IDE — score 0
unrelated_image     → Photo/nature/people/products — score 0
blank               → Empty/corrupted — score 0

SCORING (correct_document only):
Minor issues: 30-55 | Good proof: 55-74 | Strong: 75-88 | Excellent: 88-93
(Never give 100)

You MUST return ONLY valid JSON. No markdown. No explanation outside JSON:
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

async function askClaude(prompt, base64Image = null, mimeType = null) {
  console.log('[CLAUDE] 🟠 Starting Claude Verification...');
  const claudeKey = process.env.CLAUDE_API_KEY || process.env.VITE_CLAUDE_API_KEY;

  if (!claudeKey) {
    console.error('[CLAUDE] ❌ CLAUDE_API_KEY missing');
    throw new Error('CLAUDE_KEY_MISSING');
  }
  console.log('[CLAUDE] ✅ Key found, calling API...');

  const content = [];
  if (base64Image && mimeType) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mimeType, data: base64Image }
    });
  }
  content.push({
    type: 'text',
    text: `Campaign context for matching:\n${prompt}\n\nAnalyze the image above using your system instructions. Return ONLY valid JSON.`
  });

  const payload = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system: STRICT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content }]
  };

  let rawText;
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      payload,
      {
        headers: {
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 20000
      }
    );
    rawText = response.data?.content?.[0]?.text || '';
    if (!rawText.trim()) throw new Error('CLAUDE_EMPTY_RESPONSE');
    console.log('[CLAUDE] Response received, length:', rawText.length);
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error('[CLAUDE] 🟠 API FAILED:', msg);
    throw new Error(msg);
  }

  const parsed = safeParse(rawText);
  if (!parsed) {
    console.error('[CLAUDE] Could not parse JSON:', rawText.slice(0, 150));
    throw new Error('CLAUDE_PARSE_FAILED');
  }

  const final = enforceAllCaps(parsed);
  console.log(`[CLAUDE] ✅ Final → class: "${final.document_classification}" | score: ${final.confidence_score} | decision: ${final.decision}`);
  return JSON.stringify(final);
}

module.exports = { askClaude };