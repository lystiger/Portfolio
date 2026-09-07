import React, { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { activityState } from './activityState';

interface RenderLoopOptimizerProps {
  isReducedMotion?: boolean;
}

export const RenderLoopOptimizer: React.FC<RenderLoopOptimizerProps> = ({
  isReducedMotion = false
}) => {
  const { invalidate } = useThree();
  const rafIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    let heroEl = document.getElementById('home');
    let observer: IntersectionObserver | null = null;

    const checkHeroVisibility = () => {
      if (!heroEl) heroEl = document.getElementById('home');
      if (!heroEl) return true;
      const rect = heroEl.getBoundingClientRect();
      // Hero is in view if its bottom is below top of viewport and top is above bottom of viewport
      return rect.bottom > 0 && rect.top < window.innerHeight;
    };

    const updateHeroVisibility = (inView: boolean) => {
      activityState.isHeroVisible = inView;
      if (inView && activityState.isTabVisible) {
        invalidate();
        ensureLoop();
      }
    };

    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          const inView = entry.isIntersecting && entry.intersectionRatio > 0 && checkHeroVisibility();
          updateHeroVisibility(inView);
        },
        { threshold: [0, 0.02, 0.1] }
      );
      if (heroEl) observer.observe(heroEl);
    }

    const handleVisibilityChange = () => {
      const visible = document.visibilityState !== 'hidden';
      activityState.isTabVisible = visible;
      if (visible && activityState.isHeroVisible) {
        invalidate();
        ensureLoop();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleInteraction = () => {
      activityState.markInteraction();
      // Double check visibility on scroll/interaction
      const inView = checkHeroVisibility();
      if (inView !== activityState.isHeroVisible) {
        activityState.isHeroVisible = inView;
      }
      if (activityState.isHeroVisible && activityState.isTabVisible) {
        invalidate();
        ensureLoop();
      }
    };

    window.addEventListener('pointermove', handleInteraction, { passive: true });
    window.addEventListener('wheel', handleInteraction, { passive: true });
    window.addEventListener('touchmove', handleInteraction, { passive: true });
    window.addEventListener('scroll', handleInteraction, { passive: true });

    const tick = (now: number) => {
      rafIdRef.current = null;

      if (!activityState.isTabVisible || !activityState.isHeroVisible) {
        // Hero is offscreen or tab is hidden: suspend loop completely
        return;
      }

      const isInteractive = activityState.isInteractive();

      // In reduced motion mode: sleep completely when not interactive
      if (isReducedMotion && !isInteractive) {
        return;
      }

      // Ambient hero targets 36 FPS (within 30-45 FPS window); interactive targets up to 60 FPS
      const targetFps = isInteractive ? 60 : 36;
      const minInterval = 1000 / targetFps;
      const elapsed = now - lastFrameTimeRef.current;

      if (elapsed >= minInterval) {
        lastFrameTimeRef.current = now - (elapsed % minInterval);
        invalidate();
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    const ensureLoop = () => {
      if (rafIdRef.current === null && activityState.isTabVisible && activityState.isHeroVisible) {
        lastFrameTimeRef.current = performance.now();
        rafIdRef.current = requestAnimationFrame(tick);
      }
    };

    // Initial render & loop kickoff
    activityState.isTabVisible = document.visibilityState !== 'hidden';
    activityState.isHeroVisible = checkHeroVisibility();
    invalidate();
    ensureLoop();

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      observer?.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pointermove', handleInteraction);
      window.removeEventListener('wheel', handleInteraction);
      window.removeEventListener('touchmove', handleInteraction);
      window.removeEventListener('scroll', handleInteraction);
    };
  }, [invalidate, isReducedMotion]);

  return null;
};
