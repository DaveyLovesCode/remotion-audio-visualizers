import { Composition } from "remotion";
import { LiquidCrystal } from "./LiquidCrystal";

const DURATION = 7200; // 60 seconds at 120fps
const FPS = 120;
const WIDTH = 1920;
const HEIGHT = 1080;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LiquidCrystal"
      component={LiquidCrystal}
      durationInFrames={DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
