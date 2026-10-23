/**
 * Coordinate mapping: solver (x, y) in metres → Three.js world.
 * Solver y is vertical (thrust / vibration direction).
 * Three.js: Y-up, so (x, y, 0).
 */

export function toWorld(x: number, y: number): [number, number, number] {
  return [x, y, 0];
}

/** Drone symmetry: solver models one diagonal; viewer draws copies about Y. */
export const DRONE_ANGLES = [0, Math.PI / 2]; // two diagonals → four arms

export function isDroneDesign(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("quad") || lower.includes("drone");
}

/** Bounding box helper for zoom-to-fit */
export function computeBounds(
  nodes: { x: number; y: number }[]
): { center: [number, number, number]; size: number } {
  if (nodes.length === 0) {
    return { center: [0, 0, 0], size: 0.5 };
  }
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const dx = maxX - minX;
  const dy = maxY - minY;
  const size = Math.max(dx, dy, 0.1) * 1.4;
  return { center: [cx, cy, 0], size };
}