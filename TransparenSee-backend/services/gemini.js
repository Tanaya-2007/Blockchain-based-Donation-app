const { GoogleGenerativeAI } = require('@google/generative-ai');

async function askGemini(prompt, base64Image = null, mimeType = null) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const claudeKey = process.env.CLAUDE_API_KEY || process.env.VITE_CLAUDE_API_KEY;

  if (!geminiKey) {
    console.warn('[AI] GEMINI_API_KEY missing. Falling back to Claude immediately.');
    return await askClaudeFallback(prompt, base64Image, mimeType, claudeKey);
  }

  console.log('[AI] Request started for Gemini 2.5 Flash');

  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: "application/json" }
    });

    const parts = [];
    if (prompt) parts.push(prompt);
    if (base64Image && mimeType) {
      parts.push({
        inlineData: { data: base64Image, mimeType: mimeType }
      });
    }

    const result = await model.generateContent(parts);
    const textContent = result.response.text();
    
    if (!textContent) throw new Error('Malformed response from Gemini API');
    
    // Inject provider info
    try {
      const parsed = JSON.parse(textContent);
      parsed.ai_provider = 'Gemini API';
      console.log('[AI] Gemini Request success');
      return JSON.stringify(parsed);
    } catch(e) {
      return textContent;
    }
  } catch (error) {
    console.error('[AI] Gemini failed:', error.message);
    return await askClaudeFallback(prompt, base64Image, mimeType, claudeKey);
  }
}

async function askClaudeFallback(prompt, base64Image, mimeType, claudeKey) {
  if (!claudeKey) {
    throw new Error('Both Gemini and Claude API keys are missing or failed.');
  }
  console.log('[AI] Attempting Claude Fallback...');
  
  const content = [];
  if (base64Image && mimeType) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: mimeType, data: base64Image }
    });
  }
  if (prompt) content.push({ type: "text", text: prompt });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      system: "You are an AI verifier. Always respond with valid JSON only. No markdown formatting around the JSON.",
      messages: [{ role: 'user', content }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude fallback failed: ${err}`);
  }

  const data = await response.json();
  let text = data.content[0].text;
  
  // Extract JSON if wrapped in markdown
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];

  try {
    const parsed = JSON.parse(text);
    parsed.ai_provider = 'Claude (Fallback)';
    console.log('[AI] Claude Fallback success');
    return JSON.stringify(parsed);
  } catch(e) {
    return text;
  }
}

module.exports = { askGemini };
