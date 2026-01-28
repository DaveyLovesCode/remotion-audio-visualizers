import { useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AudioFrame } from "../audio/types";
import { JellyRig } from "./JellyRig";
import { Tendrils } from "./Tendrils";
import { OceanEnvironment } from "./OceanEnvironment";
import { OceanSurface } from "./OceanSurface";

/**
 * Orbital camera - swings around the jellyfish with audio-reactive throttle
 */
const OrbitalCamera: React.FC<{
  frame: number;
  fps: number;
  audioFrame: AudioFrame;
  targetRef?: React.RefObject<THREE.Object3D | null>;
}> = ({ frame, fps, audioFrame, targetRef }) => {
  const { camera } = useThree();

  const angleRef = useRef(0);
  const lastTimeRef = useRef(0);
  const smoothedTargetRef = useRef(new THREE.Vector3(0, 0, 0));
  const tmpTargetRef = useRef(new THREE.Vector3(0, 0, 0));

  const time = frame / fps;
  const pulse = audioFrame.pulse ?? 0;

  // Reset if time goes backwards (shouldn't happen in real-time, but safe)
  if (time < lastTimeRef.current - 0.05) {
    angleRef.current = time * 0.15;
    smoothedTargetRef.current.set(0, 0, 0);
  }

  // Throttle: pulse boosts angular velocity
  const baseSpeed = 0.02;
  const throttleBoost = 1.2;
  const currentSpeed = baseSpeed + pulse * throttleBoost;

  const deltaTime = Math.max(0, time - lastTimeRef.current);
  if (deltaTime > 0 && deltaTime < 0.1) {
    angleRef.current += currentSpeed * deltaTime;
  }
  lastTimeRef.current = time;

  const angle = angleRef.current;

  // Radius with wander
  const baseRadius = 5.0;
  const radiusWander =
    Math.sin(angle * 0.31) * 0.8 +
    Math.sin(angle * 0.13) * 0.4 +
    Math.cos(angle * 0.47) * 0.2;
  const radius = baseRadius + radiusWander;

  // Height varies
  const baseHeight = 0.3;
  const heightWander =
    Math.sin(angle * 0.7) * 2.5 +
    Math.cos(angle * 1.1) * 1.0 +
    Math.sin(angle * 1.7) * 0.5;
  const height = baseHeight + heightWander;

  // Orbit wobble
  const wobbleX = Math.sin(angle * 0.53) * 1.0;
  const wobbleZ = Math.cos(angle * 0.41) * 0.8;

  const x = Math.sin(angle) * radius + wobbleX;
  const z = Math.cos(angle) * radius + wobbleZ;
  const y = height;

  // Dutch angle
  const dutchAngle = Math.sin(angle * 0.19) * 0.04 + pulse * 0.03;

  const target = tmpTargetRef.current;
  if (targetRef?.current) {
    targetRef.current.getWorldPosition(target);
  } else {
    target.set(0, 0, 0);
  }

  const smooth = smoothedTargetRef.current;
  if (deltaTime === 0) {
    smooth.copy(target);
  } else {
    const follow = 1 - Math.exp(-deltaTime * 6.0);
    smooth.lerp(target, Math.min(1, Math.max(0, follow)));
  }

  camera.position.set(smooth.x + x, smooth.y + y, smooth.z + z);
  camera.lookAt(smooth.x, smooth.y, smooth.z);
  camera.rotateZ(dutchAngle);

  return null;
};

/**
 * Main scene composition
 */
export const Scene: React.FC<{
  frame: number;
  fps: number;
  audioFrame: AudioFrame;
}> = ({ frame, fps, audioFrame }) => {
  const jellyRootRef = useRef<THREE.Group | null>(null);
  const tendrilAnchorRef = useRef<THREE.Group | null>(null);

  return (
    <>
      <OrbitalCamera frame={frame} fps={fps} audioFrame={audioFrame} targetRef={jellyRootRef} />

      {/* Deep underwater lighting */}
      <ambientLight intensity={0.06} color="#001828" />
      <pointLight position={[0, 0.3, -0.5]} intensity={1.5} color="#00ffaa" distance={15} />
      <pointLight position={[0, 1, -8]} intensity={0.4} color="#0088ff" />
      <pointLight position={[4, 0, 2]} intensity={0.25} color="#ff00ff" />

      <OceanSurface frame={frame} audioFrame={audioFrame} fps={fps} />
      <OceanEnvironment frame={frame} audioFrame={audioFrame} fps={fps} />
      <JellyRig frame={frame} audioFrame={audioFrame} fps={fps} rootRef={jellyRootRef} tendrilAnchorRef={tendrilAnchorRef} />
      <Tendrils frame={frame} audioFrame={audioFrame} fps={fps} count={14} anchorRef={tendrilAnchorRef} />
    </>
  );
};
