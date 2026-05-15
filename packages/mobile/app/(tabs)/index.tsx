import React, { useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Animated,
  Modal,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { MagnifyingGlass, Bell, UserCircle, Moon, Sun, Gear, Info, X, GoogleLogo, SignOut } from "phosphor-react-native";
import { useRouter } from "expo-router";
import { VideoData } from "../../components/VideoCard";
import { API_BASE } from "../../lib/config";
import { C, R, SP, T } from "../../lib/tokens";
import { useTheme } from "../../context/ThemeContext";
import { useColors } from "../../hooks/useColors";
import { useGoogleAuth } from "../../context/GoogleAuthContext";

const { width: W } = Dimensions.get("window");

export default function HomeScreen() {
  const router = useRouter();
  const [activeChip, setActiveChip] = useState("All");
  const [refreshing, setRefreshing] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const col = useColors();
  const { user: gUser, signIn: googleSignIn, signOut: googleSignOut, loading: gLoading } = useGoogleAuth();

  // ── Fetch chip categories from API ──
  const { data: catData } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/categories`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000, // cache 1 hour
  });
  const baseChips: { id: string; label: string }[] =
    (catData as any)?.categories ?? [{ id: "All", label: "All" }];
  const chips: { id: string; label: string }[] = gUser
    ? [{ id: "__my_feed__", label: "✦ My Feed" }, ...baseChips]
    : baseChips;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["trending", activeChip],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await fetch(
        `${API_BASE}/api/trending?category=${encodeURIComponent(activeChip)}&page=${pageParam}`
      );
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage: any) =>
      lastPage.hasMore ? (lastPage.page ?? 0) + 1 : undefined,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const isMyFeed = activeChip === "__my_feed__";

  // Personal feed from Google auth
  const { data: myFeedData, isLoading: myFeedLoading } = useQuery({
    queryKey: ["my-feed", gUser?.userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/feed/subscriptions/videos?userId=${gUser!.userId}`);
      return res.json();
    },
    enabled: isMyFeed && !!gUser?.userId,
    staleTime: 5 * 60 * 1000,
  });

  const videos: VideoData[] = isMyFeed
    ? ((myFeedData as any)?.videos ?? [])
    : (data?.pages.flatMap((p: any) => p.videos ?? []) ?? []);

  const ListHeader = (
    <>
      {/* ── Top bar ── */}
      <View style={s.topBar}>
        <View style={s.logoRow}>
          <Image
            source={require("../../assets/icon.png")}
            style={s.logoImg}
            resizeMode="contain"
          />
          <Text style={[s.logoName, { color: col.white }]}>Zuno</Text>
        </View>
        <View style={s.topActions}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push("/(tabs)/search")}>
            <MagnifyingGlass size={20} color={col.muted} weight="regular" />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn}>
            <Bell size={20} color={col.muted} weight="regular" />
          </TouchableOpacity>
          <TouchableOpacity style={s.avatarBtn} onPress={() => setShowProfile(true)}>
            <View style={[s.avatarCircle, { borderColor: col.border, backgroundColor: col.glass }]}>
              {gUser?.avatar
                ? <Image source={{ uri: gUser.avatar }} style={{ width: 30, height: 30, borderRadius: 15 }} />
                : <UserCircle size={30} color={col.white} weight="fill" />
              }
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Filter chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipsContent}
        style={s.chipsRow}
      >
        {chips.map((chip) => (
          <TouchableOpacity
            key={chip.id}
            style={[s.chip, { backgroundColor: col.surface, borderColor: col.border }, activeChip === chip.id && { backgroundColor: col.white }]}
            onPress={() => setActiveChip(chip.id)}
          >
            <Text style={[s.chipTxt, { color: col.muted }, activeChip === chip.id && { color: col.bg, fontWeight: "700" }]}>{chip.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: col.bg }]} edges={["top", "left", "right"]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={col.bg} />
      <FlatList
        data={(isMyFeed ? myFeedLoading : (isLoading && !refreshing)) ? [] : videos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <VideoFeedCard video={item} />}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          (isMyFeed ? myFeedLoading : (isLoading && !refreshing)) ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color={C.red} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.red} colors={[C.red]} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130 }}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={5}
        onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator size="small" color={C.red} style={{ marginVertical: 20 }} />
          ) : null
        }
      />

      {/* ── Profile Bottom Sheet ── */}
      <Modal
        visible={showProfile}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProfile(false)}
      >
        <TouchableOpacity style={ps.backdrop} activeOpacity={1} onPress={() => setShowProfile(false)} />
        <View style={[ps.sheet, { backgroundColor: col.surface }]}>
          {/* Handle */}
          <View style={[ps.handle, { backgroundColor: col.dim }]} />

          {/* Header */}
          <View style={ps.header}>
            <View style={[ps.avatarBig, { backgroundColor: col.bg, borderColor: col.border }]}>
              {gUser?.avatar
                ? <Image source={{ uri: gUser.avatar }} style={{ width: 52, height: 52, borderRadius: 28 }} />
                : <UserCircle size={52} color={col.white} weight="fill" />
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ps.name, { color: col.white }]}>{gUser?.name ?? "Guest User"}</Text>
              <Text style={[ps.sub, { color: col.muted }]}>{gUser?.email ?? "Not signed in"}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowProfile(false)} hitSlop={10}>
              <X size={20} color={col.muted} weight="bold" />
            </TouchableOpacity>
          </View>

          <View style={[ps.divider, { backgroundColor: col.border }]} />

          {/* Dark mode toggle */}
          <View style={ps.row}>
            <View style={ps.rowLeft}>
              {isDark
                ? <Moon size={20} color={col.white} weight="fill" />
                : <Sun size={20} color={col.white} weight="fill" />
              }
              <Text style={[ps.rowTxt, { color: col.white }]}>Dark Mode</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: "#ccc", true: C.red }}
              thumbColor={col.white}
            />
          </View>

          {/* Google Sign-In / Sign-Out */}
          {gUser ? (
            <TouchableOpacity style={ps.row} onPress={async () => { await googleSignOut(); }}>
              <View style={ps.rowLeft}>
                <SignOut size={20} color="#EA4335" weight="fill" />
                <Text style={[ps.rowTxt, { color: col.white }]}>Sign out of Google</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={ps.row} onPress={async () => { await googleSignIn(); }} disabled={gLoading}>
              <View style={ps.rowLeft}>
                <GoogleLogo size={20} color="#EA4335" weight="fill" />
                <Text style={[ps.rowTxt, { color: col.white }]}>
                  {gLoading ? "Signing in…" : "Sign in with Google"}
                </Text>
              </View>
              <Text style={[ps.rowVal, { color: col.muted, fontSize: 10 }]}>Get your YT feed</Text>
            </TouchableOpacity>
          )}

          {/* Settings */}
          <TouchableOpacity style={ps.row} onPress={() => { setShowProfile(false); router.push("/settings"); }}>
            <View style={ps.rowLeft}>
              <Gear size={20} color={col.white} weight="fill" />
              <Text style={[ps.rowTxt, { color: col.white }]}>Settings</Text>
            </View>
          </TouchableOpacity>

          {/* App version */}
          <TouchableOpacity style={ps.row}>
            <View style={ps.rowLeft}>
              <Info size={20} color={col.muted} weight="fill" />
              <Text style={[ps.rowTxt, { color: col.muted }]}>App Version</Text>
            </View>
            <Text style={[ps.rowVal, { color: col.muted }]}>1.0.0</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function VideoFeedCard({ video }: { video: VideoData }) {
  const router = useRouter();
  const col = useColors();
  const isLive = video.duration === "LIVE" || video.isLive;
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(0.4)).current;

  // Pulse shimmer while thumbnail loads
  React.useEffect(() => {
    if (thumbLoaded) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [thumbLoaded]);

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => router.push(`/player/${video.id}`)}
      activeOpacity={0.9}
    >
      {/* Thumbnail */}
      <View style={s.cardThumbWrap}>
        <View style={[s.thumbContainer, { backgroundColor: col.surface }]}>
          {/* Shimmer placeholder — visible until image loads */}
          {!thumbLoaded && (
            <Animated.View style={[s.thumbShimmer, { opacity: shimmerAnim, backgroundColor: col.surface }]} />
          )}
          <Image
            source={{ uri: video.thumbnail }}
            style={s.thumb}
            resizeMode="cover"
            onLoad={() => setThumbLoaded(true)}
          />
          <View style={s.thumbOverlay} />
          {isLive && (
            <View style={s.liveBadge}>
              <Text style={s.liveTxt}>● LIVE</Text>
            </View>
          )}
          {!isLive && video.duration ? (
            <View style={s.durBadge}>
              <Text style={s.durTxt}>{video.duration}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Info row — renders instantly, no waiting on image */}
      <View style={s.cardInfo}>
        {video.channelAvatar ? (
          <Image source={{ uri: video.channelAvatar }} style={s.chanAvatar} />
        ) : (
          <View style={[s.chanAvatarFb, { backgroundColor: col.surface }]}>
            <Text style={[s.chanAvatarLetter, { color: col.white }]}>{video.channelName?.[0]?.toUpperCase() ?? "?"}</Text>
          </View>
        )}
        <View style={s.cardText}>
          <Text style={[s.cardTitle, { color: col.white }]} numberOfLines={2}>{video.title}</Text>
          <Text style={[s.cardMeta, { color: col.muted }]} numberOfLines={1}>
            {video.channelName}
            {video.viewCount ? ` · ${video.viewCount}` : ""}
            {video.publishedAt ? ` · ${video.publishedAt}` : ""}
          </Text>
        </View>
        <TouchableOpacity style={s.moreBtn} hitSlop={10}>
          <Text style={[s.moreDots, { color: col.muted }]}>⋮</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── Top bar ──
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SP.lg, paddingVertical: SP.md,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoImg: { width: 36, height: 36, borderRadius: 10 },
  logoName: { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.5 },
  topActions: { flexDirection: "row", alignItems: "center", gap: SP.xs },
  iconBtn: { padding: SP.sm },
  avatarBtn: { paddingLeft: SP.sm - 2 },
  avatarCircle: {
    width: 32, height: 32, borderRadius: R.full,
    overflow: "hidden", backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },

  // ── Chips ──
  chipsRow: { marginBottom: SP.sm },
  chipsContent: { paddingHorizontal: SP.lg, paddingBottom: SP.sm, gap: SP.sm, alignItems: "center" },
  chip: {
    paddingHorizontal: SP.lg, paddingVertical: SP.xs + 3,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.white },
  chipTxt: { color: C.muted, fontSize: T.md, fontWeight: "500" },
  chipTxtActive: { color: C.bg, fontWeight: "700" },

  // ── Feed card ──
  card: { marginBottom: SP.xl + 2 },
  cardThumbWrap: {
    paddingHorizontal: SP.md,
    marginBottom: 2,
  },
  thumbContainer: {
    width: W - SP.md * 2,
    height: (W - SP.md * 2) * 9 / 16,
    backgroundColor: C.surface,
    borderRadius: R.lg,           // was 22 — consistent R.lg = 16
    position: "relative",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 14,
  },
  thumb: { width: "100%", height: "100%" },
  thumbShimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.surface,
    zIndex: 1,
  },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  liveBadge: {
    position: "absolute", top: SP.sm + 2, left: SP.sm + 2,
    backgroundColor: C.red,
    borderRadius: R.sm - 2,
    paddingHorizontal: SP.sm, paddingVertical: 3,
  },
  liveTxt: { color: C.white, fontSize: T.xs, fontWeight: "800", letterSpacing: 0.5 },
  durBadge: {
    position: "absolute", bottom: SP.sm, right: SP.sm,
    backgroundColor: "rgba(0,0,0,0.82)",
    borderRadius: R.xs + 1, paddingHorizontal: SP.sm - 2, paddingVertical: 2,
  },
  durTxt: { color: C.white, fontSize: T.sm, fontWeight: "600" },
  cardInfo: {
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: SP.lg - 2, paddingTop: SP.sm + 2, gap: SP.sm + 2,
  },
  chanAvatar: { width: 36, height: 36, borderRadius: R.full, marginTop: 1 },
  chanAvatarFb: {
    width: 36, height: 36, borderRadius: R.full,
    backgroundColor: C.surface, alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  chanAvatarLetter: { color: C.white, fontSize: T.lg, fontWeight: "700" },
  cardText: { flex: 1 },
  cardTitle: { color: C.white, fontSize: T.lg, fontWeight: "600", lineHeight: 20, marginBottom: 3 },
  cardMeta: { color: C.muted, fontSize: T.base, lineHeight: 16 },
  moreBtn: { paddingLeft: SP.xs, paddingTop: 2 },
  moreDots: { color: C.muted, fontSize: T.xl + 2, lineHeight: 20 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});

const ps = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: R.xxl,
    borderTopRightRadius: R.xxl,
    paddingBottom: SP.xxl + 8,
    paddingHorizontal: SP.lg,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.dim,
    alignSelf: "center",
    marginTop: SP.sm + 2, marginBottom: SP.sm,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    gap: SP.md, paddingVertical: SP.md,
  },
  avatarBig: {
    width: 56, height: 56, borderRadius: R.full,
    backgroundColor: C.bg, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: C.border,
  },
  name: { color: C.white, fontSize: T.xl, fontWeight: "700" },
  sub: { color: C.muted, fontSize: T.base, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: SP.xs },
  row: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SP.md + 2,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: SP.md },
  rowTxt: { color: C.white, fontSize: T.lg, fontWeight: "500" },
  rowVal: { color: C.muted, fontSize: T.base },
});
