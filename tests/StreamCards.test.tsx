// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Details } from '../src/components/Cards/Details';
import { useSim } from '../src/store';

const s = () => useSim.getState();
beforeEach(() => { s().reset(); s().setMode('stream'); });
afterEach(cleanup);

describe('Details · Streaming', () => {
  it('shows the ladder under A and the playback buffer under B instead of the packet queues', () => {
    render(<Details />);
    expect(screen.getByRole('region', { name: 'A · Escada de qualidade' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'B · Buffer de reprodução' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /Fila de saída/ })).toBeNull();
  });

  it('marks each ladder cell with its state', () => {
    render(<Details />);
    const a = s().streamPlan.attempts[0];
    act(() => s().scrub(a.done));
    const got = document.querySelectorAll('[data-state="got"]');
    expect(got).toHaveLength(1);
    expect(got[0].getAttribute('data-rung')).toBe(String(a.rung));
    expect(got[0].getAttribute('data-seg')).toBe('0');
    expect(document.querySelectorAll('[data-state="edge"]').length).toBeGreaterThan(0);
  });

  it('the buffer reports a stall', () => {
    act(() => s().setProfile('tunnel'));
    render(<Details />);
    const stall = s().streamPlan.stalls[0];
    act(() => s().scrub((stall.from + stall.to) / 2));
    expect(document.querySelector('[data-stalled="true"]')).not.toBeNull();
  });

  it('the active side follows the stage', () => {
    render(<Details />);
    expect(screen.getByRole('region', { name: 'A · Escada de qualidade' }).getAttribute('data-active')).toBe('true');
    act(() => s().scrub(s().streamPlan.playStart + 1));
    expect(screen.getByRole('region', { name: 'B · Buffer de reprodução' }).getAttribute('data-active')).toBe('true');
  });
});
