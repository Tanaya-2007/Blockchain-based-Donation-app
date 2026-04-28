require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const paymentRoutes = require('./payment');
const verifyRoutes  = require('./routes/verify');
const onchainRoutes = require('./routes/onchain');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));   // tighten in prod
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

/* ── routes ── */
app.use('/api/payment', paymentRoutes);
app.use('/api/onchain', onchainRoutes);

/* ── AI Verification Route (Gemini 2.5 Flash) ── */
app.use('/api/ai', verifyRoutes);

/* ── health check ── */
app.get('/', (req, res) => res.json({ status: 'TransparentFund server running' }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));