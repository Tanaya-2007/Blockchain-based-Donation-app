const hre = require("hardhat");

async function main() {
  const address = "0xc12813cEE5c091b728fb65517309DDfce3Bac462";
  console.log(`Checking balance for address: ${address} on network: ${hre.network.name}`);
  const balance = await hre.ethers.provider.getBalance(address);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} POL (MATIC)`);
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
