import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSwissBookingClock, isFutureSwissBooking } from '../src/utils/swissBookingTime.ts';

test('uses Swiss summer time and expires a slot exactly at departure', () => {
  const now = new Date('2026-09-12T12:00:00Z');
  assert.equal(getSwissBookingClock(now).date, '2026-09-12');
  assert.equal(isFutureSwissBooking('2026-09-12', '14:00', now), false);
  assert.equal(isFutureSwissBooking('2026-09-12', '14:01', now), true);
  assert.equal(isFutureSwissBooking('2026-09-11', '16:45', now), false);
  assert.equal(isFutureSwissBooking('2026-09-13', '7:30', now), true);
});

test('uses Swiss winter time', () => {
  const now = new Date('2026-01-12T12:00:01Z');
  assert.equal(isFutureSwissBooking('2026-01-12', '13:00', now), false);
  assert.equal(isFutureSwissBooking('2026-01-12', '13:45', now), true);
});

test('Swiss midnight advances the booking date before UTC midnight', () => {
  const now = new Date('2026-09-12T22:00:00Z');
  assert.equal(getSwissBookingClock(now).date, '2026-09-13');
  assert.equal(isFutureSwissBooking('2026-09-12', '23:59', now), false);
  assert.equal(isFutureSwissBooking('2026-09-13', '7:30', now), true);
});

test('updates offsets across both daylight-saving transitions', () => {
  assert.equal(getSwissBookingClock(new Date('2026-03-29T00:59:00Z')).seconds, 7140);
  assert.equal(getSwissBookingClock(new Date('2026-03-29T01:00:00Z')).seconds, 10800);
  assert.equal(getSwissBookingClock(new Date('2026-10-25T00:59:00Z')).seconds, 10740);
  assert.equal(getSwissBookingClock(new Date('2026-10-25T01:00:00Z')).seconds, 7200);
});

test('rejects missing and invalid time slots', () => {
  for (const time of ['', '24:00', '12:60', 'invalid']) {
    assert.equal(isFutureSwissBooking('2099-01-01', time), false);
  }
});
