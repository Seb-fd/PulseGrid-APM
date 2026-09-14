/**
 * Seeded PRNG (mulberry32) + helpers for the deterministic stochastic simulator.
 * Determinism matters: fault-injection E2E/specs must reproduce exact sequences.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian-ish noise via averaged uniforms, mean 0, ~[-spread, +spread]. */
export function noise(rand: () => number, spread: number): number {
  return ((rand() + rand() + rand()) / 1.5 - 1) * spread;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
