import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canManageApiKeys} from '../src/utils/apiKeyAccess.ts';
import {baseSlots} from '../functions/bookingApiDomain.js';
import {getTimeSlotsByDate} from '../src/utils/timeSlots.ts';
test('API screen gate matches verified owner requirement', () => {
  assert.equal(canManageApiKeys({email: 'pccbasting@gmail.com', emailVerified: true}), true);
  for (const user of [null, {email: 'other@example.com', emailVerified: true},
    {email: 'pccbasting@gmail.com', emailVerified: false}]) assert.equal(canManageApiKeys(user), false);
});
test('server departure schedule stays in parity with existing browser schedule for every day', () => {
  for (let year = 2026; year <= 2028; year++) {
    for (let month = 0; month < 12; month++) {
      for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
        const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        assert.deepEqual(baseSlots(date), getTimeSlotsByDate(new Date(year, month, day)), date);
      }
    }
  }
});
