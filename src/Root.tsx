import { Composition } from "remotion";
import { AudioVisualizer } from "./AudioVisualizer";
import { LiquidCrystal } from "./LiquidCrystal";
import { FractureZone } from "./FractureZone";

const DURATION = 3600; // 60 seconds at 60fps
const FPS = 60;
const WIDTH = 1920;
const HEIGHT = 1080;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AudioVisualizer"
        component={AudioVisualizer}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="LiquidCrystal"
        component={LiquidCrystal}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="FractureZone"
        component={FractureZone}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
