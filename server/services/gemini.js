const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Service to interact with Google Gemini API (Gemini 2.5 Flash)
 */
async function askGemini(prompt, base64Image = null, mimeType = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }

  console.log('[Gemini] Request started for Gemini 2.5 Flash');

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // We use gemini-2.5-flash as requested
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const parts = [];
    if (prompt) {
      parts.push(prompt);
    }

    if (base64Image && mimeType) {
      parts.push({
        inlineData: {
          data: base64Image,
          mimeType: mimeType
        }
      });
    }

    const result = await model.generateContent(parts);
    const textContent = result.response.text();
    
    console.log('[Gemini] Request success');
    
    if (!textContent) {
      throw new Error('Malformed response from Gemini API');
    }

    return textContent; // This will be a stringified JSON
  } catch (error) {
    console.error('[Gemini] Request failed:', error.message);
    throw error;
  }
}

module.exports = {
  askGemini
};
