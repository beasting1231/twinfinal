#!/usr/bin/env node

const admin = require('firebase-admin');

// Initialize without service account (uses Application Default Credentials)
admin.initializeApp({
  projectId: 'twinscheduler'
});

const db = admin.firestore();

async function listEmailQueue() {
  try {
    const snapshot = await db.collection('emailQueue')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    console.log('\n========================================');
    console.log(`EMAIL QUEUE - Total: ${snapshot.size} items`);
    console.log('========================================\n');

    if (snapshot.empty) {
      console.log('✅ Queue is empty - no pending emails\n');
      process.exit(0);
    }

    snapshot.forEach((doc, index) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
      const sentAt = data.sentAt?.toDate ? data.sentAt.toDate() : data.sentAt;

      console.log(`[${index + 1}] Document ID: ${doc.id}`);
      console.log(`    To: ${data.to}`);
      console.log(`    Customer: ${data.customerName}`);
      console.log(`    Type: ${data.type}`);
      console.log(`    Status: ${data.status}`);
      console.log(`    Created: ${createdAt}`);
      if (sentAt) {
        console.log(`    Sent: ${sentAt}`);
      }
      if (data.error) {
        console.log(`    Error: ${data.error}`);
      }
      console.log('');
    });

    // Summary
    const pending = snapshot.docs.filter(doc => doc.data().status === 'pending').length;
    const failed = snapshot.docs.filter(doc => doc.data().status === 'failed').length;
    const sent = snapshot.docs.filter(doc => doc.data().status === 'sent').length;

    console.log('========================================');
    console.log('SUMMARY:');
    console.log(`  Sent: ${sent}`);
    console.log(`  Pending: ${pending}`);
    console.log(`  Failed: ${failed}`);
    console.log('========================================\n');

    if (pending > 0 || failed > 0) {
      console.log('⚠️  There are stuck emails that need attention!\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error fetching email queue:', error.message);
    console.error('\nTrying alternative authentication method...\n');

    // If default credentials fail, suggest manual check
    console.log('Please run: firebase login');
    console.log('Then run this script again.\n');
    process.exit(1);
  }
}

listEmailQueue();
