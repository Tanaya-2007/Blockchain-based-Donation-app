const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

router.post('/queue-donation', requireAuth, (req, res) => {
  const { donationId, amount } = req.body;
  console.log(`[Onchain] Queuing donation ${donationId} for ${amount}...`);

  // Simulate blockchain confirmation delay
  setTimeout(() => {
    res.json({
      success: true,
      txHash: '0x' + crypto.randomBytes(32).toString('hex')
    });
  }, 2500);
});

// Mock background queue for milestone releases to blockchain
router.post('/queue-release', requireAuth, (req, res) => {
  const { proofId, amount, campaignId } = req.body;
  console.log(`[Onchain] Queuing release of ${amount} for proof ${proofId}...`);

  // Simulate blockchain confirmation delay
  setTimeout(() => {
    res.json({
      success: true,
      txHash: '0x' + crypto.randomBytes(32).toString('hex')
    });
  }, 2500);
});

module.exports = router;
