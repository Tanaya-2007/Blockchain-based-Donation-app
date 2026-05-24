const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL_CASCADE = ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getKeys() {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
  ].filter(Boolean);
  const unique = [...new Set(keys)];
  console.log(`[GEMINI] ${unique.length} key(s) in .env`);
  return unique;
}

function safeParse(text) {
  if (!text) return null;
  try {
    const c = text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const m = c.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : c);
  } catch { return null; }
}

// Parse "retry in 57.955s" → 60000 ms
function retryDelay(msg) {
  const m = (msg||'').match(/retry in (\d+(?:\.\d+)?)s/i);
  return m ? (Math.ceil(parseFloat(m[1])) + 3) * 1000 : 65000;
}

const dead = new Map(); // cacheKey → timestamp when available again

async function askGemini(prompt, base64Image = null, mimeType = null) {
  const keys = getKeys();
  if (!keys.length) throw new Error('GEMINI_KEY_MISSING');

  for (let pass = 0; pass < 2; pass++) {
    const now = Date.now();
    let minWait = Infinity;
    let attempted = false;

    for (let ki = 0; ki < keys.length; ki++) {
      for (const modelName of MODEL_CASCADE) {
        const ck = `k${ki}_${modelName}`;
        const avail = dead.get(ck) || 0;

        if (avail > now) {
          minWait = Math.min(minWait, avail - now);
          console.log(`[GEMINI] skip (cooldown ${Math.ceil((avail-now)/1000)}s): Key${ki+1}+${modelName}`);
          continue;
        }

        attempted = true;
        try {
          const genAI = new GoogleGenerativeAI(keys[ki]);
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: 'application/json', temperature: 0.0 },
          });

          const parts = [];
          if (base64Image && mimeType) parts.push({ inlineData: { data: base64Image, mimeType } });
          parts.push({ text: prompt });

          console.log(`[GEMINI] ▶ Key${ki+1} | ${modelName} | pass${pass+1}`);
          const result = await model.generateContent(parts);
          const text   = result.response.text();
          if (!text?.trim()) throw new Error('EMPTY_RESPONSE');

          const parsed = safeParse(text);
          if (!parsed) throw new Error('PARSE_FAILED: ' + text.slice(0,60));

          dead.delete(ck);
          console.log(`[GEMINI] ✅ Key${ki+1}+${modelName} | class:${parsed.document_classification}`);
          return JSON.stringify(parsed);

        } catch (err) {
          const msg = (err.message || '').toLowerCase();
          console.error(`[GEMINI] ❌ Key${ki+1}+${modelName}: ${err.message.slice(0,150)}`);

          const isQuota    = msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted');
          const isKeyDead  = msg.includes('api_key') || msg.includes('403') || msg.includes('permission');
          const isGone     = msg.includes('404') || msg.includes('not found') || msg.includes('deprecated');

          if (isKeyDead) {
            MODEL_CASCADE.forEach(m => dead.set(`k${ki}_${m}`, now + 86400000));
            break;
          }
          if (isGone)  { dead.set(ck, now + 86400000); continue; }
          if (isQuota) {
            const wait = retryDelay(err.message);
            dead.set(ck, now + wait);
            minWait = Math.min(minWait, wait);
            console.log(`[GEMINI] rate-limited ${Math.ceil(wait/1000)}s — trying next combo`);
            continue;
          }
          continue;
        }
      }
    }

    if (pass === 0 && !attempted && minWait < 130000) {
      console.log(`[GEMINI] all combos cooling. Waiting ${Math.ceil(minWait/1000)}s...`);
      await sleep(minWait + 500);
    } else if (!attempted) {
      break;
    } else {
      break;
    }
  }

  throw new Error('ALL_GEMINI_COMBINATIONS_FAILED');
}

module.exports = { askGemini };