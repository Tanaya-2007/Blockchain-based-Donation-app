import { ethers } from "ethers";
import { contractABI } from "./contractAbi";

// This will be automatically updated by the deploy script or by .env
// We can use a fallback or window object to make it flexible
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 

export const getProvider = () => {
  if (window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  } else {
    console.warn("No ethereum provider found. Please install MetaMask!");
    return null;
  }
};

export const getSigner = async () => {
  const provider = getProvider();
  if (provider) {
    await provider.send("eth_requestAccounts", []);
    return provider.getSigner();
  }
  return null;
};

export const getContract = async (withSigner = false) => {
  const provider = getProvider();
  if (!provider) return null;

  if (withSigner) {
    const signer = await getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, contractABI, signer);
  } else {
    return new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);
  }
};

export const donateToCampaign = async (campaignId, amountInEth) => {
  try {
    const contract = await getContract(true);
    if (!contract) throw new Error("Contract not found");

    const amountWei = ethers.parseEther(amountInEth.toString());
    const tx = await contract.donate(campaignId, { value: amountWei });
    console.log("Transaction submitted: ", tx.hash);

    const receipt = await tx.wait();
    console.log("Transaction confirmed: ", receipt);

    return tx.hash;
  } catch (error) {
    console.error("Donation failed: ", error);
    throw error;
  }
};

export const releaseMilestoneFunds = async (campaignId, ngoWallet, amountInEth) => {
  try {
    const contract = await getContract(true);
    if (!contract) throw new Error("Contract not found");

    const amountWei = ethers.parseEther(amountInEth.toString());
    const tx = await contract.releaseMilestone(campaignId, ngoWallet, amountWei);
    console.log("Transaction submitted: ", tx.hash);

    const receipt = await tx.wait();
    console.log("Transaction confirmed: ", receipt);

    return tx.hash;
  } catch (error) {
    console.error("Milestone release failed: ", error);
    throw error;
  }
};

export const getCampaignData = async (campaignId) => {
    try {
        const contract = await getContract(false);
        if (!contract) throw new Error("Contract not found");
        
        const data = await contract.getCampaign(campaignId);
        return {
            campaignId: data[0],
            totalLocked: ethers.formatEther(data[1]),
            totalReleased: ethers.formatEther(data[2]),
        };
    } catch (error) {
        console.error("Failed to fetch campaign data:", error);
        return null;
    }
}
