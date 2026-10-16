import { useCallback, useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
/** Same query as the cockpit blocks in the CSS modules: everything fits and the page never scrolls. */
export const COCKPIT_QUERY = '(min-width: 1100px) and (min-height: 640px)';

const matches = (query: string) => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true;

export const prefersReducedMotion = () => matches(QUERY);

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window.matchMedia !== 'function') return () => {};
    const mq = window.matchMedia(query);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => matches(query), () => false);
}

export const useReducedMotion = () => useMediaQuery(QUERY);
