import React from "react";
import { Tabs } from "expo-router";
import {
  View, Text, StyleSheet, Platform, TouchableOpacity, Dimensions,
} from "react-native";
import { House, Compass, Television, FolderOpen, UserCircle } from "phosphor-react-native";
import MiniPlayer from "../../components/MiniPlayer";
import { useMiniPlayer } from "../../context/MiniPlayerContext";
import { useColors } from "../../hooks/useColors";

const { width: W } = Dimensions.get("window");

function TabItem({ icon: Icon, label, focused }: {
  icon: any; label: string; focused: boolean;
}) {
  const col = useColors();
  return (
    <View style={s.tabItem}>
      <View style={[s.iconWrap, focused && s.iconWrapActive]}>
        <Icon size={20} weight={focused ? "bold" : "regular"} color={focused ? col.white : col.muted} />
      </View>
      <Text style={[s.label, { color: focused ? col.white : col.muted }]}>{label}</Text>
    </View>
  );
}

function CustomTabBar(props: any) {
  const { state, descriptors, navigation } = props;
  const { current } = useMiniPlayer();
  const col = useColors();

  return (
    <View style={[s.outerWrap, { backgroundColor: col.bg }]}>
      {current && <MiniPlayer />}

      <View style={[s.navBar, { paddingBottom: Platform.OS === "ios" ? 18 : 10, borderTopColor: col.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress", target: route.key, canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={s.tabBtn}
              onPress={onPress}
              activeOpacity={0.75}
            >
              {options.tabBarIcon?.({ focused, color: "", size: 20 })}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index"   options={{ tabBarIcon: ({ focused }) => <TabItem icon={House}       label="Home"     focused={focused} /> }} />
      <Tabs.Screen name="search"  options={{ tabBarIcon: ({ focused }) => <TabItem icon={Compass}     label="Explore"  focused={focused} /> }} />
      <Tabs.Screen name="shorts"  options={{ tabBarIcon: ({ focused }) => <TabItem icon={Television}  label="Channels" focused={focused} /> }} />
      <Tabs.Screen name="library" options={{ tabBarIcon: ({ focused }) => <TabItem icon={FolderOpen}  label="Library"  focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ tabBarIcon: ({ focused }) => <TabItem icon={UserCircle}  label="You"      focused={focused} /> }} />
      <Tabs.Screen name="create"  options={{ href: null }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  outerWrap: {
    paddingBottom: 10,
    paddingHorizontal: 12,
    width: "100%",
  },
  navBar: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "transparent",
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  tabBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  iconWrap: {
    width: 36, height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {},
  label: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
