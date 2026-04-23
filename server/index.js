require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const paymentRoutes = require('./payment');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));   // tighten in prod
app.use(express.json());

/* ── routes ── */
app.use('/api/payment', paymentRoutes);

/* ── health check ── */
app.get('/', (req, res) => res.json({ status: 'TransparentFund server running' }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));