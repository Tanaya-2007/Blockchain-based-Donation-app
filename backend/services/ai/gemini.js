const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

// ── Models ordered by free-tier availability in 2026 ─────────────────────────
const MODEL_CASCADE = [
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-flash-preview-04-17',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
];

// ── Per-session quota cache — skip dead combos without wasting time ───────────
const quotaDead = new Set();

function getGeminiKeys() {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
  ].filter(Boolean);
  const unique = [...new Set(keys)];
  console.log(`[GEMINI] ${unique.length} key(s) loaded`);
  return unique;
}

// ── Parse Google's retryDelay from error JSON ─────────────────────────────────
// Error body contains: {"@type":"...RetryInfo","retryDelay":"57s"}
function parseRetryDelay(err) {
  try {
    const body = err?.response?.data || err?.errorDetails || err?.message || '';
    const str  = typeof body === 'string' ? body : JSON.stringify(body);
    // Match "retryDelay":"57s" or "retry_delay":"57s"
    const m = str.match(/"retryDelay"\s*:\s*"(\d+)s"/i)
           || str.match(/"retry_delay"\s*:\s*"(\d+)s"/i)
           || str.match(/retry[_\s]?in[:\s]+(\d+)s/i);
    if (m) return (parseInt(m[1]) + 2) * 1000; // add 2s buffer
  } catch {}
  return 8000; // default 8s if we can't parse
}

function classifyErr(err) {
  const msg  = (err?.message || '').toLowerCase();
  const body = JSON.stringify(err?.response?.data || '').toLowerCase();
  const full = msg + body;
  return {
    isQuota:     full.includes('429') || full.includes('quota') ||
                 full.includes('resource_exhausted') || full.includes('rate limit') ||
                 full.includes('too many requests'),
    isKeyDead:   full.includes('api_key_invalid') || full.includes('api key not valid') ||
                 full.includes('permission denied') || full.includes('403') ||
                 full.includes('expired') || full.includes('api key'),
    isModelGone: full.includes('not found') || full.includes('404') ||
                 full.includes('deprecated') || full.includes('is not supported') ||
                 full.includes('does not exist') || full.includes('not exist'),
    isTooLong:   full.includes('400') && (full.includes('token') || full.includes('too long') || full.includes('payload')),
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Core request ──────────────────────────────────────────────────────────────
async function callGemini(apiKey, modelName, prompt, base64Image, mimeType) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema:   RESPONSE_SCHEMA,   // ← structured output
      temperature:      0.0,               // fully deterministic
    },
  });

  const parts = [];
  if (base64Image && mimeType) {
    parts.push({ inlineData: { data: base64Image, mimeType } });
  }
  parts.push({ text: prompt });

  const result = await model.generateContent(parts);
  const text   = result.response.text();
  if (!text?.trim()) throw new Error('EMPTY_RESPONSE');

  // With responseSchema, Gemini returns clean JSON — direct parse
  return JSON.parse(text);
}

// ── Main exported function ────────────────────────────────────────────────────
async function askGemini(prompt, base64Image = null, mimeType = null) {
  const keys = getGeminiKeys();
  if (keys.length === 0) throw new Error('GEMINI_KEY_MISSING');

  for (let ki = 0; ki < keys.length; ki++) {
    let keyDead = false;

    for (const modelName of MODEL_CASCADE) {
      if (keyDead) break;

      const cacheKey = `k${ki}_${modelName}`;
      if (quotaDead.has(cacheKey)) {
        console.log(`[GEMINI] ⏭  Skip cached quota-dead: Key${ki+1}+${modelName}`);
        continue;
      }

      // ── Retry loop: up to 2 attempts with Google's own retryDelay ────────
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`[GEMINI] ▶ Key${ki+1} | ${modelName} | attempt ${attempt}`);
          const parsed = await callGemini(
            keys[ki], modelName, prompt, base64Image, mimeType
          );
          console.log(`[GEMINI] ✅ SUCCESS Key${ki+1}+${modelName} | class:${parsed.document_classification} | ai_prob:${parsed.forensic_signals?.ai_generation_probability}`);
          return JSON.stringify(parsed);

        } catch (err) {
          const { isQuota, isKeyDead, isModelGone, isTooLong } = classifyErr(err);
          console.error(`[GEMINI] ❌ Key${ki+1}|${modelName}|attempt${attempt}: ${(err.message||'').slice(0,100)}`);

          if (isKeyDead) {
            console.warn(`[GEMINI] 🔑 Key${ki+1} is DEAD — skipping all its models`);
            keyDead = true;
            break;
          }

          if (isModelGone || isTooLong) {
            console.log(`[GEMINI] Model ${modelName} unavailable — trying next model`);
            break; // next model
          }

          if (isQuota) {
            if (attempt === 1) {
              const waitMs = parseRetryDelay(err);
              console.log(`[GEMINI] ⏳ Rate-limited. Waiting ${waitMs}ms (Google's retryDelay)...`);
              await sleep(waitMs);
              continue; // retry same model
            } else {
              // Still failing after wait → mark dead for this session
              quotaDead.add(cacheKey);
              console.log(`[GEMINI] Quota confirmed dead: Key${ki+1}+${modelName}`);
              break; // next model
            }
          }

          // Any other error → try next model
          break;
        }
      }
    }
  }

  throw new Error('ALL_GEMINI_COMBINATIONS_FAILED');
}

module.exports = { askGemini };