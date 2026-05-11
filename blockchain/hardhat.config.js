require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,   // smaller bytecode = lower gas on deployment
        runs: 200,
      },
    },
  },

  networks: {
    // ── local dev (npx hardhat node) ──────────────────────────────────────
    localhost: {
      url: "http://127.0.0.1:8545",
    },

    // ── Polygon Amoy testnet (use for hackathon demo) ─────────────────────
    amoy: {
      url:      process.env.AMOY_RPC_URL   || "",
      accounts: process.env.PRIVATE_KEY ? [`0x${process.env.PRIVATE_KEY.replace(/^0x/, "")}`] : [],
      chainId:  80002,
    },

    // ── Polygon Mainnet (production — only use when ready) ────────────────
    polygon: {
      url:      process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      accounts: process.env.PRIVATE_KEY ? [`0x${process.env.PRIVATE_KEY.replace(/^0x/, "")}`] : [],
      chainId:  137,
    },
  },

  // ── Polygonscan verification (shows readable source on block explorer) ──
  // Get free API key: https://polygonscan.com/myapikey
  etherscan: {
    apiKey: {
      polygon:         process.env.POLYGONSCAN_API_KEY || "",
      polygonAmoy:     process.env.POLYGONSCAN_API_KEY || "",
    },
    customChains: [
      {
        network:   "polygonAmoy",
        chainId:   80002,
        urls: {
          apiURL:     "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com",
        },
      },
    ],
  },

  // ── gas reporter (optional — shows gas cost of each function) ──────────
  gasReporter: {
    enabled:  process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};