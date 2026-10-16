// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dock, NetworkControls } from '../src/components/Dock/Dock';
import { StageHeader } from '../src/components/StageHeader';
import { useSim } from '../src/store';
import { STAGE_START } from '../src/sim/engine';

beforeEach(() => useSim.getState().reset());
afterEach(cleanup);

describe('Dock', () => {
  it('play/pause toggles and is labelled for screen readers', () => {
    render(<Dock />);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(useSim.getState().playing).toBe(false);
    expect(screen.getByRole('button', { name: 'Reproduzir' })).toBeTruthy();
  });

  it('next-stage button and scrubber move time', () => {
    render(<><StageHeader /><Dock /></>);
    fireEvent.click(screen.getByRole('button', { name: 'Próxima etapa' }));
    expect(useSim.getState().t).toBe(STAGE_START.encrypt);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Criptografia');
    fireEvent.change(screen.getByLabelText('Linha do tempo'), { target: { value: '300' } });
    expect(useSim.getState().t).toBe(STAGE_START.transit);
  });

  it('speed and loss controls update the store and expose pressed state', () => {
    render(<><Dock /><NetworkControls /></>);
    const twoX = screen.getByRole('button', { name: '2×' });
    fireEvent.click(twoX);
    expect(useSim.getState().speed).toBe(2);
    expect(twoX.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '30%' }));
    expect(useSim.getState().loss).toBe(0.3);
  });
});

describe('Dock latency', () => {
  const ms = () => parseInt(screen.getByText((t) => t.startsWith('t+')).textContent!.slice(2), 10);

  it('t+ ms follows the route length', () => {
    useSim.getState().scrub(100);
    const { unmount } = render(<Dock />);
    const long = ms();
    unmount();
    useSim.getState().setRoute('lon', 'fra');
    useSim.getState().scrub(100);
    render(<Dock />);
    expect(long).toBeGreaterThan(50);
    expect(ms()).toBeLessThan(long / 10);
  });
});
