/**
 * Jet colormap (blue → cyan → green → yellow → red)
 * t ∈ [0, 1]
 */
export function jet(t: number): [number, number, number] {
  t = Math.min(1, Math.max(0, t));
  const r = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 3)));
  const g = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 2)));
  const b = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 1)));
  return [r, g, b];
}

export function jetHex(t: number): string {
  const [r, g, b] = jet(t);
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Returns CSS linear-gradient string for the colorbar */
export function jetGradient(): string {
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => `${jetHex(t)} ${t * 100}%`);
  return `linear-gradient(to top, ${stops.join(", ")})`;
}