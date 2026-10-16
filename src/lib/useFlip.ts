import { useLayoutEffect, useRef, type RefObject } from 'react';

const DURATION = 480;
const STAGGER = 14;
const MAX_DELAY = 360;

/**
 * FLIP: whenever `key` changes, every `[data-flip]` element inside `root` that moved slides from
 * its previous place to the new one. Items may be re-created (a picture piece becoming a packet
 * button) or disappear for a while: the last known place of each id is kept.
 *
 * Positions are layout positions (offsetLeft/offsetTop), not getBoundingClientRect: the latter
 * includes the running animation's transform, so re-measuring mid-flight would restart the
 * animation from a stale place and make cells jump back (visible flicker when keys change often).
 */
export function useFlip(root: RefObject<HTMLElement | null>, key: string, reduced: boolean) {
  const previous = useRef(new Map<string, { x: number; y: number }>());

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const next = new Map(previous.current);
    el.querySelectorAll<HTMLElement>('[data-flip]').forEach((item, i) => {
      const id = item.dataset.flip!;
      const at = { x: item.offsetLeft, y: item.offsetTop };
      const from = previous.current.get(id);
      next.set(id, at);
      if (!from || reduced || typeof item.animate !== 'function') return;
      const dx = from.x - at.x, dy = from.y - at.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      item.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: DURATION, delay: Math.min(i * STAGGER, MAX_DELAY), easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' },
      );
    });
    previous.current = next;
  }, [root, key, reduced]);
}
