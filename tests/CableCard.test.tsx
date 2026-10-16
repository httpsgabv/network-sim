// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Details } from '../src/components/Cards/Details';
import { DataCredit } from '../src/components/DataCredit';
import { cableById } from '../src/data/network';
import { legRows } from '../src/lib/describe';
import { useSim } from '../src/store';

beforeEach(() => {
  useSim.getState().reset();
  useSim.setState({ playing: false });
});
afterEach(cleanup);

const card = () => screen.getByRole('region', { name: /^Ficha do cabo/ });
const onRouteCable = () => legRows(useSim.getState().route).find((r) => r.sea)!.cable;

describe('Cable card (Rota panel)', () => {
  it('opens from the legs list and goes back with "← Trechos"', () => {
    useSim.getState().setPanel('route');
    render(<Details />);
    const id = onRouteCable();
    fireEvent.click(screen.getAllByRole('button', { name: `Ficha do cabo ${cableById.get(id)!.name}` })[0]);
    expect(within(card()).getByRole('heading', { name: cableById.get(id)!.name })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '← Trechos' }));
    expect(useSim.getState().selectedCable).toBeNull();
    expect(screen.getByRole('list', { name: 'Trechos da rota' })).toBeTruthy();
  });

  it('shows year, length, owners and landing stations, with the route ones marked', () => {
    const id = onRouteCable(), c = cableById.get(id)!;
    useSim.getState().selectCable(id);
    render(<Details />);
    expect(within(card()).getByText('Na rota')).toBeTruthy();
    if (c.rfs) expect(within(card()).getByText(String(c.rfs))).toBeTruthy();
    // owners can share the cable's name (GlobeNet is owned by GlobeNet)
    if (c.owners) expect(within(card()).getAllByText(c.owners).some((el) => el.tagName === 'P')).toBe(true);
    const stations = within(card()).getAllByRole('listitem');
    expect(stations).toHaveLength(c.landings.length);
    expect(stations.some((li) => li.dataset.onRoute === 'true')).toBe(true);
  });

  it('says when a cable is off the route, and flags those still planned in the 2022 data', () => {
    useSim.getState().setRoute('lon', 'fra');
    useSim.getState().selectCable('2africa');
    render(<Details />);
    expect(within(card()).getByText('Fora da rota')).toBeTruthy();
    expect(within(card()).getByText('Planejado em 2022')).toBeTruthy();
  });

  it('credits the source', () => {
    useSim.getState().selectCable('monet');
    render(<Details />);
    expect(within(card()).getByText(/TeleGeography/)).toBeTruthy();
  });
});

describe('DataCredit (license attribution, always on screen)', () => {
  it('links the source and the license', () => {
    render(<DataCredit />);
    expect(screen.getByRole('link', { name: 'TeleGeography' }).getAttribute('href')).toBe('https://www.submarinecablemap.com');
    expect(screen.getByRole('link', { name: 'CC BY-NC-SA' }).getAttribute('href')).toMatch(/by-nc-sa\/3\.0/);
    expect(screen.getByText(/Dados de cabos/).textContent).toContain('2022');
  });
});
