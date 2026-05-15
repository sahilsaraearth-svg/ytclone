import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Modal,
  Dimensions,
  Image,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  MagnifyingGlass,
  X,
  CaretDown,
  Check,
  DotsThreeVertical,
  TrendUp,
  MusicNote,
  GameController,
  Lightbulb,
  Television,
  Barbell,
} from "phosphor-react-native";
import { VideoData } from "../../components/VideoCard";
import { useDebounce } from "../../hooks/useDebounce";
import { API_BASE } from "../../lib/config";
import { useRouter, useFocusEffect } from "expo-router";
import { C, R, SP, T } from "../../lib/tokens";
import { useColors } from "../../hooks/useColors";

const { width: W } = Dimensions.get("window");

// Icon map — API sends string names, we resolve to components here
const ICON_MAP: Record<string, any> = {
  TrendUp, MusicNote, GameController, Lightbulb, Television, Barbell,
};

function SkeletonRow() {
  const anim = React.useRef(new Animated.Value(0.4)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.85, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={[sk.row, { opacity: anim }]}>
      <View style={sk.thumb} />
      <View style={sk.info}>
        <View style={sk.line1} />
        <View style={sk.line2} />
        <View style={sk.line3} />
      </View>
    </Animated.View>
  );
}

function SkeletonList() {
  return (
    <>{[...Array(7)].map((_, i) => <SkeletonRow key={i} />)}</>
  );
}

function DropdownModal({
  visible, options, selected, onSelect, onClose,
}: {
  visible: boolean; options: string[]; selected: string;
  onSelect: (v: string) => void; onClose: () => void;
}) {
  const col = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={ds.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[ds.sheet, { backgroundColor: col.surface, borderColor: col.border }]}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt} style={ds.option}
              onPress={() => { onSelect(opt); onClose(); }}
            >
              <Text style={[ds.optTxt, { color: col.muted }, opt === selected && { color: col.white, fontWeight: "600" }]}>{opt}</Text>
              {opt === selected && <Check size={16} color={C.red} weight="bold" />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function VideoRowCard({ video }: { video: VideoData }) {
  const router = useRouter();
  const col = useColors();
  return (
    <TouchableOpacity
      style={sr.row}
      onPress={() => router.push(`/player/${video.id}`)}
      activeOpacity={0.85}
    >
      <View style={[sr.thumbWrap, { backgroundColor: col.surface }]}>
        <Image source={{ uri: video.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {video.duration && (
          <View style={sr.durBadge}>
            <Text style={sr.durTxt}>{video.duration}</Text>
          </View>
        )}
      </View>
      <View style={sr.info}>
        <Text style={[sr.title, { color: col.white }]} numberOfLines={2}>{video.title}</Text>
        <Text style={[sr.meta, { color: col.muted }]} numberOfLines={1}>{video.channelName}</Text>
        <Text style={[sr.meta2, { color: col.dim }]} numberOfLines={1}>
          {[video.viewCount, video.publishedAt].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <TouchableOpacity hitSlop={10} style={sr.moreBtn}>
        <Text style={[sr.moreDots, { color: col.muted }]}>⋮</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function ExploreScreen() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("trending now");
  const [dateFilter, setDateFilter] = useState("Date");
  const [sortFilter, setSortFilter] = useState("Sort by");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSortPicker, setShowSortPicker] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const debounced = useDebounce(query, 400);

  // ── Fetch explore config from API ──
  const { data: exploreConfig } = useQuery({
    queryKey: ["explore-config"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/explore-config`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
  });
  const filterTabs: { key: string; label: string; icon: string }[] =
    (exploreConfig as any)?.tabs ?? [];
  const dateOptions: string[] =
    (exploreConfig as any)?.dateOptions ?? ["Any time", "Today", "This week", "This month", "This year"];
  const sortOptions: string[] =
    (exploreConfig as any)?.sortOptions ?? ["Relevance", "Upload date", "View count", "Rating"];

  const searchQuery = debounced.trim() || activeTab;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["search", searchQuery],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(searchQuery)}`);
      return res.json();
    },
    enabled: searchQuery.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const rawVideos: VideoData[] = (data as any)?.videos ?? [];

  // ── Client-side sort/filter ──
  const videos = React.useMemo(() => {
    let list = [...rawVideos];

    // Sort
    if (sortFilter === "View count") {
      list.sort((a, b) => {
        const parse = (s: string) => {
          const n = parseFloat(s?.replace(/[^0-9.KMB]/gi, "") ?? "0");
          if (/B/i.test(s)) return n * 1e9;
          if (/M/i.test(s)) return n * 1e6;
          if (/K/i.test(s)) return n * 1e3;
          return n;
        };
        return parse(b.viewCount) - parse(a.viewCount);
      });
    } else if (sortFilter === "Upload date") {
      // Prioritize items with "ago" in publishedAt that suggest recency
      list.sort((a, b) => {
        const score = (s?: string) => {
          if (!s) return 99;
          if (/hour|minute|second/i.test(s)) return 0;
          if (/day/i.test(s)) return 1;
          if (/week/i.test(s)) return 2;
          if (/month/i.test(s)) return 3;
          if (/year/i.test(s)) return 4;
          return 5;
        };
        return score(a.publishedAt) - score(b.publishedAt);
      });
    }

    return list;
  }, [rawVideos, sortFilter]);

  const col = useColors();

  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }, [])
  );

  const clearQuery = useCallback(() => {
    setQuery("");
    inputRef.current?.focus();
  }, []);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: col.bg }]} edges={["top", "left", "right"]}>
      <StatusBar barStyle={col === C ? "light-content" : "dark-content"} backgroundColor={col.bg} />

        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={[s.headerTitle, { color: col.white }]}>Explore</Text>
          <TouchableOpacity style={s.moreBtn}>
            <DotsThreeVertical size={22} color={col.muted} weight="bold" />
          </TouchableOpacity>
        </View>

        {/* ── Rounded search bar ── */}
        <View style={s.searchWrap}>
          <View style={[s.searchBar, { backgroundColor: col.surface, borderColor: col.border }]}>
            <MagnifyingGlass size={18} color={col.muted} />
            <TextInput
              ref={inputRef}
              style={[s.input, { color: col.white }]}
              placeholder="Search"
              placeholderTextColor={col.dim}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              selectionColor={C.red}
              onSubmitEditing={() => inputRef.current?.blur()}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={clearQuery} hitSlop={10}>
                <X size={16} color={col.muted} weight="bold" />
              </TouchableOpacity>
            )}
          </View>
        </View>


        {/* ── Date + Sort dropdowns ── */}
        <View style={s.filtersRow}>
          <TouchableOpacity style={[s.dropdown, { backgroundColor: col.surface, borderColor: col.border }]} onPress={() => setShowDatePicker(true)}>
            <Text style={[s.dropdownTxt, { color: col.white }]}>{dateFilter}</Text>
            <CaretDown size={10} color={col.muted} weight="bold" />
          </TouchableOpacity>
          <TouchableOpacity style={[s.dropdown, { backgroundColor: col.surface, borderColor: col.border }]} onPress={() => setShowSortPicker(true)}>
            <Text style={[s.dropdownTxt, { color: col.white }]}>{sortFilter}</Text>
            <CaretDown size={10} color={col.muted} weight="bold" />
          </TouchableOpacity>
        </View>

        {/* ── Results ── */}
        {isLoading ? (
          <SkeletonList />
        ) : (
          <FlatList
            data={videos}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <VideoRowCard video={item} />}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 130 }}
            ListEmptyComponent={
              <View style={s.center}>
                <Text style={[s.emptyTxt, { color: col.muted }]}>No results</Text>
              </View>
            }
          />
        )}

        <DropdownModal
          visible={showDatePicker} options={dateOptions}
          selected={dateFilter} onSelect={setDateFilter}
          onClose={() => setShowDatePicker(false)}
        />
        <DropdownModal
          visible={showSortPicker} options={sortOptions}
          selected={sortFilter} onSelect={setSortFilter}
          onClose={() => setShowSortPicker(false)}
        />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SP.lg + 2, paddingTop: SP.xs, paddingBottom: SP.xs,
  },
  headerTitle: { color: C.white, fontSize: T.h + 2, fontWeight: "700" },
  moreBtn: { padding: SP.xs },

  searchWrap: { paddingHorizontal: SP.lg - 2, paddingBottom: SP.sm },
  searchBar: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: R.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    paddingHorizontal: SP.md + 2, paddingVertical: SP.sm,
    gap: SP.sm,
  },
  input: { flex: 1, color: C.white, fontSize: T.lg, padding: 0 },

  tabsRow: { marginBottom: SP.xs },
  tabsContent: { paddingHorizontal: SP.lg - 2, paddingBottom: SP.xs, gap: SP.sm, alignItems: "center" },
  tab: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SP.sm + 4, paddingVertical: 6,
    borderRadius: R.full,
    backgroundColor: C.surface,
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  tabActive: { backgroundColor: C.red, borderColor: C.red },
  tabTxt: { color: C.muted, fontSize: T.base, fontWeight: "500" },
  tabTxtActive: { color: C.white, fontWeight: "600" },

  filtersRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SP.lg - 2, paddingTop: SP.xs, paddingBottom: SP.sm, gap: SP.sm,
  },
  dropdown: {
    flexDirection: "row", alignItems: "center",
    gap: SP.xs + 1,
    paddingHorizontal: SP.md, paddingVertical: SP.xs + 2,
    backgroundColor: C.surface,
    borderRadius: R.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  dropdownTxt: { color: C.white, fontSize: T.base, fontWeight: "500" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyTxt: { color: C.muted, fontSize: T.lg },
});

// ── Skeleton styles ──
const sk = StyleSheet.create({
  row: {
    flexDirection: "row", paddingHorizontal: SP.lg - 2,
    paddingVertical: SP.sm + 2, gap: SP.sm + 2, alignItems: "flex-start",
  },
  thumb: { width: 130, height: 76, borderRadius: R.md, backgroundColor: C.surface },
  info: { flex: 1, gap: 8, paddingTop: 4 },
  line1: { height: 13, borderRadius: 4, backgroundColor: C.surface, width: "90%" },
  line2: { height: 11, borderRadius: 4, backgroundColor: C.surface, width: "60%" },
  line3: { height: 10, borderRadius: 4, backgroundColor: C.surface, width: "40%" },
});

// ── Search result row card styles ──
const sr = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingHorizontal: SP.lg - 2,
    paddingVertical: SP.sm + 2,
    marginVertical: SP.xs,
    gap: SP.sm + 2,
    alignItems: "flex-start",
  },
  thumbWrap: {
    width: 130,
    height: 76,
    minWidth: 130,
    maxWidth: 130,
    borderRadius: R.md,
    overflow: "hidden",
    backgroundColor: C.surface,
    flexShrink: 0,
    flexGrow: 0,
  },
  thumbImg: { width: 130, height: 76 },
  durBadge: {
    position: "absolute", bottom: SP.xs + 1, right: SP.xs + 1,
    backgroundColor: "rgba(0,0,0,0.80)",
    borderRadius: R.xs, paddingHorizontal: SP.xs + 1, paddingVertical: 2,
  },
  durTxt: { color: C.white, fontSize: T.xs, fontWeight: "600" },
  info: { flex: 1 },
  title: { color: C.white, fontSize: T.md, fontWeight: "600", lineHeight: 18, marginBottom: SP.xs },
  meta: { color: C.muted, fontSize: T.base, marginBottom: 2 },
  meta2: { color: C.dim, fontSize: T.sm },
  moreBtn: { paddingVertical: SP.xs, paddingHorizontal: SP.xs },
  moreDots: { color: C.muted, fontSize: T.xl },
});

// ── Dropdown modal styles ──
const ds = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center", alignItems: "center",
  },
  sheet: {
    backgroundColor: C.surface,
    borderRadius: R.xl,
    paddingVertical: SP.sm, minWidth: 200,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35, shadowRadius: 30, elevation: 16,
  },
  option: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SP.xl, paddingVertical: SP.lg - 2,
  },
  optTxt: { color: "rgba(255,255,255,0.55)", fontSize: T.lg },
  optTxtActive: { color: C.white, fontWeight: "600" },
});
