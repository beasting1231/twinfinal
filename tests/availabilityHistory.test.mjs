import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildRecordedHistory, formatSwissHistoryTime } from '../src/utils/availabilityHistory.ts';

const require = createRequire(import.meta.url);
const { createAvailabilityHistoryHandler } = require('../functions/availabilityHistory.js');
const { Timestamp } = createRequire(new URL('../functions/package.json', import.meta.url))('firebase-admin/firestore');
const at = value => ({ seconds: value, nanoseconds: 0 });
const state = (status, time = 1) => ({ status, timeSlot: '8:30', signedInAt: `in-${time}`, signedOutAt: null });
const event = (id, before, after, time, previous = time - 1) => ({
  id: String(id), sourceRecordId: 'a', before, after,
  beforeVersion: before ? at(previous) : null, afterVersion: after ? at(time) : null,
  committedAt: at(time), actorId: 'pilot', actorType: 'unknown',
});
const current = value => ({ id: 'a', ...value });

test('preserves every repeated sign-in/out, regardless of delivery order', () => {
  const inside = state('available');
  const outside = state('unavailable');
  const again = state('available', 3);
  const events = [event(1, null, inside, 1), event(2, inside, outside, 2),
    event(3, outside, again, 3), event(4, again, outside, 4)];
  const history = buildRecordedHistory([current(outside)], [events[1], events[3], events[0], events[2]]);
  assert.equal(history.consistent, true);
  assert.deepEqual(history.items.map(item => item.dayTransition), ['signed-out', 'signed-in', 'signed-out', 'signed-in']);
});

test('an unchanged active legacy slot prevents a false whole-day sign-out', () => {
  const before = state('available');
  const after = state('unavailable');
  const result = buildRecordedHistory([current(after), { id: 'legacy', status: 'available', timeSlot: '9:45' }],
    [event(2, before, after, 2)]);
  assert.equal(result.consistent, true);
  assert.equal(result.items[0].dayTransition, null);
});

test('missing intermediate events or a lagging latest event suppress all day claims', () => {
  const a = state('available');
  const b = state('unavailable');
  const c = state('available', 3);
  for (const events of [[event(1, null, a, 1)], [event(1, null, a, 1), event(3, b, c, 3)]]) {
    const result = buildRecordedHistory([current(c)], events);
    assert.equal(result.consistent, false);
    assert.ok(result.items.every(item => item.dayTransition === null));
  }
});

test('nanosecond ordering is preserved and no-op saves do not produce false gaps', () => {
  const a = state('available');
  const e1 = event('z', null, a, 1);
  const e2 = event('a', a, state('unavailable'), 1);
  e1.committedAt = e1.afterVersion = { seconds: 1, nanoseconds: 10 };
  e2.beforeVersion = e1.afterVersion;
  e2.committedAt = e2.afterVersion = { seconds: 1, nanoseconds: 20 };
  assert.equal(buildRecordedHistory([current(e2.after)], [e1, e2]).consistent, true);
  e2.beforeVersion = { seconds: 1, nanoseconds: 15 };
  assert.equal(buildRecordedHistory([current(e2.after)], [e1, e2]).consistent, true);
});

test('deletions and duplicate availability documents do not create a false day sign-out', () => {
  const a = state('available');
  const result = buildRecordedHistory([{ id: 'duplicate', ...a }], [event(2, a, null, 2)]);
  assert.equal(result.consistent, true);
  assert.equal(result.items[0].dayTransition, null);
  assert.equal(buildRecordedHistory([], [event(2, a, null, 2)]).items[0].dayTransition, 'signed-out');
});

test('no-op deliveries sharing a creation timestamp cannot create a false gap', () => {
  const a = state('available');
  const b = state('unavailable');
  const result = buildRecordedHistory([current(b)], [event('z', null, a, 1),
    event('a', a, a, 1, 1), event('out', a, b, 2)]);
  assert.equal(result.consistent, true);
  assert.deepEqual(result.items.map(item => item.dayTransition), ['signed-out', 'signed-in']);
});

test('on-request changes are recorded without pretending the pilot left the day', () => {
  const after = state('onRequest');
  const result = buildRecordedHistory([current(after)], [event(2, state('available'), after, 2)]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].dayTransition, null);
});

test('timestamps use Swiss summer/winter time, not the viewer timezone', () => {
  assert.equal(formatSwissHistoryTime('2026-09-11T19:23:45.237Z'), '11/09/2026, 21:23');
  assert.equal(formatSwissHistoryTime('2026-01-11T19:23:45.237Z'), '11/01/2026, 20:23');
});

test('observer writes only immutable history, deduplicates retries and retains source timestamps', async () => {
  const writes = new Map();
  const ref = path => ({
    collection: name => ref(`${path}/${name}`), doc: id => ref(`${path}/${id}`),
    create: async data => {
      assert.match(path, /^availabilityHistory\//);
      if (writes.has(path)) throw Object.assign(new Error('duplicate'), { code: 6 });
      writes.set(path, data);
    },
  });
  const db = { collection: name => ref(name) };
  const handler = createAvailabilityHistoryHandler(db);
  const raw = { userId: 'pilot', date: '2026-09-14', status: 'available', timeSlot: '8:30', signedInAt: 'old-client-time' };
  const after = { exists: true, data: () => raw, updateTime: new Timestamp(100, 123) };
  const input = { id: 'retry-id', params: { availabilityId: 'existing-id' }, authId: 'admin', authType: 'unknown',
    data: { before: { exists: false }, after } };
  await handler(input);
  await handler(input);
  assert.equal(writes.size, 1);
  const saved = [...writes.values()][0];
  assert.equal(saved.actorId, 'admin');
  assert.equal(saved.after.signedInAt, 'old-client-time');
  assert.equal(saved.committedAt.nanoseconds, 123);
  assert.deepEqual(raw, { userId: 'pilot', date: '2026-09-14', status: 'available', timeSlot: '8:30', signedInAt: 'old-client-time' });
});

test('observer failure propagates for retry rather than writing to availability', async () => {
  const failure = new Error('history unavailable');
  const ref = { collection: () => ref, doc: () => ref, create: async () => { throw failure; } };
  const handler = createAvailabilityHistoryHandler(ref);
  await assert.rejects(handler({ id: 'failure', params: { availabilityId: 'a' }, data: {
    before: { exists: false }, after: { exists: true, updateTime: new Timestamp(100, 0),
      data: () => ({ userId: 'pilot', date: '2026-09-14' }) },
  } }), failure);
});
