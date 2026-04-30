const express = require('express');
const router = express.Router();
const { askGemini } = require('../services/gemini');

router.post('/messages', async (req, res) => {
  try {
    const messages = req.body.messages;
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'Missing messages array' });
    }

    const contentArray = messages[0].content;
    let promptText = '';
    let base64Image = null;
    let mimeType = null;

    if (Array.isArray(contentArray)) {
      for (const part of contentArray) {
        if (part.type === 'text') {
          promptText = part.text;
        } else if (part.type === 'image' && part.source?.type === 'base64') {
          base64Image = part.source.data;
          mimeType = part.source.media_type;
        }
      }
    } else if (typeof contentArray === 'string') {
      promptText = contentArray;
    }

    if (!promptText) {
      return res.status(400).json({ error: 'Missing prompt text' });
    }

    // Call Gemini 2.5 Flash with Claude Fallback
    let aiJsonString;
    try {
      aiJsonString = await askGemini(promptText, base64Image, mimeType);
    } catch (aiError) {
      console.error('[Verify Route] Both AI providers failed. Triggering frontend fallback.', aiError);
      aiJsonString = JSON.stringify({
        status: "rejected",
        confidence_score: 0,
        ai_provider: "Error Fallback",
        document_type: "api_error",
        field_match_score: 0,
        authenticity_score: 0,
        fraud_risk_score: 100,
        relevance_score: 0,
        reasons: ["AI Verification Error: " + aiError.message],
        red_flags: ["AI completely failed to process document"],
        recommended_action: "reject"
      });
    }

    const anthropicFormat = {
      id: "msg_ai_" + Date.now(),
      type: "message",
      role: "assistant",
      model: "enterprise-multi-stage",
      content: [
        {
          type: "text",
          text: aiJsonString
        }
      ]
    };

    res.json(anthropicFormat);
  } catch (error) {
    console.error('[Verify Route] Fatal Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
