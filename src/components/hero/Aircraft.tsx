import React, { useRef, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { Contrail } from './Contrail';
import { WindSystem } from './WindSystem';
import { scrollMotionState } from './motionState';

import { getFlightState } from './flightModel';

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
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
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

  useFrame((state) => {
    if (!meshRef.current) return;

    const time = state.clock.getElapsedTime();
    const scrollProgress = isReducedMotion ? 0 : scrollMotionState.progress;
    const flight = getFlightState(time, scrollProgress, isReducedMotion);

    // Calculate current tail position on spline
    const tailNorm = tailSpline.getPoint(Math.min(1, Math.max(0, flight.tHead)));

    // Derive aircraft center position from tail position and rotation
    const cosR = Math.cos(flight.rotZ);
    const sinR = Math.sin(flight.rotZ);
    const centerNormX = tailNorm.x - (tailDx * cosR - tailDy * sinR) / bgWidth;
    const centerNormY = tailNorm.y - (tailDx * sinR + tailDy * cosR) / bgHeight;

    const posX = bgPosX + centerNormX * bgWidth;
    const posY = bgPosY + centerNormY * bgHeight;

    meshRef.current.position.set(posX, posY, -3);
    meshRef.current.rotation.z = flight.rotZ;

    if (materialRef.current) {
      materialRef.current.opacity = flight.opacity;
    }
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
          ref={materialRef}
          map={texture}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </>
  );
};
