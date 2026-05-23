const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL_CASCADE = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

function safeParse(text) {
  if (!text) return null;
  try {
    const cleaned = text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : cleaned);
  } catch { return null; }
}

// FIX: handle decimal seconds like "57.955341022s"
function parseRetryDelay(msg) {
  const m = (msg || '').match(/retry in (\d+(?:\.\d+)?)s/i);
  if (m) {
    const secs = Math.ceil(parseFloat(m[1]));
    console.log(`[GEMINI] Google says retry in ${secs}s — will wait ${secs + 2}s`);
    return (secs + 2) * 1000; // +2s buffer
  }
  return 65000; // safe default
}

function classifyErr(msg) {
  const m = (msg || '').toLowerCase();
  return {
    isQuota:     m.includes('429') || m.includes('quota') ||
                 m.includes('resource_exhausted') || m.includes('rate limit') ||
                 m.includes('too many requests'),
    isKeyDead:   m.includes('api_key_invalid') || m.includes('api key not valid') ||
                 m.includes('permission denied') || m.includes('403') || m.includes('expired'),
    isModelGone: m.includes('not found') || m.includes('404') ||
                 m.includes('deprecated') || m.includes('is not supported'),
  };
}

// Per-session cache: key+model combos that are quota-dead right now
// Value = timestamp when they become available again
const availableAt = {};

async function askGemini(prompt, base64Image = null, mimeType = null) {
  const keys = getGeminiKeys();
  if (keys.length === 0) throw new Error('GEMINI_KEY_MISSING');

  // We do up to 2 full passes. On the 2nd pass we wait for the shortest
  // rate-limit window before retrying.
  for (let pass = 0; pass < 2; pass++) {

    // Find the soonest-available combo
    const now = Date.now();
    let shortestWait = Infinity;

    for (let ki = 0; ki < keys.length; ki++) {
      for (const modelName of MODEL_CASCADE) {
        const key = `k${ki}_${modelName}`;
        const avail = availableAt[key] || 0;
        if (avail > now) {
          shortestWait = Math.min(shortestWait, avail - now);
          continue; // still cooling down
        }

        // Try this combo
        try {
          const genAI = new GoogleGenerativeAI(keys[ki]);
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: 'application/json', temperature: 0.0 },
          });

          const parts = [];
          if (base64Image && mimeType) parts.push({ inlineData: { data: base64Image, mimeType } });
          parts.push({ text: prompt });

          console.log(`[GEMINI] ▶ Key${ki+1} | ${modelName} | pass ${pass+1}`);
          const result = await model.generateContent(parts);
          const text   = result.response.text();
          if (!text?.trim()) throw new Error('EMPTY_RESPONSE');

          const parsed = safeParse(text);
          if (!parsed) throw new Error('PARSE_FAILED: ' + text.slice(0, 80));

          delete availableAt[key]; // clear any old rate-limit record
          console.log(`[GEMINI] ✅ SUCCESS Key${ki+1}+${modelName} | class:${parsed.document_classification}`);
          return JSON.stringify(parsed);

        } catch (err) {
          const msg = err.message || '';
          const { isQuota, isKeyDead, isModelGone } = classifyErr(msg);
          console.error(`[GEMINI] ❌ Key${ki+1}|${modelName}: ${msg.slice(0, 200)}`);

          if (isKeyDead) {
            // Mark all models for this key as unavailable for 24h
            for (const m of MODEL_CASCADE) availableAt[`k${ki}_${m}`] = now + 86400000;
            console.warn(`[GEMINI] Key${ki+1} is dead — skipping`);
            break; // break model loop, try next key
          }

          if (isModelGone) {
            availableAt[key] = now + 86400000;
            continue; // try next model
          }

          if (isQuota) {
            const waitMs = parseRetryDelay(msg);
            availableAt[key] = now + waitMs;
            shortestWait = Math.min(shortestWait, waitMs);
            console.log(`[GEMINI] Key${ki+1}|${modelName} rate-limited for ${Math.ceil(waitMs/1000)}s`);
            continue; // try next model/key
          }

          continue; // other error → try next
        }
      }
    }

    // End of pass — check if we should wait and retry
    if (pass === 0 && shortestWait < Infinity && shortestWait < 120000) {
      console.log(`[GEMINI] All combos rate-limited. Waiting ${Math.ceil(shortestWait/1000)}s then retrying...`);
      await sleep(shortestWait + 500);
      // Continue to pass 1
    } else {
      break; // no point retrying
    }
  }

  throw new Error('ALL_GEMINI_COMBINATIONS_FAILED');
}

module.exports = { askGemini };