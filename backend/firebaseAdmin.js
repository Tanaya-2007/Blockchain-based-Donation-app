const admin = require('firebase-admin');

// Initialize with environment variables
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('[Firebase Admin] Initialized securely');
    } else {
      console.warn('[Firebase Admin] WARNING: FIREBASE_SERVICE_ACCOUNT is missing in .env');
    }
  } catch (error) {
    console.warn('[Firebase Admin] WARNING: Failed to initialize. Invalid JSON in FIREBASE_SERVICE_ACCOUNT.', error.message);
  }
}

const db = admin.apps.length ? admin.firestore() : null;

module.exports = { admin, db };
