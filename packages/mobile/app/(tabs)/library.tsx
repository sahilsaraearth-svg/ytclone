import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, StatusBar,
  TouchableOpacity, Image, ActivityIndicator,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  ClockCounterClockwise, ThumbsUp, BookmarkSimple,
} from "phosphor-react-native";
import { useRouter } from "expo-router";
import { API_BASE } from "../../lib/config";
import { VideoData } from "../../components/VideoCard";
import { useMiniPlayer } from "../../context/MiniPlayerContext";
import { useColors } from "../../hooks/useColors";
import { C } from "../../lib/tokens";
import { useGoogleAuth } from "../../context/GoogleAuthContext";
import { GoogleLogo } from "phosphor-react-native";


function VideoRow({
  video,
  onPress,
}: {
  video: VideoData;
  onPress: () => void;
}) {
  const col = useColors();
  return (
    <TouchableOpacity style={s.videoRow} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.thumbWrap, { backgroundColor: col.surface }]}>
        <Image
          source={{ uri: video.thumbnail }}
          style={s.thumb}
          resizeMode="cover"
        />
        {video.duration && (
          <View style={s.durBadge}>
            <Text style={s.durTxt}>{video.duration}</Text>
          </View>
        )}
      </View>
      <View style={s.videoInfo}>
        <Text style={[s.videoTitle, { color: col.white }]} numberOfLines={2}>{video.title}</Text>
        <Text style={[s.videoMeta, { color: col.muted }]} numberOfLines={1}>
          {video.channelName}
          {video.viewCount ? ` · ${video.viewCount}` : ""}
        </Text>
        {video.publishedAt && (
          <Text style={[s.videoDate, { color: col.dim }]}>{video.publishedAt}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function LibraryScreen() {
  const router = useRouter();
  const { play } = useMiniPlayer();
  const col = useColors();
  const { user: gUser, signIn: googleSignIn } = useGoogleAuth();
  const [activeSection, setActiveSection] = useState<"history" | "liked" | "watchlater">("history");

  const { data: likedData, isLoading: likedLoading } = useQuery({
    queryKey: ["liked-videos", gUser?.userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/feed/liked?userId=${gUser!.userId}`);
      return res.json();
    },
    enabled: !!gUser?.userId && activeSection === "liked",
    staleTime: 5 * 60 * 1000,
  });

  const { data: wlData, isLoading: wlLoading } = useQuery({
    queryKey: ["watch-later", gUser?.userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/feed/watch-later?userId=${gUser!.userId}`);
      return res.json();
    },
    enabled: !!gUser?.userId && activeSection === "watchlater",
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["library-trending"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/trending`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      const videos: VideoData[] = json?.videos ?? (Array.isArray(json) ? json : []);
      return videos.slice(0, 20);
    },
    staleTime: 5 * 60 * 1000,
  });

  const videos: VideoData[] = data ?? [];

  return (
    <SafeAreaView style={[s.container, { backgroundColor: col.bg }]} edges={["top", "left", "right"]}>
      <StatusBar barStyle={col === C ? "light-content" : "dark-content"} backgroundColor={col.bg} />

      {/* Header */}
      <View style={s.header}>
        <Text style={[s.title, { color: col.white }]}>Library</Text>
      </View>

      {/* Quick menu */}
      <View style={s.quickMenu}>
        <TouchableOpacity
          style={[s.quickItem, { backgroundColor: col.surface, borderColor: activeSection === "history" ? C.red : col.border }]}
          activeOpacity={0.75}
          onPress={() => setActiveSection("history")}
        >
          <View style={[s.quickIconWrap, { backgroundColor: col.glass }]}>
            <ClockCounterClockwise size={22} color={activeSection === "history" ? C.red : col.white} weight="regular" />
          </View>
          <Text style={[s.quickLabel, { color: activeSection === "history" ? C.red : col.white }]}>History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.quickItem, { backgroundColor: col.surface, borderColor: activeSection === "liked" ? C.red : col.border }]}
          activeOpacity={0.75}
          onPress={() => gUser ? setActiveSection("liked") : googleSignIn()}
        >
          <View style={[s.quickIconWrap, { backgroundColor: col.glass }]}>
            <ThumbsUp size={22} color={activeSection === "liked" ? C.red : col.white} weight="regular" />
          </View>
          <Text style={[s.quickLabel, { color: activeSection === "liked" ? C.red : col.white }]}>Liked</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.quickItem, { backgroundColor: col.surface, borderColor: activeSection === "watchlater" ? C.red : col.border }]}
          activeOpacity={0.75}
          onPress={() => gUser ? setActiveSection("watchlater") : googleSignIn()}
        >
          <View style={[s.quickIconWrap, { backgroundColor: col.glass }]}>
            <BookmarkSimple size={22} color={activeSection === "watchlater" ? C.red : col.white} weight="regular" />
          </View>
          <Text style={[s.quickLabel, { color: activeSection === "watchlater" ? C.red : col.white }]}>Watch Later</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.divider, { backgroundColor: col.border }]} />

      {/* Google sign-in prompt when trying to access authenticated sections */}
      {!gUser && activeSection !== "history" && (
        <View style={s.center}>
          <GoogleLogo size={40} color="#EA4335" weight="fill" />
          <Text style={[s.emptyTxt, { color: col.white }]}>Sign in to view your {activeSection === "liked" ? "liked videos" : "watch later"}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={googleSignIn}>
            <Text style={s.retryTxt}>Sign in with Google</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Section heading */}
      {(activeSection === "history" || gUser) && (
        <View style={s.sectionHeader}>
          {activeSection === "history" && <ClockCounterClockwise size={16} color={col.muted} weight="regular" />}
          {activeSection === "liked" && <ThumbsUp size={16} color={col.muted} weight="regular" />}
          {activeSection === "watchlater" && <BookmarkSimple size={16} color={col.muted} weight="regular" />}
          <Text style={[s.sectionTitle, { color: col.white }]}>
            {activeSection === "history" ? "Recently watched" : activeSection === "liked" ? "Liked videos" : "Watch later"}
          </Text>
        </View>
      )}

      {/* History section */}
      {activeSection === "history" && (
        <>
          {isLoading && <View style={s.center}><ActivityIndicator color={C.red} size="large" /></View>}
          {isError && (
            <View style={s.center}>
              <ClockCounterClockwise size={40} color={col.dim} weight="thin" />
              <Text style={[s.emptyTxt, { color: col.muted }]}>Couldn't load history</Text>
              <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
                <Text style={s.retryTxt}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
          {!isLoading && !isError && videos.length === 0 && (
            <View style={s.center}>
              <ClockCounterClockwise size={40} color={col.dim} weight="thin" />
              <Text style={[s.emptyTxt, { color: col.muted }]}>No watch history</Text>
              <Text style={[s.emptyHint, { color: col.dim }]}>Videos you watch will appear here</Text>
            </View>
          )}
          {!isLoading && !isError && videos.length > 0 && (
            <FlatList
              data={videos}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <VideoRow video={item} onPress={() => { play(item); router.push(`/player/${item.id}`); }} />
              )}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 130, paddingTop: 4 }}
            />
          )}
        </>
      )}

      {/* Liked videos section */}
      {activeSection === "liked" && gUser && (
        <>
          {likedLoading && <View style={s.center}><ActivityIndicator color={C.red} size="large" /></View>}
          {!likedLoading && ((likedData as any)?.videos ?? []).length === 0 && (
            <View style={s.center}>
              <ThumbsUp size={40} color={col.dim} weight="thin" />
              <Text style={[s.emptyTxt, { color: col.muted }]}>No liked videos yet</Text>
            </View>
          )}
          {!likedLoading && ((likedData as any)?.videos ?? []).length > 0 && (
            <FlatList
              data={(likedData as any).videos}
              keyExtractor={(item: any) => item.id}
              renderItem={({ item }: any) => (
                <VideoRow video={item} onPress={() => { play(item); router.push(`/player/${item.id}`); }} />
              )}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 130, paddingTop: 4 }}
            />
          )}
        </>
      )}

      {/* Watch Later section */}
      {activeSection === "watchlater" && gUser && (
        <>
          {wlLoading && <View style={s.center}><ActivityIndicator color={C.red} size="large" /></View>}
          {!wlLoading && ((wlData as any)?.videos ?? []).length === 0 && (
            <View style={s.center}>
              <BookmarkSimple size={40} color={col.dim} weight="thin" />
              <Text style={[s.emptyTxt, { color: col.muted }]}>Watch Later is empty</Text>
            </View>
          )}
          {!wlLoading && ((wlData as any)?.videos ?? []).length > 0 && (
            <FlatList
              data={(wlData as any).videos}
              keyExtractor={(item: any) => item.id}
              renderItem={({ item }: any) => (
                <VideoRow video={item} onPress={() => { play(item); router.push(`/player/${item.id}`); }} />
              )}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 130, paddingTop: 4 }}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  title: { color: C.white, fontSize: 22, fontWeight: "700" },

  quickMenu: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 6,
  },
  quickItem: {
    flex: 1,
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  quickIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center", justifyContent: "center",
  },
  quickLabel: { color: C.white, fontSize: 11, fontWeight: "500", textAlign: "center" },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginHorizontal: 14, marginBottom: 14 },

  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, marginBottom: 6,
  },
  sectionTitle: { color: C.white, fontSize: 15, fontWeight: "700" },

  videoRow: {
    flexDirection: "row", gap: 12,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  thumbWrap: {
    width: 120, height: 70, borderRadius: 10,
    overflow: "hidden", backgroundColor: C.surface,
    flexShrink: 0,
  },
  thumb: { width: "100%", height: "100%" },
  durBadge: {
    position: "absolute", bottom: 4, right: 4,
    backgroundColor: "rgba(0,0,0,0.78)",
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
  },
  durTxt: { color: C.white, fontSize: 10, fontWeight: "600" },

  videoInfo: { flex: 1, justifyContent: "center" },
  videoTitle: { color: C.white, fontSize: 13, fontWeight: "500", lineHeight: 18, marginBottom: 4 },
  videoMeta: { color: C.muted, fontSize: 12 },
  videoDate: { color: C.dim, fontSize: 11, marginTop: 2 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 50, gap: 10 },
  emptyTxt: { color: C.muted, fontSize: 14, fontWeight: "500" },
  emptyHint: { color: C.dim, fontSize: 12 },
  retryBtn: {
    paddingHorizontal: 20, paddingVertical: 9,
    backgroundColor: C.red, borderRadius: 999, marginTop: 4,
  },
  retryTxt: { color: C.white, fontSize: 13, fontWeight: "700" },
});
