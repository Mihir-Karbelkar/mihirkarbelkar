export interface Point {
  x: number;
  y: number;
}
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface TourStep {
  target: string;
  say: string;
}
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
/** Where the cursor "clicks" on a target: its heading area, kept inside the viewport. */
export function targetPoint(
  box: Box,
  viewport: { width: number; height: number },
): Point {
  const margin = 24;
  return {
    x: clamp(
      box.left + Math.min(box.width * 0.3, 220),
      margin,
      viewport.width - margin,
    ),
    y: clamp(
      box.top + Math.min(56, box.height / 2),
      margin,
      viewport.height - 160,
    ),
  };
}
/** Flight time grows with distance but stays snappy. */
export function travelTime(from: Point, to: Point): number {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.round(clamp(260 + d * 0.55, 320, 900));
}
/** Near the left edge the mascot carries the cursor from the right, mirrored. */
export const carriesFromRight = (cursor: Point) => cursor.x < 90;
/**
 * Top-left of the 64px mascot so its hand (at 52,36, or 12,36 mirrored)
 * holds the cursor tip.
 */
export function mascotOffset(cursor: Point): Point {
  return {
    x: cursor.x - (carriesFromRight(cursor) ? 10 : 50),
    y: cursor.y - 34,
  };
}
/** A pointer movement this large while touring means the visitor wants their cursor back. */
export const CANCEL_DISTANCE = 12;
export function isDeliberateMove(dx: number, dy: number) {
  return Math.abs(dx) + Math.abs(dy) > CANCEL_DISTANCE;
}
