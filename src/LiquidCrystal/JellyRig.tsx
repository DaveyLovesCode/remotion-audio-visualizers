import { useRef, type RefObject } from "react";
import * as THREE from "three";
import { usePulseReactor } from "../audio/reactors";
import type { AudioFrame } from "../audio/types";
import { RefractionDome } from "./RefractionDome";
import { DomeRipple } from "./DomeRipple";

export interface JellyRigProps {
  frame: number;
  fps: number;
  audioFrame: AudioFrame;
  rootRef: RefObject<THREE.Group | null>;
  tendrilAnchorRef: RefObject<THREE.Group | null>;
}

type SpringState = { value: number; velocity: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const stepSpring = (
  state: SpringState,
  target: number,
  dt: number,
  frequencyHz: number,
  dampingRatio: number,
) => {
  const omega = 2 * Math.PI * frequencyHz;
  const f = omega * omega * (target - state.value);
  const d = 2 * dampingRatio * omega * state.velocity;
  state.velocity += (f - d) * dt;
  state.value += state.velocity * dt;
};

export const JellyRig: React.FC<JellyRigProps> = ({
  frame,
  fps,
  audioFrame,
  rootRef,
  tendrilAnchorRef,
}) => {
  const time = frame / fps;
  const pulse = audioFrame.pulse ?? 0;

  // Forward thrust on bass hits
  const thrustPulse = usePulseReactor(audioFrame.bass, time, { decay: 0.65 });
  const thrustZ = thrustPulse * -0.75;

  const phaseRef = useRef(0);
  const lastTimeRef = useRef(0);

  const bodyYawRef = useRef<SpringState>({ value: 0, velocity: 0 });
  const headYawRef = useRef<SpringState>({ value: 0, velocity: 0 });
  const bodyRollRef = useRef<SpringState>({ value: 0, velocity: 0 });
  const headPitchRef = useRef<SpringState>({ value: 0, velocity: 0 });

  if (time < lastTimeRef.current - 0.05) {
    phaseRef.current = time * 0.6;
    bodyYawRef.current = { value: 0, velocity: 0 };
    headYawRef.current = { value: 0, velocity: 0 };
    bodyRollRef.current = { value: 0, velocity: 0 };
    headPitchRef.current = { value: 0, velocity: 0 };
  }

  const dt = clamp(time - lastTimeRef.current, 0, 1 / 30);
  lastTimeRef.current = time;

  const phaseSpeed = 0.7 + pulse * 1.8;
  if (dt > 0) {
    phaseRef.current += phaseSpeed * dt;
  }
  const phase = phaseRef.current;

  // Constant sway amplitudes - audio only speeds up the motion, not amplitude
  const lateralAmp = 0.85;
  const x =
    Math.sin(phase) * lateralAmp +
    Math.sin(phase * 0.5 + 1.2) * (lateralAmp * 0.3);

  const verticalAmp = 0.35;
  const y =
    Math.sin(phase * 0.7 + 2.3) * verticalAmp +
    Math.cos(phase * 0.22 + 0.7) * (verticalAmp * 0.35);

  // Horizontal velocity
  const dxdt =
    Math.cos(phase) * lateralAmp * phaseSpeed +
    Math.cos(phase * 0.5 + 1.2) * (lateralAmp * 0.25) * 0.5 * phaseSpeed;

  // Vertical velocity
  const dydt =
    Math.cos(phase * 0.7 + 2.3) * verticalAmp * 0.7 * phaseSpeed -
    Math.sin(phase * 0.22 + 0.7) * (verticalAmp * 0.35) * 0.22 * phaseSpeed;

  const forwardSpeed = 8 + pulse * 20;
  const desiredYaw = clamp(Math.atan2(dxdt, forwardSpeed) * 1.15, -0.22, 0.22);

  // Head looks ahead - leads the body
  const leadSeconds = 0.35;
  const futurePhase = phase + phaseSpeed * leadSeconds;

  const dxdtFuture =
    Math.cos(futurePhase) * lateralAmp * phaseSpeed +
    Math.cos(futurePhase * 0.5 + 1.2) * (lateralAmp * 0.25) * 0.5 * phaseSpeed;
  const desiredYawFuture = clamp(
    Math.atan2(dxdtFuture, forwardSpeed) * 1.6,
    -0.4,
    0.4,
  );

  const dydtFuture =
    Math.cos(futurePhase * 0.7 + 2.3) * verticalAmp * 0.7 * phaseSpeed -
    Math.sin(futurePhase * 0.22 + 0.7) * (verticalAmp * 0.35) * 0.22 * phaseSpeed;
  // Pitch down when moving up, pitch up when moving down (jellyfish orientation is inverted)
  const desiredPitchFuture = clamp(dydtFuture * 0.8, -0.25, 0.25);

  const rollTarget = clamp(-dxdt * 0.02, -0.12, 0.12);

  if (dt > 0) {
    stepSpring(bodyYawRef.current, desiredYaw, dt, 1.7, 0.9);
    stepSpring(headYawRef.current, desiredYawFuture, dt, 3.2, 0.8);
    stepSpring(bodyRollRef.current, rollTarget, dt, 2.2, 0.95);
    stepSpring(headPitchRef.current, desiredPitchFuture, dt, 3.0, 0.75);
  }

  const pitchBase = -Math.PI / 2;
  const pitchWobble = Math.sin(time * 0.35 + 1) * 0.04;
  const yawWobble = Math.sin(time * 0.4) * 0.06;
  const rollWobble = Math.sin(time * 0.28 + 0.3) * 0.03;

  const baseScale = 1.3;
  const beatPunch = 1 + pulse * 0.12;

  const bodyYaw = bodyYawRef.current.value + yawWobble * 0.25;
  const headExtraYaw = headYawRef.current.value - bodyYawRef.current.value + yawWobble * 0.55;
  const headPitch = headPitchRef.current.value;
  const bodyRoll = bodyRollRef.current.value + rollWobble;

  return (
    <group ref={rootRef as React.Ref<THREE.Group>} position={[x, y, 0]}>
      <group
        rotation={[pitchBase + pitchWobble, bodyYaw, bodyRoll]}
        scale={baseScale * beatPunch}
        position={[0, 0, thrustZ]}
      >
        <group rotation={[headPitch, headExtraYaw, 0]}>
          <RefractionDome frame={frame} audioFrame={audioFrame} fps={fps} />
          <DomeRipple frame={frame} audioFrame={audioFrame} fps={fps} />
          <group ref={tendrilAnchorRef as React.Ref<THREE.Group>} position={[0, -0.3, 0]} />
        </group>
      </group>
    </group>
  );
};
