// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Vector3 } from 'three';
import type { OrbitControls } from 'three-stdlib';
import { ZoomControls } from '../src/components/Globe/ZoomControls';
import { ZOOM_MIN, ZOOM_STEP } from '../src/lib/camera';

afterEach(cleanup);

const fakeControls = (distance: number) => {
  const c = { object: { position: new Vector3(0, 0, distance) }, update: vi.fn() };
  return { ref: { current: c as unknown as OrbitControls }, c };
};

describe('ZoomControls', () => {
  it('+ moves the camera closer, − farther, keeping its direction', () => {
    const { ref, c } = fakeControls(4);
    render(<ZoomControls controls={ref} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aproximar' }));
    expect(c.object.position.z).toBeCloseTo(4 / ZOOM_STEP, 9);
    fireEvent.click(screen.getByRole('button', { name: 'Afastar' }));
    expect(c.object.position.z).toBeCloseTo(4, 9);
    expect(c.update).toHaveBeenCalledTimes(2);
  });

  it('never goes inside the minimum distance', () => {
    const { ref, c } = fakeControls(ZOOM_MIN);
    render(<ZoomControls controls={ref} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aproximar' }));
    expect(c.object.position.length()).toBeCloseTo(ZOOM_MIN, 9);
  });
});
