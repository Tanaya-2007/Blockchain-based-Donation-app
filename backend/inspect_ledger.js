require('dotenv').config();
const { db } = require('./firebaseAdmin');

async function inspect() {
  const snap = await db.collection('ledger').limit(1).get();
  snap.forEach(doc => {
    console.log(doc.id, '=>', doc.data());
  });
}

inspect().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
