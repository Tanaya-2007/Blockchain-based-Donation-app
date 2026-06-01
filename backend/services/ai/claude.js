// Claude fallback — calls Anthropic API directly
// No API key required in artifact/proxy context
// Gracefully falls through to Groq if unavailable

const https = require('https');

async function askClaude(prompt, base64Image = null, mimeType = null) {
  console.log('[AI-ORCHESTRATOR] 🟠 Starting Claude Verification...');

  return new Promise((resolve, reject) => {
    const content = [];

    if (base64Image && mimeType) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mimeType, data: base64Image }
      });
    }
    content.push({
      type: 'text',
      text: prompt + '\n\nRespond ONLY in valid JSON. No markdown. No explanation.'
    });

    const body = JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system:     'You are a forensic fraud detection AI. Always return valid JSON only. No markdown.',
      messages:   [{ role: 'user', content }]
    });

    // Use CLAUDE_API_KEY if available, otherwise try without (artifact context)
    const claudeKey = process.env.CLAUDE_API_KEY || process.env.VITE_CLAUDE_API_KEY || '';

    if (!claudeKey) {
      return reject(new Error('CLAUDE_MISSING_KEY: API key is not configured'));
    }

    const headers = {
      'Content-Type':      'application/json',
      'anthropic-version': '2023-06-01',
      'Content-Length':    Buffer.byteLength(body),
      'x-api-key':         claudeKey,
    };

    const req = https.request({
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers,
      timeout:  20000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200) {
            const text = json?.content?.[0]?.text || '';
            if (!text?.trim()) {
              reject(new Error('CLAUDE_EMPTY_RESPONSE'));
              return;
            }
            const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            const match = clean.match(/\{[\s\S]*\}/);
            console.log('[CLAUDE] ✅ Claude succeeded');
            resolve(match ? match[0] : clean);
          } else {
            const msg = json?.error?.message || `HTTP ${res.statusCode}`;
            console.error(`[CLAUDE] ❌ Failed: ${msg.slice(0, 100)}`);
            reject(new Error(`CLAUDE_ERROR: ${msg}`));
          }
        } catch(e) {
          reject(new Error('CLAUDE_PARSE_ERROR'));
        }
      });
    });

    req.on('error',   e => { console.error('[CLAUDE] ❌ Network error:', e.message); reject(e); });
    req.on('timeout', () => { req.destroy(); reject(new Error('CLAUDE_TIMEOUT')); });
    req.write(body);
    req.end();
  });
}

module.exports = { askClaude };