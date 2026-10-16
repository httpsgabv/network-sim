import { describe, expect, it } from 'vitest';
import { fragmentGrid, fragmentPosition } from '../src/lib/fragments';

describe('fragmentGrid', () => {
  it('lays pieces out close to a 3:2 photo', () => {
    expect(fragmentGrid(24)).toEqual({ cols: 6, rows: 4 });
    expect(fragmentGrid(3)).toEqual({ cols: 3, rows: 1 });
    expect(fragmentGrid(1)).toEqual({ cols: 1, rows: 1 });
  });

  it('always has room for every piece', () => {
    for (const n of [2, 7, 23, 48, 120]) {
      const { cols, rows } = fragmentGrid(n);
      expect(cols * rows).toBeGreaterThanOrEqual(n);
      expect(cols * (rows - 1)).toBeLessThan(n);
    }
  });
});

describe('fragmentPosition', () => {
  const g = fragmentGrid(24);
  it('maps the first piece to the top-left and the last to the bottom-right', () => {
    expect(fragmentPosition(0, g)).toBe('0% 0%');
    expect(fragmentPosition(23, g)).toBe('100% 100%');
  });

  it('walks row by row', () => {
    expect(fragmentPosition(1, g)).toBe('20% 0%');
    expect(fragmentPosition(6, g)).toBe('0% 33.333%');
  });

  it('handles a single row or column', () => {
    expect(fragmentPosition(2, fragmentGrid(3))).toBe('100% 0%');
    expect(fragmentPosition(0, fragmentGrid(1))).toBe('0% 0%');
  });
});
