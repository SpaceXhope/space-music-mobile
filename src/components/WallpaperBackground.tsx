import {
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageStyle,
  type ViewStyle,
} from "react-native";
import type { WallpaperSettings } from "@/features/wallpaper/wallpaper";

const ABSOLUTE_FILL: ViewStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

const COVER_IMAGE: ImageStyle = { position: "absolute" };
const CONTAIN_IMAGE: ImageStyle = { width: "100%", height: "100%" };

/**
 * Full-bleed player wallpaper. With "cover" the image is scaled to overflow
 * the screen and the X/Y position (0–100) shifts it like `object-position` on
 * the desktop app, so users can align any picture exactly where they want it.
 */
export function WallpaperBackground({
  settings,
  dim = 0.55,
}: {
  settings: WallpaperSettings | null;
  dim?: number;
}) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  if (!settings || settings.uri.length === 0) return null;

  const sourceWidth = Math.max(1, settings.width || screenW);
  const sourceHeight = Math.max(1, settings.height || screenH);

  if (settings.fit === "contain") {
    return (
      <View style={ABSOLUTE_FILL} pointerEvents="none">
        <View style={[ABSOLUTE_FILL, styles.containShell]}>
          <Image
            source={{ uri: settings.uri }}
            resizeMode="contain"
            style={CONTAIN_IMAGE}
          />
        </View>
        <View style={[ABSOLUTE_FILL, { backgroundColor: `rgba(5,6,12,${dim})` }]} />
      </View>
    );
  }

  const scale = Math.max(screenW / sourceWidth, screenH / sourceHeight);
  const scaledW = sourceWidth * scale;
  const scaledH = sourceHeight * scale;
  const offX = -(scaledW - screenW) * (settings.positionX / 100);
  const offY = -(scaledH - screenH) * (settings.positionY / 100);

  return (
    <View style={ABSOLUTE_FILL} pointerEvents="none">
      <Image
        source={{ uri: settings.uri }}
        resizeMode="cover"
        style={[
          COVER_IMAGE,
          {
            width: scaledW,
            height: scaledH,
            left: offX,
            top: offY,
          },
        ]}
      />
      <View style={[ABSOLUTE_FILL, { backgroundColor: `rgba(5,6,12,${dim})` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  containShell: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
});