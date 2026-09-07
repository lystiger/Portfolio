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

    const setupScene = () => {
      const heroSection = document.getElementById('home');
      if (!heroSection) {
        requestAnimationFrame(setupScene);
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

      const tl = gsap.timeline({
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

      return () => {
        tl.scrollTrigger?.kill();
        tl.kill();
      };
    };

    const cleanup = setupScene();
    return () => {
      if (typeof cleanup === 'function') cleanup();
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

