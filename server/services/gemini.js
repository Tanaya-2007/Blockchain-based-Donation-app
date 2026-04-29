const { GoogleGenerativeAI } = require('@google/generative-ai');

async function askGeminiDirect(prompt, base64Image = null, mimeType = null) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!geminiKey) throw new Error('GEMINI_API_KEY missing');

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
  
  const jsonMatch = textContent.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textContent);
  parsed.ai_provider = 'Gemini API';
  return parsed;
}

async function askClaudeDirect(prompt, base64Image, mimeType) {
  const claudeKey = process.env.CLAUDE_API_KEY || process.env.VITE_CLAUDE_API_KEY;
  if (!claudeKey) throw new Error('CLAUDE_API_KEY missing');
  
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
    throw new Error(`Claude API failed: ${err}`);
  }

  const data = await response.json();
  let text = data.content[0].text;
  
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  parsed.ai_provider = 'Claude API';
  return parsed;
}

module.exports = { askGeminiDirect, askClaudeDirect };
