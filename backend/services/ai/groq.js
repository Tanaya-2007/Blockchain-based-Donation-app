const axios = require('axios');

const { extractTextWithOCR } = require('./ocr');

async function askGroq(prompt, base64Image = null, mimeType = null) {
  console.log('[AI-ORCHESTRATOR] 🟡 Starting Groq Verification...');
  const groqKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;

  if (!groqKey) {
    console.warn('WARNING: GROQ_API_KEY is missing!');
    throw new Error('GROQ_KEY_MISSING');
  }

  // Groq decommissioned their Vision models. We must extract text with OCR first.
  let extractedText = "";
  if (base64Image) {
     console.log('[AI-ORCHESTRATOR] 🟡 Groq has no Vision: Pre-processing with OCR...');
     try {
       // ocr.js extractTextWithOCR returns a JSON string, we just want the raw text if possible, 
       // but wait, extractTextWithOCR actually returns the final JSON. 
       // We should use Tesseract directly here to get raw text.
       const Tesseract = require('tesseract.js');
       const imgStr = base64Image.startsWith('data:') ? base64Image : `data:${mimeType||'image/png'};base64,${base64Image}`;
       const { data: { text } } = await Tesseract.recognize(imgStr, 'eng');
       extractedText = text;
     } catch (e) {
       console.error("Groq OCR Pre-processing failed", e.message);
     }
  }

  const finalPrompt = prompt + "\n\n" + (extractedText ? `DOCUMENT TEXT EXTRACTED VIA OCR:\n${extractedText}\n\n` : "") + "Respond ONLY in valid JSON. No markdown. No explanation.";

  const payload = {
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: finalPrompt }],
    max_tokens: 1000,
    temperature: 0.1
  };

  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', payload, {
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000 // 15 seconds timeout
    });

    const data = response.data;
    let rawText = data?.choices?.[0]?.message?.content || "";
    return rawText;
  } catch (error) {
    throw new Error(error.response?.data?.error?.message || error.message);
  }
}

module.exports = { askGroq };
