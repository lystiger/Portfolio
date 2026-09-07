import React, { useRef } from 'react';
import { useFrame, useThree, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { Aircraft } from './Aircraft';
import { WindSystem } from './WindSystem';
import { scrollMotionState } from './motionState';
import { usePointerParallax } from '../../hooks/usePointerParallax';

interface HeroSceneProps {
  isReducedMotion?: boolean;
}

export const HeroWorld: React.FC<HeroSceneProps> = ({ isReducedMotion = false }) => {
  if (typeof window !== 'undefined') {
    (window as any).__HERO_WORLD_RENDERS__ = ((window as any).__HERO_WORLD_RENDERS__ || 0) + 1;
  }
  const { viewport, camera } = useThree();
  const { target } = usePointerParallax();

  const bgTexture = useLoader(THREE.TextureLoader, 'assets/hero-bg-clean.webp');
  const charTexture = useLoader(THREE.TextureLoader, 'assets/layer-character-full.png');
  const grassTexture = useLoader(THREE.TextureLoader, 'assets/grass-tile.png');

  const bgRef = useRef<THREE.Mesh>(null);
  const charRef = useRef<THREE.Mesh>(null);
  const grassRef = useRef<THREE.Mesh>(null);

  const baseAspect = 1376 / 768;
  const viewAspect = viewport.width / viewport.height;

  // Viewport cover scaling matching CSS cover right bottom
  const coverScale = viewAspect > baseAspect 
    ? viewport.width / 1376 
    : viewport.height / 768;

  const bgWidth = 1376 * coverScale;
  const bgHeight = 768 * coverScale;

  // Background aligned to bottom right
  const bgPosX = (viewport.width - bgWidth) / 2;
  const bgPosY = (-viewport.height + bgHeight) / 2;

  // Foreground grass strip along the bottom edge
  const grassH = Math.min(0.64, Math.max(0.40, viewport.height * 0.06));
  const grassW = viewport.width * 1.15;
  const grassY = -viewport.height / 2 + grassH / 2 - 0.02;

  const currentParallax = useRef({ x: 0, y: 0 });

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();
    const wind = isReducedMotion ? { strength: 0, gust: 0 } : WindSystem.sample(time);
    const scrollProgress = isReducedMotion ? 0 : scrollMotionState.progress;

    // Parallax dampens smoothly to 0 as scroll progress increases
    const parallaxDamp = isReducedMotion ? 0 : Math.max(0, 1 - scrollProgress * 1.8);

    if (!isReducedMotion) {
      currentParallax.current.x = THREE.MathUtils.lerp(
        currentParallax.current.x,
        target.current.x * parallaxDamp,
        delta * 3.0
      );
      currentParallax.current.y = THREE.MathUtils.lerp(
        currentParallax.current.y,
        target.current.y * parallaxDamp,
        delta * 3.0
      );
    } else {
      currentParallax.current.x = 0;
      currentParallax.current.y = 0;
    }

    const px = currentParallax.current.x;
    const py = currentParallax.current.y;

    // Camera subtle depth push on scroll (max ~5% zoom)
    if (camera instanceof THREE.OrthographicCamera) {
      const zoomTarget = 100 * (1 + scrollProgress * 0.05);
      camera.zoom = THREE.MathUtils.lerp(camera.zoom, zoomTarget, 0.1);
      camera.updateProjectionMatrix();
    }

    // Layer 1: Base Sky / Landscape (Z = -8, 0 to 1.5px parallax)
    if (bgRef.current) {
      const factor = 0.012;
      bgRef.current.position.x = bgPosX + px * factor;
      bgRef.current.position.y = bgPosY + py * factor;
    }

    // Layer 4: Character (Z = 0, restrained 5-7px parallax, subtle shift on scroll)
    if (charRef.current) {
      const factor = 0.035;
      const scrollShiftX = scrollProgress * 0.20;
      const scrollShiftY = -scrollProgress * 0.14;
      const idleCharY = isReducedMotion ? 0 : Math.sin(time * 0.6) * 0.005;
      charRef.current.position.x = bgPosX + px * factor + scrollShiftX;
      charRef.current.position.y = bgPosY + py * factor + scrollShiftY + idleCharY;
    }

    // Layer 5: Foreground Grass (Z = 2, restrained 8-10px parallax, gentle wind sway)
    if (grassRef.current) {
      const factor = 0.065;
      const scrollShiftY = -scrollProgress * 0.18;
      grassRef.current.position.x = px * factor;
      grassRef.current.position.y = grassY + py * factor + scrollShiftY;

      if (!isReducedMotion) {
        grassRef.current.rotation.z = wind.strength * 0.022;
      }
    }
  });

  return (
    <>
      {/* Layer 1: Base Sky & Landscape (Clean without character/plane) */}
      <mesh ref={bgRef} position={[bgPosX, bgPosY, -8]}>
        <planeGeometry args={[bgWidth, bgHeight]} />
        <meshBasicMaterial map={bgTexture} depthWrite={false} />
      </mesh>

      {/* Layer 3: Deterministic Aircraft & Procedural Contrail */}
      <Aircraft
        bgPosX={bgPosX}
        bgPosY={bgPosY}
        bgWidth={bgWidth}
        bgHeight={bgHeight}
        isReducedMotion={isReducedMotion}
      />

      {/* Layer 4: Character Full-Frame Layer */}
      <mesh ref={charRef} position={[bgPosX, bgPosY, 0]}>
        <planeGeometry args={[bgWidth, bgHeight]} />
        <meshBasicMaterial map={charTexture} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Layer 5: Foreground Grass Strip */}
      <mesh ref={grassRef} position={[0, grassY, 2]}>
        <planeGeometry args={[grassW, grassH]} />
        <meshBasicMaterial map={grassTexture} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
};
