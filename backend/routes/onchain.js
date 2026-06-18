const express = require('express');
const admin = require('firebase-admin');
const { ethers } = require('ethers');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const blockchainService = require('../services/blockchain');

/* ─────────────────────────────────────────────────────────
   POST /api/onchain/queue-donation
   Body: { donationId, amount }
   ───────────────────────────────────────────────────────── */
router.post('/queue-donation', requireAuth, async (req, res) => {
  const { donationId, amount } = req.body;
  console.log(`[Onchain] Logging real donation ${donationId} of $${amount}...`);

  try {
    if (!blockchainService.contract) {
      throw new Error("Relayer not initialized");
    }

    const db = admin.firestore();
    const donationRef = db.collection('donations').doc(donationId);
    const donationSnap = await donationRef.get();
    
    if (!donationSnap.exists) {
      return res.status(404).json({ error: "Donation not found in database" });
    }
    const donationData = donationSnap.data();

    // Convert INR amount to USD (at ₹83 = $1) and then to USDC units (6 decimals)
    const usdAmount = Math.max(1, Math.round(Number(amount) / 83));
    const amountUSDC = ethers.parseUnits(String(usdAmount), 6);
    
    // Call smart contract donate
    const tx = await blockchainService.contract.donate(donationData.campaignId, amountUSDC);
    console.log(`[Onchain] Tx submitted: ${tx.hash}`);

    // Update Firestore to indicate syncing is underway
    await donationRef.update({
      blockchainStatus: 'syncing',
      blockchainTxHash: tx.hash
    });

    const receipt = await tx.wait(1);
    console.log(`[Onchain] Tx confirmed: ${receipt.hash}`);

    // Update Firestore to finished
    const batch = db.batch();
    batch.update(donationRef, {
      blockchainStatus: 'done',
      blockchainTxHash: receipt.hash
    });

    // Update ledger entry if exists
    const ledgerSnap = await db.collection('ledger')
      .where('paymentId', '==', donationData.razorpayPaymentId || '')
      .limit(1)
      .get();
      
    if (!ledgerSnap.empty) {
      batch.update(ledgerSnap.docs[0].ref, {
        blockchainStatus: 'done',
        blockchainTxHash: receipt.hash
      });
    }

    await batch.commit();

    res.json({
      success: true,
      txHash: receipt.hash
    });
  } catch (error) {
    console.error("[Onchain] queue-donation failed:", error);
    res.status(500).json({ error: error.message || "Blockchain transaction failed" });
  }
});

/* ─────────────────────────────────────────────────────────
   POST /api/onchain/queue-release
   Body: { proofId, amount, campaignId }
   ───────────────────────────────────────────────────────── */
router.post('/queue-release', requireAuth, async (req, res) => {
  const { proofId, amount, campaignId } = req.body;
  console.log(`[Onchain] Logging milestone release of $${amount} for campaign ${campaignId}...`);

  try {
    if (!blockchainService.contract) {
      throw new Error("Relayer not initialized");
    }

    const db = admin.firestore();
    const campaignSnap = await db.collection('campaigns').doc(campaignId).get();
    if (!campaignSnap.exists) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    const campaignData = campaignSnap.data();

    // Derive deterministic wallet address for NGO
    const ngoWalletAddress = blockchainService.deriveAddress(campaignData.ngoId);
    // Convert INR amount to USD (at ₹83 = $1) and then to USDC units (6 decimals)
    const usdAmount = Math.max(1, Math.round(Number(amount) / 83));
    const amountUSDC = ethers.parseUnits(String(usdAmount), 6);

    // Call contract releaseMilestone
    const tx = await blockchainService.contract.releaseMilestone(campaignId, ngoWalletAddress, amountUSDC);
    console.log(`[Onchain] Tx submitted: ${tx.hash}`);

    await db.collection('proofs').doc(proofId).update({
      blockchainStatus: 'syncing',
      txHash: tx.hash
    });

    const receipt = await tx.wait(1);
    console.log(`[Onchain] Tx confirmed: ${receipt.hash}`);

    // Update Proof and Ledger entries
    const batch = db.batch();
    batch.update(db.collection('proofs').doc(proofId), {
      blockchainStatus: 'done',
      txHash: receipt.hash
    });

    const ledgerSnap = await db.collection('ledger')
      .where('campaignId', '==', campaignId)
      .where('type', '==', 'milestone_release')
      .where('milestoneNo', '==', campaignData.currentMilestone - 1 || 1)
      .limit(1)
      .get();

    if (!ledgerSnap.empty) {
      batch.update(ledgerSnap.docs[0].ref, {
        blockchainStatus: 'done',
        txHash: receipt.hash
      });
    }

    await batch.commit();

    res.json({
      success: true,
      txHash: receipt.hash
    });
  } catch (error) {
    console.error("[Onchain] queue-release failed:", error);
    res.status(500).json({ error: error.message || "Blockchain transaction failed" });
  }
});

/* ─────────────────────────────────────────────────────────
   POST /api/onchain/queue-refund
   Body: { campaignId }
   ───────────────────────────────────────────────────────── */
router.post('/queue-refund', requireAuth, async (req, res) => {
  const { campaignId } = req.body;
  console.log(`[Onchain] Distributing refunds on-chain for halted campaign ${campaignId}...`);

  try {
    const txHash = await blockchainService.executeOnChainRefund(campaignId);
    res.json({
      success: true,
      txHash: txHash
    });
  } catch (error) {
    console.error("[Onchain] queue-refund failed:", error);
    res.status(500).json({ error: error.message || "Blockchain refund failed" });
  }
});

module.exports = router;
