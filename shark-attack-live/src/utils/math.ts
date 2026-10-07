export type Rng = () => number;

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const distSq = (ax: number, ay: number, bx: number, by: number): number => (ax - bx) ** 2 + (ay - by) ** 2;
export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt(distSq(ax, ay, bx, by));
export const randRange = (min: number, max: number, rng: Rng = Math.random): number => min + (max - min) * rng();

export function pickWeighted<T extends string>(weights: Partial<Record<T, number>>, rng: Rng = Math.random): T | null {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const [key, w] of entries) {
    roll -= Math.max(0, w);
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
