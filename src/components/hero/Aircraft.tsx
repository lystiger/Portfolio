import React, { useRef, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { Contrail } from './Contrail';
import { WindSystem } from './WindSystem';
import { scrollMotionState } from './motionState';

interface AircraftProps {
  bgPosX: number;
  bgPosY: number;
  bgWidth: number;
  bgHeight: number;
  isReducedMotion?: boolean;
}

export const Aircraft: React.FC<AircraftProps> = ({
  bgPosX,
  bgPosY,
  bgWidth,
  bgHeight,
  isReducedMotion = false
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useLoader(THREE.TextureLoader, 'assets/plane.png');

  // Baseline resting coordinates in 1376x768 frame:
  // Plane center: (659, 118) -> norm: (-0.021075, +0.346354)
  // Plane tail:   (704, 135) -> norm: (+0.011628, +0.324219)
  const baseNormX = (659 - 688) / 1376;
  const baseNormY = (384 - 118) / 768;

  // Plane dimensions in Three.js units matching 150x62 in 1376x768
  const planeWidth = (150 / 1376) * bgWidth;
  const planeHeight = (62 / 768) * bgHeight;

  // Tail offset in unrotated plane: (704-659)=+45px, (135-118)=+17px down
  const tailDx = (45 / 150) * planeWidth;
  const tailDy = -(17 / 62) * planeHeight;

  // Single unified aerodynamic spline of the aircraft tail
  // Index 0: Deep in clouds
  // Index 1: Cloud entry point (0.176, 0.096)
  // Index 2: Exact resting tail position (0.011628, 0.324219)
  // Indices 3..6: Smooth continuous climb trajectory into upper atmosphere
  const tailSpline = useMemo(() => {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.285, -0.055, -3.01),
      new THREE.Vector3(0.176, 0.096, -3.01),
      new THREE.Vector3(0.011628, 0.324219, -3.01),
      new THREE.Vector3(-0.16, 0.50, -3.01),
      new THREE.Vector3(-0.40, 0.65, -3.01),
      new THREE.Vector3(-0.72, 0.80, -3.01),
      new THREE.Vector3(-1.18, 0.96, -3.01)
    ], false, 'centripetal');
  }, []);

  // Rest state parameter: waypoint 2 of 6 = 2/6 = 1/3
  const tRest = 2.0 / 6.0;

  useFrame((state) => {
    if (!meshRef.current) return;

    const time = state.clock.getElapsedTime();
    const wind = isReducedMotion ? { strength: 0, gust: 0 } : WindSystem.sample(time);
    const scrollProgress = isReducedMotion ? 0 : scrollMotionState.progress;

    let currentTHead = tRest;
    let rotZ = 0;

    if (scrollProgress > 0.002) {
      const t = Math.min(1, Math.max(0, scrollProgress));
      currentTHead = tRest + t * (1.0 - tRest);
      // Subtle bank angle (up to ~5 degrees)
      rotZ = -t * 0.08;
    } else if (!isReducedMotion) {
      // Idle hover
      const idleOffset = Math.sin(time * 0.45) * 0.003;
      currentTHead = tRest + idleOffset;
      rotZ = Math.sin(time * 0.5) * 0.015;
    }

    // Calculate current tail position on spline
    const tailNorm = tailSpline.getPoint(Math.min(1, Math.max(0, currentTHead)));

    // Derive aircraft center position from tail position and rotation
    const cosR = Math.cos(rotZ);
    const sinR = Math.sin(rotZ);
    const centerNormX = tailNorm.x - (tailDx * cosR - tailDy * sinR) / bgWidth;
    const centerNormY = tailNorm.y - (tailDx * sinR + tailDy * cosR) / bgHeight;

    const posX = bgPosX + centerNormX * bgWidth;
    const posY = bgPosY + centerNormY * bgHeight;

    meshRef.current.position.set(posX, posY, -3);
    meshRef.current.rotation.z = rotZ;
  });

  return (
    <>
      <Contrail
        bgPosX={bgPosX}
        bgPosY={bgPosY}
        bgWidth={bgWidth}
        bgHeight={bgHeight}
        tailSpline={tailSpline}
        isReducedMotion={isReducedMotion}
      />
      <mesh ref={meshRef} position={[bgPosX + baseNormX * bgWidth, bgPosY + baseNormY * bgHeight, -3]}>
        <planeGeometry args={[planeWidth, planeHeight]} />
        <meshBasicMaterial
          map={texture}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </>
  );
};
