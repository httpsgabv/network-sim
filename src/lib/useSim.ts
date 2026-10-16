import { useEffect } from 'react';
import { snapshot, type Plan, type Snapshot } from '../sim/engine';
import { useSim } from '../store';

/** Drives the simulation clock with requestAnimationFrame (which also idles in hidden tabs). */
export function useClock() {
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      useSim.getState().tick(now - last);
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

let cached: { plan: Plan; t: number; snap: Snapshot } | null = null;

/** One snapshot per (plan, t), shared by every panel and the globe layers in the same frame. */
export function snapshotOf(plan: Plan, t: number): Snapshot {
  if (cached?.plan !== plan || cached.t !== t) cached = { plan, t, snap: snapshot(plan, t) };
  return cached.snap;
}

export function useSnapshot() {
  const t = useSim((s) => s.t);
  const plan = useSim((s) => s.plan);
  return snapshotOf(plan, t);
}
