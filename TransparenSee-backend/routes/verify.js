const express = require('express');
const router = express.Router();
const { askGemini } = require('../services/gemini');

/**
 * AI Verification Route
 * Replaces old Claude logic with Gemini 2.5 Flash while maintaining the same 
 * Anthropic-like request/response format so the frontend doesn't need to change.
 */
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

    // Parse the Anthropic-style payload from the frontend
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

    // Call Gemini 2.5 Flash
    let geminiJsonString;
    try {
      geminiJsonString = await askGemini(promptText, base64Image, mimeType);
    } catch (geminiError) {
      // Bonus: If Gemini fails (invalid key, quota exceeded), we return a safe JSON payload 
      // to trick the frontend into falling back elegantly (admin review state).
      console.error('[Verify Route] Gemini failed. Triggering frontend fallback.');
      geminiJsonString = JSON.stringify({
        score: 72,
        confidence_score: 72,
        verdict: "DONOR_VOTE",
        decision: "manual_review",
        status: "admin_review",
        document_classification: "api_error",
        matched_fields: { org_name_match: false, website_valid: false, purpose_match: false },
        reasoning: "AI Verification Error: " + geminiError.message
      });
    }

    // Wrap the Gemini JSON output in the Anthropic response structure
    // so the frontend code parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]) continues to work perfectly.
    const anthropicFormat = {
      id: "msg_gemini_" + Date.now(),
      type: "message",
      role: "assistant",
      model: "gemini-2.5-flash",
      content: [
        {
          type: "text",
          text: geminiJsonString
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
