const axios = require('axios');
const { buildVerificationPrompt } = require('./prompt');
const { applyHardCaps } = require('./gemini');

function safeParse(text) {
  if (!text) return null;
  try {
    const cleaned = text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : cleaned);
  } catch { return null; }
}

async function askGroq(prompt, base64Image = null, mimeType = null) {
  console.log('[GROQ] Starting Groq/Llama-4 Forensic Verification...');
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.error('[GROQ] ❌ GROQ_API_KEY missing');
    throw new Error('GROQ_KEY_MISSING');
  }
  console.log('[GROQ] ✅ Key found, calling API...');

  const fullPrompt = buildVerificationPrompt(prompt);
  const userContent = [];
  if (base64Image && mimeType) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64Image}` }
    });
  }
  userContent.push({ type: 'text', text: fullPrompt });

  let raw;
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'system',
            content: `You are a forensic document fraud detection AI.
ZERO-TRUST: Every document is fake until proven genuine.
You MUST return ONLY valid JSON — no markdown, no explanation.
AI-generated documents MUST receive confidence_score of 0-10.
Documents scoring below 75 are ALWAYS rejected.
Be intentionally strict. False positives preferred over approving fakes.`
          },
          { role: 'user', content: userContent }
        ],
        max_tokens: 1000,
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

  const final = applyHardCaps(parsed, 'Groq');
  console.log(`[GROQ] ✅ Final → class:${final.document_classification} | score:${final.confidence_score} | risk:${final.risk_label} | decision:${final.decision}`);
  return JSON.stringify(final);
}

module.exports = { askGroq };