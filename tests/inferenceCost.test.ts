import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  breakEvenRequestsPerDay,
  exampleInputs,
  monthlyCost,
} from '../src/lib/inferenceCost.ts';

const near = (a: number, b: number, tol = 1) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('example inputs: API bill, one GPU, and the saving', () => {
  const r = monthlyCost(exampleInputs);
  near(r.apiCostPerRequest, 0.0105, 1e-9);
  near(r.before, 50000 * 30.4 * 0.0105);
  assert.equal(r.gpus, 1);
  near(r.gpuCost, 1.2 * 730);
  near(r.after, r.before * 0.2 + 876);
  assert.ok(r.savings > 0);
});

test('nothing moved means no GPUs and no change', () => {
  const r = monthlyCost({ ...exampleInputs, movableShare: 0 });
  assert.equal(r.gpus, 0);
  near(r.after, r.before, 1e-9);
});

test('GPUs are sized for peak traffic', () => {
  // 1M/day, 80% moved = 9.26 req/s average, x3 peak = 27.8 req/s at 2 per GPU -> 14 GPUs.
  const r = monthlyCost({ ...exampleInputs, requestsPerDay: 1_000_000 });
  assert.equal(r.gpus, 14);
});

test('at low volume the API is cheaper; break-even sits where one GPU pays for itself', () => {
  assert.ok(
    monthlyCost({ ...exampleInputs, requestsPerDay: 1000 }).savings < 0,
  );
  const be = breakEvenRequestsPerDay(exampleInputs);
  assert.ok(be !== null);
  // One GPU (876/month) = rpd * 0.8 * 30.4 * 0.0105
  near(be!, 876 / (0.8 * 30.4 * 0.0105), 2);
});

test('break-even is null when a GPU can never pay off', () => {
  assert.equal(
    breakEvenRequestsPerDay({
      ...exampleInputs,
      apiInputPrice: 0,
      apiOutputPrice: 0,
    }),
    null,
  );
});
