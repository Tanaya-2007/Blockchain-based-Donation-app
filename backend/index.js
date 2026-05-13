require('dotenv').config({ override: true });

console.log("=== ENV DEBUG ===");
console.log("Gemini Key Exists :", !!process.env.GEMINI_API_KEY);
console.log("Gemini Key 2      :", !!process.env.GEMINI_API_KEY_2);
console.log("Gemini Key 3      :", !!process.env.GEMINI_API_KEY_3);
console.log("GROQ Key Exists   :", !!process.env.GROQ_API_KEY);   // ✅ GROQ not GROK
console.log("=================");

if (!process.env.GEMINI_API_KEY) {
  console.log("\x1b[31m%s\x1b[0m", "WARNING: GEMINI_API_KEY is missing!");
}
if (!process.env.GROQ_API_KEY) {                                   // ✅ GROQ not GROK
  console.log("\x1b[33m%s\x1b[0m", "WARNING: GROQ_API_KEY is missing!");
}

const express = require('express');
const cors = require('cors');
const paymentRoutes = require('./payment');
const aiRoutes = require('./routes/ai');
const onchainRoutes = require('./routes/onchain');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://transparent-fund-47cd9.web.app"
  ]
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

/* ── routes ── */
app.use('/api/payment', paymentRoutes);
app.use('/api/onchain', onchainRoutes);
app.use('/api/ai', aiRoutes);

/* ── health check ── */
app.get('/', (req, res) => res.json({ status: 'TransparentFund server running' }));

app.get('/api/debug-ai', (req, res) => {
  res.json({
    gemini_key_1: !!process.env.GEMINI_API_KEY,
    gemini_key_2: !!process.env.GEMINI_API_KEY_2,
    gemini_key_3: !!process.env.GEMINI_API_KEY_3,
    groq_key: !!process.env.GROQ_API_KEY,
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));