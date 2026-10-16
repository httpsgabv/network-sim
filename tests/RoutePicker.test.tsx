// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RoutePicker } from '../src/components/Dock/RoutePicker';
import { useSim } from '../src/store';

// Radix Select leans on pointer-capture, scrollIntoView and ResizeObserver, which jsdom lacks.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => useSim.getState().reset());
afterEach(cleanup);

const open = (name: string) => {
  const trigger = screen.getByRole('combobox', { name });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
};

describe('RoutePicker', () => {
  it('names both selects and starts at São Paulo → Tóquio', () => {
    render(<RoutePicker />);
    expect(screen.getByRole('combobox', { name: 'Origem' }).textContent).toContain('São Paulo');
    expect(screen.getByRole('combobox', { name: 'Destino' }).textContent).toContain('Tóquio');
  });

  it('lists the 15 cities west → east with the current one checked', () => {
    render(<RoutePicker />);
    open('Origem');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(15);
    expect(options[0].textContent).toBe('Los Angeles');
    expect(options.filter((o) => o.getAttribute('data-state') === 'checked').map((o) => o.textContent)).toEqual(['São Paulo']);
  });

  it('choosing a city changes the route and restarts the send', () => {
    useSim.getState().scrub(100);
    render(<RoutePicker />);
    open('Destino');
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Sydney' }));
    expect(useSim.getState()).toMatchObject({ origin: 'sao', destination: 'syd', t: 0, playing: true });
  });

  it('choosing the city at the other end swaps the pair', () => {
    render(<RoutePicker />);
    open('Origem');
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Tóquio' }));
    expect(useSim.getState()).toMatchObject({ origin: 'tyo', destination: 'sao' });
  });

  it('the swap button reverses the route and restarts', () => {
    useSim.getState().scrub(100);
    render(<RoutePicker />);
    fireEvent.click(screen.getByRole('button', { name: 'Inverter origem e destino' }));
    expect(useSim.getState()).toMatchObject({ origin: 'tyo', destination: 'sao', t: 0 });
  });
});
