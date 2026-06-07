const express = require('express');
const router  = express.Router();
const { verifyDocument } = require('../services/ai/verifier');
const { db, admin } = require('../firebaseAdmin');
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Strict AI rate limiter: 30 requests per hour per IP
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  message: { error: 'AI rate limit exceeded. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/messages', requireAuth, aiLimiter, async (req, res) => {

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

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║              VERIFICATION RESULT                ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  🤖 Provider  : ${(result.ai_provider || 'Unknown').padEnd(32)}║`);
    console.log(`║  📄 Class     : ${(result.document_classification || '—').padEnd(32)}║`);
    console.log(`║  🎯 Score     : ${String((result.confidence_score || 0) + '/93').padEnd(32)}║`);
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

      return res.json({ content: [{ text: JSON.stringify(result) }] });

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
        ai_provider:             'Service Outage',
        is_relevant:             true,
        matches_campaign:        true,
        fraud_detected:          false,
      }) }]
    });
  }
});

router.post('/verify-milestone', requireAuth, aiLimiter, async (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Backend Firebase not configured' });
  }

  const {
    imageBase64, imageType, campaignContext,
    campaignId, campaignTitle, ngoId, ngoName, milestoneNo, fileUrls
  } = req.body;

  if (!campaignContext || !campaignId || !ngoId || !milestoneNo) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const aiResult = await verifyDocument(campaignContext, imageBase64, imageType);
    const score = aiResult.confidence_score ?? 0;
    
    let finalStatus;
    if (aiResult.decision === 'pending_retry' || aiResult.status === 'pending_retry') {
      finalStatus = 'pending_retry';
    } else if (score >= 75) {
      finalStatus = 'pending_admin_review';
    } else {
      finalStatus = 'rejected';
    }
    aiResult.status = finalStatus;

    if (finalStatus !== 'pending_retry') {
      // 1. Securely save proof to DB
      await db.collection('proofs').add({
        campaignId,
        campaignTitle: campaignTitle || '',
        ngoId,
        ngoName: ngoName || '',
        milestoneNo: Number(milestoneNo),
        fileUrls: fileUrls || [],
        aiScore: score,
        aiVerdict: aiResult.status,
        aiSummary: aiResult.reason || '',
        aiProvider: aiResult.ai_provider || 'Unknown',
        status: finalStatus,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 2. Securely update campaign if passed
      if (finalStatus === 'pending_admin_review') {
        const campRef = db.collection('campaigns').doc(campaignId);
        const campSnap = await campRef.get();
        if (campSnap.exists) {
          const campData = campSnap.data();
          let milestones = Array.isArray(campData.milestones) ? campData.milestones : [];
          if (!Array.isArray(campData.milestones) && campData.milestones) {
             milestones = Object.keys(campData.milestones).sort((a,b) => Number(a)-Number(b)).map(k => campData.milestones[k]);
          }
          
          const msIndex = Number(milestoneNo) - 1;
          const updatedMilestones = milestones.map((m, i) => 
            i === msIndex ? { ...m, status: 'verified' } : m
          );

          await campRef.update({
            milestones: updatedMilestones,
            currentMilestone: Number(milestoneNo) + 1
          });
        }
      }
    }

    return res.json({ result: aiResult, finalStatus });
  } catch (err) {
    console.error('[AI verify-milestone error]', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;