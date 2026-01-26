import { Composition, Folder } from "remotion";
import { AudioVisualizer } from "./AudioVisualizer";
import {
  Test_CoreGeometry,
  Test_GPUParticles,
  Test_LightBeams,
  Test_EnergyRings,
  Test_FloatingDebris,
  Test_BeatFlash,
} from "./IsolatedTests";

const DURATION = 1800; // 60 seconds at 30fps
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Main composition */}
      <Composition
        id="AudioVisualizer"
        component={AudioVisualizer}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />

      {/* Isolated tests for performance profiling */}
      <Folder name="Isolated-Tests">
        <Composition
          id="Test-CoreGeometry"
          component={Test_CoreGeometry}
          durationInFrames={DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="Test-GPUParticles"
          component={Test_GPUParticles}
          durationInFrames={DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="Test-LightBeams"
          component={Test_LightBeams}
          durationInFrames={DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="Test-EnergyRings"
          component={Test_EnergyRings}
          durationInFrames={DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="Test-FloatingDebris"
          component={Test_FloatingDebris}
          durationInFrames={DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="Test-BeatFlash"
          component={Test_BeatFlash}
          durationInFrames={DURATION}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
      </Folder>
    </>
  );
};
