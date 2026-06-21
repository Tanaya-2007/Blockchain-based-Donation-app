# 🚀 TransparentFund

> AI-Verified Blockchain Crowdfunding Platform with Milestone-Based Escrow, Fraud Detection, and Donor Protection.

![React](https://img.shields.io/badge/Frontend-React-blue)
![Node.js](https://img.shields.io/badge/Backend-Node.js-green)
![Firebase](https://img.shields.io/badge/Database-Firebase-orange)
![Gemini](https://img.shields.io/badge/AI-Google%20Gemini-red)
![Ethereum](https://img.shields.io/badge/Blockchain-Sepolia-purple)
![Solidity](https://img.shields.io/badge/Smart%20Contracts-Solidity-black)

---

# 🌍 The Problem

Traditional crowdfunding and charity platforms suffer from a fundamental trust issue.

Donors often have no visibility into:

- Where their money goes
- Whether milestones are actually completed
- Whether uploaded documents are genuine
- How funds are being utilized

In most platforms, NGOs receive 100% of the funds immediately after a campaign succeeds.

This creates opportunities for:

❌ Fund misuse  
❌ Fake campaigns  
❌ Forged documents  
❌ Lack of accountability  
❌ Reduced donor trust

---

# 💡 Our Solution

TransparentFund introduces an **AI-Verified Escrow-Based Crowdfunding Model**.

Instead of releasing all funds immediately:

1. Donors contribute to a campaign.
2. Funds are locked inside a blockchain escrow smart contract.
3. NGOs complete milestones.
4. Proof documents are uploaded.
5. AI performs forensic fraud analysis.
6. Admin reviews eligible submissions.
7. Funds are released milestone-by-milestone.
8. Fraudulent campaigns trigger automatic donor refunds.

This ensures transparency, accountability, and donor protection.

---

# 🔥 Core Features

## 🔒 Smart Contract Escrow

Unlike traditional crowdfunding platforms:

- Funds remain locked in smart contracts
- NGOs cannot access money immediately
- Releases happen only after milestone verification
- Every transaction is auditable on-chain

### Smart Contract Capabilities

- Campaign fund locking
- Milestone-based releases
- Batch refunds
- Transaction tracking
- Donor fund protection

---

## 🤖 AI-Powered Document Verification

Every uploaded document undergoes multiple verification layers.

### AI Verification Pipeline

Primary:

- Google Gemini

Fallback:

- Grok

Emergency Fallback:

- OCR + Rule-Based Analysis

This ensures the verification system never fails due to provider outages.

---

## 🔬 Forensic Fraud Detection

The platform performs forensic analysis to detect:

### AI Generated Documents

Detection signals include:

- Diffusion artifacts
- Unrealistic paper texture
- Synthetic signatures
- Digital stamp overlays
- Perfect alignment anomalies
- GAN smoothing artifacts

### Tampered Documents

Detection signals include:

- Compression inconsistencies
- Clone stamp artifacts
- Pixel repetition
- Copy-paste text insertion
- Mismatched sharpness regions

### Authenticity Indicators

Positive signals include:

- Paper grain
- Scan noise
- Ink bleed
- Natural imperfections
- Realistic signatures
- Official document formatting

---

## 📄 Milestone Verification System

Example:

### Milestone 1

Hospital admission completed

Required proof:

- Admission letter
- Initial invoice
- Medical report

### Milestone 2

Treatment completed

Required proof:

- Final bill
- Completion certificate
- Medical receipts

Only verified milestones unlock funds.

---

## 🛡️ Admin Review Workflow

The AI assigns a confidence score.

### Verification Logic

AI Score ≥ 75

➡ Sent to Admin Review

Admin can:

- Approve
- Reject
- Request re-upload

AI detects fraud

➡ Immediate Rejection

No milestone release occurs.

---

## 💸 Automatic Refund Protection

If a campaign is rejected:

1. Smart contract halts the campaign
2. Refund transaction is created
3. Donors receive funds back automatically

### Donor Protection Guarantee

✅ Milestone verified → Funds released

❌ Fraud detected → Funds refunded

---

# 💱 Dual Currency Architecture

## User Side

Donors pay using INR.

Supported methods:

- UPI
- Credit Card
- Debit Card
- Net Banking
- Wallets

Powered by Razorpay.

---

## Blockchain Side

The system converts INR to USDC equivalent.

Example:

₹830

↓

$10 USDC

↓

Locked into Escrow Contract

This creates an auditable blockchain record while keeping donations simple for Indian users.

---

# ⚙️ Relayer System

Donors do not need:

- MetaMask
- Test ETH
- Blockchain knowledge

The backend relayer:

1. Receives payment confirmation
2. Calculates USDC equivalent
3. Signs transaction
4. Sends funds to smart contract

This provides a Web2-like experience with Web3 transparency.

---

# ⛓️ Blockchain Layer

Network:

- Ethereum Sepolia Testnet

---

### MockUSDC.sol

ERC-20 Stablecoin

Features:

- USDC simulation
- 6 decimals
- Faucet minting

---

### TransparentFund.sol

Escrow Contract

Functions:

- donate()
- releaseMilestone()
- refundCampaign()

Responsibilities:

- Lock campaign funds
- Release verified milestones
- Execute donor refunds

---

# 📜 Public Transparency Ledger

Every major action becomes publicly traceable.

Recorded Events:

- Donations
- Milestone submissions
- AI decisions
- Admin approvals
- Fund releases
- Refunds

Users can verify:

- Campaign progress
- Fund movement
- Blockchain transactions
- Release history

---

# 📊 Dashboards

## 👤 Donor Dashboard

Features:

- Donation history
- Refund tracking
- Campaign contributions
- Blockchain receipts
- Impact monitoring

---

## 🏥 NGO Dashboard

Features:

- Campaign creation
- Milestone management
- Document uploads
- Fund tracking
- Analytics

---

## 🛡️ Admin Dashboard

Features:

- NGO approval workflow
- AI review results
- Fraud monitoring
- Campaign moderation
- Milestone approval

---

# 🧰 Technology Stack

## Frontend

- React.js
- Vite
- Framer Motion
- Recharts
- Ethers.js

---

## Backend

- Node.js
- Express.js
- Razorpay SDK
- Firebase Admin SDK

---

## Database

### Firebase Firestore

Collections:

- users
- campaigns
- donations
- proofs
- ledger

---

## Authentication

- Firebase Authentication

---

## Artificial Intelligence

Primary Provider:

- Google Gemini

Fallback Provider:

- Grok

Additional Layer:

- OCR Analysis
- Forensic Detection Engine
- Rule-Based Validation

---

## Blockchain

- Solidity
- Hardhat
- Ethers.js
- Sepolia Testnet
- ERC-20 MockUSDC

---

# 🔄 System Workflow

Donor

↓
Razorpay Payment

↓
Backend Relayer

↓
USDC Conversion

↓
Smart Contract Escrow

↓
NGO Uploads Proof

↓
Gemini Verification

↓ (if unavailable)

Grok Verification

↓ (if unavailable)

OCR Verification

↓

Fraud Detection Engine

↓

Score ≥ 75

↓

Admin Review

↓

Approved

↓

Milestone Release

↓

Ledger Update

↓

Public Transparency

---

Fraud Detected

↓

Campaign Halted

↓

Batch Refund

↓

Donors Refunded

---

# 🎯 Key Benefits

### For Donors

- Complete transparency
- On-chain verification
- Refund protection
- Fraud prevention

### For NGOs

- Increased credibility
- Transparent fundraising
- Structured milestone releases

### For Administrators

- AI-assisted verification
- Reduced manual workload
- Fraud detection tools

---

# 🚀 Future Roadmap

- Real USDC integration
- Multi-chain support
- DAO governance
- AI anomaly detection
- Automated milestone auditing
- Mobile application
- Real-time analytics

---

# 👨‍💻 Team

Built collaboratively by a passionate team focused on combining:

- Artificial Intelligence
- Blockchain Technology
- FinTech
- Transparency Systems

to create a safer and more accountable crowdfunding ecosystem.

---

## 🌟 TransparentFund

**"Trust is not claimed. Trust is verified."**