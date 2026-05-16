require('dotenv').config({ override: true });

console.log("=== ENV DEBUG ===");
console.log("Gemini Key 1 :", !!process.env.GEMINI_API_KEY);
console.log("Gemini Key 2 :", !!process.env.GEMINI_API_KEY_2);
console.log("Gemini Key 3 :", !!process.env.GEMINI_API_KEY_3);
console.log("GROQ Key     :", !!process.env.GROQ_API_KEY);
console.log("Claude Key   :", !!process.env.CLAUDE_API_KEY);
console.log("Razorpay     :", !!process.env.RAZORPAY_KEY_ID);
console.log("=================");

if (!process.env.GEMINI_API_KEY) console.log("\x1b[31m%s\x1b[0m", "WARNING: GEMINI_API_KEY missing!");
if (!process.env.GROQ_API_KEY)   console.log("\x1b[33m%s\x1b[0m", "WARNING: GROQ_API_KEY missing!");
if (!process.env.RAZORPAY_KEY_ID)console.log("\x1b[31m%s\x1b[0m", "WARNING: RAZORPAY_KEY_ID missing!");

const express       = require('express');
const cors          = require('cors');
const paymentRoutes = require('./payment');
const aiRoutes      = require('./routes/ai');
const onchainRoutes = require('./routes/onchain');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://transparent-fund-47cd9.web.app",
    "https://transparent-fund-47cd9.firebaseapp.com"
  ]
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/api/payment', paymentRoutes);
app.use('/api/onchain', onchainRoutes);
app.use('/api/ai',      aiRoutes);

app.get('/', (req, res) => res.json({ status: 'TransparentFund backend running ✅' }));

app.get('/api/debug-ai', (req, res) => {
  res.json({
    gemini_key_1: !!process.env.GEMINI_API_KEY,
    gemini_key_2: !!process.env.GEMINI_API_KEY_2,
    gemini_key_3: !!process.env.GEMINI_API_KEY_3,
    groq_key:     !!process.env.GROQ_API_KEY,
    claude_key:   !!process.env.CLAUDE_API_KEY,
    razorpay:     !!process.env.RAZORPAY_KEY_ID,
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);

  // ── Keep-alive: ping self every 14 mins so Render never cold-starts ──
  // Only runs in production (Render sets NODE_ENV=production automatically)
  if (process.env.NODE_ENV === 'production') {
    const SELF_URL = 'https://blockchain-based-donation-app.onrender.com';
    setInterval(async () => {
      try {
        const https = require('https');
        https.get(`${SELF_URL}/`, () => {
          console.log('[Keep-alive] Ping sent ✅');
        }).on('error', () => {
          console.log('[Keep-alive] Ping failed (non-critical)');
        });
      } catch (_) {}
    }, 14 * 60 * 1000); // every 14 minutes
    console.log('[Keep-alive] Auto-ping enabled for Render free tier');
  }
});