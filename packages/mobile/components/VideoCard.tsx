import React, { memo, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { DotsThreeVertical } from "phosphor-react-native";
import { C, R, SP, T } from "../lib/tokens";

const { width: W } = Dimensions.get("window");
const PADDING = SP.md;
const GAP = SP.sm + 2;
const CARD_W = (W - PADDING * 2 - GAP) / 2;

export interface VideoData {
  id: string;
  title: string;
  thumbnail: string;
  channelName: string;
  channelAvatar?: string | null;
  duration: string;
  viewCount: string;
  publishedAt?: string;
  isLive?: boolean;
}

// ── Shared shimmer hook ────────────────────────────────────────────────────
function useShimmer() {
  const [loaded, setLoaded] = useState(false);
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (loaded) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.85, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [loaded]);
  return { loaded, setLoaded, anim };
}

// ─── Grid card (2-column) ──────────────────────────────────────────────────
export const VideoCard = memo(({ video, style }: { video: VideoData; style?: any }) => {
  const router = useRouter();
  const isLive = video.isLive || video.duration === "LIVE";
  const { loaded, setLoaded, anim } = useShimmer();

  return (
    <TouchableOpacity
      style={[s.card, style]}
      onPress={() => router.push(`/player/${video.id}`)}
      activeOpacity={0.78}
    >
      {/* Thumbnail */}
      <View style={s.thumbWrap}>
        {!loaded && <Animated.View style={[StyleSheet.absoluteFill, s.shimmer, { opacity: anim }]} />}
        <Image
          source={{ uri: video.thumbnail }}
          style={s.thumb}
          resizeMode="cover"
          onLoad={() => setLoaded(true)}
        />
        {isLive ? (
          <View style={s.liveBadge}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>LIVE</Text>
          </View>
        ) : !!video.duration ? (
          <View style={s.durBadge}>
            <Text style={s.durText}>{video.duration}</Text>
          </View>
        ) : null}
      </View>

      {/* Info — renders instantly */}
      <View style={s.info}>
        <View style={s.infoRow}>
          {video.channelAvatar ? (
            <Image source={{ uri: video.channelAvatar }} style={s.avatar} />
          ) : (
            <View style={s.avatarFb}>
              <Text style={s.avatarLetter}>{video.channelName?.[0]?.toUpperCase() ?? "?"}</Text>
            </View>
          )}
          <View style={s.textCol}>
            <Text style={s.title} numberOfLines={2}>{video.title}</Text>
            <Text style={s.meta} numberOfLines={1}>{video.channelName}</Text>
            <Text style={s.meta} numberOfLines={1}>
              {[video.viewCount, video.publishedAt].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <TouchableOpacity style={s.moreBtn} hitSlop={8}>
            <DotsThreeVertical size={14} color={C.muted} weight="bold" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
});
VideoCard.displayName = "VideoCard";

// ─── Row card (search / related / explore) ────────────────────────────────
export const VideoRow = memo(({ video }: { video: VideoData }) => {
  const router = useRouter();
  const isLive = video.isLive || video.duration === "LIVE";
  const { loaded, setLoaded, anim } = useShimmer();

  return (
    <TouchableOpacity
      style={s.rowCard}
      onPress={() => router.push(`/player/${video.id}`)}
      activeOpacity={0.78}
    >
      <View style={s.rowThumb}>
        {!loaded && <Animated.View style={[StyleSheet.absoluteFill, s.shimmer, { opacity: anim }]} />}
        <Image
          source={{ uri: video.thumbnail }}
          style={s.rowImg}
          resizeMode="cover"
          onLoad={() => setLoaded(true)}
        />
        {isLive ? (
          <View style={s.liveBadge}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>LIVE</Text>
          </View>
        ) : !!video.duration ? (
          <View style={s.durBadge}>
            <Text style={s.durText}>{video.duration}</Text>
          </View>
        ) : null}
      </View>
      <View style={s.rowInfo}>
        <Text style={s.rowTitle} numberOfLines={2}>{video.title}</Text>
        <Text style={s.rowMeta} numberOfLines={1}>{video.channelName}</Text>
        <Text style={s.rowMeta} numberOfLines={1}>
          {[video.viewCount, video.publishedAt].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <TouchableOpacity style={{ padding: SP.xs, alignSelf: "flex-start" }} hitSlop={8}>
        <DotsThreeVertical size={16} color={C.muted} weight="bold" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});
VideoRow.displayName = "VideoRow";

// ─── Shorts thumbnail card ─────────────────────────────────────────────────
export const ShortsCard = memo(({ video }: { video: VideoData }) => {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={s.shortCard}
      onPress={() => router.push(`/player/${video.id}`)}
      activeOpacity={0.8}
    >
      <View style={s.shortThumb}>
        <Image source={{ uri: video.thumbnail }} style={s.shortImg} resizeMode="cover" />
        <View style={s.shortOverlay}>
          <Text style={s.shortTitle} numberOfLines={2}>{video.title}</Text>
          <Text style={s.shortViews}>{video.viewCount}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});
ShortsCard.displayName = "ShortsCard";

const s = StyleSheet.create({
  // ── Shared ──
  shimmer: { backgroundColor: "#1A1A1A", zIndex: 1, borderRadius: 4 },

  // ── Grid card ──
  card: {
    width: CARD_W,
    backgroundColor: "transparent",
    marginBottom: SP.lg,
  },
  thumbWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: C.glass,
    borderRadius: R.sm,
    overflow: "hidden",
  },
  thumb: { width: "100%", height: "100%" },

  liveBadge: {
    position: "absolute",
    bottom: SP.xs + 1,
    right: SP.xs + 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SP.xs,
    backgroundColor: C.red,
    borderRadius: R.xs,
    paddingHorizontal: SP.xs + 1,
    paddingVertical: 2,
  },
  liveDot: {
    width: 5, height: 5,
    borderRadius: R.full,
    backgroundColor: C.white,
  },
  liveText: { color: C.white, fontSize: T.xs - 1, fontWeight: "700", letterSpacing: 0.5 },

  durBadge: {
    position: "absolute",
    bottom: SP.xs + 1,
    right: SP.xs + 1,
    backgroundColor: "rgba(0,0,0,0.80)",
    borderRadius: R.xs,
    paddingHorizontal: SP.xs,
    paddingVertical: 1.5,
  },
  durText: { color: C.white, fontSize: T.xs, fontWeight: "600" },

  info: { paddingHorizontal: 2, paddingTop: SP.sm - 1 },
  infoRow: { flexDirection: "row", gap: SP.sm - 1, alignItems: "flex-start" },
  avatar: { width: 24, height: 24, borderRadius: R.full, marginTop: 1 },
  avatarFb: {
    width: 24, height: 24, borderRadius: R.full,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  avatarLetter: { color: C.white, fontSize: T.xs, fontWeight: "700" },
  textCol: { flex: 1 },
  title: { color: C.white, fontSize: T.base, fontWeight: "500", lineHeight: 17, marginBottom: 2 },
  meta: { color: C.muted, fontSize: T.xs, lineHeight: 14 },
  moreBtn: { padding: 2, marginTop: 1 },

  // ── Row card ──
  rowCard: {
    flexDirection: "row",
    paddingHorizontal: SP.lg - 2,
    paddingVertical: SP.sm + 2,
    gap: SP.md - 1,
    alignItems: "flex-start",
  },
  rowThumb: {
    width: 150,
    aspectRatio: 16 / 9,
    backgroundColor: C.glass,
    borderRadius: R.sm,
    overflow: "hidden",
    flexShrink: 0,
  },
  rowImg: { width: "100%", height: "100%" },
  rowInfo: { flex: 1, gap: 3, paddingTop: 1 },
  rowTitle: { color: C.white, fontSize: T.md, fontWeight: "500", lineHeight: 18 },
  rowMeta: { color: C.muted, fontSize: T.sm, lineHeight: 15 },

  // ── Shorts ──
  shortCard: {
    width: 110,
    marginRight: SP.sm + 2,
  },
  shortThumb: {
    width: 110,
    height: 165,
    borderRadius: R.md,
    overflow: "hidden",
    backgroundColor: C.glass,
  },
  shortImg: { width: "100%", height: "100%" },
  shortOverlay: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    padding: SP.sm,
    backgroundColor: "rgba(0,0,0,0.50)",
  },
  shortTitle: { color: C.white, fontSize: T.sm, fontWeight: "500", lineHeight: 14 },
  shortViews: { color: "rgba(255,255,255,0.7)", fontSize: T.xs, marginTop: 3 },
});
