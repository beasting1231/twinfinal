const admin = require('firebase-admin');

// Initialize with project ID
admin.initializeApp({
  projectId: 'twinscheduler'
});

const db = admin.firestore();

async function checkEmailQueue() {
  try {
    const snapshot = await db.collection('emailQueue')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    console.log(`\n=== Email Queue (${snapshot.size} items) ===\n`);

    if (snapshot.empty) {
      console.log('No emails in queue.');
      return;
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`Type: ${data.type}`);
      console.log(`To: ${data.to}`);
      console.log(`Customer: ${data.customerName}`);
      console.log(`Status: ${data.status}`);
      const createdAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt;
      console.log(`Created: ${createdAt}`);
      if (data.sentAt) {
        const sentAt = data.sentAt.toDate ? data.sentAt.toDate() : data.sentAt;
        console.log(`Sent: ${sentAt}`);
      }
      if (data.error) {
        console.log(`Error: ${data.error}`);
      }
      console.log('---');
    });
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

checkEmailQueue();
