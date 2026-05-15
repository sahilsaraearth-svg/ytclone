import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Image, StatusBar, TextInput, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlass, CaretDown, UserCircle } from "phosphor-react-native";
import { API_BASE } from "../../lib/config";
import { useColors } from "../../hooks/useColors";
import { C } from "../../lib/tokens";

const SORT_OPTIONS = ["May you like that", "Alphabetical", "Most recent"];

interface Channel {
  id: string;
  name: string;
  avatar: string | null;
  subs: string;
}

function dedupeChannels(videos: any[]): Channel[] {
  const seen = new Set<string>();
  const out: Channel[] = [];
  for (const v of videos) {
    const name: string = v.channelName || v.author?.name || "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const id: string = v.channelId || v.author?.id || name.replace(/\s+/g, "-").toLowerCase();
    out.push({
      id,
      name,
      avatar: v.channelAvatar || v.author?.thumbnails?.[0]?.url || null,
      subs: v.channelSubCount || v.author?.subscriberCountText || "",
    });
  }
  return out;
}

export default function ChannelsTabScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("May you like that");
  const [showSort, setShowSort] = useState(false);
  const [subState, setSubState] = useState<Record<string, boolean>>({});

  const col = useColors();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["channels-tab"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/trending`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      const videos: any[] = json?.videos ?? (Array.isArray(json) ? json : []);
      return dedupeChannels(videos);
    },
    staleTime: 5 * 60 * 1000,
  });

  const channels: Channel[] = data ?? [];

  const sorted = [...channels].sort((a, b) =>
    sort === "Alphabetical" ? a.name.localeCompare(b.name) : 0
  );

  const filtered = sorted.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase())
  );

  const toggleSub = useCallback((id: string) => {
    setSubState((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: col.bg }]} edges={["top", "left", "right"]}>
      <StatusBar barStyle={col === C ? "light-content" : "dark-content"} backgroundColor={col.bg} />

      {/* Header */}
      <View style={s.header}>
        <Text style={[s.title, { color: col.white }]}>Channels</Text>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <View style={[s.searchBar, { backgroundColor: col.surface, borderColor: col.border }]}>
          <MagnifyingGlass size={17} color={col.muted} />
          <TextInput
            style={[s.searchInput, { color: col.white }]}
            placeholder="Search channels"
            placeholderTextColor={col.dim}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            selectionColor={C.red}
          />
        </View>
      </View>

      {/* Sort */}
      <View style={s.sortHeaderRow}>
        <Text style={[s.sortLabel, { color: col.muted }]}>Sort by: </Text>
        <TouchableOpacity
          style={s.sortDropdown}
          onPress={() => setShowSort((v) => !v)}
        >
          <Text style={[s.sortValue, { color: col.white }]}>{sort}</Text>
          <CaretDown size={11} color={col.muted} weight="bold" />
        </TouchableOpacity>
      </View>

      {showSort && (
        <View style={[s.sortSheet, { backgroundColor: col.surface, borderColor: col.border }]}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[s.sortRow, { borderBottomColor: col.border }]}
              onPress={() => { setSort(opt); setShowSort(false); }}
            >
              <Text style={[s.sortTxt, { color: col.muted }, sort === opt && { color: col.white, fontWeight: "600" }]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isLoading && (
        <View style={s.center}>
          <ActivityIndicator color={C.red} size="large" />
        </View>
      )}

      {isError && (
        <View style={s.center}>
          <Text style={[s.errorTxt, { color: col.muted }]}>Couldn't load channels</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
            <Text style={s.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const subscribed = subState[item.id] ?? false;
            return (
              <TouchableOpacity
                style={s.channelRow}
                onPress={() => router.push(`/channel/${item.id}`)}
                activeOpacity={0.75}
              >
                <View style={[s.avatarWrap, { backgroundColor: col.card, borderColor: col.border }]}>
                  {item.avatar ? (
                    <Image source={{ uri: item.avatar }} style={s.avatarImg} />
                  ) : (
                    <View style={[s.avatarFb, { backgroundColor: col.surface }]}>
                      <Text style={[s.avatarLetter, { color: col.white }]}>{item.name[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                </View>

                <View style={s.channelInfo}>
                  <Text style={[s.channelName, { color: col.white }]}>{item.name}</Text>
                  {item.subs ? (
                    <Text style={[s.channelMeta, { color: col.muted }]}>{item.subs}</Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[s.subBtn, subscribed && { ...s.subBtnGrey, borderColor: col.border }]}
                  onPress={() => toggleSub(item.id)}
                >
                  <Text style={[s.subBtnTxt, subscribed && { color: col.muted }]}>
                    {subscribed ? "Subscribed" : "Subscribe"}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 130 }}
          ListEmptyComponent={
            <View style={s.center}>
              <UserCircle size={48} color={col.dim} weight="thin" />
              <Text style={[s.emptyTxt, { color: col.muted }]}>No channels found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  title: { color: C.white, fontSize: 22, fontWeight: "700" },

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
