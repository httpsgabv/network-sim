// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { prefersReducedMotion, useReducedMotion } from '../src/lib/useReducedMotion';

let listeners: (() => void)[] = [];
function mockMatchMedia(matches: { value: boolean }) {
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return matches.value; },
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: (_: string, cb: () => void) => { listeners = listeners.filter((l) => l !== cb); },
  }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); listeners = []; });

function Probe() {
  return <span data-testid="v">{String(useReducedMotion())}</span>;
}

describe('useReducedMotion', () => {
  it('reads the media query and follows changes', () => {
    const state = { value: false };
    mockMatchMedia(state);
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('v').textContent).toBe('false');
    state.value = true;
    act(() => listeners.forEach((l) => l()));
    expect(getByTestId('v').textContent).toBe('true');
    expect(prefersReducedMotion()).toBe(true);
  });
});
