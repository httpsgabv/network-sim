// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ModeSwitch, ScenarioControls } from '../src/components/Dock/StreamControls';
import { useSim } from '../src/store';

const s = () => useSim.getState();
beforeEach(() => s().reset());
afterEach(cleanup);

const group = (name: string) => screen.getByRole('group', { name });

describe('ModeSwitch', () => {
  it('starts on Transferência and switches to Streaming', () => {
    render(<ModeSwitch />);
    const transfer = screen.getByRole('button', { name: 'Transferência' });
    const stream = screen.getByRole('button', { name: 'Streaming' });
    expect(transfer.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(stream);
    expect(s().mode).toBe('stream');
    expect(stream.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('ScenarioControls', () => {
  it('Transferência shows content type, loss 0–30 % and MTU', () => {
    render(<ScenarioControls />);
    expect(group('Tipo de conteúdo')).toBeTruthy();
    expect(within(group('Taxa de perda de pacotes')).getByRole('button', { name: '30%' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Perfil da rede de Kenji' })).toBeNull();
  });

  it('Streaming swaps the content type for the network profile and uses its own loss steps', () => {
    render(<ScenarioControls />);
    act(() => s().setMode('stream'));
    expect(screen.queryByRole('group', { name: 'Tipo de conteúdo' })).toBeNull();
    const profiles = within(group('Perfil da rede de Kenji')).getAllByRole('button').map((b) => b.textContent);
    expect(profiles).toEqual(['Fibra', '4G', 'Queda', 'Túnel']);
    const losses = within(group('Taxa de perda de pacotes')).getAllByRole('button').map((b) => b.textContent);
    expect(losses).toEqual(['0%', '0,5%', '1%', '5%']);
    expect(group('Tamanho máximo do pacote (MTU)')).toBeTruthy();
  });

  it('a profile describes itself and restarts the session', () => {
    act(() => s().setMode('stream'));
    render(<ScenarioControls />);
    act(() => s().scrub(10));
    const tunnel = screen.getByRole('button', { name: 'Túnel' });
    expect(tunnel.getAttribute('title')).toMatch(/12 s/);
    fireEvent.click(tunnel);
    expect(s()).toMatchObject({ profile: 'tunnel', t: 0 });
    expect(tunnel.getAttribute('aria-pressed')).toBe('true');
  });

  it('stream loss and MTU change the stream plan, not the transfer settings', () => {
    act(() => s().setMode('stream'));
    render(<ScenarioControls />);
    fireEvent.click(screen.getByRole('button', { name: '1%' }));
    expect(s().streamLoss).toBe(0.01);
    expect(s().loss).toBe(0.12);
    fireEvent.click(screen.getByRole('button', { name: '4 KB' }));
    expect(s().streamPlan.config.mss).toBe(4096);
  });
});
