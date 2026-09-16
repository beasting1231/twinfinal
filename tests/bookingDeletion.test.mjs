import test from 'node:test';
import assert from 'node:assert/strict';
import { clearDeletedBookingAssignments, getAccountingBookings } from '../src/utils/bookingDeletion.ts';

test('deletion clears every pilot and payment in the same patch', () => {
  const original = {
    bookingStatus: 'deleted',
    assignedPilots: ['Alice', 'Bob'],
    acknowledgedPilots: ['Alice'],
    pilotPayments: [{ pilotName: 'Alice', amount: 180, paymentMethod: 'direkt' }],
    customerName: 'Customer',
  };
  const deleted = clearDeletedBookingAssignments(original);
  assert.deepEqual(deleted.assignedPilots, []);
  assert.deepEqual(deleted.acknowledgedPilots, []);
  assert.deepEqual(deleted.pilotPayments, []);
  assert.equal(deleted.customerName, 'Customer');
  assert.deepEqual(original.assignedPilots, ['Alice', 'Bob']);
  assert.deepEqual(clearDeletedBookingAssignments({ bookingStatus: 'deleted' }), {
    bookingStatus: 'deleted', assignedPilots: [], acknowledgedPilots: [], pilotPayments: [],
  });
});

test('accounting excludes legacy deleted bookings even with assignments and payments', () => {
  const active = { bookingStatus: 'confirmed', assignedPilots: ['Alice'] };
  const paidNoShow = { bookingStatus: 'no show', assignedPilots: ['Bob'] };
  const deleted = {
    bookingStatus: 'deleted', assignedPilots: ['Charlie'],
    pilotPayments: [{ pilotName: 'Charlie', amount: 180, paymentMethod: 'direkt' }],
  };
  assert.deepEqual(getAccountingBookings([active, deleted, paidNoShow]), [active, paidNoShow]);
  assert.deepEqual(getAccountingBookings([deleted]), []);
});

test('ordinary updates and restoration do not clear pilot information', () => {
  for (const bookingStatus of ['confirmed', 'cancelled', 'no show', undefined]) {
    const patch = { bookingStatus, assignedPilots: ['Alice'] };
    assert.equal(clearDeletedBookingAssignments(patch), patch);
  }
});
