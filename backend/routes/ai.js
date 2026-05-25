const express = require('express');
const router  = express.Router();
const { verifyDocument } = require('../services/ai/verifier');

router.post('/messages', async (req, res) => {
  console.log('\n[AI ROUTE] ━━━━ New verification request ━━━━');
  try {
    const messages = req.body.messages;
    if (!messages?.length) return res.status(400).json({ error:'Missing messages' });

    const content = messages[0].content;
    let campaignContext='', base64Image=null, mimeType=null;

    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type==='text') campaignContext=part.text;
        if (part.type==='image' && part.source?.type==='base64') {
          base64Image=part.source.data; mimeType=part.source.media_type;
        }
      }
    } else if (typeof content==='string') { campaignContext=content; }

    if (!campaignContext) return res.status(400).json({ error:'Missing campaign context' });

    console.log(`[AI ROUTE] Context  : ${campaignContext.slice(0,80)}`);
    console.log(`[AI ROUTE] Has image: ${!!base64Image} ${mimeType||''}`);

    const result = await verifyDocument(campaignContext, base64Image, mimeType);

    // Terminal only — full provider detail
    console.log(`[AI ROUTE] ✅ Provider: ${result.ai_provider} | Score: ${result.confidence_score} | Decision: ${result.decision}`);
    console.log('[AI ROUTE] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Strip real provider before sending to browser
    const { ai_provider, ...safeResult } = result;
    safeResult.ai_provider = 'TransparentFund AI';

    return res.json({ content:[{ text: JSON.stringify(safeResult) }] });

  } catch (err) {
    console.error('[AI ROUTE] FATAL:', err.message);
    return res.json({ content:[{ text: JSON.stringify({
      status:'pending_retry', confidence_score:0, risk_label:'HIGH_RISK_FRAUD',
      document_classification:'unknown', decision:'pending_retry',
      reason:'Verification temporarily unavailable.',
      ai_provider:'TransparentFund AI',
      is_relevant:true, matches_campaign:true, fraud_detected:false,
    }) }] });
  }
});

module.exports = router;