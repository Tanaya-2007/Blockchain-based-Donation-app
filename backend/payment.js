// server/routes/payment.js
const express  = require('express');
const Razorpay = require('razorpay');
const crypto   = require('crypto');
const router   = express.Router();

// Initialise Razorpay — keys from env
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ─────────────────────────────────────────────────────────
   POST /api/payment/create-order
   Body: { amount: number (in rupees), campaignId, campaignTitle }
   Returns: { orderId, amount, currency, keyId }
───────────────────────────────────────────────────────── */
router.post('/create-order', async (req, res) => {
  try {
    const { amount, campaignId, campaignTitle } = req.body;

    if (!amount || isNaN(amount) || Number(amount) < 1) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId is required' });
    }

    // Razorpay expects amount in paise (₹1 = 100 paise)
    const amountPaise = Math.round(Number(amount) * 100);

    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      receipt:  `tf_${campaignId}_${Date.now()}`,
      notes: {
        campaignId,
        campaignTitle: campaignTitle || '',
      },
    });

    res.json({
      orderId:       order.id,
      amount:        order.amount,       // paise
      amountRupees:  Number(amount),     // rupees — easier for frontend
      currency:      order.currency,
      keyId:         process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('[Razorpay create-order error]', err);
    res.status(500).json({ error: err.message || 'Order creation failed' });
  }
});

/* ─────────────────────────────────────────────────────────
   POST /api/payment/verify
   Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
   Returns: { verified: boolean }
───────────────────────────────────────────────────────── */
router.post('/verify', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment fields', verified: false });
    }

    // HMAC-SHA256 signature check
    const body      = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected  = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    const verified = expected === razorpay_signature;

    if (!verified) {
      console.warn('[Razorpay verify] Signature mismatch');
      return res.status(400).json({ verified: false, error: 'Signature mismatch — possible tampered request' });
    }

    res.json({ verified: true, paymentId: razorpay_payment_id });
  } catch (err) {
    console.error('[Razorpay verify error]', err);
    res.status(500).json({ verified: false, error: err.message });
  }
});

module.exports = router;