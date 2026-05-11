const hre = require('hardhat');

async function main() {
    const [signer] = await hre.ethers.getSigners();
    const contractAddress = require('../../frontend/src/utils/contractAddress').CONTRACT_ADDRESS;
    
    console.log('Funding contract directly at ' + contractAddress + ' ...');
    await signer.sendTransaction({
        to: contractAddress, 
        value: hre.ethers.parseEther('100.0')
    });
    console.log('Funded contract with 100 ETH');
}

main().catch(console.error);
