import { Composition } from "remotion";
import { LiquidCrystal } from "./LiquidCrystal";

const DURATION = 1916; // ~32 seconds at 60fps (after trimming first 28.07s)
const FPS = 60;
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
