const admin = require('firebase-admin');

const USER_UID = 'Q8cMukfAMNOWTJ0gE7TViFWZGXs1';
const USER_EMAIL = 'nic_nussbaum@hotmail.com';

async function deleteUserData() {
  // Initialize with service account or application default credentials
  admin.initializeApp({
    projectId: 'twinscheduler'
  });

  const db = admin.firestore();

  console.log(`\n=== Deleting data for user: ${USER_EMAIL} (${USER_UID}) ===\n`);

  // 1. Find and delete all availability documents for this user
  console.log('1. Searching for availability documents...');
  const availabilityRef = db.collection('availability');
  const availabilitySnapshot = await availabilityRef.where('userId', '==', USER_UID).get();

  if (availabilitySnapshot.empty) {
    console.log('   No availability documents found for this user.');
  } else {
    console.log(`   Found ${availabilitySnapshot.size} availability document(s).`);

    const batch = db.batch();
    availabilitySnapshot.forEach(doc => {
      console.log(`   - Deleting: ${doc.id}`);
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log('   ✓ Availability documents deleted.');
  }

  // 2. Delete the user document from users collection
  console.log('\n2. Deleting user document from users collection...');
  const userDocRef = db.collection('users').doc(USER_UID);
  const userDoc = await userDocRef.get();

  if (!userDoc.exists) {
    console.log('   User document not found in users collection.');
  } else {
    console.log(`   Found user document. Data: ${JSON.stringify(userDoc.data(), null, 2)}`);
    await userDocRef.delete();
    console.log('   ✓ User document deleted from users collection.');
  }

  // 3. Check and delete from userProfiles collection
  console.log('\n3. Checking userProfiles collection...');
  const userProfileRef = db.collection('userProfiles').doc(USER_UID);
  const userProfileDoc = await userProfileRef.get();

  if (!userProfileDoc.exists) {
    console.log('   User profile not found in userProfiles collection.');
  } else {
    console.log(`   Found user profile. Data: ${JSON.stringify(userProfileDoc.data(), null, 2)}`);
    await userProfileRef.delete();
    console.log('   ✓ User profile deleted from userProfiles collection.');
  }

  console.log('\n=== Firestore data deletion complete ===\n');
  console.log('NOTE: To delete from Firebase Authentication, run:');
  console.log(`firebase auth:delete ${USER_UID} --project twinscheduler`);
}

deleteUserData().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
