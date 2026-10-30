import { createRequire } from 'node:module';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8380' ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9399') {
  throw new Error('Seeding is allowed only in the local booking API emulators.');
}
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-twin-history' });
const db = admin.firestore();
const password = 'local-api-only';
const ignoreExisting = error => {
  if (error.code !== 6 && error.code !== 'auth/uid-already-exists' && error.code !== 'auth/email-already-exists') throw error;
};
// Create-only: this seed never replaces or imports existing records.
for (const [uid, email, role, name, emailVerified] of [
  ['local-owner', 'pccbasting@gmail.com', 'admin', 'Local Owner', true],
  ['local-pilot', 'local-pilot@example.test', 'pilot', 'Local Pilot', false],
]) {
  await admin.auth().createUser({ uid, email, emailVerified, password }).catch(ignoreExisting);
  await db.doc(`userProfiles/${uid}`).create({ uid, email, role, displayName: name, theme: 'dark',
    onboardingComplete: true, priority: 1 }).catch(ignoreExisting);
}
const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' })
  .format(new Date(Date.now() + 86400000));
for (const timeSlot of ['8:30', '9:45', '11:00']) {
  await db.doc(`availability/local-${tomorrow}-${timeSlot}`).create({ userId: 'local-pilot', date: tomorrow, timeSlot,
    status: 'available' }).catch(ignoreExisting);
}
for (const [id, customerName, timeIndex] of [['local-booking-1', 'Anna Example', 0], ['local-booking-2', 'Ben Sample', 1]]) {
  await db.doc(`bookings/${id}`).create({ customerName, date: tomorrow, timeIndex, numberOfPeople: 1, span: 1,
    bookingStatus: 'confirmed', email: `${id}@example.test`, assignedPilots: [''], createdAt: new Date() })
    .catch(ignoreExisting);
}
console.log(`Local-only data ready for ${tomorrow}. Owner login: pccbasting@gmail.com (password in this script).`);
await admin.app().delete();
