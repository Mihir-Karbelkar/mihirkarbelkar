import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDeliberateMove,
  mascotOffset,
  targetPoint,
  travelTime,
} from '../src/lib/tour.ts';

const vp = { width: 1440, height: 900 };
test('target point sits on the heading area and inside the viewport', () => {
  assert.deepEqual(
    targetPoint({ left: 60, top: 100, width: 1320, height: 600 }, vp),
    {
      x: 280,
      y: 156,
    },
  );
  const offscreen = targetPoint(
    { left: -500, top: 2000, width: 100, height: 40 },
    vp,
  );
  assert.equal(offscreen.x, 24);
  assert.equal(offscreen.y, 740);
});
test('travel time scales with distance within bounds', () => {
  const o = { x: 0, y: 0 };
  assert.equal(travelTime(o, o), 320);
  assert.ok(travelTime(o, { x: 300, y: 0 }) > 320);
  assert.equal(travelTime(o, { x: 5000, y: 0 }), 900);
});
test('mascot stands beside the cursor and flips near the left edge', () => {
  // the 64px-wide mascot's centre is left of the cursor, or right of it when mirrored
  assert.ok(mascotOffset({ x: 600, y: 400 }).x + 32 < 600);
  assert.ok(mascotOffset({ x: 40, y: 400 }).x + 32 > 40);
  assert.equal(isDeliberateMove(3, 4), false);
  assert.equal(isDeliberateMove(10, 10), true);
});
