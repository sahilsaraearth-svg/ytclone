import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Dimensions, ActivityIndicator, StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bell, DotsThreeVertical, MagnifyingGlass, CaretDown } from "phosphor-react-native";
import { VideoData } from "../../components/VideoCard";
import { API_BASE } from "../../lib/config";
import { useColors } from "../../hooks/useColors";
import { C } from "../../lib/tokens";

const { width: W } = Dimensions.get("window");
const BANNER_H = 140;
const AVATAR_SIZE = 72;
const TABS = ["Home", "Video", "Playlist", "Community", "Channels", "Ab"];

export default function ChannelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("Home");
  const [subscribed, setSubscribed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["channel", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(id ?? "")}`);
      return res.json();
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const videos: VideoData[] = (data as any)?.videos ?? [];
  const ch = videos[0];
  const col = useColors();

  return (
    <SafeAreaView style={[s.container, { backgroundColor: col.bg }]} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── Banner — full dark image ── */}
      <View style={s.bannerWrap}>
        {ch?.thumbnail ? (
          <Image source={{ uri: ch.thumbnail }} style={s.bannerImg} resizeMode="cover" blurRadius={12} />
        ) : (
          <View style={s.bannerPlaceholder} />
        )}
        {/* Gradient overlay for luxury dark feel */}
        <View style={s.bannerOverlay} />

        {/* Nav over banner */}
        <View style={s.bannerNav}>
          <TouchableOpacity style={s.navBtn} onPress={() => router.back()}>
            <ArrowLeft size={20} color={C.white} weight="bold" />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={s.navBtn}>
            <MagnifyingGlass size={18} color={C.white} />
          </TouchableOpacity>
          <TouchableOpacity style={s.navBtn}>
            <DotsThreeVertical size={18} color={C.white} weight="bold" />
          </TouchableOpacity>
        </View>

        {/* Bell + Subscribe buttons inside banner bottom-left */}
        <View style={s.bannerActions}>
          <TouchableOpacity style={s.bellBtn}>
            <Bell size={18} color={subscribed ? C.white : C.muted} weight={subscribed ? "fill" : "regular"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.subBtn, subscribed && s.subBtnGrey]}
            onPress={() => setSubscribed((v) => !v)}
          >
            <Text style={s.subBtnTxt}>{subscribed ? "Subscribed" : "Subscrib"}</Text>
          </TouchableOpacity>
        </View>

        {/* Avatar overlapping bottom-right of banner */}
        <View style={s.avatarOverlap}>
          {ch?.channelAvatar ? (
            <Image source={{ uri: ch.channelAvatar }} style={s.avatar} />
          ) : (
            <View style={s.avatarFb}>
              <Text style={s.avatarLetter}>{(ch?.channelName ?? id ?? "?")[0]?.toUpperCase()}</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>
        {/* Channel info — spacer for avatar */}
        <View style={[s.channelInfo, { backgroundColor: col.bg }]}>
          <View style={{ height: AVATAR_SIZE / 2 + 10 }} />
          <TouchableOpacity style={s.biographyRow} activeOpacity={0.8}>
            <Text style={[s.biography, { color: col.white }]}>Biography</Text>
            <CaretDown size={13} color={col.muted} weight="bold" />
          </TouchableOpacity>
          <Text style={[s.channelMeta, { color: col.muted }]}>
            1.2k subscribers · {videos.length > 0 ? `${videos.length} videos` : "42 videos"}
          </Text>
        </View>

        {/* Tabs — sticky */}
        <View style={[s.tabsContainer, { backgroundColor: col.bg }]}>
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.tabsContent}
          >
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[s.tab, activeTab === tab && s.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[s.tabTxt, { color: col.muted }, activeTab === tab && { color: col.white, fontWeight: "600" }]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={[s.tabDivider, { backgroundColor: col.border }]} />
        </View>

        {/* Content */}
        {isLoading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={C.red} />
          </View>
        ) : (
          <View>
            <Text style={[s.sectionLabel, { color: col.white }]}>News</Text>
            {videos.map((v) => (
              <ChannelVideoRow key={v.id} video={v} />
            ))}
            {videos.length === 0 && (
              <View style={s.center}>
                <Text style={[s.emptyTxt, { color: col.muted }]}>No videos</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 130 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ChannelVideoRow({ video }: { video: VideoData }) {
  const router = useRouter();
  const col = useColors();
  return (
    <TouchableOpacity
      style={vr.row}
      onPress={() => router.push(`/player/${video.id}`)}
      activeOpacity={0.85}
    >
      <View style={[vr.thumbWrap, { backgroundColor: col.surface }]}>
        <Image source={{ uri: video.thumbnail }} style={vr.thumb} resizeMode="cover" />
        {video.duration && (
          <View style={vr.dur}>
            <Text style={vr.durTxt}>{video.duration}</Text>
          </View>
        )}
      </View>
      <View style={vr.info}>
        <Text style={[vr.title, { color: col.white }]} numberOfLines={2}>{video.title}</Text>
        <Text style={[vr.meta, { color: col.muted }]}>{video.channelName}</Text>
        <Text style={[vr.meta2, { color: col.dim }]}>{[video.viewCount, video.publishedAt].filter(Boolean).join(" · ")}</Text>
      </View>
      <TouchableOpacity hitSlop={10}>
        <Text style={{ color: col.muted, fontSize: 16 }}>⋮</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const vr = StyleSheet.create({
  row: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10, gap: 10, alignItems: "flex-start" },
  thumbWrap: { width: 130, height: 76, borderRadius: 14, overflow: "hidden", backgroundColor: "#1A1A1A", flexShrink: 0 },
  thumb: { width: "100%", height: "100%" },
  dur: { position: "absolute", bottom: 5, right: 5, backgroundColor: "rgba(0,0,0,0.80)", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  durTxt: { color: "#fff", fontSize: 10, fontWeight: "600" },
  info: { flex: 1 },
  title: { color: C.white, fontSize: 13, fontWeight: "600", lineHeight: 18, marginBottom: 4 },
  meta: { color: C.muted, fontSize: 12, marginBottom: 2 },
  meta2: { color: "#666", fontSize: 11 },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  bannerWrap: { width: W, height: BANNER_H, backgroundColor: C.surface, position: "relative" },
  bannerImg: { width: "100%", height: "100%" },
  bannerPlaceholder: { width: "100%", height: "100%", backgroundColor: "#1E1E1E" },
  bannerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.50)" },

  bannerNav: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 6, paddingVertical: 8,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center", marginHorizontal: 2,
  },

  // Bell + subscribe inside banner bottom
  bannerActions: {
    position: "absolute", bottom: 12, left: 14,
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  bellBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  subBtn: {
    paddingHorizontal: 20, paddingVertical: 8,
    backgroundColor: C.red, borderRadius: 999,
    shadowColor: C.red, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  subBtnGrey: {
    backgroundColor: "rgba(255,255,255,0.10)",
    shadowOpacity: 0, elevation: 0,
    borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.15)",
  },
  subBtnTxt: { color: C.white, fontSize: 13, fontWeight: "700" },

  // Avatar bottom-right of banner
  avatarOverlap: {
    position: "absolute",
    bottom: -(AVATAR_SIZE / 2),
    right: 16,
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3, borderColor: C.bg,
    overflow: "hidden",
    backgroundColor: C.card,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30, shadowRadius: 8, elevation: 8,
  },
  avatar: { width: "100%", height: "100%" },
  avatarFb: { width: "100%", height: "100%", backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: C.white, fontSize: 26, fontWeight: "700" },

  channelInfo: {
    paddingHorizontal: 16, paddingBottom: 14,
    paddingRight: 16 + AVATAR_SIZE + 8,
  },
  biographyRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 },
  biography: { color: C.white, fontSize: 17, fontWeight: "700" },
  channelMeta: { color: C.muted, fontSize: 13 },

  tabsContainer: { backgroundColor: C.bg },
  tabsContent: { paddingHorizontal: 10, paddingBottom: 0, gap: 2 },
  tab: { paddingHorizontal: 14, paddingVertical: 11 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.white },
  tabTxt: { color: C.muted, fontSize: 13, fontWeight: "500" },
  tabTxtActive: { color: C.white, fontWeight: "600" },
  tabDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border },

  sectionLabel: { color: C.white, fontSize: 15, fontWeight: "700", paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
  center: { alignItems: "center", paddingTop: 60 },
  emptyTxt: { color: C.muted, fontSize: 14 },
});
