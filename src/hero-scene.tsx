import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { HeroWorld } from './components/hero/HeroScene';
import { scrollMotionState } from './components/hero/motionState';

gsap.registerPlugin(ScrollTrigger);

export const HeroApp: React.FC = () => {
  if (typeof window !== 'undefined') {
    (window as any).__HERO_APP_RENDERS__ = ((window as any).__HERO_APP_RENDERS__ || 0) + 1;
  }
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setIsReducedMotion(reduced);

    let setupFrame = 0;
    let settleFrame = 0;
    let verificationTimer = 0;
    let timeline: gsap.core.Timeline | null = null;
    let pinnedHero: HTMLElement | null = null;
    let heroObserver: MutationObserver | null = null;

    const setupScene = () => {
      const heroSection = document.getElementById('home');
      if (!heroSection) {
        settleFrame = requestAnimationFrame(setupScene);
        return;
      }

      // Activate WebGL mode on body permanently
      document.body.classList.add('has-webgl');
      heroSection.classList.add('webgl-active');

      if (reduced) return;

      const heroCopy = heroSection.querySelectorAll(
        'h1, p, a, img[src*="calligraphy"], div[style*="writing-mode"]'
      );
      const navLinks = document.querySelectorAll('header nav a');

      timeline = gsap.timeline({
        scrollTrigger: {
          trigger: heroSection,
          start: 'top top',
          end: '+=100%',
          pin: true,
          pinSpacing: true,
          scrub: 0.8,
          onUpdate: (self) => {
            scrollMotionState.progress = self.progress;

            if (navLinks.length >= 2) {
              const homeLink = navLinks[0] as HTMLElement;
              const storyLink = navLinks[1] as HTMLElement;

              if (self.progress > 0.65) {
                homeLink.style.opacity = '0.45';
                storyLink.style.opacity = '1.0';
              } else {
                homeLink.style.opacity = '1.0';
                storyLink.style.opacity = '0.62';
              }
            }
          }
        }
      }).to(heroCopy, {
        opacity: 0,
        y: -35,
        stagger: 0.02,
        ease: 'power1.out'
      }, 0.1);

      pinnedHero = heroSection;

    };

    heroObserver = new MutationObserver(() => {
      if (reduced || !pinnedHero) return;
      const currentHero = document.getElementById('home');
      if (currentHero && currentHero !== pinnedHero) {
        const staleTimeline = timeline;
        timeline = null;
        pinnedHero = null;
        staleTimeline?.scrollTrigger?.kill();
        staleTimeline?.kill();
        cancelAnimationFrame(settleFrame);
        settleFrame = requestAnimationFrame(setupScene);
      }
    });
    heroObserver.observe(document.body, { childList: true, subtree: true });

    // The host component can finish hydrating just after this module mounts.
    // Wait for two paint frames so ScrollTrigger pins the settled hero node.
    setupFrame = requestAnimationFrame(() => {
      settleFrame = requestAnimationFrame(setupScene);
    });

    // Recover if a late host render replaced the pinned hero after setup.
    verificationTimer = window.setTimeout(() => {
      if (reduced) return;
      const heroSection = document.getElementById('home');
      if (heroSection && !heroSection.parentElement?.classList.contains('pin-spacer')) {
        const staleTimeline = timeline;
        timeline = null;
        pinnedHero = null;
        staleTimeline?.scrollTrigger?.kill();
        staleTimeline?.kill();
        cancelAnimationFrame(settleFrame);
        setupScene();
      }
    }, 600);

    return () => {
      cancelAnimationFrame(setupFrame);
      cancelAnimationFrame(settleFrame);
      clearTimeout(verificationTimer);
      heroObserver?.disconnect();
      timeline?.scrollTrigger?.kill();
      timeline?.kill();
    };
  }, []);

  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 10], zoom: 100 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0
      }}
    >
      <HeroWorld isReducedMotion={isReducedMotion} />
    </Canvas>
  );
};

function init() {
  const rootEl = document.getElementById('hero-scene-root');
  const heroEl = document.getElementById('home');
  if (rootEl && heroEl) {
    console.log('[HeroScene] Mounting R3F canvas to #hero-scene-root (DOM ready)...');
    const root = createRoot(rootEl);
    root.render(<HeroApp />);
  } else {
    setTimeout(init, 30);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
