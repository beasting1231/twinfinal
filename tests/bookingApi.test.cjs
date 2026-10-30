const {test} = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../functions/bookingApiDomain');
const key = scopes => ({scopes});
test('only verified exact owner identity may manage keys', () => {
  assert.equal(domain.isOwner({token: {email: 'PCCBASTING@gmail.com', email_verified: true}}), true);
  for (const auth of [null, {}, {token: {}}, {token: {email: 'pccbasting@gmail.com', email_verified: false}},
    {token: {email: 'pccbasting@gmail.com.evil.test', email_verified: true}}]) assert.equal(domain.isOwner(auth), false);
});
test('mixed edits require both scopes; statuses cannot bypass deletion permission', () => {
  assert.throws(() => domain.validateBody({customerName: 'Peter', bookingStatus: 'confirmed'}, 'update',
    key(['bookings:update'])), /bookings:status/);
  assert.throws(() => domain.validateBody({customerName: 'Peter', bookingStatus: 'confirmed'}, 'update',
    key(['bookings:status'])), /bookings:update/);
  for (const bookingStatus of domain.STATUSES) assert.equal(domain.validateBody({bookingStatus}, 'update',
    key(['bookings:status'])).bookingStatus, bookingStatus);
  assert.throws(() => domain.validateBody({bookingStatus: 'deleted'}, 'update', key(['bookings:status'])), /status/);
  for (const field of ['history', 'createdBy', 'pilotPayments', 'assignedPilots', 'span', 'isBlocked', 'timeIndex']) {
    assert.throws(() => domain.validateBody({[field]: 'injected'}, 'update', key(domain.SCOPES)), /Unsupported field/);
  }
});
test('calendar/time validation and name prefixes handle common inputs', () => {
  assert.equal(domain.dateValue('2028-02-29'), '2028-02-29');
  for (const date of ['2026-02-29', '2026-13-01', 'garbage']) assert.throws(() => domain.dateValue(date));
  assert.equal(domain.timeValue('8:30'), '08:30');
  assert.throws(() => domain.timeValue('24:00'));
  assert.equal(domain.matchesName('Péter Basting', 'pete bast'), true);
  assert.equal(domain.matchesName('Peter Basting', 'ast'), false);
  assert.equal(domain.matchesName('김 민수', '김'), true);
});
test('availability matches existing capacity semantics, deduplicates pilot records, respects custom slots', () => {
  const date = '2099-01-01';
  const records = [
    {userId: 'a', timeSlot: '8:30'}, {userId: 'a', timeSlot: '8:30', status: 'available'},
    {userId: 'b', timeSlot: '8:30', status: 'onRequest'},
    {userId: 'c', timeSlot: '8:30', status: 'unavailable'},
    {userId: 'removed', timeSlot: '8:30', status: 'available'},
  ];
  const bookings = [{id: 'x', timeIndex: 0, numberOfPeople: 1, bookingStatus: 'cancelled'},
    {id: 'y', timeIndex: 0, numberOfPeople: 3, bookingStatus: 'deleted'}];
  const slots = domain.availability(date, {overrides: {0: '9:00'}, additionalSlots: ['17:00']}, records,
    bookings, [{id: 'a'}, {id: 'b'}, {id: 'c'}]);
  assert.deepEqual(slots[0], {time: '09:00', timeIndex: 0, capacity: 2, availableSpots: 1, bookable: true});
  assert.equal(slots.at(-1).timeIndex, 1000);
  assert.equal(domain.availability(date, {}, records, bookings, [{id: 'a'}, {id: 'b'}], 'x')[0].availableSpots, 2);
});
