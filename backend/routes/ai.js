const express = require('express');
const router = express.Router();
const { verifyDocument } = require('../services/ai/verifier');

router.post('/messages', async (req, res) => {
  console.log("AI REQUEST RECEIVED in /api/ai/messages");

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

    const parsedJson = await verifyDocument(promptText, base64Image, mimeType);

    // Return exact format frontend expects (Anthropic style wrapper, or direct)
    // The frontend currently expects Anthropic style wrapper: { content: [{ text: "..." }] }
    return res.json({
      content: [{ text: JSON.stringify(parsedJson) }]
    });

  } catch (err) {
    console.error("FATAL ROUTE ERROR:", err.message);
    return res.json({
      content: [{ text: JSON.stringify({
        status: "pending_retry",
        confidence_score: 0,
        document_type: "api_error",
        reason: "Critical server error. Verification delayed.",
        decision: "pending_retry"
      }) }]
    });
  }
});

module.exports = router;
