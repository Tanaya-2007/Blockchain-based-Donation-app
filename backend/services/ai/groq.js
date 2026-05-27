// Groq fallback — used when all Gemini keys exhausted
// Raw HTTPS, no SDK dependency

const https = require('https');

const MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-90b-vision-preview',
  'llama-3.2-11b-vision-preview',
];

function callGroqRaw(apiKey, model, prompt, base64Image, mimeType) {
  return new Promise((resolve, reject) => {
    let messageContent;
    if (base64Image && mimeType && mimeType.startsWith('image/')) {
      messageContent = [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
        { type: 'text', text: prompt + '\n\nRespond ONLY in valid JSON. No markdown.' }
      ];
    } else {
      messageContent = prompt + '\n\nRespond ONLY in valid JSON. No markdown.';
    }

    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: messageContent }],
      temperature: 0.0,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const req = https.request({
      hostname: 'api.groq.com',
      path:     '/openai/v1/chat/completions',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${apiKey}`,
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
            resolve(json?.choices?.[0]?.message?.content || '');
          } else {
            const msg = json?.error?.message || data.slice(0, 300);
            reject(Object.assign(new Error(msg), { httpStatus: res.statusCode }));
          }
        } catch(e) { reject(new Error('GROQ_PARSE: ' + data.slice(0, 100))); }
      });
    });
    req.on('error',   e => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('GROQ_TIMEOUT')); });
    req.write(body);
    req.end();
  });
}

async function askGroq(prompt, base64Image = null, mimeType = null) {
  console.log('[AI-ORCHESTRATOR] 🟡 Starting Groq Verification...');
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error('GROQ_KEY_MISSING');

  for (const model of MODELS) {
    try {
      console.log(`[GROQ] ▶ Trying ${model}`);
      const text = await callGroqRaw(groqKey, model, prompt, base64Image, mimeType);
      if (!text?.trim()) throw new Error('EMPTY_RESPONSE');
      const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      JSON.parse(match ? match[0] : clean); // validate JSON
      console.log(`[GROQ] ✅ ${model} succeeded`);
      return match ? match[0] : clean;
    } catch (err) {
      const msg  = err.message || '';
      const http = err.httpStatus || 0;
      console.error(`[GROQ] ❌ ${model}: ${msg.slice(0, 120)}`);
      if (http === 429) throw new Error('GROQ_RATE_LIMITED');
      continue;
    }
  }
  throw new Error('ALL_GROQ_MODELS_FAILED');
}

module.exports = { askGroq };