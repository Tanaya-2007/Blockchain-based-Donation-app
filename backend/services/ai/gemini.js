const { GoogleGenerativeAI } = require('@google/generative-ai');

async function askGemini(prompt, base64Image = null, mimeType = null) {
  console.log('[AI-ORCHESTRATOR] 🟢 Starting Gemini Verification...');
  
  // Collect all available Gemini keys
  const keys = [
    process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2 || process.env.VITE_GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3 || process.env.VITE_GEMINI_API_KEY_3
  ].filter(Boolean); // Remove empty/undefined keys

  if (keys.length === 0) {
    throw new Error('ALL_GEMINI_KEYS_MISSING');
  }

  let lastError = null;

  // Try each key sequentially
  for (let i = 0; i < keys.length; i++) {
    const currentKey = keys[i];
    try {
      console.log(`[AI-ORCHESTRATOR] 🟢 Trying Gemini Key ${i + 1}/${keys.length}...`);
      const genAI = new GoogleGenerativeAI(currentKey);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: "application/json" }
      });

      const parts = [];
      if (prompt) parts.push(prompt + "\n\nRespond ONLY in valid JSON. No markdown. No explanation.");
      if (base64Image && mimeType) {
        parts.push({
          inlineData: { data: base64Image, mimeType: mimeType }
        });
      }

      const result = await model.generateContent(parts);
      const textContent = result.response.text();
      
      if (!textContent) throw new Error('MALFORMED_RESPONSE');
      
      console.log(`[AI-ORCHESTRATOR] 🟢 Gemini Key ${i + 1} succeeded.`);
      return textContent;
    } catch (err) {
      console.error(`[AI-ORCHESTRATOR] 🔴 Gemini Key ${i + 1} failed:`, err.message);
      lastError = err;
      // Continue to next key
    }
  }

  // If all keys failed
  throw new Error(`ALL_GEMINI_KEYS_FAILED: ${lastError.message}`);
}

module.exports = { askGemini };
