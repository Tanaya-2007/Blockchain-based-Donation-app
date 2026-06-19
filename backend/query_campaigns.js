require('dotenv').config();
const { db } = require('./firebaseAdmin');

async function check() {
  if (!db) {
    console.error('Firebase DB not initialized!');
    return;
  }
  const snap = await db.collection('campaigns').get();
  console.log('--- Campaigns ---');
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id} | Title: "${data.title}" | Status: ${data.status} | HaltedAt: ${data.haltedAt ? data.haltedAt.toDate() : 'none'}`);
  });
  
  const proofSnap = await db.collection('proofs').get();
  console.log('--- Proofs ---');
  proofSnap.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id} | CampaignId: ${data.campaignId} | MilestoneNo: ${data.milestoneNo} | Status: ${data.status}`);
  });
}

check().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
