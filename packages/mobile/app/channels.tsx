import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Image, StatusBar, TextInput, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MagnifyingGlass, CaretDown, UserCircle } from "phosphor-react-native";
import { API_BASE } from "../lib/config";

const C = {
  bg: "#0B0B0B",
  surface: "#151515",
  card: "#1A1A1A",
  border: "rgba(255,255,255,0.07)",
  red: "#FF0000",
  white: "#FFFFFF",
  muted: "#A0A0A0",
  dim: "#444444",
};

const SORT_OPTIONS = ["May you like that", "Alphabetical", "Most recent"];

interface Channel {
  id: string;
  name: string;
  avatar: string | null;
  subs: string;
  subscribed: boolean;
}

function dedupeChannels(videos: any[]): Channel[] {
  const seen = new Set<string>();
  const out: Channel[] = [];
  for (const v of videos) {
    const name: string = v.channelName || v.author?.name || "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    // derive id from channelId field or generate from name
    const id: string = v.channelId || v.author?.id || name.replace(/\s+/g, "-").toLowerCase();
    out.push({
      id,
      name,
      avatar: v.channelAvatar || v.author?.thumbnails?.[0]?.url || null,
      subs: v.channelSubCount || v.author?.subscriberCountText || "",
      subscribed: false,
    });
  }
  return out;
}

export default function ChannelsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("May you like that");
  const [showSort, setShowSort] = useState(false);
  const [subState, setSubState] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/trending`);
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      const videos: any[] = json?.videos ?? (Array.isArray(json) ? json : []);
      return dedupeChannels(videos);
    },
    staleTime: 5 * 60 * 1000,
  });

  const channels: Channel[] = data ?? [];

  const sorted = [...channels].sort((a, b) => {
    if (sort === "Alphabetical") return a.name.localeCompare(b.name);
    return 0;
  });

  const filtered = sorted.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase())
  );

  const toggleSub = useCallback((id: string) => {
    setSubState((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <SafeAreaView style={s.container} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={C.white} weight="bold" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Channels</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Search bar ── */}
      <View style={s.searchWrap}>
        <View style={s.searchBar}>
          <MagnifyingGlass size={17} color={C.muted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search channels"
            placeholderTextColor={C.dim}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            selectionColor={C.red}
          />
        </View>
      </View>

      {/* ── Sort by ── */}
      <View style={s.sortHeaderRow}>
        <Text style={s.sortLabel}>Sort by: </Text>
        <TouchableOpacity
          style={s.sortDropdown}
          onPress={() => setShowSort((v) => !v)}
        >
          <Text style={s.sortValue}>{sort}</Text>
          <CaretDown size={11} color={C.muted} weight="bold" />
        </TouchableOpacity>
      </View>

      {showSort && (
        <View style={s.sortSheet}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={s.sortRow}
              onPress={() => { setSort(opt); setShowSort(false); }}
            >
              <Text style={[s.sortTxt, sort === opt && s.sortTxtActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── States ── */}
      {isLoading && (
        <View style={s.center}>
          <ActivityIndicator color={C.red} size="large" />
        </View>
      )}

      {isError && (
        <View style={s.center}>
          <Text style={s.errorTxt}>Couldn't load channels</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
            <Text style={s.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Channel list ── */}
      {!isLoading && !isError && (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const subscribed = subState[item.id] ?? item.subscribed;
            return (
              <TouchableOpacity
                style={s.channelRow}
                onPress={() => router.push(`/channel/${item.id}`)}
                activeOpacity={0.75}
              >
                <View style={s.avatarWrap}>
                  {item.avatar ? (
                    <Image source={{ uri: item.avatar }} style={s.avatarImg} />
                  ) : (
                    <View style={s.avatarFb}>
                      <Text style={s.avatarLetter}>{item.name[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                </View>

                <View style={s.channelInfo}>
                  <Text style={s.channelName}>{item.name}</Text>
                  {item.subs ? (
                    <Text style={s.channelMeta}>{item.subs}</Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[s.subBtn, subscribed && s.subBtnGrey]}
                  onPress={() => toggleSub(item.id)}
                >
                  <Text style={[s.subBtnTxt, subscribed && s.subBtnTxtGrey]}>
                    {subscribed ? "Subscribed" : "Subscrib"}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 130 }}
          ListEmptyComponent={
            <View style={s.center}>
              <UserCircle size={48} color={C.dim} weight="thin" />
              <Text style={s.emptyTxt}>No channels found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 10,
  },
  backBtn: { padding: 8 },
  headerTitle: {
    flex: 1, color: C.white, fontSize: 20, fontWeight: "700",
    textAlign: "center",
  },

  searchWrap: { paddingHorizontal: 14, marginBottom: 10 },
  searchBar: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    paddingHorizontal: 16, paddingVertical: 13, gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20, shadowRadius: 12, elevation: 4,
  },
  searchInput: { flex: 1, color: C.white, fontSize: 14, padding: 0 },

  sortHeaderRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 8,
  },
  sortLabel: { color: C.muted, fontSize: 13 },
  sortDropdown: { flexDirection: "row", alignItems: "center", gap: 4 },
  sortValue: { color: C.white, fontSize: 13, fontWeight: "600" },

  sortSheet: {
    backgroundColor: C.surface, marginHorizontal: 14,
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    marginBottom: 8, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 14, elevation: 8,
  },
  sortRow: {
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  sortTxt: { color: C.muted, fontSize: 14 },
  sortTxtActive: { color: C.white, fontWeight: "600" },

  channelRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  avatarWrap: {
    width: 54, height: 54, borderRadius: 27,
    overflow: "hidden", backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarFb: {
    width: "100%", height: "100%",
    backgroundColor: "#222",
    alignItems: "center", justifyContent: "center",
  },
  avatarLetter: { color: C.white, fontSize: 20, fontWeight: "700" },
  channelInfo: { flex: 1 },
  channelName: { color: C.white, fontSize: 14, fontWeight: "600", marginBottom: 3 },
  channelMeta: { color: C.muted, fontSize: 12 },

  subBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: C.red, borderRadius: 999,
    shadowColor: C.red, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.30, shadowRadius: 8, elevation: 6,
  },
  subBtnGrey: {
    backgroundColor: "transparent", shadowOpacity: 0, elevation: 0,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  subBtnTxt: { color: C.white, fontSize: 12, fontWeight: "700" },
  subBtnTxtGrey: { color: C.muted },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  errorTxt: { color: C.muted, fontSize: 14 },
  retryBtn: {
    paddingHorizontal: 20, paddingVertical: 9,
    backgroundColor: C.red, borderRadius: 999,
  },
  retryTxt: { color: C.white, fontSize: 13, fontWeight: "700" },
  emptyTxt: { color: C.muted, fontSize: 14 },
});
