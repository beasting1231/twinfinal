import { createRequire } from 'node:module';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8180' ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9199') {
  throw new Error('Seeding is allowed only in the local availability emulators.');
}
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-twin-history' });
const db = admin.firestore();
// Create-only: this seed never replaces or imports existing records.
for (const [uid, role, name] of [['preview-admin', 'admin', 'Preview Admin'], ['preview-pilot', 'pilot', 'Preview Pilot']]) {
  try {
    await admin.auth().createUser({ uid, email: `${uid}@example.test`, password: 'local-history-only' });
  } catch (error) { if (error.code !== 'auth/uid-already-exists' && error.code !== 'auth/email-already-exists') throw error; }
  try {
    await db.doc(`userProfiles/${uid}`).create({ uid, email: `${uid}@example.test`, role, displayName: name, theme: 'dark', onboardingComplete: true, priority: 1 });
  } catch (error) { if (error.code !== 6) throw error; }
}
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date());
for (const [timeSlot, status] of [['7:30', 'available'], ['8:30', 'unavailable']]) {
  try {
    await db.doc(`availability/preview-${today}-${timeSlot}`).create({
      userId: 'preview-pilot', date: today, timeSlot, status,
      signedInAt: '2026-05-07T05:42:40.147Z',
      ...(status === 'unavailable' ? { signedOutAt: '2026-09-11T19:23:45.237Z' } : {}),
    });
  } catch (error) { if (error.code !== 6) throw error; }
}
console.log('Local-only preview ready: preview-admin@example.test / local-history-only');
await admin.app().delete();
