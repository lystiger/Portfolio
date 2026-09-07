import React, { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { activityState } from './activityState';

interface RenderLoopOptimizerProps {
  isReducedMotion?: boolean;
}

// Interactive frames are capped at 60 FPS; ambient frames at 36 FPS.
const INTERACTIVE_FPS = 60;
const AMBIENT_FPS = 36;
// Pointer/scroll events can fire hundreds of times per second. Reading the hero
// rect on each one forces a synchronous layout, so the fallback check runs at
// most this often; the IntersectionObserver handles the common case.
const VISIBILITY_CHECK_INTERVAL = 100;

export const RenderLoopOptimizer: React.FC<RenderLoopOptimizerProps> = ({
  isReducedMotion = false
}) => {
  const { invalidate } = useThree();
  const rafIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    let heroEl: HTMLElement | null = null;
    let observedEl: HTMLElement | null = null;
    let observer: IntersectionObserver | null = null;
    let lastVisibilityCheck = 0;

    // The host page can replace the pinned hero node after this effect runs
    // (see hero-scene.tsx). Holding on to the old element would mean measuring
    // a node the page no longer treats as the hero -- or, if it was detached, a
    // permanently zero rect whose observer never fires again. getElementById is
    // a cheap hash lookup and forces no layout, so just re-resolve every time.
    const resolveHeroEl = () => {
      heroEl = document.getElementById('home') ?? (heroEl?.isConnected ? heroEl : null);
      if (observer && heroEl && heroEl !== observedEl) {
        if (observedEl) observer.unobserve(observedEl);
        observer.observe(heroEl);
        observedEl = heroEl;
      }
      return heroEl;
    };

    const checkHeroVisibility = () => {
      const el = resolveHeroEl();
      if (!el) return true;
      const rect = el.getBoundingClientRect();
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
          const entry = entries[entries.length - 1];
          const inView = entry.isIntersecting && entry.intersectionRatio > 0 && checkHeroVisibility();
          updateHeroVisibility(inView);
        },
        { threshold: [0, 0.02, 0.1] }
      );
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

      // Throttled fallback for the case where the observer is stale or the hero
      // node was swapped out; resolveHeroEl() re-binds the observer when needed.
      const now = performance.now();
      if (now - lastVisibilityCheck >= VISIBILITY_CHECK_INTERVAL) {
        lastVisibilityCheck = now;
        const inView = checkHeroVisibility();
        if (inView !== activityState.isHeroVisible) {
          activityState.isHeroVisible = inView;
        }
      }

      // Never invalidate() here: tick owns every render so the frame-rate cap
      // holds on displays that run above 60 Hz.
      ensureLoop();
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
      const targetFps = isInteractive ? INTERACTIVE_FPS : AMBIENT_FPS;
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
        // Back-date the clock by one interactive interval so a loop restarted by
        // an interaction renders on its first tick instead of a frame later.
        lastFrameTimeRef.current = performance.now() - 1000 / INTERACTIVE_FPS;
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
      observedEl = null;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pointermove', handleInteraction);
      window.removeEventListener('wheel', handleInteraction);
      window.removeEventListener('touchmove', handleInteraction);
      window.removeEventListener('scroll', handleInteraction);
    };
  }, [invalidate, isReducedMotion]);

  return null;
};
