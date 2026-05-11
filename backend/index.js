require('dotenv').config({ override: true });

console.log("=== ENV DEBUG ===");
console.log("Gemini Key Exists:", !!process.env.GEMINI_API_KEY);
console.log("Claude Key Exists:", !!process.env.CLAUDE_API_KEY);
console.log("=================");

if (!process.env.GEMINI_API_KEY) {
  console.log("\x1b[31m%s\x1b[0m", "WARNING: GEMINI_API_KEY is missing!");
}
if (!process.env.CLAUDE_API_KEY) {
  console.log("\x1b[33m%s\x1b[0m", "WARNING: CLAUDE_API_KEY is missing!");
}

const express    = require('express');
const cors       = require('cors');
const paymentRoutes = require('./payment');
const aiRoutes  = require('./routes/ai');
const onchainRoutes = require('./routes/onchain');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin:[
   "http://localhost:5173",
   "https://transparent-fund-47cd9.web.app"
 ] }));   // tighten in prod
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

/* ── routes ── */
app.use('/api/payment', paymentRoutes);
app.use('/api/onchain', onchainRoutes);

/* ── AI Verification Route (Claude Proxy) ── */
app.use('/api/ai', aiRoutes);

/* ── health check ── */
app.get('/', (req, res) => res.json({ status: 'TransparentFund server running' }));

app.get('/api/debug-ai', (req, res) => {
  res.json({
    gemini_loaded: !!process.env.GEMINI_API_KEY,
    claude_loaded: !!process.env.CLAUDE_API_KEY
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));