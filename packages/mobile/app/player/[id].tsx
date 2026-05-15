import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Dimensions, ActivityIndicator, StatusBar, Modal,
  FlatList, Platform, Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Play, Pause, SpeakerSimpleHigh, SpeakerSimpleSlash,
  ArrowsOutSimple, ArrowsInSimple, DotsThreeVertical,
  ThumbsUp, ThumbsDown, ShareFat, DownloadSimple, BookmarkSimple,
  CaretDown, UserCircle, GearSix, Check, SkipBack, SkipForward, Bell,
  Scissors, List,
} from "phosphor-react-native";
import VideoPlayer from "../../components/VideoPlayer";
import { VideoData } from "../../components/VideoCard";
import { API_BASE } from "../../lib/config";
import { useMiniPlayer } from "../../context/MiniPlayerContext";
import { C, R, SP, T } from "../../lib/tokens";
import { useColors } from "../../hooks/useColors";

const { width: W, height: SCREEN_H } = Dimensions.get("window");
const VIDEO_H = Math.round((W * 9) / 16);

// ─── Shimmer skeleton ─────────────────────────────────────────────────
function Shimmer({ width, height, radius = R.sm - 2, style }: {
  width: number | string; height: number; radius?: number; style?: any;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });
  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: "#333" },
        { opacity },
        style,
      ]}
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────
function fmt(sec: number) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface QualityOption { quality: string; label: string; hasAudio: boolean; }

// ─── Main screen ──────────────────────────────────────────────────────
export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { play: miniPlay } = useMiniPlayer();
  const col = useColors();

  const [paused, setPaused]               = useState(false);
  const [muted, setMuted]                 = useState(false);
  const [fullscreen, setFullscreen]       = useState(false);
  const [showControls, setShowControls]   = useState(true);
  const [currentTime, setCurrentTime]     = useState(0);
  const [duration, setDuration]           = useState(0);
  const [buffering, setBuffering]         = useState(true);
  const [descExpanded, setDescExpanded]   = useState(false);
  const [liked, setLiked]                 = useState(false);
  const [disliked, setDisliked]           = useState(false);
  const [subscribed, setSubscribed]       = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const [selectedQuality, setSelectedQuality]     = useState<string>("auto");
  const [streamUrl, setStreamUrl]         = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl]     = useState<string | null>(null);
  const [qualities, setQualities]         = useState<QualityOption[]>([]);
  const [streamLoading, setStreamLoading] = useState(true);
  const [commentsExpanded, setCommentsExpanded] = useState(false);

  const timer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef    = useRef<any>(null);
  const savedPos    = useRef(0);

  // ── Stream fetch ──
  const fetchStream = useCallback(async (quality = "auto") => {
    if (!id) return;
    setStreamLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/stream/${id}?quality=${quality}`);
      const d = await res.json();
      if (d.availableQualities?.length > 0) setQualities(d.availableQualities);
      setStreamUrl(`${API_BASE}/api/dash/${id}`);
      setFallbackUrl(`${API_BASE}/api/proxy/${id}?quality=360`);
      setSelectedQuality(d.quality ?? quality);
    } catch {
      setStreamUrl(`${API_BASE}/api/dash/${id}`);
      setFallbackUrl(`${API_BASE}/api/proxy/${id}?quality=360`);
    } finally {
      setStreamLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchStream("auto"); }, [fetchStream]);

  // ── Video meta ──
  const { data, isLoading } = useQuery({
    queryKey: ["video", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/video/${id}`);
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const videoData = (data as any)?.video;
  const initialRelated: VideoData[] = (data as any)?.related ?? [];

  // ── Infinite related videos ──
  const {
    data: relatedPages,
    fetchNextPage: fetchMoreRelated,
    hasNextPage: hasMoreRelated,
    isFetchingNextPage: loadingMoreRelated,
  } = useInfiniteQuery({
    queryKey: ["related", id],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await fetch(`${API_BASE}/api/related/${id}?page=${pageParam}`);
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (last: any) => last.hasMore ? (last.page ?? 0) + 1 : undefined,
    enabled: !!id,
  });

  const extraRelated: VideoData[] = relatedPages?.pages.flatMap((p: any) => p.videos ?? []) ?? [];
  const related: VideoData[] = [...initialRelated, ...extraRelated];

  // ── Comments ──
  const { data: commentsData } = useQuery({
    queryKey: ["comments", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/comments/${id}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
  });
  const comments: any[] = (commentsData as any)?.comments ?? [];

  useEffect(() => {
    if (videoData && id) {
      miniPlay({
        id, title: videoData.title ?? "",
        channelName: videoData.channelName ?? "",
        thumbnail: videoData.thumbnail ?? "",
      });
    }
  }, [videoData, id]);

  // ── Controls auto-hide ──
  const resetTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setShowControls(true);
    timer.current = setTimeout(() => { if (!paused) setShowControls(false); }, 3200);
  }, [paused]);

  useEffect(() => {
    resetTimer();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  const togglePlay = useCallback(() => { setPaused((p) => !p); resetTimer(); }, [resetTimer]);
  const toggleMute = useCallback(() => { setMuted((m) => !m); resetTimer(); }, [resetTimer]);
  const toggleFullscreen = useCallback(async () => {
    const pos = videoRef.current?.getPosition
      ? await videoRef.current.getPosition()
      : currentTime;
    savedPos.current = pos > 1 ? pos : 0;
    setFullscreen((f) => !f);
    resetTimer();
  }, [currentTime, resetTimer]);
  const progress = duration > 0 ? currentTime / duration : 0;

  const onProgress = useCallback((d: { currentTime: number }) => setCurrentTime(d.currentTime), []);
  const onLoad     = useCallback((d: { duration: number }) => {
    setDuration(d.duration); setBuffering(false);
    if (savedPos.current > 1) {
      const pos = savedPos.current;
      savedPos.current = 0;
      setTimeout(() => videoRef.current?.seek(pos), 120);
    }
  }, []);
  const onBuffer = useCallback(({ isBuffering: b }: { isBuffering: boolean }) => setBuffering(b), []);
  const onError  = useCallback(() => setError("Playback error — try a different quality."), []);

  useEffect(() => {
    if (savedPos.current > 1) {
      const pos = savedPos.current;
      savedPos.current = 0;
      setTimeout(() => videoRef.current?.seek(pos), 150);
    }
  }, [fullscreen]);

  // ─────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.root, { backgroundColor: col.bg }]} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ════ VIDEO PLAYER ════ */}
      <TouchableOpacity
        activeOpacity={1}
        style={[s.playerWrap, fullscreen && s.playerWrapFS]}
        onPress={() => {
          if (showControls) togglePlay();
          else { setShowControls(true); resetTimer(); }
        }}
      >
        {videoData?.thumbnail && (
          <Image source={{ uri: videoData.thumbnail }} style={s.playerBg} resizeMode="cover" />
        )}
        <View style={s.playerBgOverlay} />

        {streamLoading ? (
          <View style={s.loaderBox}>
            <ActivityIndicator size="large" color={C.red} />
          </View>
        ) : streamUrl ? (
          <VideoPlayer
            videoRef={videoRef}
            dashUrl={streamUrl}
            fallbackUrl={fallbackUrl ?? streamUrl}
            paused={paused}
            muted={muted}
            style={s.video}
            onProgress={onProgress}
            onLoad={onLoad}
            onBuffer={onBuffer}
            onError={onError}
          />
        ) : null}

        {!streamLoading && buffering && (
          <View style={s.overlayCenter}>
            <ActivityIndicator size="large" color={C.white} />
          </View>
        )}

        {error && !streamLoading && (
          <View style={s.overlayCenter}>
            <Text style={s.errTxt}>{error}</Text>
            <TouchableOpacity style={s.retryPill} onPress={() => fetchStream("auto")}>
              <Text style={s.retryTxt}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!streamLoading && showControls && !buffering && (
          <View style={s.ctrlOverlay}>
            {/* Top: back + title + menu */}
            <View style={s.ctrlTop}>
              <TouchableOpacity
                style={s.ctrlGlassBtn}
                onPress={(e) => { e.stopPropagation?.(); router.back(); }}
              >
                <ArrowLeft size={20} color={C.white} weight="bold" />
              </TouchableOpacity>
              <Text style={s.ctrlTitle} numberOfLines={1}>{videoData?.title ?? ""}</Text>
              <TouchableOpacity style={s.ctrlGlassBtn} onPress={(e) => e.stopPropagation?.()}>
                <DotsThreeVertical size={20} color={C.white} weight="bold" />
              </TouchableOpacity>
            </View>

            {/* Center: skip / play / skip */}
            <View style={s.ctrlCenter}>
              <TouchableOpacity
                style={s.skipGlass}
                onPress={(e) => {
                  e.stopPropagation?.();
                  videoRef.current?.seek(Math.max(0, currentTime - 10));
                  resetTimer();
                }}
              >
                <SkipBack size={24} color={C.white} weight="regular" />
                <Text style={s.skipLabel}>10</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.playGlass}
                onPress={(e) => { e.stopPropagation?.(); togglePlay(); }}
              >
                {paused
                  ? <Play size={32} color={C.white} weight="fill" style={{ marginLeft: 3 }} />
                  : <Pause size={32} color={C.white} weight="fill" />
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={s.skipGlass}
                onPress={(e) => {
                  e.stopPropagation?.();
                  videoRef.current?.seek(Math.min(duration, currentTime + 10));
                  resetTimer();
                }}
              >
                <SkipForward size={24} color={C.white} weight="regular" />
                <Text style={s.skipLabel}>10</Text>
              </TouchableOpacity>
            </View>

            {/* Bottom: progress + time + controls */}
            <View style={s.ctrlBottom}>
              <View style={s.trackWrap}>
                <View style={s.trackBg} />
                <View style={[s.trackFill, { width: `${progress * 100}%` as any }]} />
                <View style={[s.trackDot, { left: `${Math.max(0, Math.min(100, progress * 100))}%` as any }]} />
              </View>
              <View style={s.timeRow}>
                <Text style={s.timeTxt}>{fmt(currentTime)}</Text>
                <Text style={s.timeDivider}>/</Text>
                <Text style={[s.timeTxt, { color: C.muted }]}>{fmt(duration)}</Text>
                <View style={{ flex: 1 }} />
                {qualities.length > 0 && (
                  <TouchableOpacity
                    style={s.ctrlIconBtn}
                    onPress={(e) => { e.stopPropagation?.(); setShowQualityPicker(true); }}
                  >
                    <GearSix size={16} color={C.white} weight="regular" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.ctrlIconBtn} onPress={(e) => { e.stopPropagation?.(); toggleMute(); }}>
                  {muted
                    ? <SpeakerSimpleSlash size={16} color={C.white} weight="regular" />
                    : <SpeakerSimpleHigh size={16} color={C.white} weight="regular" />
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.ctrlIconBtn}
                  onPress={(e) => { e.stopPropagation?.(); toggleFullscreen(); }}
                >
                  {fullscreen
                    ? <ArrowsInSimple size={16} color={C.white} weight="regular" />
                    : <ArrowsOutSimple size={16} color={C.white} weight="regular" />
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </TouchableOpacity>
      {/* ── END VIDEO PLAYER ── */}

      {/* ════ SCROLLABLE CONTENT ════ */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces
      >
        {/* ── Info panel ── */}
        <View style={[s.infoPanel, { backgroundColor: col.bg }]}>
          {/* Title */}
          {isLoading ? (
            <View style={s.titleRow}>
              <View style={{ flex: 1, gap: SP.sm }}>
                <Shimmer width="92%" height={16} radius={R.xs} />
                <Shimmer width="65%" height={16} radius={R.xs} />
              </View>
              <Shimmer width={16} height={16} radius={R.xs} style={{ marginLeft: SP.sm }} />
            </View>
          ) : (
            <TouchableOpacity
              style={s.titleRow}
              onPress={() => setDescExpanded((e) => !e)}
              activeOpacity={0.85}
            >
              <Text style={[s.titleTxt, { color: col.white }]} numberOfLines={descExpanded ? undefined : 2}>
                {videoData?.title ?? ""}
              </Text>
              <CaretDown
                size={16} color={C.muted} weight="bold"
                style={[s.caretIcon, descExpanded && s.caretUp]}
              />
            </TouchableOpacity>
          )}

          {/* Stats */}
          {isLoading ? (
            <Shimmer width={160} height={12} radius={R.xs} style={{ marginBottom: SP.lg, marginTop: SP.xs }} />
          ) : (
            <Text style={[s.statsTxt, { color: col.muted }]}>
              {[videoData?.viewCount, videoData?.publishedAt].filter(Boolean).join("  ·  ")}
            </Text>
          )}

          {/* Description expanded */}
          {!isLoading && descExpanded && videoData?.description ? (
            <View style={s.descBox}>
              <Text style={s.descTxt}>{videoData.description}</Text>
            </View>
          ) : null}

          {/* Action pills */}
          {isLoading ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.actionsRow} scrollEnabled={false}>
              {[80, 80, 70, 95, 65, 60].map((w, i) => (
                <Shimmer key={i} width={w} height={36} radius={R.full} />
              ))}
            </ScrollView>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.actionsRow}>
              <ActionPill icon={ThumbsUp} label={videoData?.likes ? String(videoData.likes) : "Like"} active={liked}
                onPress={() => setLiked((v) => { if (!v) setDisliked(false); return !v; })} />
              <ActionPill icon={ThumbsDown} label="Dislike" active={disliked}
                onPress={() => setDisliked((v) => { if (!v) setLiked(false); return !v; })} />
              <ActionPill icon={ShareFat}       label="Share"    onPress={() => {}} />
              <ActionPill icon={DownloadSimple} label="Download" onPress={() => {}} />
              <ActionPill icon={BookmarkSimple} label="Save"     onPress={() => {}} />
              <ActionPill icon={Scissors}       label="Clip"     onPress={() => {}} />
            </ScrollView>
          )}

          <View style={s.divider} />

          {/* Channel card */}
          {isLoading ? (
            <View style={s.channelCard}>
              <View style={s.channelLeft}>
                <Shimmer width={40} height={40} radius={R.full} />
                <View style={{ gap: SP.xs + 3, marginLeft: SP.sm + 2 }}>
                  <Shimmer width={110} height={12} radius={R.xs} />
                  <Shimmer width={80} height={10} radius={R.xs} />
                </View>
              </View>
              <Shimmer width={80} height={32} radius={R.full} />
            </View>
          ) : (
            <View style={s.channelCard}>
              <TouchableOpacity style={s.channelLeft} activeOpacity={0.8}
                onPress={() => { if (videoData?.channelId) router.push(`/channel/${videoData.channelId}`); }}
              >
                <View style={s.avatarRing}>
                  {videoData?.channelAvatar
                    ? <Image source={{ uri: videoData.channelAvatar }} style={s.avatarImg} />
                    : <UserCircle size={40} color={C.muted} weight="thin" />
                  }
                </View>
                <View style={s.channelMeta}>
                  <View style={s.channelNameRow}>
                    <Text style={s.channelName}>{videoData?.channelName}</Text>
                    <View style={s.checkBadge}><Check size={7} color="#fff" weight="bold" /></View>
                  </View>
                  {videoData?.subscriberCount
                    ? <Text style={s.subCount}>{videoData.subscriberCount} subscribers</Text>
                    : null}
                </View>
              </TouchableOpacity>
              <View style={s.subGroup}>
                <TouchableOpacity style={s.bellBtn}>
                  <Bell size={18} color={C.muted} weight="regular" />
                </TouchableOpacity>
                <TouchableOpacity style={[s.subBtn, subscribed && s.subBtnSub]}
                  onPress={() => setSubscribed((v) => !v)} activeOpacity={0.85}>
                  <Text style={[s.subBtnTxt, subscribed && s.subBtnTxtSub]}>
                    {subscribed ? "Subscribed" : "Subscrib"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ════ COMMENTS ════ */}
        <TouchableOpacity
          activeOpacity={isLoading ? 1 : 0.85}
          onPress={() => { if (!isLoading && comments.length > 0) setCommentsExpanded((v) => !v); }}
          style={[s.commentsBox, { backgroundColor: col.surface, borderColor: col.border }]}
        >
          <View style={s.commentsBoxHeader}>
            {isLoading ? (
              <>
                <Shimmer width={80} height={13} radius={R.xs} />
                <Shimmer width={30} height={13} radius={R.xs} />
              </>
            ) : (
              <>
                <Text style={[s.commentsTitle, { color: col.white }]}>Comments</Text>
                <View style={s.commentsBoxRight}>
                  <Text style={s.commentsCount}>{comments.length}+</Text>
                  <CaretDown size={14} color={C.muted} weight="bold"
                    style={{ transform: [{ rotate: commentsExpanded ? "180deg" : "0deg" }] }}
                  />
                </View>
              </>
            )}
          </View>

          {/* First comment / skeleton */}
          <View style={s.commentRow}>
            {isLoading ? (
              <>
                <Shimmer width={32} height={32} radius={R.full} />
                <View style={{ flex: 1, gap: SP.xs + 3, marginLeft: SP.sm + 2 }}>
                  <Shimmer width="50%" height={11} radius={R.xs} />
                  <Shimmer width="90%" height={11} radius={R.xs} />
                  <Shimmer width="75%" height={11} radius={R.xs} />
                </View>
              </>
            ) : comments[0] ? (
              <>
                {comments[0].authorAvatar
                  ? <Image source={{ uri: comments[0].authorAvatar }} style={s.commentAvatar} />
                  : <View style={s.commentAvatarPlaceholder}><UserCircle size={28} color={C.muted} weight="regular" /></View>
                }
                <View style={s.commentBody}>
                  <View style={s.commentAuthorRow}>
                    <Text style={s.commentAuthor}>{comments[0].author}</Text>
                    <Text style={s.commentTime}>{comments[0].publishedAt}</Text>
                  </View>
                  <Text style={s.commentText} numberOfLines={commentsExpanded ? 100 : 2}>{comments[0].text}</Text>
                </View>
              </>
            ) : null}
          </View>

          {/* Expanded comments */}
          {!isLoading && commentsExpanded && comments.slice(1).map((item: any) => (
            <View key={item.id} style={[s.commentRow, { borderTopWidth: 1, borderTopColor: C.border, paddingTop: SP.md }]}>
              {item.authorAvatar
                ? <Image source={{ uri: item.authorAvatar }} style={s.commentAvatar} />
                : <View style={s.commentAvatarPlaceholder}><UserCircle size={28} color={C.muted} weight="regular" /></View>
              }
              <View style={s.commentBody}>
                <View style={s.commentAuthorRow}>
                  <Text style={s.commentAuthor}>{item.author}</Text>
                  {item.isChannelOwner && <View style={s.ownerBadge}><Text style={s.ownerBadgeTxt}>Creator</Text></View>}
                  <Text style={s.commentTime}>{item.publishedAt}</Text>
                </View>
                <Text style={s.commentText} numberOfLines={4}>{item.text}</Text>
                {item.likes && item.likes !== "0" && (
                  <View style={s.commentLikesRow}>
                    <ThumbsUp size={11} color={C.muted} weight="regular" />
                    <Text style={s.commentLikes}>{item.likes}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </TouchableOpacity>

        {/* ════ RELATED ════ */}
        <View style={[s.relatedSection, { backgroundColor: col.bg }]}>
          <View style={s.relHeader}>
            {isLoading
              ? <Shimmer width={70} height={14} radius={R.xs} />
              : <Text style={[s.relTitle, { color: col.white }]}>Up next</Text>
            }
          </View>
          {isLoading
            ? [1, 2, 3, 4].map((i) => (
                <View key={i} style={s.relSkeletonRow}>
                  <Shimmer width={136} height={80} radius={R.md} />
                  <View style={{ flex: 1, gap: SP.xs + 3 }}>
                    <Shimmer width="90%" height={12} radius={R.xs} />
                    <Shimmer width="70%" height={12} radius={R.xs} />
                    <Shimmer width="50%" height={10} radius={R.xs} />
                  </View>
                </View>
              ))
            : related.map((item) => <RelatedCard key={item.id} video={item} />)
          }
          {loadingMoreRelated && (
            <ActivityIndicator size="small" color={C.red} style={{ marginVertical: 16 }} />
          )}
          {!isLoading && !loadingMoreRelated && hasMoreRelated && (
            <TouchableOpacity
              style={{ alignItems: "center", paddingVertical: 14 }}
              onPress={() => fetchMoreRelated()}
            >
              <Text style={{ color: C.muted, fontSize: T.base }}>Load more</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 140 }} />
      </ScrollView>

      {/* ── Quality sheet modal ── */}
      <Modal
        visible={showQualityPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQualityPicker(false)}
      >
        <TouchableOpacity
          style={qs.overlay}
          activeOpacity={1}
          onPress={() => setShowQualityPicker(false)}
        >
          <View style={qs.sheet}>
            <View style={qs.handle} />
            <Text style={qs.sheetTitle}>Quality</Text>
            <FlatList
              data={qualities}
              keyExtractor={(item) => item.quality}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={qs.row}
                  onPress={() => {
                    setSelectedQuality(item.label);
                    setShowQualityPicker(false);
                    fetchStream(item.quality);
                  }}
                >
                  <Text style={[qs.rowLabel, item.label === selectedQuality && qs.rowLabelActive]}>
                    {item.label}
                  </Text>
                  {item.label === selectedQuality && (
                    <Check size={16} color={C.red} weight="bold" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Action pill ──────────────────────────────────────────────────────
function ActionPill({
  icon: Icon, label, active = false, onPress,
}: {
  icon: any; label: string; active?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[ap.pill, active && ap.pillActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Icon size={16} color={active ? C.white : C.muted} weight={active ? "fill" : "regular"} />
      <Text style={[ap.label, active && ap.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const ap = StyleSheet.create({
  pill: {
    flexDirection: "row", alignItems: "center", gap: SP.sm - 2,
    paddingHorizontal: SP.lg - 2, paddingVertical: SP.sm + 1,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  pillActive: {
    backgroundColor: "rgba(255,255,255,0.11)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  label: { color: C.muted, fontSize: T.base, fontWeight: "500" },
  labelActive: { color: C.white },
});

// ─── Related card (vertical list) ────────────────────────────────────
function RelatedCard({ video }: { video: VideoData }) {
  const router = useRouter();
  const isLive = video.duration === "LIVE" || video.isLive;

  return (
    <TouchableOpacity
      style={rc.card}
      onPress={() => router.push(`/player/${video.id}`)}
      activeOpacity={0.85}
    >
      <View style={rc.thumbWrap}>
        <Image source={{ uri: video.thumbnail }} style={rc.thumb} resizeMode="cover" />
        <View style={rc.thumbOverlay} />
        {isLive ? (
          <View style={rc.liveBadge}>
            <Text style={rc.liveTxt}>● LIVE</Text>
          </View>
        ) : video.duration ? (
          <View style={rc.durBadge}>
            <Text style={rc.durTxt}>{video.duration}</Text>
          </View>
        ) : null}
        <View style={rc.playDot} />
      </View>

      <View style={rc.info}>
        <Text style={rc.title} numberOfLines={2}>{video.title}</Text>
        <Text style={rc.channel} numberOfLines={1}>{video.channelName}</Text>
        <Text style={rc.meta} numberOfLines={1}>
          {[video.viewCount, video.publishedAt].filter(Boolean).join(" · ")}
        </Text>
      </View>

      <TouchableOpacity style={rc.moreBtn} hitSlop={10}>
        <Text style={rc.moreDots}>⋮</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const rc = StyleSheet.create({
  card: {
    flexDirection: "row",
    paddingHorizontal: SP.lg - 2,
    paddingVertical: SP.sm + 2,
    gap: SP.md,
    alignItems: "flex-start",
  },
  thumbWrap: {
    width: 136, height: 80,
    borderRadius: R.lg,          // consistent R.lg = 16
    overflow: "hidden",
    backgroundColor: C.card,
    flexShrink: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 12,
    elevation: 8,
  },
  thumb: { width: "100%", height: "100%" },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  liveBadge: {
    position: "absolute", top: SP.sm - 2, left: SP.sm - 2,
    backgroundColor: C.red,
    borderRadius: R.xs,
    paddingHorizontal: SP.sm - 2, paddingVertical: 2,
  },
  liveTxt: { color: C.white, fontSize: T.xs - 1, fontWeight: "800", letterSpacing: 0.5 },
  durBadge: {
    position: "absolute", bottom: SP.xs + 1, right: SP.xs + 1,
    backgroundColor: "rgba(0,0,0,0.80)",
    borderRadius: R.xs, paddingHorizontal: SP.xs + 1, paddingVertical: 2,
  },
  durTxt: { color: C.white, fontSize: T.xs, fontWeight: "600" },
  playDot: {
    position: "absolute", top: SP.sm - 2, right: SP.sm - 2,
    width: 6, height: 6, borderRadius: R.full,
    backgroundColor: C.red,
    shadowColor: C.red, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 4,
  },
  info: { flex: 1, justifyContent: "flex-start", paddingTop: 1 },
  title: { color: C.white, fontSize: T.md, fontWeight: "600", lineHeight: 18, marginBottom: SP.xs + 1 },
  channel: { color: C.muted, fontSize: T.base, marginBottom: 3 },
  meta: { color: C.dim, fontSize: T.sm },
  moreBtn: { paddingTop: SP.xs, paddingLeft: 2 },
  moreDots: { color: C.muted, fontSize: T.xl },
});

// ─── Horizontal related card (unused strip, kept for future) ─────────
function RelatedCardH({ video }: { video: VideoData }) {
  const router = useRouter();
  const isLive = video.duration === "LIVE" || video.isLive;

  return (
    <TouchableOpacity
      style={rch.card}
      onPress={() => router.push(`/player/${video.id}`)}
      activeOpacity={0.85}
    >
      <View style={rch.thumbWrap}>
        <Image source={{ uri: video.thumbnail }} style={rch.thumb} resizeMode="cover" />
        <View style={rch.thumbOverlay} />
        {isLive ? (
          <View style={rch.liveBadge}><Text style={rch.liveTxt}>● LIVE</Text></View>
        ) : video.duration ? (
          <View style={rch.durBadge}><Text style={rch.durTxt}>{video.duration}</Text></View>
        ) : null}
      </View>
      <Text style={rch.title} numberOfLines={2}>{video.title}</Text>
      <Text style={rch.channel} numberOfLines={1}>{video.channelName}</Text>
    </TouchableOpacity>
  );
}

const rch = StyleSheet.create({
  card: { width: 148, marginRight: SP.md, flexShrink: 0 },
  thumbWrap: {
    width: 148, height: 88,
    borderRadius: R.md,          // was 12 — consistent R.md = 12
    overflow: "hidden",
    backgroundColor: C.card,
    marginBottom: SP.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 8,
    elevation: 6,
  },
  thumb: { width: "100%", height: "100%" },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  liveBadge: {
    position: "absolute", top: SP.xs + 1, left: SP.xs + 1,
    backgroundColor: C.red, borderRadius: R.xs,
    paddingHorizontal: SP.xs + 1, paddingVertical: 2,
  },
  liveTxt: { color: C.white, fontSize: T.xs - 1, fontWeight: "800" },
  durBadge: {
    position: "absolute", bottom: SP.xs, right: SP.xs,
    backgroundColor: "rgba(0,0,0,0.82)",
    borderRadius: R.xs, paddingHorizontal: SP.xs + 1, paddingVertical: 2,
  },
  durTxt: { color: C.white, fontSize: T.xs, fontWeight: "600" },
  title: { color: C.white, fontSize: T.base, fontWeight: "600", lineHeight: 17, marginBottom: 3 },
  channel: { color: C.muted, fontSize: T.sm },
});

// ─── Main styles ──────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // ── Video player ──
  playerWrap: {
    width: W,
    height: VIDEO_H,
    backgroundColor: "#000",
    borderBottomLeftRadius: R.xl,   // consistent R.xl = 20
    borderBottomRightRadius: R.xl,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.50,
    shadowRadius: 28,
    elevation: 20,
  },
  playerWrapFS: {
    height: SCREEN_H,
    borderRadius: 0,
    position: "absolute",
    top: 0, left: 0,
    zIndex: 999,
  },
  playerBg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  playerBgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.20)",
  },
  video: { width: "100%", height: "100%" },
  loaderBox: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#000",
  },
  overlayCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  errTxt: { color: C.muted, fontSize: T.md, textAlign: "center", paddingHorizontal: SP.xxl, marginBottom: SP.md },
  retryPill: {
    paddingHorizontal: SP.xxl, paddingVertical: SP.sm + 1,
    backgroundColor: C.red, borderRadius: R.full,
  },
  retryTxt: { color: C.white, fontSize: T.md, fontWeight: "700" },

  // ── Controls overlay ──
  ctrlOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.overlay,
    justifyContent: "space-between",
    paddingTop: SP.sm, paddingBottom: SP.sm + 2,
  },
  ctrlTop: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SP.sm, gap: SP.sm - 2,
  },
  ctrlGlassBtn: {
    width: 36, height: 36, borderRadius: R.full,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center", justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  ctrlTitle: {
    flex: 1, color: C.white,
    fontSize: T.md, fontWeight: "500", letterSpacing: 0.1,
  },
  ctrlCenter: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 28,
  },
  skipGlass: {
    width: 52, height: 52, borderRadius: R.full,
    backgroundColor: "rgba(0,0,0,0.32)",
    alignItems: "center", justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
  },
  skipLabel: { color: C.white, fontSize: T.xs - 1, fontWeight: "600", marginTop: -4, opacity: 0.75 },
  playGlass: {
    width: 68, height: 68, borderRadius: R.full,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.20)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.50,
    shadowRadius: 12,
    elevation: 10,
  },
  ctrlBottom: { paddingHorizontal: SP.md, paddingBottom: SP.xs },
  trackWrap: {
    height: 3, marginBottom: SP.sm + 1,
    position: "relative", justifyContent: "center",
  },
  trackBg: {
    position: "absolute", left: 0, right: 0,
    height: 3, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  trackFill: {
    position: "absolute", left: 0,
    height: 3, borderRadius: 2,
    backgroundColor: C.red,
  },
  trackDot: {
    position: "absolute",
    width: 12, height: 12, borderRadius: R.full,
    backgroundColor: C.red,
    marginLeft: -6, top: -4.5,
    shadowColor: C.red,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 6,
    elevation: 4,
  },
  timeRow: { flexDirection: "row", alignItems: "center", gap: SP.xs },
  timeTxt: { color: C.white, fontSize: T.sm, fontWeight: "500" },
  timeDivider: { color: C.muted, fontSize: T.sm },
  ctrlIconBtn: {
    width: 30, height: 30, borderRadius: R.full,
    alignItems: "center", justifyContent: "center",
  },

  // ── Info panel ──
  infoPanel: { paddingHorizontal: SP.lg, paddingTop: SP.lg, paddingBottom: SP.xs },
  loadCenter: { paddingVertical: 28, alignItems: "center" },
  titleRow: {
    flexDirection: "row", alignItems: "flex-start",
    justifyContent: "space-between", gap: SP.sm, marginBottom: SP.sm,
  },
  titleTxt: {
    flex: 1, color: C.white,
    fontSize: T.xxl - 1, fontWeight: "700", lineHeight: 24, letterSpacing: -0.2,
  },
  caretIcon: { marginTop: SP.xs + 1 },
  caretUp: { transform: [{ rotate: "180deg" }] },

  statsTxt: { color: C.muted, fontSize: T.base, marginBottom: SP.lg - 2, letterSpacing: 0.1 },

  descBox: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: SP.lg - 2,
    marginBottom: SP.lg - 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  descTxt: { color: C.muted, fontSize: T.md, lineHeight: 20 },

  actionsRow: { gap: SP.sm, paddingRight: SP.xs, marginBottom: SP.lg },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginVertical: SP.lg - 2,
  },

  // ── Channel card ──
  channelCard: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.card,
    borderRadius: R.xl,            // consistent R.xl = 20
    padding: SP.lg - 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: SP.xs,
  },
  channelLeft: { flexDirection: "row", alignItems: "center", gap: SP.md, flex: 1 },
  avatarRing: {
    width: 46, height: 46, borderRadius: R.full,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  avatarImg: { width: 46, height: 46, borderRadius: R.full },
  channelMeta: { flex: 1 },
  channelNameRow: { flexDirection: "row", alignItems: "center", gap: SP.xs + 1, marginBottom: 3 },
  channelName: { color: C.white, fontSize: T.base, fontWeight: "700", letterSpacing: 0.1 },
  checkBadge: {
    width: 15, height: 15, borderRadius: R.full,
    backgroundColor: C.muted,
    alignItems: "center", justifyContent: "center",
  },
  subCount: { color: C.muted, fontSize: T.base },

  subGroup: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  bellBtn: {
    width: 40, height: 40, borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  subBtn: {
    paddingHorizontal: SP.lg + 2, paddingVertical: SP.sm + 2,
    backgroundColor: C.red, borderRadius: R.full,
    shadowColor: C.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.40,
    shadowRadius: 10,
    elevation: 8,
  },
  subBtnSub: {
    backgroundColor: C.surface,
    shadowOpacity: 0, elevation: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  subBtnTxt: { color: C.white, fontSize: T.md, fontWeight: "700" },
  subBtnTxtSub: { color: C.muted },

  // ── Comments ──
  commentsBox: {
    marginHorizontal: SP.lg - 2,
    marginTop: SP.sm,
    marginBottom: SP.md,
    backgroundColor: C.surface,
    borderRadius: R.lg,            // was 16 — consistent R.lg = 16
    padding: SP.lg - 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  commentsBoxHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: SP.sm + 2,
  },
  commentsBoxRight: { flexDirection: "row", alignItems: "center", gap: SP.sm - 2 },
  commentsTitle: { color: C.white, fontSize: T.lg, fontWeight: "700" },
  commentsCount: { color: C.muted, fontSize: T.md },

  // ── Related ──
  relatedSection: { paddingTop: SP.xs, paddingBottom: SP.sm },
  relHeader: { paddingHorizontal: SP.lg, paddingBottom: SP.sm + 2 },
  relTitle: { color: C.white, fontSize: T.xl - 1, fontWeight: "700", letterSpacing: 0.1 },
  relSkeletonRow: {
    flexDirection: "row", gap: SP.md, alignItems: "center",
    paddingHorizontal: SP.lg - 2, paddingVertical: SP.sm + 2,
  },

  // ── Comment rows ──
  commentRow: {
    flexDirection: "row", gap: SP.sm + 2,
    paddingHorizontal: SP.lg, paddingBottom: SP.lg, alignItems: "flex-start",
  },
  commentAvatar: { width: 32, height: 32, borderRadius: R.full, marginTop: 1 },
  commentAvatarPlaceholder: {
    width: 32, height: 32, borderRadius: R.full, marginTop: 1,
    backgroundColor: C.surface, alignItems: "center", justifyContent: "center",
  },
  commentBody: { flex: 1 },
  commentAuthorRow: {
    flexDirection: "row", alignItems: "center", gap: SP.sm - 2, marginBottom: 3, flexWrap: "wrap",
  },
  commentAuthor: { color: C.white, fontSize: T.base, fontWeight: "600" },
  ownerBadge: {
    backgroundColor: C.surface2, borderRadius: R.xs,
    paddingHorizontal: SP.xs + 1, paddingVertical: 2,
  },
  ownerBadgeTxt: { color: C.muted, fontSize: T.xs, fontWeight: "600" },
  commentTime: { color: C.dim, fontSize: T.sm },
  commentText: { color: C.muted, fontSize: T.md, lineHeight: 18 },
  commentLikesRow: { flexDirection: "row", alignItems: "center", gap: SP.xs, marginTop: SP.sm - 2 },
  commentLikes: { color: C.muted, fontSize: T.sm },
});

// ─── Quality modal styles ─────────────────────────────────────────────
const qs = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.70)",
  },
  sheet: {
    backgroundColor: "#161616",
    borderTopLeftRadius: R.xxl,    // consistent R.xxl = 28
    borderTopRightRadius: R.xxl,
    paddingBottom: 36, minHeight: 200,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center", marginTop: SP.md, marginBottom: SP.lg,
  },
  sheetTitle: {
    color: C.white, fontSize: T.xl,
    fontWeight: "700", paddingHorizontal: SP.xl, marginBottom: SP.sm,
  },
  row: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.xl, paddingVertical: SP.lg - 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  rowLabel: { color: C.muted, fontSize: T.xl - 1, fontWeight: "500" },
  rowLabelActive: { color: C.white, fontWeight: "700" },
});
