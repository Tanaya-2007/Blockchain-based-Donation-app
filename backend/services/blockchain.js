const { ethers } = require('ethers');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { CONTRACT_ADDRESS } = require('../contractAddress');

const RPC_URL = process.env.SEPOLIA_RPC_URL || "https://rpc.ankr.com/eth_sepolia";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

let wallet;
let contract;

if (PRIVATE_KEY) {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    const fundABI = [
      "function donate(string memory _campaignId, uint256 _amount) public",
      "function releaseMilestone(string memory _campaignId, address _ngoWallet, uint256 _amount) public",
      "function refundCampaign(string memory _campaignId, address[] memory _donors, uint256[] memory _amounts) public"
    ];
    
    contract = new ethers.Contract(CONTRACT_ADDRESS, fundABI, wallet);
    console.log(`[Blockchain Service] Loaded relayer wallet: ${wallet.address}`);
  } catch (err) {
    console.error("[Blockchain Service] Relayer initialization failed:", err.message);
  }
} else {
  console.warn("[Blockchain Service] WARNING: PRIVATE_KEY missing! Relayer disabled.");
}

function deriveAddress(id) {
  if (!id) return ethers.ZeroAddress;
  const hash = crypto.createHash('sha256').update(String(id)).digest('hex');
  return ethers.getAddress('0x' + hash.slice(0, 40));
}

async function executeOnChainRefund(campaignId) {
  if (!wallet || !contract) {
    console.warn("[Blockchain Service] Relayer not initialized. Skipping on-chain refund.");
    return null;
  }

  const db = admin.firestore();
  
  // Fetch all donations to distribute on-chain
  const donationsSnap = await db.collection('donations')
    .where('campaignId', '==', campaignId)
    .where('status', '==', 'refunded')
    .get();

  if (donationsSnap.empty) {
    console.log("[Blockchain Service] No refunded donations found to record on-chain.");
    return null;
  }

  const donors = [];
  const amounts = [];

  donationsSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    const donorAddress = data.walletAddress || deriveAddress(data.donorId);
    const refundedAmount = data.refundedAmount || data.amount || 0;

    if (donorAddress && refundedAmount > 0) {
      const refundedUSD = Math.max(1, Math.round(Number(refundedAmount) / 83));
      donors.push(donorAddress);
      amounts.push(ethers.parseUnits(String(refundedUSD), 6));
    }
  });

  if (donors.length === 0) return null;

  console.log(`[Blockchain Service] Refunding ${donors.length} donors on-chain for campaign ${campaignId}...`);
  const tx = await contract.refundCampaign(campaignId, donors, amounts);
  console.log(`[Blockchain Service] Refund Tx submitted: ${tx.hash}`);

  const receipt = await tx.wait(1);
  console.log(`[Blockchain Service] Refund Tx confirmed: ${receipt.hash}`);

  // Update matching ledger entries
  const batch = db.batch();
  const ledgerSnap = await db.collection('ledger')
    .where('campaignId', '==', campaignId)
    .where('type', '==', 'refund')
    .get();

  ledgerSnap.docs.forEach(lDoc => {
    batch.update(lDoc.ref, {
      blockchainStatus: 'done',
      txHash: receipt.hash
    });
  });

  await batch.commit();
  return receipt.hash;
}

module.exports = {
  wallet,
  contract,
  deriveAddress,
  executeOnChainRefund
};
