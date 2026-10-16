import { describe, expect, it } from 'vitest';
import { BUFFER_VIEW_S, bufferBlocks, bufferNote, ladderRows } from '../src/lib/streamCards';
import { ENCODE_S, streamSnapshot } from '../src/sim/stream/engine';
import { streamPlanFor } from '../src/store';

const drop = streamPlanFor('sao', 'tyo', 'drop', 0, 1024);
const tunnel = streamPlanFor('sao', 'tyo', 'tunnel', 0, 1024);
const at = (p: typeof drop, t: number) => ({ p, snap: streamSnapshot(p, t) });
const rows = (p: typeof drop, t: number) => ladderRows(p, streamSnapshot(p, t));
const cell = (p: typeof drop, t: number, rung: number, seg: number) => rows(p, t).find((r) => r.rung === rung)!.cells[seg];

describe('ladderRows (A · Escada)', () => {
  it('lists 1080p on top, 15 cells per rung', () => {
    const r = rows(drop, 0);
    expect(r.map((x) => x.label)).toEqual(['1080p', '720p', '480p', '240p']);
    expect(r.every((x) => x.cells.length === 15)).toBe(true);
  });

  it('segments appear at the origin as the encoder reaches them', () => {
    expect(cell(drop, 0, 0, 0)).toBe('pending');
    expect(cell(drop, ENCODE_S / 2, 0, 0)).toBe('origin');
    expect(cell(drop, ENCODE_S / 2, 0, 14)).toBe('pending');
    expect(cell(drop, ENCODE_S, 3, 14)).toBe('origin');
  });

  it('follows a segment from transit to Kenji, and the edge holds the prefetched ones', () => {
    const a = drop.attempts[0];
    expect(cell(drop, (a.firstByte + a.done) / 2, a.rung, 0)).toBe('transit');
    expect(cell(drop, a.done, a.rung, 0)).toBe('got');
    expect(cell(drop, a.done, a.rung, 1)).toBe('edge');
  });

  it('an abandoned download stays visible at the rung it was abandoned at', () => {
    const ab = drop.attempts.find((x) => x.abandoned)!;
    expect(cell(drop, ab.done + 0.01, ab.rung, ab.seg)).toBe('abandoned');
  });
});

describe('bufferBlocks (B · buffer de reprodução)', () => {
  it('is empty before the first segment', () => {
    const { p, snap } = at(drop, ENCODE_S + 0.1);
    expect(bufferBlocks(p, snap)).toEqual([]);
  });

  it('stacks the downloaded seconds ahead of the playhead, plus the segment arriving', () => {
    const a = drop.attempts[5];
    const { p, snap } = at(drop, (a.firstByte + a.done) / 2);
    const blocks = bufferBlocks(p, snap);
    const solid = blocks.filter((b) => !b.arriving);
    expect(solid.reduce((sum, b) => sum + b.width, 0)).toBeCloseTo(snap.sample.buffer, 1);
    expect(solid[0].start).toBe(0);
    const arriving = blocks.find((b) => b.arriving)!;
    expect(arriving.rung).toBe(a.rung);
    expect(arriving.width).toBeGreaterThan(0);
    expect(arriving.width).toBeLessThan(2);
    expect(blocks.every((b) => b.start + b.width <= BUFFER_VIEW_S + 1e-9)).toBe(true);
  });

  it('says why nothing is coming in', () => {
    const stall = tunnel.stalls[0];
    expect(bufferNote(tunnel, streamSnapshot(tunnel, (stall.from + stall.to) / 2))).toMatch(/espera o segmento/);
    expect(bufferNote(drop, streamSnapshot(drop, 1))).toMatch(/1º segmento/);
  });
});
