import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { VideoCamera, Link, MicrophoneStage } from "phosphor-react-native";
import { useRouter } from "expo-router";

const C = {
  bg: "#0F0F0F",
  surface: "#1A1A1A",
  glass: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.10)",
  red: "#FF0000",
  white: "#FFFFFF",
  muted: "#888888",
};

const OPTIONS = [
  { icon: VideoCamera, label: "Upload video", sub: "Share a video with your audience" },
  { icon: Link, label: "Go live", sub: "Stream live to your subscribers" },
  { icon: MicrophoneStage, label: "Create post", sub: "Write a community post" },
];

export default function CreateScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={s.container} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.header}>
        <Text style={s.title}>Create</Text>
      </View>
      <View style={s.list}>
        {OPTIONS.map(({ icon: Icon, label, sub }) => (
          <TouchableOpacity key={label} style={s.option} activeOpacity={0.75}>
            <View style={s.iconWrap}>
              <Icon size={24} color={C.white} weight="regular" />
            </View>
            <View style={s.optInfo}>
              <Text style={s.optLabel}>{label}</Text>
              <Text style={s.optSub}>{sub}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 10 },
  title: { color: C.white, fontSize: 22, fontWeight: "700" },
  list: { padding: 12, gap: 4 },
  option: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 8, paddingVertical: 16,
    borderRadius: 12,
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: C.glass, alignItems: "center", justifyContent: "center",
  },
  optInfo: { flex: 1 },
  optLabel: { color: C.white, fontSize: 15, fontWeight: "600" },
  optSub: { color: C.muted, fontSize: 12, marginTop: 2 },
});
