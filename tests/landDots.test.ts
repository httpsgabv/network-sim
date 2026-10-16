import { describe, expect, it } from 'vitest';
import flat from '../src/data/landDots.json';

const dots: [number, number][] = [];
for (let i = 0; i < flat.length; i += 2) dots.push([flat[i], flat[i + 1]]);

const nearest = (lat: number, lon: number) =>
  Math.min(...dots.map(([a, b]) => Math.hypot(a - lat, (((b - lon + 540) % 360) - 180) * Math.cos((lat * Math.PI) / 180))));

describe('landDots (generated from world-atlas)', () => {
  it('has a plausible number of dots', () => {
    expect(dots.length).toBeGreaterThan(3000);
    expect(dots.length).toBeLessThan(8000);
  });

  it.each([
    ['São Paulo', -23.55, -46.63],
    ['Tóquio', 35.68, 139.69],
    ['Paris', 48.86, 2.35],
    ['Nairóbi', -1.29, 36.82],
    ['Sydney', -33.87, 151.2],
  ])('covers %s', (_, lat, lon) => expect(nearest(lat, lon)).toBeLessThan(2.5));

  it.each([
    ['Atlântico Sul', -10, -25],
    ['Pacífico', 0, -150],
    ['Índico', -20, 80],
  ])('leaves the %s empty', (_, lat, lon) => expect(nearest(lat, lon)).toBeGreaterThan(5));
});
