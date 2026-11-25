import { StyleSheet, Text, View } from "react-native";
import {
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  type ProviderId,
} from "@/domain/music";
import { colors, radii } from "@/theme";

export function ProviderPill({ provider }: { provider: ProviderId }) {
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: `${PROVIDER_COLORS[provider][0]}22` },
      ]}
    >
      <View
        style={[styles.dot, { backgroundColor: PROVIDER_COLORS[provider][0] }]}
      />
      <Text style={styles.label}>{PROVIDER_LABELS[provider]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.round,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { color: colors.text, fontSize: 11, fontWeight: "700" },
});
