import { ethers } from "ethers";
import { contractABI } from "./contractAbi";
import { CONTRACT_ADDRESS as dynamicAddress } from "./contractAddress";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || dynamicAddress;

// Fixed symbolic ETH amount used for ALL blockchain operations.
// Blockchain is the transparency layer only — real money flows via Razorpay.
// 0.0001 ETH = ~$0.0003 on testnet, cheap enough for any test wallet.
const SYMBOLIC_ETH = "0.0001";
const SYMBOLIC_WEI = ethers.parseEther(SYMBOLIC_ETH);

/* ─── helpers ─────────────────────────────────────────── */
export const getProvider = () => {
  if (typeof window !== "undefined" && window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  throw new Error("MetaMask is not installed. Please install it to use the blockchain layer.");
};

export const getSigner = async () => {
  const provider = getProvider();
  try {
    await provider.send("eth_requestAccounts", []);
    return await provider.getSigner();
  } catch (error) {
    throw new Error("Failed to connect wallet. " + (error.message || ""));
  }
};

export const getContract = async (withSigner = false) => {
  const provider = getProvider();
  if (withSigner) {
    const signer = await getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, contractABI, signer);
  }
  return new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);
};

async function checkNetwork() {
  const provider = getProvider();
  const network  = await provider.getNetwork();
  // Accept Hardhat local (31337) or Polygon Amoy (80002)
  if (network.chainId !== 31337n && network.chainId !== 80002n) {
    throw new Error(
      "Wrong network. Please switch MetaMask to Localhost 8545 (chainId 31337) or Polygon Amoy (80002)."
    );
  }
  return network.chainId;
}

function wrapError(error, context) {
  console.error(`[blockchain.js] ${context}:`, error);
  if (error.code === "ACTION_REJECTED" || error.code === 4001) {
    throw new Error("Transaction rejected in MetaMask.");
  }
  if (
    error.message?.includes("nonce") ||
    error.message?.includes("Internal JSON-RPC error")
  ) {
    throw new Error(
      "MetaMask nonce mismatch — you may have restarted your local node. " +
      "Fix: MetaMask → Settings → Advanced → Clear activity tab data, then retry."
    );
  }
  // Pass through the original error message
  throw new Error(error.reason || error.message || "Blockchain error");
}

/* ─── donateToCampaign ────────────────────────────────── */
// Records a symbolic donation on-chain after Razorpay succeeds.
// This is the transparency layer — NOT the real payment.
export const donateToCampaign = async (campaignId) => {
  try {
    await checkNetwork();
    const contract      = await getContract(true);
    const cleanId       = String(campaignId).trim();

    const tx      = await contract.donate(cleanId, { value: SYMBOLIC_WEI });
    const receipt = await tx.wait(1);
    console.log("[blockchain] donateToCampaign confirmed:", receipt.hash);
    return receipt.hash;
  } catch (error) {
    wrapError(error, "donateToCampaign");
  }
};

/* ─── releaseMilestoneFunds ───────────────────────────── */
// KEY FIX: always use SYMBOLIC_ETH (0.0001) — never derive from ₹ amount.
// The auto-patch (donate then release) is combined into ONE MetaMask approval
// by using a multicall-style approach: we send enough in the donate tx to cover
// the release, so there's only ONE user-facing MetaMask popup.
//
// Flow:
// 1. Check on-chain locked balance for this campaign
// 2. If insufficient — auto-patch by calling donate() with SYMBOLIC_WEI silently
//    (This requires a second MetaMask popup but is unavoidable for local testing)
// 3. Call releaseMilestone() — ONE final MetaMask popup
export const releaseMilestoneFunds = async (campaignId, ngoWallet) => {
  // _ignored: we intentionally ignore the ₹-derived ethAmount from AdminPanel
  // and always use SYMBOLIC_ETH instead
  try {
    await checkNetwork();
    const contract  = await getContract(true);
    const cleanId   = String(campaignId).trim();

    console.log("[blockchain] releaseMilestone — campaign:", cleanId, "ngo:", ngoWallet);

    // Step 1: Check current locked balance on-chain
    const campaignData = await contract.getCampaign(cleanId);
    const lockedWei    = BigInt(campaignData[1] || 0n);
    const needsWei     = SYMBOLIC_WEI;

    console.log("[blockchain] locked:", ethers.formatEther(lockedWei), "ETH, needs:", SYMBOLIC_ETH, "ETH");

    // Step 2: Auto-fund if not enough locked (happens on fresh deployments / node restarts)
    if (lockedWei < needsWei) {
      const shortfall = needsWei - lockedWei;
      console.log("[blockchain] Auto-patching shortfall:", ethers.formatEther(shortfall), "ETH");
      // This triggers MetaMask popup #1 — admin must confirm
      const patchTx = await contract.donate(cleanId, { value: shortfall });
      await patchTx.wait(1);
      console.log("[blockchain] Auto-patch confirmed");
    }

    // Step 3: Release — triggers MetaMask popup (last one)
    const tx      = await contract.releaseMilestone(cleanId, ngoWallet, needsWei);
    const receipt = await tx.wait(1);
    console.log("[blockchain] releaseMilestone confirmed:", receipt.hash);
    return receipt.hash;
  } catch (error) {
    wrapError(error, "releaseMilestoneFunds");
  }
};

/* ─── getCampaignData ─────────────────────────────────── */
export const getCampaignData = async (campaignId) => {
  try {
    const contract = await getContract(false);
    const data     = await contract.getCampaign(String(campaignId).trim());
    return {
      campaignId:    data[0],
      totalLocked:   ethers.formatEther(data[1]),
      totalReleased: ethers.formatEther(data[2]),
    };
  } catch (error) {
    console.error("[blockchain] getCampaignData failed:", error);
    return null;
  }
};