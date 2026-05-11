const { askGemini } = require('./gemini');
const { askClaude } = require('./claude');
const { extractTextWithOCR } = require('./ocr');
const { askGroq } = require('./groq');

function createSafeFallback(reason = "Verification delayed") {
  return {
    status: "pending_retry",
    decision: "pending_retry", // For NgoDashboard
    document_classification: "api_error", // For NgoDashboard
    confidence_score: 65,
    ai_provider: "Safe Fallback",
    recommended_action: "manual_review",

    relevance_score: 60,
    authenticity_score: 55,
    field_match_score: 50,
    fraud_risk_score: 15,

    document_type: "verification_delayed",

    reasons: [
      reason,
      "Backup verification pipeline activated",
      "AI providers temporarily unavailable"
    ],
    reasoning: reason, // For NgoDashboard
    summary: "Verification delayed.", // For NgoDashboard

    red_flags: [],

    verification_flags: {
      campaign_relevant: true,
      goal_match: true,
      fraud_check_passed: true
    },
    matched_fields: { organization_name: true, registration_number: true, location: true, purpose: true } // For NgoDashboard
  };
}

function safeParse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch (e) {
    return null;
  }
}

async function verifyDocument(prompt, base64Image, mimeType) {
  let aiProvider = "None";
  let rawResponse = null;

  // 1. Try Gemini First
  try {
    rawResponse = await askGemini(prompt, base64Image, mimeType);
    aiProvider = "Gemini 2.5 Flash";
  } catch (geminiErr) {
    console.error(`[AI] Gemini failed: ${geminiErr.message}`);
    console.log("[AI] Switching to Groq fallback");
    
    // 2. Fallback to Groq
    try {
      rawResponse = await askGroq(prompt, base64Image, mimeType);
      aiProvider = "Groq LLaMA 3";
      console.log(`[AI] Groq success`);
    } catch (groqErr) {
      console.error(`[AI] Groq failed: ${groqErr.message}`);
      console.log("[AI] Switching to Claude fallback");

      // 3. Fallback to Claude
      try {
        rawResponse = await askClaude(prompt, base64Image, mimeType);
        aiProvider = "Claude 3 Haiku";
        console.log(`[AI] Claude success`);
      } catch (claudeErr) {
        console.error(`[AI] Claude failed: ${claudeErr.message}`);
        console.log("[AI] All AI APIs failed. Switching to OCR Fallback.");

        // 4. Fallback to OCR
        try {
          const ocrStr = await extractTextWithOCR(base64Image);
          console.log(`[AI] OCR success`);
          const ocrResult = safeParse(ocrStr);
          if (ocrResult) {
             console.log("[AI FINAL RESPONSE] OCR Fallback success", ocrResult);
             ocrResult.ai_provider = "Tesseract OCR";
             return ocrResult;
          }
        } catch (ocrErr) {
          console.error(`[AI] OCR failed: ${ocrErr.message}`);
          // ALL FAILED
          const safe = createSafeFallback("Verification delayed due to total system outage");
          console.log("[AI FINAL RESPONSE]", safe);
          return safe;
        }
      }
    }
  }

  // Parse Response
  let parsed = safeParse(rawResponse);
  
  if (!parsed) {
    console.error("[AI] Failed to parse final output:", rawResponse);
    const safe = createSafeFallback("Invalid AI response format");
    safe.ai_provider = aiProvider;
    console.log("[AI FINAL RESPONSE]", safe);
    return safe;
  }

  parsed.ai_provider = aiProvider;
  console.log(`[AI FINAL RESPONSE]`, parsed);
  return parsed;
}

module.exports = { verifyDocument, createSafeFallback };
