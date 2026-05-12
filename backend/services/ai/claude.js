const axios = require('axios');

async function askClaude(prompt, base64Image = null, mimeType = null) {
  console.log('[AI-ORCHESTRATOR] 🟠 Starting Claude Verification...');
  const claudeKey = process.env.CLAUDE_API_KEY || process.env.VITE_CLAUDE_API_KEY;

  if (!claudeKey) {
    throw new Error('CLAUDE_KEY_MISSING');
  }

  const content = [];
  if (base64Image && mimeType) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: mimeType, data: base64Image }
    });
  }
  if (prompt) {
    content.push({ type: "text", text: prompt + "\n\nRespond ONLY in valid JSON. No markdown. No explanation." });
  }

  const payload = {
    // ✅ FIXED: claude-3-haiku-20240307 is deprecated — use current Haiku model
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: "You are a verification AI. You must ALWAYS return valid JSON ONLY. Do not use markdown wrappers. Do not include any explanations.",
    messages: [{ role: 'user', content }]
  };

  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', payload, {
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 20000
    });

    const data = response.data;
    let rawText = data?.content?.[0]?.text || "";
    console.log('[AI-ORCHESTRATOR] 🟠 Claude raw response length:', rawText.length);
    return rawText;
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error('[AI-ORCHESTRATOR] 🟠 Claude error:', msg);
    throw new Error(msg);
  }
}

module.exports = { askClaude };