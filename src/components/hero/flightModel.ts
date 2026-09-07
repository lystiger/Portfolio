import * as THREE from 'three';

export interface FlightState {
  tHead: number;
  tTail: number;
  rotZ: number;
  opacity: number;
}

export const T_REST = 2.0 / 6.0;
export const T_CLOUD = 1.0 / 6.0;

export function getFlightState(time: number, scrollProgress: number, isReducedMotion: boolean): FlightState {
  if (isReducedMotion) {
    return {
      tHead: T_REST,
      tTail: T_CLOUD,
      rotZ: 0,
      opacity: 1.0,
    };
  }

  // Continuous ambient flight across the visible sky (8s loop)
  // At time = 0s, tHead is EXACTLY T_REST (the static baseline artwork).
  // The plane glides across the open sky between t=0.12 and t=0.46,
  // staying 100% visible inside the hero frame above the character.
  const cycleDuration = 8.0;
  const flightDuration = 7.6;
  const timeOffset = 4.768;
  const rawCycle = (time + timeOffset) % cycleDuration;

  let ambientT = T_REST;
  let ambientOpacity = 1.0;

  if (rawCycle < flightDuration) {
    const p = rawCycle / flightDuration;
    ambientT = 0.12 + p * (0.46 - 0.12);
    if (rawCycle < 0.4) {
      ambientOpacity = rawCycle / 0.4;
    } else if (rawCycle > (flightDuration - 0.4)) {
      ambientOpacity = Math.max(0, (flightDuration - rawCycle) / 0.4);
    } else {
      ambientOpacity = 1.0;
    }
  } else {
    ambientT = 0.12;
    ambientOpacity = 0.0;
  }

  const ambientBank = -(ambientT - T_REST) * 0.12 + Math.sin(time * 1.4) * 0.018;

  // When user scrolls, scroll progress smoothly takes over and drives the aircraft
  // to climb through the upper clouds (t=0.5 to t=1.0) for the section transition
  if (scrollProgress > 0.002) {
    const blend = Math.min(1, scrollProgress * 2.5);
    const scrollP = Math.min(1, Math.max(0, scrollProgress));
    const scrollT = T_REST + Math.pow(scrollP, 1.15) * (1.0 - T_REST);
    const scrollBank = -scrollP * 0.10;

    const tHead = THREE.MathUtils.lerp(ambientT, scrollT, blend);
    const opacity = THREE.MathUtils.lerp(ambientOpacity, 1.0, blend);
    const rotZ = THREE.MathUtils.lerp(ambientBank, scrollBank, blend);
    const tTail = Math.max(0.04, tHead - 0.22);

    return { tHead, tTail, rotZ, opacity };
  }

  const tTail = Math.max(0.04, ambientT - 0.22);
  return {
    tHead: ambientT,
    tTail,
    rotZ: ambientBank,
    opacity: ambientOpacity,
  };
}
