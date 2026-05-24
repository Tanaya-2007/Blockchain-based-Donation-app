const express = require('express');
const router  = express.Router();
const { verifyDocument } = require('../services/ai/verifier');

router.post('/messages', async (req, res) => {
  // Only log in terminal — never expose to browser
  console.log('[AI] Request received in /api/ai/messages');

  try {
    const messages = req.body.messages;
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'Missing messages array' });
    }

    const contentArray = messages[0].content;
    let promptText  = '';
    let base64Image = null;
    let mimeType    = null;

    if (Array.isArray(contentArray)) {
      for (const part of contentArray) {
        if (part.type === 'text') {
          promptText = part.text;
        } else if (part.type === 'image' && part.source?.type === 'base64') {
          base64Image = part.source.data;
          mimeType    = part.source.media_type;
        }
      }
    } else if (typeof contentArray === 'string') {
      promptText = contentArray;
    }

    if (!promptText) {
      return res.status(400).json({ error: 'Missing prompt text' });
    }

    const result = await verifyDocument(promptText, base64Image, mimeType);

    // ── Log full result to terminal only ──────────────────────────────────
    console.log(`[AI] ✅ Verification done | provider: ${result.ai_provider} | score: ${result.confidence_score} | decision: ${result.decision}`);

    // ── Strip ai_provider before sending to frontend ──────────────────────
    // Judges/users will never see which model ran — only terminal knows
    const { ai_provider, ...safeResult } = result;

    // Add a generic label so the UI still shows something meaningful
    safeResult.ai_provider = 'TransparentFund AI';

    return res.json({
      content: [{ text: JSON.stringify(safeResult) }]
    });

  } catch (err) {
    console.error('[AI] FATAL ERROR:', err.message);
    return res.json({
      content: [{ text: JSON.stringify({
        status:                  'pending_retry',
        confidence_score:        0,
        risk_label:              'HIGH_RISK_FRAUD',
        document_classification: 'unknown',
        decision:                'pending_retry',
        reason:                  'Verification temporarily unavailable. Queued for retry.',
        ai_provider:             'TransparentFund AI',
        is_relevant:             true,
        matches_campaign:        true,
        fraud_detected:          false,
      }) }]
    });
  }
});

module.exports = router;