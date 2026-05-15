import React from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Switch, ScrollView, StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft, Moon, Sun, WifiHigh, Bell, Shield,
  Info, Trash, Globe,
} from "phosphor-react-native";
import { useTheme } from "../context/ThemeContext";
import { C, R, SP, T } from "../lib/tokens";

export default function SettingsScreen() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();

  const bg      = isDark ? C.bg      : "#F5F5F5";
  const surface = isDark ? C.surface : "#FFFFFF";
  const text    = isDark ? C.white   : "#111111";
  const muted   = isDark ? C.muted   : "#666666";
  const border  = isDark ? C.border  : "rgba(0,0,0,0.08)";

  const Section = ({ title }: { title: string }) => (
    <Text style={[s.sectionTitle, { color: muted }]}>{title}</Text>
  );

  const Row = ({
    icon, label, value, onPress, right,
  }: {
    icon: React.ReactNode;
    label: string;
    value?: string;
    onPress?: () => void;
    right?: React.ReactNode;
  }) => (
    <TouchableOpacity
      style={[s.row, { backgroundColor: surface, borderBottomColor: border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={s.rowLeft}>
        {icon}
        <Text style={[s.rowLabel, { color: text }]}>{label}</Text>
      </View>
      {right ?? (value ? <Text style={[s.rowVal, { color: muted }]}>{value}</Text> : null)}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: bg }]} edges={["top", "left", "right"]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />

      {/* Header */}
      <View style={[s.header, { borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <ArrowLeft size={22} color={text} weight="bold" />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: text }]}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Appearance */}
        <Section title="APPEARANCE" />
        <Row
          icon={isDark
            ? <Moon size={20} color={C.red} weight="fill" />
            : <Sun size={20} color={C.red} weight="fill" />
          }
          label="Dark Mode"
          right={
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: "#ccc", true: C.red }}
              thumbColor={C.white}
            />
          }
        />

        {/* Playback */}
        <Section title="PLAYBACK" />
        <Row
          icon={<WifiHigh size={20} color={C.muted} weight="fill" />}
          label="Video Quality"
          value="Auto"
        />
        <Row
          icon={<Globe size={20} color={C.muted} weight="fill" />}
          label="Playback Speed"
          value="1x"
        />

        {/* Notifications */}
        <Section title="NOTIFICATIONS" />
        <Row
          icon={<Bell size={20} color={C.muted} weight="fill" />}
          label="Push Notifications"
          right={<Switch value={false} trackColor={{ false: "#ccc", true: C.red }} thumbColor={C.white} />}
        />

        {/* Privacy */}
        <Section title="PRIVACY" />
        <Row
          icon={<Shield size={20} color={C.muted} weight="fill" />}
          label="Privacy Policy"
          onPress={() => {}}
        />
        <Row
          icon={<Trash size={20} color="#FF4444" weight="fill" />}
          label="Clear Cache"
          onPress={() => {}}
        />

        {/* About */}
        <Section title="ABOUT" />
        <Row
          icon={<Info size={20} color={C.muted} weight="fill" />}
          label="App Version"
          value="1.0.0"
        />

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SP.lg, paddingVertical: SP.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 32 },
  headerTitle: { fontSize: T.xl, fontWeight: "700" },
  sectionTitle: {
    fontSize: T.xs, fontWeight: "700", letterSpacing: 1,
    paddingHorizontal: SP.lg, paddingTop: SP.lg + 4, paddingBottom: SP.xs + 2,
  },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SP.lg, paddingVertical: SP.md + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: SP.md },
  rowLabel: { fontSize: T.lg, fontWeight: "500" },
  rowVal: { fontSize: T.base },
});
