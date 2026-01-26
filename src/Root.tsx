import { Composition } from "remotion";
import { AudioVisualizer } from "./AudioVisualizer";

const DURATION = 1800; // 60 seconds at 30fps
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="AudioVisualizer"
      component={AudioVisualizer}
      durationInFrames={DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
