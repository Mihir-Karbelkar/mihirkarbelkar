import type { Action, Point } from './contracts';
export const START: Point = { x: 1, y: 5 };
export const TARGET: Point = { x: 8, y: 4 };
export const blocked = (p: Point) =>
  p.x < 0 ||
  p.x > 9 ||
  p.y < 0 ||
  p.y > 9 ||
  (p.x >= 4 && p.x <= 5 && p.y >= 3 && p.y <= 6);
const directions: { action: Action; dx: number; dy: number }[] = [
  { action: 'move-right', dx: 1, dy: 0 },
  { action: 'move-up', dx: 0, dy: -1 },
  { action: 'move-down', dx: 0, dy: 1 },
  { action: 'move-left', dx: -1, dy: 0 },
];
/** A transparent policy: motion permits movement; BFS finds a collision-free next step. */
export function policy(
  position: Point,
  target: Point,
  observation: string,
): { action: Action; next: Point; reason: string } {
  if (/stationary|still|pause|unknown|waiting/i.test(observation))
    return {
      action: 'wait',
      next: position,
      reason: 'No motion observation: wait.',
    };
  if (position.x === target.x && position.y === target.y)
    return { action: 'wait', next: position, reason: 'Target reached.' };
  if (blocked(target))
    return {
      action: 'wait',
      next: position,
      reason: 'Target is outside the reachable space.',
    };
  const queue: { p: Point; first: (typeof directions)[number] | null }[] = [
      { p: position, first: null },
    ],
    seen = new Set([`${position.x},${position.y}`]);
  for (let i = 0; i < queue.length; i++) {
    const { p, first } = queue[i];
    if (p.x === target.x && p.y === target.y && first) {
      return {
        action: first.action,
        next: { x: position.x + first.dx, y: position.y + first.dy },
        reason: `Motion permits a step. Shortest safe path toward (${target.x}, ${target.y}).`,
      };
    }
    for (const d of directions) {
      const next = { x: p.x + d.dx, y: p.y + d.dy },
        key = `${next.x},${next.y}`;
      if (!blocked(next) && !seen.has(key)) {
        seen.add(key);
        queue.push({ p: next, first: first || d });
      }
    }
  }
  return { action: 'wait', next: position, reason: 'No safe route.' };
}
