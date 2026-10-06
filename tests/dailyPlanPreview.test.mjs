import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseDailyPlanPreview } from '../src/utils/dailyPlanPreview.ts';

test('preview accepts only the verified rollout account', () => {
  assert.equal(canUseDailyPlanPreview({ email: 'pccbasting@gmail.com', emailVerified: true }), true);
  assert.equal(canUseDailyPlanPreview({ email: 'PCCBASTING@gmail.com', emailVerified: true }), true);
  for (const user of [null, undefined, { email: null, emailVerified: true },
    { email: 'pccbasting@gmail.com', emailVerified: false },
    { email: 'another@gmail.com', emailVerified: true },
    { email: 'pccbasting@gmail.com.example.com', emailVerified: true }]) {
    assert.equal(canUseDailyPlanPreview(user), false);
  }
});
