require('dotenv').config();
const { db } = require('./firebaseAdmin');

async function check() {
  if (!db) {
    console.error('Firebase DB not initialized!');
    return;
  }
  const snap = await db.collection('ledger').get();
  console.log('--- Ledger ---');
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id} | Camp: "${data.camp}" | Type: ${data.type} | Amt: ${data.amt} | bchainStatus: ${data.blockchainStatus} | Hash: ${data.blockchainTxHash || data.hash}`);
  });
}

check().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
