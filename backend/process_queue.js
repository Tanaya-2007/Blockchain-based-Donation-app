require('dotenv').config({ override: true });
const admin = require('firebase-admin');
const { ethers } = require('ethers');

// Initialize Firebase Admin if not initialized
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

const blockchainService = require('./services/blockchain');

async function processQueue() {
  if (!blockchainService.contract) {
    console.error("Relayer not initialized. Check PRIVATE_KEY.");
    return;
  }

  console.log("Checking for queued donations...");
  const donationsSnap = await db.collection('donations')
    .where('blockchainStatus', '==', 'queued_for_chain_sync')
    .get();

  console.log(`Found ${donationsSnap.size} queued donations.`);
  for (const docSnap of donationsSnap.docs) {
    const donationId = docSnap.id;
    const donationData = docSnap.data();
    console.log(`Processing donation ${donationId} (Amount: ${donationData.amount})...`);

    try {
      const usdAmount = Math.max(1, Math.round(Number(donationData.amount) / 83));
      const amountUSDC = ethers.parseUnits(String(usdAmount), 6);
      
      const tx = await blockchainService.contract.donate(donationData.campaignId, amountUSDC);
      console.log(`Tx submitted for donation ${donationId}: ${tx.hash}`);

      // Set to syncing
      await docSnap.ref.update({
        blockchainStatus: 'syncing',
        blockchainTxHash: tx.hash
      });

      const receipt = await tx.wait(1);
      console.log(`Tx confirmed for donation ${donationId}: ${receipt.hash}`);

      const batch = db.batch();
      batch.update(docSnap.ref, {
        blockchainStatus: 'done',
        blockchainTxHash: receipt.hash
      });

      // Update matching ledger entry
      const ledgerSnap = await db.collection('ledger')
        .where('paymentId', '==', donationData.paymentId || '')
        .limit(1)
        .get();

      if (!ledgerSnap.empty) {
        batch.update(ledgerSnap.docs[0].ref, {
          blockchainStatus: 'done',
          blockchainTxHash: receipt.hash
        });
      }
      await batch.commit();
      console.log(`Donation ${donationId} fully synced!`);
    } catch (err) {
      console.error(`Failed to process donation ${donationId}:`, err.message);
    }
  }

  console.log("Checking for queued proofs/milestone releases...");
  const proofsSnap = await db.collection('proofs')
    .where('blockchainStatus', '==', 'queued_for_chain_sync')
    .get();

  console.log(`Found ${proofsSnap.size} queued proofs.`);
  for (const docSnap of proofsSnap.docs) {
    const proofId = docSnap.id;
    const proofData = docSnap.data();
    console.log(`Processing proof ${proofId} (Milestone: ${proofData.milestoneNo})...`);

    try {
      const campaignRef = db.collection('campaigns').doc(proofData.campaignId);
      const campaignSnap = await campaignRef.get();
      if (!campaignSnap.exists) {
        console.error(`Campaign ${proofData.campaignId} not found.`);
        continue;
      }
      const campaignData = campaignSnap.data();
      const ngoWalletAddress = blockchainService.deriveAddress(campaignData.ngoId);
      
      // Calculate nextMilestoneAmt
      const milestones = Array.isArray(campaignData.milestones) 
        ? campaignData.milestones 
        : Object.values(campaignData.milestones || {});
      const currentMilestoneIdx = campaignData.currentMilestone ? campaignData.currentMilestone - 1 : 0;
      const nextMilestone = milestones[currentMilestoneIdx];
      const nextMilestoneAmt = nextMilestone?.amount || (campaignData.targetAmount / (milestones.length || 1));

      const usdAmount = Math.max(1, Math.round(Number(nextMilestoneAmt) / 83));
      const amountUSDC = ethers.parseUnits(String(usdAmount), 6);

      const tx = await blockchainService.contract.releaseMilestone(proofData.campaignId, ngoWalletAddress, amountUSDC);
      console.log(`Tx submitted for release ${proofId}: ${tx.hash}`);

      await docSnap.ref.update({
        blockchainStatus: 'syncing',
        txHash: tx.hash
      });

      const receipt = await tx.wait(1);
      console.log(`Tx confirmed for release ${proofId}: ${receipt.hash}`);

      const batch = db.batch();
      batch.update(docSnap.ref, {
        blockchainStatus: 'done',
        txHash: receipt.hash
      });

      const ledgerSnap = await db.collection('ledger')
        .where('campaignId', '==', proofData.campaignId)
        .where('type', '==', 'milestone_release')
        .where('milestoneNo', '==', proofData.milestoneNo)
        .limit(1)
        .get();

      if (!ledgerSnap.empty) {
        batch.update(ledgerSnap.docs[0].ref, {
          blockchainStatus: 'done',
          txHash: receipt.hash
        });
      }

      await batch.commit();
      console.log(`Proof ${proofId} release fully synced!`);
    } catch (err) {
      console.error(`Failed to process proof ${proofId}:`, err.message);
    }
  }

  // Also check if there's any ledger entries that are queued
  console.log("Checking for queued ledger entries directly...");
  const ledgerSnap = await db.collection('ledger')
    .where('blockchainStatus', '==', 'queued_for_chain_sync')
    .get();
  
  console.log(`Found ${ledgerSnap.size} queued ledger entries.`);
  for (const docSnap of ledgerSnap.docs) {
    const data = docSnap.data();
    // If it's a donation and donation document is done, we can just sync the ledger status directly!
    if (data.type === 'donation' && data.paymentId) {
      const donSnap = await db.collection('donations').where('paymentId', '==', data.paymentId).limit(1).get();
      if (!donSnap.empty) {
        const donData = donSnap.docs[0].data();
        if (donData.blockchainStatus === 'done' && donData.blockchainTxHash) {
          await docSnap.ref.update({
            blockchainStatus: 'done',
            blockchainTxHash: donData.blockchainTxHash
          });
          console.log(`Synced ledger entry ${docSnap.id} from donation document.`);
        }
      }
    }
  }
}

processQueue().then(() => {
  console.log("Queue processing complete!");
  process.exit(0);
}).catch(err => {
  console.error("Queue processing crashed:", err);
  process.exit(1);
});
