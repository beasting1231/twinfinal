const admin = require('firebase-admin');
const serviceAccount = require('./functions/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkEmailQueue() {
  try {
    const snapshot = await db.collection('emailQueue')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    console.log(`\n=== Email Queue (${snapshot.size} recent items) ===\n`);

    if (snapshot.empty) {
      console.log('No emails in queue.');
      return;
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`Type: ${data.type}`);
      console.log(`To: ${data.to}`);
      console.log(`Status: ${data.status}`);
      console.log(`Created: ${data.createdAt?.toDate?.() || data.createdAt}`);
      if (data.error) {
        console.log(`Error: ${data.error}`);
      }
      console.log('---');
    });
  } catch (error) {
    console.error('Error checking email queue:', error.message);
  } finally {
    process.exit(0);
  }
}

checkEmailQueue();
