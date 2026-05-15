import React from "react";
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Play, Pause, X } from "phosphor-react-native";
import { useMiniPlayer } from "../context/MiniPlayerContext";
import { useColors } from "../hooks/useColors";
import { C } from "../lib/tokens";

const { width: W } = Dimensions.get("window");

export default function MiniPlayer() {
  const { current, isPlaying, setIsPlaying, dismiss } = useMiniPlayer();
  const router = useRouter();
  const col = useColors();

  if (!current) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={() => router.push(`/player/${current.id}`)}
      style={[s.wrap, { backgroundColor: col.surface, borderColor: col.border }]}
    >
      {/* Red progress bar at top */}
      <View style={s.progressTrack}>
        <View style={s.progressFill} />
      </View>

      <View style={s.row}>
        {/* Thumbnail */}
        <Image source={{ uri: current.thumbnail }} style={[s.thumb, { backgroundColor: col.dim }]} resizeMode="cover" />

        {/* Text */}
        <View style={s.info}>
          <Text style={[s.title, { color: col.white }]} numberOfLines={1}>{current.title}</Text>
          <Text style={[s.channel, { color: col.muted }]} numberOfLines={1}>{current.channelName}</Text>
        </View>

        {/* Controls */}
        <TouchableOpacity
          style={s.ctrlBtn}
          hitSlop={10}
          onPress={(e) => { e.stopPropagation?.(); setIsPlaying(!isPlaying); }}
        >
          {isPlaying
            ? <Pause size={20} color={col.white} weight="fill" />
            : <Play  size={20} color={col.white} weight="fill" />}
        </TouchableOpacity>

        <TouchableOpacity
          style={s.ctrlBtn}
          hitSlop={10}
          onPress={(e) => { e.stopPropagation?.(); dismiss(); }}
        >
          <X size={18} color={col.muted} weight="bold" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap: {
    width: "100%",
    backgroundColor: C.bg,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.40,
    shadowRadius: 16,
    elevation: 12,
  },
  progressTrack: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  progressFill: {
    height: "100%",
    width: "38%",
    backgroundColor: C.red,
    borderRadius: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  thumb: {
    width: 56,
    height: 36,
    borderRadius: 8,
    backgroundColor: C.dim,
    flexShrink: 0,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: C.white,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  channel: {
    color: C.muted,
    fontSize: 11,
  },
  ctrlBtn: {
    width: 32, height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
