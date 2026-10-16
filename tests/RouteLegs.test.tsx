// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Details } from '../src/components/Cards/Details';
import { cableById } from '../src/data/network';
import { legRows } from '../src/lib/describe';
import { STAGE_START } from '../src/sim/engine';
import { useSim } from '../src/store';

beforeEach(() => {
  useSim.getState().reset();
  useSim.getState().setPanel('route');
  useSim.setState({ playing: false });
});
afterEach(cleanup);

const list = () => screen.getByRole('list', { name: 'Trechos da rota' });
const rows = () => within(list()).getAllByRole('listitem');
const at = (t: number) => { useSim.getState().scrub(t); render(<Details />); };

describe('legRows', () => {
  it('one row per leg, with fibre km and one-way ms that add up to the route', () => {
    const route = useSim.getState().route;
    const r = legRows(route);
    expect(r).toHaveLength(route.legs.length);
    const km = r.reduce((s, x) => s + x.km, 0);
    expect(km).toBeCloseTo(route.length * 6371, 0);
    for (const x of r) expect(x.ms).toBeCloseTo(x.km * 0.005, 9);
  });

  it('names the cable for sea legs and says "por terra" for land ones', () => {
    for (const x of legRows(useSim.getState().route)) {
      if (x.sea) expect(x.cableName).toBe(cableById.get(x.cable)!.name);
      else expect(x.cableName).toMatch(/Backhaul|Backbone/);
    }
  });

  it('a city → its own landing station reads as one place, not "Fortaleza → Fortaleza"', () => {
    for (const x of legRows(useSim.getState().route)) expect(x.between).not.toMatch(/^(.+) → \1$/);
  });
});

describe('Rota tab', () => {
  it('is a third option of the detail panel', () => {
    useSim.getState().setPanel('events');
    at(0);
    fireEvent.click(screen.getByRole('button', { name: 'Rota' }));
    expect(useSim.getState().panel).toBe('route');
    expect(list()).toBeTruthy();
  });

  it('lists every leg of the route, with the route summary on top', () => {
    at(0);
    expect(rows()).toHaveLength(useSim.getState().route.legs.length);
    expect(screen.getByText(/São Paulo → Tóquio/)).toBeTruthy();
    expect(screen.getByText(/do caminho é fibra no fundo do mar/)).toBeTruthy();
  });

  it('marks the leg the packets are on only while the network acts', () => {
    at(0);
    expect(rows().filter((li) => li.dataset.active === 'true')).toHaveLength(0);
    cleanup();
    at((STAGE_START.transit + STAGE_START.sort) / 2);
    expect(rows().filter((li) => li.dataset.active === 'true')).toHaveLength(1);
  });

  it('redraws when the route changes', () => {
    useSim.getState().setRoute('lon', 'fra');
    useSim.setState({ playing: false });
    at(0);
    expect(rows()).toHaveLength(useSim.getState().route.legs.length);
    expect(screen.getByText(/Londres → Frankfurt/)).toBeTruthy();
  });

  it('clicking a cable selects it', () => {
    at(0);
    const sea = legRows(useSim.getState().route).find((x) => x.sea)!;
    fireEvent.click(within(list()).getAllByRole('button', { name: `Ficha do cabo ${sea.cableName}` })[0]);
    expect(useSim.getState().selectedCable).toBe(sea.cable);
    expect(useSim.getState().panel).toBe('route');
  });
});
