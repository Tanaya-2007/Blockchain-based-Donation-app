// Uses BOTH v1 (stable) and v1beta endpoints + all 4 keys
// v1 models (gemini-1.5-*) have SEPARATE quota from v1beta models (gemini-2.0-*)
// This doubles the available quota and bypasses India's v1beta restrictions
const https = require('https');

// Try v1 FIRST — gemini-1.5-* models, separate quota bucket, works in India
// Then v1beta as fallback
const COMBOS = [
  { api: 'v1',     model: 'gemini-1.5-flash'     },
  { api: 'v1',     model: 'gemini-1.5-flash-8b'  },
  { api: 'v1',     model: 'gemini-1.5-pro'        },
  { api: 'v1beta', model: 'gemini-2.0-flash'      },
  { api: 'v1beta', model: 'gemini-2.0-flash-lite' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getKeys() {
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
    const c = text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const m = c.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : c);
  } catch { return null; }
}

function parseRetryDelay(msg) {
  const m = (msg||'').match(/retry in (\d+(?:\.\d+)?)s/i);
  return m ? (Math.ceil(parseFloat(m[1])) + 3) * 1000 : 65000;
}

// Direct HTTPS call — no SDK, no version dependency
function callGeminiRaw(apiKey, api, model, prompt, base64Image, mimeType) {
  return new Promise((resolve, reject) => {
    const parts = [];
    if (base64Image && mimeType) {
      parts.push({ inline_data: { mime_type: mimeType, data: base64Image } });
    }
    parts.push({ text: prompt });

    const body = JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.0 },
    });

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/${api}/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200) {
            // Extract text from Gemini response structure
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            resolve({ ok: true, text });
          } else {
            const msg  = json?.error?.message || data.slice(0, 300);
            const code = json?.error?.status  || String(res.statusCode);
            reject(Object.assign(new Error(msg), { httpStatus: res.statusCode, googleStatus: code }));
          }
        } catch(e) { reject(new Error('PARSE_HTTP_RESPONSE: ' + data.slice(0,100))); }
      });
    });

    req.on('error',   e => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')); });
    req.write(body);
    req.end();
  });
}

// Per-session cooldown cache: key → timestamp when available again
const cooldown = new Map();

async function askGemini(prompt, base64Image = null, mimeType = null) {
  const keys = getKeys();
  if (!keys.length) throw new Error('GEMINI_KEY_MISSING');

  for (let pass = 0; pass < 2; pass++) {
    const now = Date.now();
    let minWait   = Infinity;
    let anyTried  = false;

    for (let ki = 0; ki < keys.length; ki++) {
      for (const { api, model } of COMBOS) {
        const ck     = `k${ki}_${api}_${model}`;
        const avail  = cooldown.get(ck) || 0;

        if (avail > now) {
          minWait = Math.min(minWait, avail - now);
          continue;
        }

        anyTried = true;
        try {
          console.log(`[GEMINI] ▶ Key${ki+1} | /${api}/${model} | pass${pass+1}`);
          const { text } = await callGeminiRaw(keys[ki], api, model, prompt, base64Image, mimeType);
          if (!text?.trim()) throw new Error('EMPTY_RESPONSE');

          const parsed = safeParse(text);
          if (!parsed) throw new Error('PARSE_FAILED: ' + text.slice(0, 60));

          cooldown.delete(ck);
          console.log(`[GEMINI] ✅ Key${ki+1}+${model} | class:${parsed.document_classification}`);
          return JSON.stringify(parsed);

        } catch (err) {
          const msg  = err.message || '';
          const http = err.httpStatus || 0;
          const gst  = (err.googleStatus || '').toLowerCase();
          console.error(`[GEMINI] ❌ Key${ki+1}|/${api}/${model}: ${msg.slice(0,160)}`);

          const isQuota   = http===429 || gst.includes('resource_exhausted') ||
                            msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('429');
          const isKeyDead = http===403 || gst.includes('permission_denied') ||
                            msg.toLowerCase().includes('api_key_invalid') || msg.toLowerCase().includes('api key not valid');
          const isGone    = http===404 || gst.includes('not_found') ||
                            msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('deprecated');

          if (isKeyDead) {
            COMBOS.forEach(c => cooldown.set(`k${ki}_${c.api}_${c.model}`, now + 86400000));
            console.warn(`[GEMINI] Key${ki+1} dead`);
            break;
          }
          if (isGone)  { cooldown.set(ck, now + 86400000); continue; }
          if (isQuota) {
            const wait = parseRetryDelay(msg);
            cooldown.set(ck, now + wait);
            minWait = Math.min(minWait, wait);
            console.log(`[GEMINI] Key${ki+1}+${model} rate-limited ~${Math.ceil(wait/1000)}s`);
            continue;
          }
          continue;
        }
      }
    }

    // If everything was rate-limited and shortest wait < 2 min, wait and retry once
    if (!anyTried && minWait < 130000 && pass === 0) {
      console.log(`[GEMINI] All rate-limited. Waiting ${Math.ceil(minWait/1000)}s...`);
      await sleep(minWait + 500);
    } else {
      break;
    }
  }

  throw new Error('ALL_GEMINI_COMBINATIONS_FAILED');
}

module.exports = { askGemini };