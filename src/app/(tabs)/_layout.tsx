import { Tabs } from "expo-router";
import { StyleSheet, type ColorValue } from "react-native";
import { MusicGlyph, type MusicGlyphKind } from "@/components/MusicGlyph";
import { colors } from "@/theme";

function TabIcon({
  kind,
  color,
}: {
  kind: MusicGlyphKind;
  color: ColorValue;
}) {
  return <MusicGlyph kind={kind} size={22} color={String(color)} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarLabelStyle: styles.label,
        tabBarIconStyle: styles.icon,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Главная",
          tabBarIcon: ({ color }) => <TabIcon kind="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Поиск",
          tabBarIcon: ({ color }) => <TabIcon kind="search" color={color} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Медиатека",
          tabBarIcon: ({ color }) => <TabIcon kind="library" color={color} />,
        }}
      />
      <Tabs.Screen
        name="rooms"
        options={{
          title: "Комнаты",
          tabBarIcon: ({ color }) => <TabIcon kind="room" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Настройки",
          tabBarIcon: ({ color }) => <TabIcon kind="settings" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 72,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    backgroundColor: "rgba(8, 6, 18, 0.99)",
  },
  tabItem: { paddingTop: 4, paddingBottom: 2 },
  label: { fontSize: 10, fontWeight: "700" },
  icon: { marginBottom: 2 },
});
