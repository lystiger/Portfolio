import { useEffect, useRef } from 'react';
import { activityState } from '../components/hero/activityState';

export interface PointerParallax {
  x: number; // normalized -1 to 1
  y: number; // normalized -1 to 1
}

export function usePointerParallax() {
  const pointer = useRef<PointerParallax>({ x: 0, y: 0 });
  const target = useRef<PointerParallax>({ x: 0, y: 0 });

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const handlePointerMove = (e: PointerEvent) => {
      activityState.markInteraction();
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      target.current.x = Math.max(-1, Math.min(1, x));
      target.current.y = Math.max(-1, Math.min(1, y));
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  return { pointer, target };
}
