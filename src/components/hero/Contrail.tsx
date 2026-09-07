import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { scrollMotionState } from './motionState';

import { getFlightState } from './flightModel';

interface ContrailProps {
  bgPosX: number;
  bgPosY: number;
  bgWidth: number;
  bgHeight: number;
  tailSpline: THREE.CatmullRomCurve3;
  isReducedMotion?: boolean;
  historyLength?: number;
}

export const Contrail: React.FC<ContrailProps> = ({
  bgPosX,
  bgPosY,
  bgWidth,
  bgHeight,
  tailSpline,
  isReducedMotion = false,
  historyLength = 55
}) => {
  const meshRef = React.useRef<THREE.Mesh>(null);
  const lastContrailTime = React.useRef(-1);
  const lastScrollProgress = React.useRef(-1);
  const CONTRAIL_INTERVAL = 1 / 25; // ~25 Hz update rate for procedural geometry (Requirement 8)

  const { geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(historyLength * 2 * 3);
    const colors = new Float32Array(historyLength * 2 * 4);
    const indices: number[] = [];

    for (let i = 0; i < historyLength - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    geo.setIndex(indices);

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    return { geometry: geo, material: mat };
  }, [historyLength]);

  useFrame((state) => {
    if (!meshRef.current) return;

    const time = state.clock.getElapsedTime();
    const scrollProgress = isReducedMotion ? 0 : scrollMotionState.progress;
    const flight = getFlightState(time, scrollProgress, isReducedMotion);

    material.opacity = flight.opacity;

    // Throttle procedural geometry calculation and GPU buffer upload to ~25 Hz
    const isFirstRun = lastContrailTime.current < 0;
    const timeElapsed = time - lastContrailTime.current;
    const progressChanged = Math.abs(scrollProgress - lastScrollProgress.current) > 0.0005;

    if (!isFirstRun && timeElapsed < CONTRAIL_INTERVAL && !progressChanged) {
      return;
    }

    lastContrailTime.current = time;
    lastScrollProgress.current = scrollProgress;

    const currentTHead = flight.tHead;
    const currentTTail = flight.tTail;

    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = geometry.attributes.color as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;
    const colArray = colAttr.array as Float32Array;

    // Sample points monotonically from currentTHead back to currentTTail on tailSpline
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < historyLength; i++) {
      const frac = i / (historyLength - 1); // 0 at head, 1 at tail
      const t = THREE.MathUtils.lerp(currentTHead, currentTTail, frac);
      const normP = tailSpline.getPoint(Math.min(1, Math.max(0, t)));
      points.push(new THREE.Vector3(
        bgPosX + normP.x * bgWidth,
        bgPosY + normP.y * bgHeight,
        -3.01
      ));
    }

    for (let i = 0; i < historyLength; i++) {
      const p = points[i];
      const nextP = points[Math.min(i + 1, historyLength - 1)];

      const dx = nextP.x - p.x;
      const dy = nextP.y - p.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const t = i / (historyLength - 1);
      // Ribbon width: expands gradually away from plane
      const width = (0.014 + t * 0.024);
      // Alpha: opaque at head, dissolves into clouds at tail
      const alpha = Math.max(0, (1 - t * 0.82) * 0.88);

      const idx = i * 6;
      posArray[idx] = p.x + nx * width;
      posArray[idx + 1] = p.y + ny * width;
      posArray[idx + 2] = p.z;

      posArray[idx + 3] = p.x - nx * width;
      posArray[idx + 4] = p.y - ny * width;
      posArray[idx + 5] = p.z;

      const cIdx = i * 8;
      // Authentic warm white / cloud tone (#faf7f2)
      colArray[cIdx] = 0.98;
      colArray[cIdx + 1] = 0.97;
      colArray[cIdx + 2] = 0.95;
      colArray[cIdx + 3] = alpha;

      colArray[cIdx + 4] = 0.98;
      colArray[cIdx + 5] = 0.97;
      colArray[cIdx + 6] = 0.95;
      colArray[cIdx + 7] = alpha;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} />;
};
