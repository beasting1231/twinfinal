import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {initializeApp, deleteApp} from 'firebase/app';
import {getAuth, connectAuthEmulator, signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, terminate} from 'firebase/firestore';
import {getFunctions, connectFunctionsEmulator, httpsCallable} from 'firebase/functions';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8380' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9399' || process.env.GCLOUD_PROJECT !== 'demo-twin-history') {
  throw new Error('Refusing to test outside the dedicated API demo emulators.');
}
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const {SCOPES} = require('../functions/bookingApiDomain');
const serverApp = admin.initializeApp({projectId: 'demo-twin-history'});
const db = admin.firestore();
const clients = [];
const date = '2099-01-01';
const base = 'http://127.0.0.1:5305/api/v1';
async function client(uid, email, verified = true, role = 'admin') {
  await admin.auth().createUser({uid, email, emailVerified: verified, password: 'api-local-only-2026'});
  await db.doc(`userProfiles/${uid}`).set({uid, email, role, displayName: uid, onboardingComplete: true, theme: 'dark'});
  const app = initializeApp({projectId: 'demo-twin-history', apiKey: 'demo-api-key', authDomain: 'localhost'}, uid);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9399', {disableWarnings: true});
  const functions = getFunctions(app);
  connectFunctionsEmulator(functions, '127.0.0.1', 5301);
  const store = getFirestore(app);
  connectFirestoreEmulator(store, '127.0.0.1', 8380);
  await signInWithEmailAndPassword(auth, email, 'api-local-only-2026');
  const call = async (name, data) => (await httpsCallable(functions, name)(data)).data;
  clients.push({app, store});
  return {call, store};
}
let sequence = 0;
async function api(secret, path, method = 'GET', body, idempotency = `test-request-${++sequence}`) {
  const response = await fetch(`${base}${path}`, {method, headers: {
    ...(secret ? {Authorization: `Bearer ${secret}`} : {}),
    'Content-Type': 'application/json', 'Idempotency-Key': idempotency,
  }, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  return {status: response.status, body: await response.json()};
}
after(async () => {
  for (const {app, store} of clients) { await terminate(store); await deleteApp(app); }
  await serverApp.delete();
});
test('isolated API integration and existing-data compatibility', async t => {
  const owner = await client('api-owner', 'pccbasting@gmail.com');
  const other = await client('api-other', 'other@example.test');
  const unverified = await client('api-unverified', 'unverified@example.test', false);
  const create = async (scopes, name = 'Test tool') => owner.call('createIntegrationApiKey', {name, scopes});
  await db.doc('availability/api-owner-morning').set({date, userId: 'api-owner', timeSlot: '8:30'});
  await db.doc('availability/api-other-morning').set({date, userId: 'api-other', timeSlot: '8:30', status: 'onRequest'});
  await db.doc('availability/api-owner-later').set({date, userId: 'api-owner', timeSlot: '9:45', status: 'available'});
  const legacyRef = db.doc('bookings/legacy-booking');
  await legacyRef.set({date: '2098-12-31', customerName: 'Péter Basting', bookingStatus: 'confirmed',
    numberOfPeople: 1, span: 1, timeIndex: 0, assignedPilots: ['Pilot X'], history: [{action: 'created'}],
    customLegacyField: 'preserve exactly', createdAt: admin.firestore.Timestamp.fromMillis(123456)});
  const baseline = await legacyRef.get();
  let all, readOnly, statusOnly;
  await t.test('only the verified owner can create/list/revoke keys', async () => {
    for (const who of [other, unverified]) {
      for (const name of ['createIntegrationApiKey', 'listIntegrationApiKeys', 'revokeIntegrationApiKey']) {
        await assert.rejects(who.call(name, {name: 'Denied', scopes: SCOPES, id: 'a'.repeat(24)}), /verified owner/);
      }
    }
    await assert.rejects(create([]), /permission/);
    await assert.rejects(create(['bookings:admin']), /permission/);
    all = await create(SCOPES);
    readOnly = await create(['bookings:read', 'availability:read'], 'Read only');
    statusOnly = await create(['bookings:status'], 'Status only');
    const stored = (await db.doc(`integrationApiKeys/${all.key.id}`).get()).data();
    assert.equal(stored.secret, undefined);
    assert.equal(stored.secretHash.length, 64);
    assert.equal(JSON.stringify(stored).includes(all.secret), false);
    const listed = await owner.call('listIntegrationApiKeys');
    assert.equal(listed.keys.length, 3);
    assert.equal(JSON.stringify(listed).includes('secretHash'), false);
    await assert.rejects(getDoc(doc(owner.store, 'integrationApiKeys', all.key.id)), /permission/i);
    await assert.rejects(setDoc(doc(owner.store, 'integrationApiKeys', all.key.id), {scopes: SCOPES}), /permission/i);
  });
  await t.test('authentication, routing, and read permissions are enforced', async () => {
    assert.equal((await api(null, '/bookings?name=Peter')).status, 401);
    assert.equal((await api(all.secret.slice(0, -1) + (all.secret.endsWith('0') ? '1' : '0'), '/bookings?name=Peter')).status, 401);
    assert.equal((await api(statusOnly.secret, '/bookings?name=Peter')).status, 403);
    assert.equal((await api(all.secret, '/unknown')).status, 404);
    for (const [path, method, body] of [
      ['/bookings', 'POST', {customerName: 'Denied', date, time: '08:30', numberOfPeople: 1}],
      ['/bookings/legacy-booking', 'PATCH', {notes: 'Denied'}],
      ['/bookings/legacy-booking', 'PATCH', {bookingStatus: 'confirmed'}],
      ['/bookings/legacy-booking', 'DELETE', undefined],
      ['/booking-requests', 'POST', {customerName: 'Denied', email: 'demo@example.test', date, time: '08:30', numberOfPeople: 1}],
    ]) assert.equal((await api(readOnly.secret, path, method, body)).status, 403);
    assert.equal((await api(all.secret, '/bookings?date=2099-02-30')).status, 400);
  });
  await t.test('name search, day/time capacity and viewing leave existing records unchanged', async () => {
    const result = await api(readOnly.secret, '/bookings?name=pete%20bast');
    assert.equal(result.status, 200);
    assert.equal(result.body.bookings[0].id, 'legacy-booking');
    assert.equal(result.body.bookings[0].time, '08:30');
    assert.equal(result.body.bookings[0].timezone, 'Europe/Zurich');
    assert.equal(result.body.bookings[0].history, undefined);
    assert.equal((await api(all.secret, '/bookings?name=Peter&date=2099-01-01')).body.bookings.length, 0);
    assert.equal((await api(all.secret, '/bookings/legacy-booking')).body.booking.customerName, 'Péter Basting');
    const capacity = await api(readOnly.secret, `/availability?date=${date}&time=08:30`);
    assert.equal(capacity.status, 200);
    assert.equal(capacity.body.slots.length, 1);
    assert.equal(capacity.body.slots[0].availableSpots, 2);
    assert.equal((await api(all.secret, `/availability?date=${date}&time=12:34`)).status, 404);
    const afterRead = await legacyRef.get();
    assert.deepEqual(afterRead.data(), baseline.data());
    assert.ok(afterRead.updateTime.isEqual(baseline.updateTime));
  });
  await t.test('MCP endpoint reuses the API without changing existing records', async () => {
    const rpc = async (secret, method, params) => {
      const response = await fetch(`${base}/mcp`, {method: 'POST', headers: {Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json', Accept: 'application/json, text/event-stream'},
      body: JSON.stringify({jsonrpc: '2.0', id: ++sequence, method, ...(params ? {params} : {})})});
      assert.equal(response.status, 200);
      return (await response.json()).result;
    };
    assert.equal((await rpc(readOnly.secret, 'initialize', {protocolVersion: '2025-06-18', capabilities: {},
      clientInfo: {name: 'test', version: '1'}})).protocolVersion, '2025-06-18');
    assert.deepEqual((await rpc(readOnly.secret, 'tools/list')).tools.map(tool => tool.name).sort(),
        ['check_availability', 'get_booking', 'search_bookings']);
    const found = await rpc(readOnly.secret, 'tools/call', {name: 'search_bookings', arguments: {name: 'pete bast'}});
    assert.equal(found.structuredContent.bookings[0].id, 'legacy-booking');
    const slots = await rpc(readOnly.secret, 'tools/call', {name: 'check_availability', arguments: {date, time: '08:30'}});
    assert.equal(slots.structuredContent.slots[0].availableSpots, 2);
    const denied = await rpc(readOnly.secret, 'tools/call', {name: 'set_booking_status',
      arguments: {id: 'legacy-booking', bookingStatus: 'cancelled'}});
    assert.equal(denied.isError, true);
    const request = {customerName: 'MCP Request', email: 'mcp@example.test', date, time: '08:30', numberOfPeople: 1,
      idempotencyKey: 'mcp-request-once'};
    const made = await rpc(all.secret, 'tools/call', {name: 'create_booking_request', arguments: request});
    assert.equal(made.structuredContent.status, 'pending', JSON.stringify(made));
    assert.deepEqual(await rpc(all.secret, 'tools/call', {name: 'create_booking_request', arguments: request}), made);
    const afterMcp = await legacyRef.get();
    assert.deepEqual(afterMcp.data(), baseline.data());
    assert.ok(afterMcp.updateTime.isEqual(baseline.updateTime));
  });
  let createdId;
  await t.test('booking creation is compatible, idempotent and rejects over-capacity', async () => {
    const body = {customerName: 'API Customer', date, time: '08:30', numberOfPeople: 1};
    const created = await api(all.secret, '/bookings', 'POST', body, 'create-once-only');
    assert.equal(created.status, 201, JSON.stringify(created));
    createdId = created.body.id;
    const repeated = await api(all.secret, '/bookings', 'POST', body, 'create-once-only');
    assert.deepEqual(repeated, created);
    assert.equal((await api(all.secret, '/bookings', 'POST', {...body, customerName: 'Changed'}, 'create-once-only')).status, 409);
    assert.equal((await api(all.secret, '/bookings', 'POST', {...body, numberOfPeople: 2})).status, 409);
    const stored = (await db.doc(`bookings/${createdId}`).get()).data();
    assert.equal(stored.bookingStatus, 'unconfirmed');
    assert.deepEqual(stored.assignedPilots, ['']);
    assert.equal(stored.span, 1);
    assert.equal(stored.history[0].apiKeyId, all.key.id);
    assert.equal((await api(all.secret, '/bookings', 'POST', body, '')).status, 400);
  });
  await t.test('status-only key cannot edit details, delete, or smuggle a deleted status', async () => {
    for (const status of ['confirmed', 'pending', 'cancelled', 'no show', 'unconfirmed']) {
      const result = await api(statusOnly.secret, `/bookings/${createdId}`, 'PATCH', {bookingStatus: status});
      assert.equal(result.status, 200, JSON.stringify(result));
      assert.equal((await db.doc(`bookings/${createdId}`).get()).data().bookingStatus, status);
    }
    const before = await db.doc(`bookings/${createdId}`).get();
    assert.equal((await api(statusOnly.secret, `/bookings/${createdId}`, 'PATCH', {bookingStatus: 'confirmed', customerName: 'No'})).status, 403);
    assert.equal((await api(statusOnly.secret, `/bookings/${createdId}`, 'PATCH', {bookingStatus: 'deleted'})).status, 400);
    assert.equal((await api(statusOnly.secret, `/bookings/${createdId}`, 'DELETE')).status, 403);
    assert.ok(before.updateTime.isEqual((await before.ref.get()).updateTime));
  });
  await t.test('detail edits and rescheduling preserve unrelated fields and existing audit history', async () => {
    const ref = db.doc(`bookings/${createdId}`);
    await ref.update({customLegacyField: 'stay', pilotPayments: [{pilotName: 'Example', amount: 40}]});
    const previous = (await ref.get()).data();
    const edited = await api(all.secret, `/bookings/${createdId}`, 'PATCH', {notes: 'Updated', time: '09:45'});
    assert.equal(edited.status, 200, JSON.stringify(edited));
    const current = (await ref.get()).data();
    assert.equal(current.customLegacyField, 'stay');
    assert.deepEqual(current.pilotPayments, previous.pilotPayments);
    assert.equal(current.timeIndex, 1);
    assert.equal(current.history.length, previous.history.length + 1);
    assert.deepEqual(current.history.slice(0, -1), previous.history);
    assert.equal(current.history.at(-1).action, 'moved');
    assert.equal((await api(all.secret, `/bookings/${createdId}`, 'PATCH', {pilotPayments: []})).status, 400);
  });
  await t.test('simultaneous API requests cannot both take the last space', async () => {
    const body = {customerName: 'Concurrent', date, time: '08:30', numberOfPeople: 2};
    const otherWriter = await create(['bookings:create'], 'Independent writer');
    const results = await Promise.all([api(all.secret, '/bookings', 'POST', body),
      api(otherWriter.secret, '/bookings', 'POST', body)]);
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409], JSON.stringify(results));
  });
  await t.test('deletion uses existing cleanup and cannot be reversed through status permission', async () => {
    const ref = db.doc(`bookings/${createdId}`);
    await ref.update({assignedPilots: ['Example'], acknowledgedPilots: ['Example']});
    const result = await api(all.secret, `/bookings/${createdId}`, 'DELETE');
    assert.equal(result.status, 200, JSON.stringify(result));
    const deleted = (await ref.get()).data();
    assert.equal(deleted.bookingStatus, 'deleted');
    assert.deepEqual(deleted.assignedPilots, []);
    assert.deepEqual(deleted.acknowledgedPilots, []);
    assert.deepEqual(deleted.pilotPayments, []);
    assert.equal(deleted.customLegacyField, 'stay');
    assert.equal(deleted.history.at(-1).snapshotAfter.bookingStatus, 'deleted');
    assert.equal((await api(all.secret, `/bookings/${createdId}`, 'GET')).status, 404);
    assert.equal((await api(all.secret, `/bookings/${createdId}`, 'PATCH', {bookingStatus: 'confirmed'})).status, 409);
    const deletedSnapshot = await ref.get();
    const repeated = await api(all.secret, `/bookings/${createdId}`, 'DELETE');
    assert.equal(repeated.status, 200);
    assert.ok(deletedSnapshot.updateTime.isEqual((await ref.get()).updateTime));
  });
  await t.test('request submission keeps pending schema and does not consume capacity', async () => {
    const body = {customerName: 'Request Customer', email: 'request@example.test', phoneNumber: '+41000000000',
      pickupLocation: 'HW', date, time: '08:30', numberOfPeople: 1};
    const result = await api(all.secret, '/booking-requests', 'POST', body, 'request-create-once');
    assert.equal(result.status, 201, JSON.stringify(result));
    const stored = (await db.doc(`bookingRequests/${result.body.id}`).get()).data();
    assert.equal(stored.phone, body.phoneNumber);
    assert.equal(stored.meetingPoint, body.pickupLocation);
    assert.equal(stored.status, 'pending');
    assert.deepEqual(await api(all.secret, '/booking-requests', 'POST', body, 'request-create-once'), result);
    assert.equal((await db.collection('emailQueue').get()).size, 0);
  });
  await t.test('pagination never silently drops matching bookings', async () => {
    const writes = Array.from({length: 503}, (_, i) => db.doc(`bookings/search-${String(i).padStart(4, '0')}`).set(
      {date: '2099-03-01', customerName: i === 502 ? 'Unique Match' : 'Different', bookingStatus: 'confirmed'}));
    await Promise.all(writes);
    let cursor = null, found = [], pages = 0;
    do {
      const result = await api(all.secret, `/bookings?name=Unique&date=2099-03-01${cursor ? `&cursor=${cursor}` : ''}`);
      assert.equal(result.status, 200, JSON.stringify(result));
      found.push(...result.body.bookings);
      cursor = result.body.nextCursor;
      assert.ok(++pages < 5);
    } while (cursor);
    assert.equal(found.length, 1);
    assert.equal(found[0].id, 'search-0502');
  });
  await t.test('revocation and expiry block previously valid keys immediately', async () => {
    await owner.call('revokeIntegrationApiKey', {id: readOnly.key.id});
    assert.equal((await api(readOnly.secret, '/bookings?name=Peter')).status, 401);
    await db.doc(`integrationApiKeys/${statusOnly.key.id}`).update({expiresAt: '2000-01-01T00:00:00Z'});
    assert.equal((await api(statusOnly.secret, `/bookings/${createdId}`, 'PATCH', {bookingStatus: 'confirmed'})).status, 401);
    const ref = db.doc(`integrationApiUsage/${all.key.id}`);
    await ref.set({minute: Math.floor(Date.now() / 60000), count: 120});
    assert.equal((await api(all.secret, '/bookings?name=Peter')).status, 429);
  });
  await t.test('original public reads and admin writes remain allowed by untouched rules', async () => {
    const original = await legacyRef.get();
    assert.deepEqual(original.data(), baseline.data());
    assert.ok(original.updateTime.isEqual(baseline.updateTime));
    await setDoc(doc(other.store, 'bookings', 'existing-admin-flow'), {date, customerName: 'Existing admin flow'});
    assert.equal((await getDoc(doc(other.store, 'bookings', 'existing-admin-flow'))).exists(), true);
    const publicApp = initializeApp({projectId: 'demo-twin-history', apiKey: 'demo-api-key'}, 'public-form-check');
    const publicStore = getFirestore(publicApp);
    connectFirestoreEmulator(publicStore, '127.0.0.1', 8380);
    clients.push({app: publicApp, store: publicStore});
    assert.equal((await getDoc(doc(publicStore, 'bookings', 'legacy-booking'))).exists(), true);
    await assert.rejects(getDoc(doc(publicStore, 'integrationApiKeys', all.key.id)), /permission/i);
    assert.equal((await db.collection('settings').get()).size, 0);
  });
});
