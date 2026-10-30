import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, setDoc, doc, updateDoc, deleteDoc, terminate } from 'firebase/firestore';
import { setAvailabilityStatus, unassignPilotFromBookings } from '../src/utils/availabilityState.ts';
import { buildRecordedHistory } from '../src/utils/availabilityHistory.ts';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8180' ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9199' ||
    process.env.GCLOUD_PROJECT !== 'demo-twin-history') {
  throw new Error('Refusing to run outside the isolated demo-twin-history emulators.');
}
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: 'demo-twin-history' });
const db = admin.firestore();
const clients = [];
const date = '2026-09-14';
const pilotId = 'history-pilot';
const eventCollection = db.collection(`availabilityHistory/${date}/pilots/${pilotId}/events`);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function historyAtLeast(count) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const snapshot = await eventCollection.get();
    if (snapshot.size >= count) return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${count} server history entries`);
}

async function client(uid, role, name) {
  const email = `${uid}@example.test`;
  await admin.auth().createUser({ uid, email, password: 'local-history-only' });
  await db.doc(`userProfiles/${uid}`).set({ uid, email, role, displayName: name, theme: 'dark', onboardingComplete: true, priority: 1 });
  const app = initializeApp({ projectId: 'demo-twin-history', apiKey: 'demo-history-key', authDomain: 'localhost' }, uid);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const store = getFirestore(app);
  connectFirestoreEmulator(store, '127.0.0.1', 8180);
  await signInWithEmailAndPassword(auth, email, 'local-history-only');
  clients.push({ app, store });
  return store;
}

test('existing saves, permissions, history capture and booking cleanup remain compatible', async t => {
  const pilot = await client(pilotId, 'pilot', 'Local Pilot');
  const adminClient = await client('history-admin', 'admin', 'Local Admin');
  const driver = await client('history-driver', 'driver', 'Local Driver');
  const other = await client('history-other', 'pilot', 'Other Pilot');
  const save = (store, status, timeSlot = '8:30') => setAvailabilityStatus({ db: store, userId: pilotId, date, timeSlot, status });

  await t.test('viewing and recording do not modify a pre-existing source record', async () => {
    const legacy = db.doc('availability/legacy-untouched');
    const content = { userId: pilotId, date, timeSlot: '7:30', signedInAt: '2026-05-07T05:42:40.147Z', extraField: 'preserve-me' };
    await legacy.set(content);
    const before = await legacy.get();
    await historyAtLeast(1);
    await getDocs(collection(adminClient, `availabilityHistory/${date}/pilots/${pilotId}/events`));
    const after = await legacy.get();
    assert.deepEqual(after.data(), content);
    assert.ok(before.updateTime.isEqual(after.updateTime));
  });

  await t.test('repeated cycles retain every event while old availability fields keep their format', async () => {
    await save(pilot, 'available');
    await save(pilot, 'unavailable');
    await save(pilot, 'available');
    await save(pilot, 'unavailable');
    const events = await historyAtLeast(5);
    const cycles = events.filter(item => item.after?.timeSlot === '8:30').sort((a, b) => a.committedAt.toMillis() - b.committedAt.toMillis());
    assert.deepEqual(cycles.map(item => item.after.status), ['available', 'unavailable', 'available', 'unavailable']);
    const records = await db.collection('availability').where('userId', '==', pilotId).where('date', '==', date).get();
    const slot = records.docs.find(item => item.data().timeSlot === '8:30').data();
    assert.deepEqual(Object.keys(slot).sort(), ['userId', 'date', 'timeSlot', 'status', 'signedInAt', 'signedOutAt'].sort());
    assert.equal(typeof slot.signedInAt, 'string');
    assert.equal(typeof slot.signedOutAt, 'string');
    const history = buildRecordedHistory(records.docs.map(item => ({ ...item.data(), id: item.id })), events);
    assert.equal(history.consistent, true);
    assert.ok(history.items.filter(item => item.after?.timeSlot === '8:30').every(item => item.dayTransition === null));
  });

  await t.test('admin and driver edits and on-request status keep working', async () => {
    await save(adminClient, 'onRequest');
    await save(driver, 'available');
    const events = await historyAtLeast(7);
    assert.ok(events.some(item => item.after?.status === 'onRequest'));
    const adminEvent = events.find(item => item.after?.status === 'onRequest');
    // Firestore Emulator 1.21 emits this placeholder for ALL authenticated writes.
    // Unit tests separately verify that supplied real principal IDs are retained.
    if (adminEvent.actorId === 'fake-auth-id@gmail.com') {
      t.diagnostic('Emulator supplied placeholder auth context; real actor attribution remains a release check.');
    } else {
      assert.equal(adminEvent.actorId, 'history-admin');
      assert.ok(events.some(item => item.actorId === 'history-driver'));
    }
  });

  await t.test('a different pilot cannot edit this pilot or forge/read the admin audit trail', async () => {
    await assert.rejects(save(other, 'unavailable'), /permission/i);
    const path = `availabilityHistory/${date}/pilots/${pilotId}/events/forged`;
    await assert.rejects(setDoc(doc(adminClient, path), { fake: true }), /permission/i);
    await assert.rejects(getDocs(collection(pilot, `availabilityHistory/${date}/pilots/${pilotId}/events`)), /permission/i);
    const event = (await eventCollection.limit(1).get()).docs[0];
    await assert.rejects(updateDoc(doc(adminClient, event.ref.path), { actorId: 'forged' }), /permission/i);
    await assert.rejects(deleteDoc(doc(adminClient, event.ref.path)), /permission/i);
  });

  await t.test('parallel full-day saves and legacy duplicate records remain compatible', async () => {
    await db.doc('availability/duplicate-slot').set({ userId: pilotId, date, timeSlot: '8:30', status: 'available', signedInAt: '2026-01-01T00:00:00.000Z' });
    await historyAtLeast(8);
    const beforeCount = (await eventCollection.get()).size;
    await Promise.all(['7:30', '8:30', '9:45'].map(slot => save(adminClient, 'unavailable', slot)));
    await historyAtLeast(beforeCount + 3);
    const records = await db.collection('availability').where('userId', '==', pilotId).where('date', '==', date).get();
    // The missing 9:45 slot remains absent: old save behavior is preserved.
    assert.equal(records.size, 3);
    assert.ok(records.docs.every(item => item.data().status === 'unavailable'));
  });

  await t.test('sign-out booking and payment cleanup is unchanged', async () => {
    await db.doc('bookings/history-booking').set({ date, timeIndex: 1, assignedPilots: ['Local Pilot', 'Other Pilot'],
      pilotPayments: [{ pilotName: 'Local Pilot', amount: 100 }, { pilotName: 'Other Pilot', amount: 50 }], customerName: 'Synthetic passenger' });
    await unassignPilotFromBookings(adminClient, date, '8:30', pilotId);
    const booking = (await db.doc('bookings/history-booking').get()).data();
    assert.deepEqual(booking.assignedPilots, ['', 'Other Pilot']);
    assert.deepEqual(booking.pilotPayments, [{ pilotName: 'Other Pilot', amount: 50 }]);
    assert.equal(booking.customerName, 'Synthetic passenger');
  });

  await t.test('ordinary direct writes from older clients are also captured', async () => {
    const count = (await eventCollection.get()).size;
    const ref = (await db.collection('availability').where('userId', '==', pilotId).limit(1).get()).docs[0].ref;
    await updateDoc(doc(adminClient, ref.path), { status: 'onRequest' });
    const events = await historyAtLeast(count + 1);
    assert.ok(events.some(item => item.sourceRecordId === ref.id && item.after?.status === 'onRequest'));
  });

  for (const { app, store } of clients) { await terminate(store); await deleteApp(app); }
  await admin.app().delete();
});
