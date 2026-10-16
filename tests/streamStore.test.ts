import { beforeEach, describe, expect, it } from 'vitest';
import { CITIES } from '../src/data/nodes';
import { edgeOf } from '../src/data/network';
import { FIBRE_MS_PER_KM, routeKm } from '../src/sim/route';
import { LAST_MILE_RTT_S } from '../src/sim/stream/engine';
import { STREAM_LOSSES, TICKS_PER_SECOND, routeFor, useSim } from '../src/store';

const s = () => useSim.getState();
const run = (ms: number) => { for (let i = 0; i < ms / 50; i++) s().tick(50); };

beforeEach(() => s().reset());

describe('edgeOf (CDN edge = city closest to the viewer, spec Decision 2)', () => {
  it('São Paulo → Tóquio is served from Hong Kong', () => {
    expect(edgeOf('sao', 'tyo')).toBe('hkg');
  });

  it('is never one of the two ends, for every pair', () => {
    for (const o of CITIES) for (const d of CITIES) {
      if (o.id === d.id) continue;
      const e = edgeOf(o.id, d.id);
      expect(e).not.toBe(o.id);
      expect(e).not.toBe(d.id);
    }
  });
});

describe('store · streaming mode', () => {
  it('starts in Transferência; Streaming defaults to the drop profile with no loss', () => {
    expect(s().mode).toBe('transfer');
    expect(s()).toMatchObject({ profile: 'drop', streamLoss: 0, streamSeg: null });
    expect(STREAM_LOSSES).toEqual([0, 0.005, 0.01, 0.05]);
  });

  it('switching mode restarts the clock', () => {
    run(500);
    s().setMode('stream');
    expect(s()).toMatchObject({ mode: 'stream', t: 0 });
  });

  it('in Streaming one second of wall clock is one second of t; Transferência keeps its ticks', () => {
    run(1000);
    expect(s().t).toBeCloseTo(TICKS_PER_SECOND);
    s().setMode('stream');
    run(1000);
    expect(s().t).toBeCloseTo(1);
    s().setSpeed(2);
    run(500);
    expect(s().t).toBeCloseTo(2);
  });

  it('derives both round trips from the routes through the edge', () => {
    const p = s().streamPlan.config;
    const ms = (o: string, d: string) => routeKm(routeFor(o, d)) * FIBRE_MS_PER_KM / 1000;
    expect(p.rttEdge).toBeCloseTo(2 * ms('hkg', 'tyo') + LAST_MILE_RTT_S);
    expect(p.rttOrigin).toBeCloseTo(2 * ms('sao', 'hkg'));
  });

  it('profile, loss, MTU and route rebuild the stream plan and restart', () => {
    s().setMode('stream');
    const first = s().streamPlan;
    run(1000);
    s().setProfile('tunnel');
    expect(s().streamPlan).not.toBe(first);
    expect(s().streamPlan.config.profile).toBe('tunnel');
    expect(s().t).toBe(0);
    run(1000);
    s().setStreamLoss(0.01);
    expect(s()).toMatchObject({ streamLoss: 0.01, t: 0 });
    expect(s().streamPlan.config.loss).toBe(0.01);
    s().setMtu(4096);
    expect(s().streamPlan.config.mss).toBe(4096);
    s().setRoute('lon', 'nyc');
    expect(s().streamPlan.config.rttEdge).not.toBeCloseTo(first.config.rttEdge);
  });

  it('stops at the end of the stream plan and steps through its stages', () => {
    s().setMode('stream');
    const p = s().streamPlan;
    s().stepNext();
    expect(s()).toMatchObject({ t: p.stageStart[1], playing: false });
    s().stepNext();
    expect(s().t).toBe(p.stageStart[2]);
    s().scrub(p.end - 0.01);
    s().toggle();
    run(500);
    expect(s()).toMatchObject({ t: p.end, playing: false });
    s().scrub(1e6);
    expect(s().t).toBe(p.end);
  });

  it('selecting a segment opens it in the Segmento panel', () => {
    s().selectSeg(4);
    expect(s()).toMatchObject({ streamSeg: 4, panel: 'segment' });
    s().selectSeg(99);
    expect(s().streamSeg).toBe(14);
  });
});
