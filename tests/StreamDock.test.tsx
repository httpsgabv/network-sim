// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dock } from '../src/components/Dock/Dock';
import { Hud } from '../src/components/Hud';
import { StageHeader } from '../src/components/StageHeader';
import { useSim } from '../src/store';

const s = () => useSim.getState();
beforeEach(() => { s().reset(); s().setMode('stream'); });
afterEach(cleanup);

describe('StageHeader · Streaming', () => {
  it('shows six stages with their actor, and next-stage walks them', () => {
    render(<><StageHeader /><Dock /></>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Codificação');
    expect(screen.getByText(/Etapa 01 \/ 06/)).toBeTruthy();
    expect(screen.getAllByText('A · Origem').length).toBe(2); // the header chip and the dock group
    fireEvent.click(screen.getByRole('button', { name: 'Próxima etapa' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Conexão + TLS');
    expect(screen.getAllByText('Rede').length).toBeGreaterThan(0);
  });
});

describe('Dock · Streaming', () => {
  it('the scrubber spans the six stages of the stream plan', () => {
    render(<Dock />);
    const scrub = screen.getByLabelText('Linha do tempo');
    expect(scrub.getAttribute('max')).toBe('600');
    fireEvent.change(scrub, { target: { value: '300' } });
    expect(s().t).toBeCloseTo(s().streamPlan.stageStart[3]);
  });

  it('counts time from the play press, in seconds', () => {
    render(<Dock />);
    expect(screen.getByText('codificando')).toBeTruthy();
    act(() => s().scrub(4.5));
    expect(screen.getByText('t+2,50 s')).toBeTruthy();
  });
});

describe('Hud · Streaming', () => {
  it('shows quality, throughput, cwnd, ABR rule and both RTTs', () => {
    act(() => s().setProfile('fiber'));
    render(<Hud />);
    for (const k of ['Qualidade', 'Throughput medido', 'cwnd', 'ABR', 'RTT']) expect(screen.getByText(k)).toBeTruthy();
    expect(screen.getByText(/borda \d+ ms/)).toBeTruthy();
    act(() => s().scrub(s().streamPlan.end));
    expect(screen.getByText('1080p')).toBeTruthy();
  });
});
