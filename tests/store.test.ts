import { beforeEach, describe, expect, it } from 'vitest';
import { KINDS, TICKS_PER_SECOND, useSim } from '../src/store';
import { END, STAGE_START } from '../src/sim/engine';

const s = () => useSim.getState();

beforeEach(() => s().reset());

describe('store', () => {
  it('starts playing a photo at t = 0 with 12% loss', () => {
    expect(s()).toMatchObject({ t: 0, playing: true, speed: 1, kind: 'photo', loss: 0.12 });
    expect(s().plan.packets).toHaveLength(KINDS.photo.count);
  });

  const run = (ms: number) => { for (let i = 0; i < ms / 50; i++) s().tick(50); };

  it('tick advances t by wall time × speed, only while playing', () => {
    run(1000);
    expect(s().t).toBeCloseTo(TICKS_PER_SECOND);
    s().setSpeed(2);
    run(500);
    expect(s().t).toBeCloseTo(TICKS_PER_SECOND * 2);
    s().toggle();
    run(1000);
    expect(s().t).toBeCloseTo(TICKS_PER_SECOND * 2);
  });

  it('clamps huge frame gaps (tab was hidden) so time does not jump', () => {
    s().tick(60_000);
    expect(s().t).toBeLessThan(TICKS_PER_SECOND * 0.2);
  });

  it('stops at the end, and toggle from the end replays', () => {
    s().scrub(END - 0.1);
    s().toggle();
    run(1000);
    expect(s()).toMatchObject({ t: END, playing: false });
    s().toggle();
    expect(s()).toMatchObject({ t: 0, playing: true });
  });

  it('stepNext jumps to the next stage start and pauses', () => {
    s().scrub(STAGE_START.transit + 3);
    s().stepNext();
    expect(s()).toMatchObject({ t: STAGE_START.sort, playing: false });
    s().scrub(END);
    s().stepNext();
    expect(s().t).toBe(END);
  });

  it('scrub pauses and clamps', () => {
    s().scrub(9999);
    expect(s()).toMatchObject({ t: END, playing: false });
    s().scrub(-3);
    expect(s().t).toBe(0);
  });

  it('changing kind or loss rebuilds the plan and restarts', () => {
    s().scrub(100);
    s().setKind('video');
    expect(s()).toMatchObject({ t: 0, playing: true, kind: 'video' });
    expect(s().plan.packets).toHaveLength(KINDS.video.count);
    s().scrub(100);
    s().setLoss(0);
    expect(s().t).toBe(0);
    expect(s().plan.packets.some((p) => p.lost)).toBe(false);
  });

  it('selection is clamped to the packet count', () => {
    s().select(40);
    expect(s().selected).toBe(KINDS.photo.count - 1);
    s().setKind('text');
    expect(s().selected).toBeLessThan(KINDS.text.count);
  });
});

describe('store.load (real transfer)', () => {
  const fakeTransfer = (n: number, kind: 'photo' | 'text' = 'photo') => ({
    payload: { kind, name: 'x', mime: 'image/jpeg', bytes: new Uint8Array(10) },
    packets: Array.from({ length: n }, (_, seq) => ({ seq, total: n, payload: new Uint8Array(1) })),
    delivered: new Uint8Array(10),
    intact: true,
  });

  it('plans one animated packet per real packet and restarts', () => {
    s().scrub(100);
    s().load(fakeTransfer(37));
    expect(s().plan.packets).toHaveLength(37);
    expect(s()).toMatchObject({ t: 0, playing: true, kind: 'photo' });
    expect(s().transfer?.packets).toHaveLength(37);
  });

  it('changing loss keeps the real packet count', () => {
    s().load(fakeTransfer(37));
    s().setLoss(0.25);
    expect(s().plan.packets).toHaveLength(37);
  });

  it('takes the kind from the payload', () => {
    s().load(fakeTransfer(1, 'text'));
    expect(s().kind).toBe('text');
  });
});

describe('store.setRoute', () => {
  it('starts at São Paulo → Tóquio with its latency', () => {
    expect(s()).toMatchObject({ origin: 'sao', destination: 'tyo' });
    expect(s().route.hops[0]).toBe('sao');
    expect(s().msPerTick * 100).toBeGreaterThan(100);
  });

  it('restarts, keeps kind/loss/MTU and the plan (same lost seqs on any route)', () => {
    s().setKind('video'); s().setLoss(0.25); s().setMtu(2048);
    const lost = s().plan.packets.map((p) => p.lost);
    s().scrub(120);
    s().setRoute('lon', 'fra');
    expect(s()).toMatchObject({ origin: 'lon', destination: 'fra', t: 0, playing: true, kind: 'video', loss: 0.25, mtu: 2048 });
    expect(s().plan.packets.map((p) => p.lost)).toEqual(lost);
    expect(s().msPerTick).toBeLessThan(0.1);
  });

  it('picking the city at the other end swaps the pair, never origin = destination', () => {
    s().setRoute('tyo', 'tyo');
    expect(s()).toMatchObject({ origin: 'tyo', destination: 'sao' });
    s().setRoute('sao', 'sao');
    expect(s()).toMatchObject({ origin: 'sao', destination: 'tyo' });
  });

  it('swapRoute reverses; the same pair gives the same route instance', () => {
    const r = s().route;
    s().swapRoute();
    expect(s()).toMatchObject({ origin: 'tyo', destination: 'sao', t: 0 });
    s().swapRoute();
    expect(s().route).toBe(r);
  });
});

describe('store.panel (middle detail card)', () => {
  it('shows events by default; picking a packet switches to its details', () => {
    expect(s().panel).toBe('events');
    s().select(3);
    expect(s().panel).toBe('packet');
    s().setPanel('events');
    expect(s().panel).toBe('events');
  });
});
