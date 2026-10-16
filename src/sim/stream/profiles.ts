// Bandwidth of Kenji's last mile over time (spec streaming.md, "Perfis de rede"). Only the access link varies:
// cables and backbones never congest (spec Decision 3).

export const PROFILE_IDS = ['fiber', 'lte', 'drop', 'tunnel'] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

export interface Profile {
  label: string;
  /** Tooltip / accessible description, pt-BR. */
  title: string;
  /** Available bandwidth in Mbps at `x` seconds after Kenji presses play. Pure: same (x, seed) → same value. */
  bwMbps(x: number, seed: number): number;
}

/** Integer hash → [0, 1). Random access by (i, seed), unlike a PRNG stream, so any x can be sampled in any order. */
function noise(i: number, seed: number): number {
  let h = Math.imul(i ^ Math.imul(seed, 0x9e3779b1), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h / 4294967296;
}

export const PROFILES: Record<ProfileId, Profile> = {
  fiber: { label: 'Fibra', title: 'Fibra estável · 50 Mbps', bwMbps: () => 50 },
  // ponytail: a sine plus 0.5 s steps of noise, not a real cellular trace; swap in a measured trace if fidelity matters.
  lte: {
    label: '4G',
    title: '4G oscilando · 2–12 Mbps',
    bwMbps: (x, seed) => Math.min(12, Math.max(2, 6.5 + 4.2 * Math.sin(x / 2.4) + 3 * (noise(Math.floor(x * 2), seed) - 0.5))),
  },
  // 4–14 s, not 10–20 s: at the top rung dash.js buffers up to 30 s, so by 10 s a 30 s video is fully downloaded (T10.3).
  drop: { label: 'Queda', title: 'Queda · 20 → 1,5 Mbps entre 4 s e 14 s', bwMbps: (x) => (x >= 4 && x < 14 ? 1.5 : 20) },
  // 12 s, not 5: a ~10 s buffer covers a 5 s tunnel and nothing would stall (seen in mockup v9).
  tunnel: { label: 'Túnel', title: 'Túnel · 8 Mbps, 12 s quase sem sinal', bwMbps: (x) => (x >= 10 && x < 22 ? 0.1 : 8) },
};
