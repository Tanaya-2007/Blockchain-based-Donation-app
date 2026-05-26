const express = require('express');
const router  = express.Router();
const { verifyDocument } = require('../services/ai/verifier');

router.post('/messages', async (req, res) => {

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║          NEW VERIFICATION REQUEST               ║');
  console.log('╚══════════════════════════════════════════════════╝');

  try {
    const messages = req.body.messages;
    if (!messages?.length) return res.status(400).json({ error: 'Missing messages' });

    const content = messages[0].content;
    let campaignContext = '', base64Image = null, mimeType = null;

    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === 'text') campaignContext = part.text;
        if (part.type === 'image' && part.source?.type === 'base64') {
          base64Image = part.source.data;
          mimeType    = part.source.media_type;
        }
      }
    } else if (typeof content === 'string') {
      campaignContext = content;
    }

    if (!campaignContext) return res.status(400).json({ error: 'Missing campaign context' });

    console.log(`  Context  : ${campaignContext.slice(0, 100)}`);
    console.log(`  Has Image: ${!!base64Image} | Type: ${mimeType || 'none'}`);
    console.log(`  Image KB : ${base64Image ? Math.round((base64Image.length * 3 / 4) / 1024) + ' KB' : '—'}`);
    console.log('  ──────────────────────────────────────────────────');

    const result = await verifyDocument(campaignContext, base64Image, mimeType);

    // ── FULL RESULT — terminal only, never sent to browser ───────────────
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║              VERIFICATION RESULT                ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  🤖 Provider  : ${(result.ai_provider || 'Unknown').padEnd(32)}║`);
    console.log(`║  📄 Class     : ${(result.document_classification || '—').padEnd(32)}║`);
    console.log(`║  🎯 Score     : ${String(result.confidence_score + '/93').padEnd(32)}║`);
    console.log(`║  🚦 Risk      : ${(result.risk_label || '—').padEnd(32)}║`);
    console.log(`║  ✅ Decision  : ${(result.decision || '—').padEnd(32)}║`);
    console.log(`║  🧠 AI Prob   : ${String((result.forensic_analysis?.ai_generation_probability || 0) + '%').padEnd(32)}║`);
    console.log(`║  🔍 Tamper    : ${String((result.forensic_analysis?.tampering_probability || 0) + '%').padEnd(32)}║`);
    console.log(`║  📝 Reason    : ${(result.reason || '—').slice(0, 32).padEnd(32)}║`);
    if (result.penalties?.length) {
      console.log(`║  ⬇  Penalties : ${result.penalties.slice(0, 2).join(' | ').slice(0, 32).padEnd(32)}║`);
    }
    if (result.positive_signals?.length) {
      console.log(`║  ⬆  Positives : ${result.positive_signals.slice(0, 2).join(' | ').slice(0, 32).padEnd(32)}║`);
    }
    console.log('╚══════════════════════════════════════════════════╝\n');

    // ── Strip real provider before sending to browser ────────────────────
    const { ai_provider, penalties, positive_signals, ...safeResult } = result;
    safeResult.ai_provider = 'TransparentFund AI';

    return res.json({ content: [{ text: JSON.stringify(safeResult) }] });

  } catch (err) {
    console.error('\n[AI ROUTE] ❌ FATAL ERROR:', err.message, '\n');
    return res.json({
      content: [{ text: JSON.stringify({
        status:                  'pending_retry',
        confidence_score:        0,
        risk_label:              'HIGH_RISK_FRAUD',
        document_classification: 'unknown',
        decision:                'pending_retry',
        reason:                  'Verification temporarily unavailable.',
        ai_provider:             'TransparentFund AI',
        is_relevant:             true,
        matches_campaign:        true,
        fraud_detected:          false,
      }) }]
    });
  }
});

module.exports = router;