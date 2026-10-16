// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { useFlip } from '../src/lib/useFlip';

// jsdom has no layout: place each item by its index among its siblings, 50 px apart.
let animate: ReturnType<typeof vi.fn>;
const index = (el: HTMLElement) => [...el.parentElement!.children].indexOf(el);

beforeEach(() => {
  animate = vi.fn();
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) { return index(this) * 50; });
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(0);
  HTMLElement.prototype.animate = animate as unknown as HTMLElement['animate'];
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function List({ order, reduced = false }: { order: string[]; reduced?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useFlip(root, order.join(','), reduced);
  return <div ref={root}>{order.map((id) => (id.startsWith('_') ? <i key={id} /> : <span key={id} data-flip={id} />))}</div>;
}

describe('useFlip', () => {
  it('does not animate on first render', () => {
    render(<List order={['a', 'b', 'c']} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('slides each moved item from its old place to the new one, staggered', () => {
    const { rerender } = render(<List order={['a', 'b', 'c']} />);
    rerender(<List order={['c', 'a', 'b']} />);
    const calls = animate.mock.calls.map(([frames, opts]) => ({ from: frames[0].transform, delay: opts.delay }));
    // c moved 100 px left (was at 100, now at 0); a and b moved 50 px right
    expect(calls).toEqual([
      { from: 'translate(100px, 0px)', delay: 0 },
      { from: 'translate(-50px, 0px)', delay: expect.any(Number) },
      { from: 'translate(-50px, 0px)', delay: expect.any(Number) },
    ]);
    expect(calls[2].delay).toBeGreaterThan(calls[1].delay);
  });

  it('leaves items that did not move alone (no re-animation on unrelated changes)', () => {
    const { rerender } = render(<List order={['a', 'b', 'c']} />);
    rerender(<List order={['a', 'c', 'b']} />);
    expect(animate).toHaveBeenCalledTimes(2);
    animate.mockClear();
    rerender(<List order={['a', 'c', 'b', '_slot']} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('remembers where an item was while it was gone', () => {
    const { rerender } = render(<List order={['a', 'b', 'c']} />); // c at 100
    rerender(<List order={['_1', '_2', '_3']} />); // all gone (left for the network)
    rerender(<List order={['c', '_2', '_3']} />); // c comes back at 0
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0][0][0].transform).toBe('translate(100px, 0px)');
  });

  it('respects reduced motion', () => {
    const { rerender } = render(<List order={['a', 'b']} reduced />);
    rerender(<List order={['b', 'a']} reduced />);
    expect(animate).not.toHaveBeenCalled();
  });
});
