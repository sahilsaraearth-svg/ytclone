import { Hono } from "hono";
import vm from "vm";
import crypto from "crypto";
import { spawn } from "child_process";
import { Innertube, Platform } from "youtubei.js";

// Provide Node.js vm-based JS evaluator for stream URL deciphering
(Platform as any).load({
  runtime: "node",
  server: true,
  sha1Hash: async (data: string) =>
    crypto.createHash("sha1").update(data).digest("hex"),
  uuidv4: () => crypto.randomUUID(),
  fetch: globalThis.fetch,
  Headers: globalThis.Headers,
  Request: globalThis.Request,
  Response: globalThis.Response,
  eval: async (script: string, env: Record<string, unknown>) => {
    const sandbox = { ...env };
    const context = vm.createContext(sandbox);
    try {
      vm.runInContext(script, context);
    } catch {
      // ignore side-effect errors
    }
    return sandbox;
  },
} as any);

// Singleton Innertube instance
let ytInstance: Innertube | null = null;
let ytInitializing = false;
let ytInitPromise: Promise<Innertube> | null = null;

async function getYT(): Promise<Innertube> {
  if (ytInstance) return ytInstance;
  if (ytInitPromise) return ytInitPromise;

  ytInitPromise = Innertube.create({
    generate_session_locally: true,
    retrieve_player: true,
  }).then((yt) => {
    ytInstance = yt;
    // Pre-warm trending cache in background — home screen hits instantly
    prewarmTrending(yt).catch(() => {});
    return yt;
  });

  return ytInitPromise;
}

async function prewarmTrending(yt: Innertube) {
  try {
    const videos: any[] = [];
    const seen = new Set<string>();
    for (const topic of TRENDING_TOPICS.slice(0, 3)) {
      if (videos.length >= 30) break;
      try {
        const results = await yt.search(topic, { type: "video" });
        for (const item of results.videos ?? []) {
          const v = extractVideoData(item);
          if (v && !seen.has(v.id)) { seen.add(v.id); videos.push(v); }
          if (videos.length >= 30) break;
        }
      } catch { /* skip */ }
    }
    const result = { videos, category: "All", page: 0, hasMore: true };
    trendingCache.set("trend:All:0", { data: result, expiresAt: Date.now() + TREND_TTL });
    trendingCache.set("trend:trending now:0", { data: result, expiresAt: Date.now() + TREND_TTL });
    console.log("[prewarm] trending cache ready —", videos.length, "videos");
  } catch (e) {
    console.warn("[prewarm] failed:", e);
  }
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(views: number): string {
  if (!views) return "";
  if (views >= 1_000_000_000) return `${(views / 1_000_000_000).toFixed(1)}B views`;
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K views`;
  return `${views} views`;
}

function extractVideoData(video: any): any {
  try {
    const id = video.id ?? video.video_id ?? null;
    if (!id || typeof id !== "string") return null;

    const thumbnail =
      video.thumbnails?.[video.thumbnails.length - 1]?.url ??
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    const title = video.title?.text ?? video.title ?? "Unknown Title";

    const channelName =
      video.author?.name ??
      video.short_byline_text?.runs?.[0]?.text ??
      "Unknown Channel";

    const channelAvatar = video.author?.thumbnails?.[0]?.url ?? null;
    const channelId: string = video.author?.id ?? video.channel_id ?? "";

    const durationSec = video.duration?.seconds ?? null;
    const duration =
      video.duration?.text ??
      video.length_text?.simpleText ??
      (durationSec ? formatDuration(durationSec) : "");

    // Parse raw view count text → format as K/M/B
    const rawViewText: string =
      video.view_count?.text ??
      video.short_view_count?.text ??
      (video.view_count ? String(video.view_count) : "");
    const rawViewNum = parseInt(rawViewText.replace(/[^0-9]/g, ""), 10);
    const viewCount = !isNaN(rawViewNum) && rawViewNum > 0
      ? formatViews(rawViewNum)
      : rawViewText;

    const publishedAt =
      video.published?.text ??
      video.publishedTimeText?.simpleText ??
      "";

    return {
      id,
      title,
      thumbnail,
      channelName,
      channelAvatar,
      channelId,
      duration,
      viewCount,
      publishedAt,
    };
  } catch {
    return null;
  }
}

// ── Generic TTL cache helper ──────────────────────────────────────────────────
const videoInfoCache = new Map<string, { data: any; expiresAt: number }>();
const trendingCache  = new Map<string, { data: any; expiresAt: number }>();
const searchCache    = new Map<string, { data: any; expiresAt: number }>();
const TREND_TTL = 15 * 60 * 1000; // 15 min
const SEARCH_TTL = 5 * 60 * 1000; // 5 min

// ── Stream URL cache ──────────────────────────────────────────────────────────
// ── Stream cache ──────────────────────────────────────────────────────────────
interface FormatEntry {
  quality: string;   // "720", "480", etc.
  label: string;     // "720p"
  videoUrl: string;
  audioUrl: string;  // always present — best m4a audio track
  hasAudio: boolean; // true = progressive (single stream), false = needs mux
}
interface StreamInfo {
  formats: FormatEntry[];
  expiresAt: number;
}
const streamCache = new Map<string, StreamInfo>();

async function getStreamInfo(id: string): Promise<StreamInfo> {
  const cached = streamCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const formats: FormatEntry[] = [];

  await new Promise<void>((resolve) => {
    const proc = spawn("yt-dlp", [
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      `https://www.youtube.com/watch?v=${id}`,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let out = "";
    proc.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", () => {
      try {
        const data = JSON.parse(out.trim());
        const rawFmts: any[] = data.formats ?? [];

        // Best audio-only track (m4a, highest abr)
        const audioFmts = rawFmts
          .filter((f) => f.vcodec === "none" && f.acodec !== "none" && f.ext === "m4a" && f.url)
          .sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0));
        const bestAudioUrl: string = audioFmts[0]?.url ?? "";

        // Video formats — group by height, keep best per height
        const videoMap = new Map<number, any>();
        for (const f of rawFmts) {
          if (!f.url || !f.height) continue;
          if (f.vcodec === "none" || !f.vcodec) continue;
          if (f.ext !== "mp4") continue;
          const h: number = f.height;
          const existing = videoMap.get(h);
          // Prefer progressive (has audio), then higher bitrate
          const score = (f.acodec && f.acodec !== "none" ? 10000 : 0) + (f.vbr ?? f.tbr ?? 0);
          const existScore = existing
            ? (existing.acodec && existing.acodec !== "none" ? 10000 : 0) + (existing.vbr ?? existing.tbr ?? 0)
            : -1;
          if (score > existScore) videoMap.set(h, f);
        }

        for (const [h, f] of videoMap) {
          const isProgressive = f.acodec && f.acodec !== "none";
          formats.push({
            quality: String(h),
            label: `${h}p`,
            videoUrl: f.url,
            audioUrl: isProgressive ? f.url : bestAudioUrl,
            hasAudio: isProgressive,
          });
        }
      } catch { /* ignore parse errors */ }
      resolve();
    });
    proc.on("error", () => resolve());
    setTimeout(() => { try { proc.kill(); } catch {} resolve(); }, 14000);
  });

  formats.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

  const result: StreamInfo = { formats, expiresAt: Date.now() + 4 * 60 * 1000 };
  if (formats.length > 0) streamCache.set(id, result);
  return result;
}

// yt-dlp URL extraction (async, used as fallback)
async function getYtDlpUrl(id: string, height: string): Promise<string | null> {
  return new Promise((resolve) => {
    const qualityFilter = `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${height}][ext=mp4]/best[ext=mp4]/best`;
    const proc = spawn("yt-dlp", [
      "-f", qualityFilter,
      "--no-playlist", "--no-warnings",
      "--get-url",
      `https://www.youtube.com/watch?v=${id}`,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let out = "";
    proc.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", () => {
      const url = out.trim().split("\n")[0] ?? null;
      resolve(url || null);
    });
    proc.on("error", () => resolve(null));
    // Timeout after 8s
    setTimeout(() => { try { proc.kill(); } catch {} resolve(null); }, 8000);
  });
}

// Legacy compat
async function getStreamUrl(id: string): Promise<string | null> {
  const info = await getStreamInfo(id);
  return info.formats[0]?.videoUrl ?? null;
}

// Trending topics to search for "home feed" simulation
const TRENDING_TOPICS = [
  "trending now", "music 2024", "gaming", "viral videos", "news today",
  "comedy", "sports highlights", "tech review", "movies trailer", "cooking",
  "travel vlog", "fitness workout", "science explained", "anime", "finance tips",
  "street food", "car review", "education", "fashion", "dance",
];

// ── Static config served as API so mobile never has hardcoded values ─────────

const HOME_CATEGORIES = [
  { id: "All",      label: "All" },
  { id: "Gaming",   label: "Gaming" },
  { id: "Music",    label: "Music" },
  { id: "News",     label: "News" },
  { id: "Live",     label: "Live" },
  { id: "Coding",   label: "Coding" },
  { id: "Tech",     label: "Tech" },
  { id: "Design",   label: "Design" },
  { id: "Fitness",  label: "Fitness" },
  { id: "Comedy",   label: "Comedy" },
  { id: "Food",     label: "Food" },
  { id: "Travel",   label: "Travel" },
  { id: "Science",  label: "Science" },
];

const EXPLORE_TABS = [
  { key: "trending now", label: "Trending", icon: "TrendUp" },
  { key: "Music",        label: "Music",    icon: "MusicNote" },
  { key: "Gaming",       label: "Gaming",   icon: "GameController" },
  { key: "Learning",     label: "Learning", icon: "Lightbulb" },
  { key: "Tech",         label: "Tech",     icon: "Television" },
  { key: "Fitness",      label: "Fitness",  icon: "Barbell" },
];

const DATE_FILTER_OPTIONS  = ["Any time", "Today", "This week", "This month", "This year"];
const SORT_FILTER_OPTIONS  = ["Relevance", "Upload date", "View count", "Rating"];

// Kick off YT init + prewarm immediately on server start
getYT().catch(() => {});

export const youtube = new Hono()
  // GET /api/categories — home chip list
  .get("/categories", (c) => c.json({ categories: HOME_CATEGORIES }, 200))

  // GET /api/explore-config — search tabs + filter options
  .get("/explore-config", (c) =>
    c.json({
      tabs: EXPLORE_TABS,
      dateOptions: DATE_FILTER_OPTIONS,
      sortOptions: SORT_FILTER_OPTIONS,
    }, 200)
  )

  // GET /api/trending?category=All&page=0 — paginated trending feed
  .get("/trending", async (c) => {
    const category = (c.req.query("category") ?? "All").trim();
    const page     = parseInt(c.req.query("page") ?? "0", 10) || 0;
    const cacheKey = `trend:${category}:${page}`;
    const hit = trendingCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return c.json(hit.data, 200);
    try {
      const ytClient = await getYT();
      const videos: any[] = [];
      const seen = new Set<string>();
      const PER_PAGE = 15;

      if (category && category !== "All" && category !== "trending now") {
        // Specific category — offset via page (each page = different query variant)
        const queries = [`${category}`, `best ${category}`, `top ${category} 2024`, `${category} highlights`, `${category} viral`];
        const q = queries[page % queries.length];
        const results = await ytClient.search(q, { type: "video" });
        for (const item of results.videos ?? []) {
          const v = extractVideoData(item);
          if (v && !seen.has(v.id)) { seen.add(v.id); videos.push(v); }
          if (videos.length >= PER_PAGE) break;
        }
      } else {
        // All — each page uses a different slice of TRENDING_TOPICS
        const topicsPerPage = 3;
        const start = (page * topicsPerPage) % TRENDING_TOPICS.length;
        const topics = [
          ...TRENDING_TOPICS.slice(start, start + topicsPerPage),
          ...TRENDING_TOPICS.slice(0, Math.max(0, (start + topicsPerPage) - TRENDING_TOPICS.length)),
        ];
        for (const topic of topics) {
          if (videos.length >= PER_PAGE) break;
          try {
            const results = await ytClient.search(topic, { type: "video" });
            for (const item of results.videos ?? []) {
              const v = extractVideoData(item);
              if (v && !seen.has(v.id)) { seen.add(v.id); videos.push(v); }
              if (videos.length >= PER_PAGE) break;
            }
          } catch { /* skip */ }
        }
      }

      const result = { videos, category, page, hasMore: videos.length >= PER_PAGE };
      trendingCache.set(cacheKey, { data: result, expiresAt: Date.now() + TREND_TTL });
      return c.json(result, 200);
    } catch (err: any) {
      console.error("Trending error:", err.message);
      return c.json({ error: "Failed to fetch trending", videos: [] }, 500);
    }
  })

  // GET /api/search?q=query
  .get("/search", async (c) => {
    const q = c.req.query("q") ?? "";
    if (!q.trim()) return c.json({ videos: [] }, 200);

    const cacheKey = `search:${q.trim().toLowerCase()}`;
    const hit = searchCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return c.json(hit.data, 200);

    try {
      const ytClient = await getYT();
      const results = await ytClient.search(q, { type: "video" });

      const videos: any[] = [];
      for (const item of results.videos ?? []) {
        const v = extractVideoData(item);
        if (v) videos.push(v);
        if (videos.length >= 20) break;
      }

      const result = { videos, query: q };
      searchCache.set(cacheKey, { data: result, expiresAt: Date.now() + SEARCH_TTL });
      return c.json(result, 200);
    } catch (err: any) {
      console.error("Search error:", err.message);
      return c.json({ error: "Search failed", videos: [] }, 500);
    }
  })

  // GET /api/video/:id — metadata + related (cached 10 min)
  .get("/video/:id", async (c) => {
    const id = c.req.param("id");
    try {
      // Return cached if fresh
      const cached = videoInfoCache.get(id);
      if (cached && cached.expiresAt > Date.now()) {
        return c.json(cached.data, 200);
      }

      const ytClient = await getYT();
      const info = await ytClient.getInfo(id);
      const basic = info.basic_info;
      const secondaryInfo = (info as any).secondary_info;
      const channelAvatar =
        secondaryInfo?.owner?.author?.thumbnails?.[0]?.url ?? null;
      const subscriberCount =
        secondaryInfo?.owner?.subscriber_count?.text ?? "";

      const related: any[] = [];
      for (const item of (info as any).watch_next_feed ?? []) {
        const v = extractVideoData(item);
        if (v) related.push(v);
        if (related.length >= 10) break;
      }

      // Fallback: if watch_next_feed empty, use search results as related
      if (related.length === 0 && basic.title) {
        try {
          const searchResults = await ytClient.search(basic.title, { type: "video" });
          for (const item of searchResults.videos ?? []) {
            const v = extractVideoData(item);
            if (v && v.id !== id) related.push(v);
            if (related.length >= 10) break;
          }
        } catch {
          // silently fail
        }
      }

      // Format publish_date (ISO string) → relative like "3 years ago"
      const rawDate: string | undefined = (basic as any).publish_date;
      let publishedAt = "";
      if (rawDate) {
        try {
          const diff = Date.now() - new Date(rawDate).getTime();
          const secs  = Math.floor(diff / 1000);
          const mins  = Math.floor(secs / 60);
          const hrs   = Math.floor(mins / 60);
          const days  = Math.floor(hrs / 24);
          const weeks = Math.floor(days / 7);
          const months= Math.floor(days / 30);
          const years = Math.floor(days / 365);
          if (years  >= 1) publishedAt = `${years} year${years  > 1 ? "s" : ""} ago`;
          else if (months >= 1) publishedAt = `${months} month${months > 1 ? "s" : ""} ago`;
          else if (weeks  >= 1) publishedAt = `${weeks} week${weeks  > 1 ? "s" : ""} ago`;
          else if (days   >= 1) publishedAt = `${days} day${days    > 1 ? "s" : ""} ago`;
          else if (hrs    >= 1) publishedAt = `${hrs} hour${hrs     > 1 ? "s" : ""} ago`;
          else                  publishedAt = `${mins} minute${mins  > 1 ? "s" : ""} ago`;
        } catch { publishedAt = rawDate; }
      }

      // Channel ID from secondaryInfo or channel_id field
      const channelId: string =
        secondaryInfo?.owner?.author?.id ??
        (basic as any).channel_id ??
        "";

      const result = {
        video: {
          id,
          title: basic.title ?? "Unknown",
          channelName: basic.author ?? "Unknown Channel",
          channelId,
          channelAvatar,
          viewCount: basic.view_count ? formatViews(basic.view_count) : "",
          likes: basic.like_count ?? 0,
          description: basic.short_description ?? "",
          thumbnail:
            basic.thumbnail?.[basic.thumbnail.length - 1]?.url ??
            `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          publishedAt,
          duration: basic.duration ? formatDuration(basic.duration) : "",
          subscriberCount,
        },
        related,
      };

      videoInfoCache.set(id, { data: result, expiresAt: Date.now() + 10 * 60 * 1000 });
      return c.json(result, 200);
    } catch (err: any) {
      console.error("Video info error:", err.message);
      return c.json({ error: "Failed to fetch video info" }, 500);
    }
  })

  // GET /api/related/:id?page=0 — paginated related videos
  .get("/related/:id", async (c) => {
    const id   = c.req.param("id");
    const page = parseInt(c.req.query("page") ?? "0", 10) || 0;
    const cacheKey = `related:${id}:${page}`;
    const hit = videoInfoCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return c.json(hit.data, 200);
    try {
      const ytClient = await getYT();
      // Use trending topics offset by page to simulate infinite related
      const topic = TRENDING_TOPICS[(page * 2) % TRENDING_TOPICS.length];
      const results = await ytClient.search(topic, { type: "video" });
      const videos: any[] = [];
      for (const item of results.videos ?? []) {
        const v = extractVideoData(item);
        if (v && v.id !== id) videos.push(v);
        if (videos.length >= 15) break;
      }
      const result = { videos, page, hasMore: videos.length >= 15 };
      videoInfoCache.set(cacheKey, { data: result, expiresAt: Date.now() + TREND_TTL });
      return c.json(result, 200);
    } catch (err: any) {
      return c.json({ videos: [], page, hasMore: false }, 200);
    }
  })

  // GET /api/comments/:id — top comments for a video
  .get("/comments/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const ytClient = await getYT();
      const commentsData = await ytClient.getComments(id);
      const threads = commentsData.contents ?? [];
      const comments = threads.slice(0, 20).map((thread: any) => {
        const cv = thread.comment;
        if (!cv) return null;
        return {
          id: cv.comment_id ?? "",
          author: cv.author?.name ?? "Unknown",
          authorAvatar: cv.author?.thumbnails?.[0]?.url ?? null,
          text: cv.content?.toString() ?? "",
          likes: cv.like_count ?? "0",
          publishedAt: cv.published_time ?? "",
          isChannelOwner: cv.author_is_channel_owner ?? false,
        };
      }).filter(Boolean);
      return c.json({ comments }, 200);
    } catch (err: any) {
      console.error("Comments error:", err.message);
      return c.json({ comments: [] }, 200);
    }
  })

  // GET /api/stream/:id?quality=720|480|360|auto
  // Returns proxy URL (always has audio) + quality list
  .get("/stream/:id", async (c) => {
    const id = c.req.param("id");
    const wantQuality = c.req.query("quality") ?? "auto";
    // Use X-Forwarded-Host if behind a proxy (Runable tunnel), else fall back to request origin
    const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "localhost:4200";
    const proto = c.req.header("x-forwarded-proto") ?? "http";
    const baseUrl = `${proto}://${host}`;
    try {
      const info = await getStreamInfo(id);
      if (info.formats.length === 0) return c.json({ error: "No playable formats found" }, 404);

      let chosen = info.formats[0];
      if (wantQuality !== "auto") {
        const match = info.formats.find(
          (f) => f.quality === wantQuality || f.label === `${wantQuality}p`
        );
        if (match) chosen = match;
      }

      // Always serve via proxy so muxing happens server-side → audio guaranteed
      const proxyUrl = `${baseUrl}/api/proxy/${id}?quality=${chosen.quality}`;

      return c.json({
        url: proxyUrl,
        quality: chosen.label,
        hasAudio: true,
        // Return ALL quality proxy URLs so mobile can switch instantly without another API call
        availableQualities: info.formats.map((f) => ({
          quality: f.quality,
          label: f.label,
          hasAudio: true,
          proxyUrl: `${baseUrl}/api/proxy/${id}?quality=${f.quality}`,
        })),
      }, 200);
    } catch (err: any) {
      console.error("Stream error:", err.message);
      return c.json({ error: "Failed to get stream URL", details: err.message }, 500);
    }
  })

  // GET /api/formats/:id — available quality list
  .get("/formats/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const info = await getStreamInfo(id);
      return c.json({
        formats: info.formats.map((f) => ({ quality: f.quality, label: f.label, hasAudio: true })),
      }, 200);
    } catch (err: any) {
      return c.json({ error: "Failed to get formats", details: err.message }, 500);
    }
  })

  // GET /api/dash/:id — generates DASH manifest with direct YT CDN URLs
  // React-native-video handles range requests natively — zero ffmpeg, zero mux delay
  .get("/dash/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const info = await getStreamInfo(id);
      if (info.formats.length === 0) return c.json({ error: "No formats" }, 404);

      // Build representation entries for each video quality
      const videoReps = info.formats
        .filter((f) => !f.hasAudio) // adaptive video-only
        .map((f) => {
          const h = parseInt(f.quality);
          const w = Math.round(h * (16 / 9));
          return `<Representation id="v${f.quality}" mimeType="video/mp4" codecs="avc1.64001f" bandwidth="2000000" width="${w}" height="${h}">
            <BaseURL>${encodeURI(f.videoUrl)}</BaseURL>
            <SegmentBase indexRange="0-999"><Initialization range="0-999"/></SegmentBase>
          </Representation>`;
        }).join("\n");

      // Best audio
      const audioUrl = info.formats.find((f) => !f.hasAudio)?.audioUrl ?? info.formats[0].audioUrl;
      const audioRep = `<Representation id="a0" mimeType="audio/mp4" codecs="mp4a.40.2" bandwidth="128000">
        <BaseURL>${encodeURI(audioUrl)}</BaseURL>
        <SegmentBase indexRange="0-999"><Initialization range="0-999"/></SegmentBase>
      </Representation>`;

      // Also add progressive 360p as fallback AdaptationSet
      const progressive = info.formats.find((f) => f.hasAudio);
      const progRep = progressive ? `<AdaptationSet mimeType="video/mp4" subsegmentAlignment="true">
        <Representation id="prog360" mimeType="video/mp4" codecs="avc1.42001e" bandwidth="500000" width="640" height="360">
          <BaseURL>${encodeURI(progressive.videoUrl)}</BaseURL>
          <SegmentBase indexRange="0-999"><Initialization range="0-999"/></SegmentBase>
        </Representation>
      </AdaptationSet>` : "";

      const dash = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" minBufferTime="PT2S">
  <Period>
    <AdaptationSet mimeType="video/mp4" subsegmentAlignment="true">
      ${videoReps}
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" subsegmentAlignment="true">
      ${audioRep}
    </AdaptationSet>
    ${progRep}
  </Period>
</MPD>`;

      return new Response(dash, {
        headers: {
          "Content-Type": "application/dash+xml",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
      });
    } catch (err: any) {
      return c.json({ error: "DASH manifest failed", details: err.message }, 500);
    }
  })

  // GET /api/ytproxy?url=<encoded> — transparent range proxy for YouTube CDN
  // Needed because YT CDN blocks direct mobile requests without proper headers
  .get("/ytproxy", async (c) => {
    const url = c.req.query("url");
    if (!url) return c.json({ error: "url param required" }, 400);
    try {
      const rangeHeader = c.req.header("range");
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/91.0",
        "Referer": "https://www.youtube.com/",
      };
      if (rangeHeader) headers["Range"] = rangeHeader;
      const upstream = await fetch(decodeURIComponent(url), { headers });
      const status = upstream.status;
      const resHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
      };
      const ct = upstream.headers.get("content-type");
      if (ct) resHeaders["Content-Type"] = ct;
      const cl = upstream.headers.get("content-length");
      if (cl) resHeaders["Content-Length"] = cl;
      const cr = upstream.headers.get("content-range");
      if (cr) resHeaders["Content-Range"] = cr;
      return new Response(upstream.body, { status, headers: resHeaders });
    } catch (err: any) {
      return c.json({ error: "Proxy failed", details: err.message }, 500);
    }
  })

  // GET /api/proxy/:id?quality=480 — kept for compatibility, now proxies single stream
  .get("/proxy/:id", async (c) => {
    const id = c.req.param("id");
    const quality = c.req.query("quality") ?? "360";
    try {
      const info = await getStreamInfo(id);
      const fmt = info.formats.find(
        (f) => f.quality === quality || f.label === `${quality}p`
      ) ?? info.formats.find((f) => f.hasAudio) ?? info.formats[0];

      if (!fmt) return c.json({ error: "No formats found" }, 404);

      const targetUrl = fmt.hasAudio ? fmt.videoUrl : fmt.videoUrl;
      const rangeHeader = c.req.header("range");
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/91.0",
        "Referer": "https://www.youtube.com/",
      };
      if (rangeHeader) headers["Range"] = rangeHeader;
      const upstream = await fetch(targetUrl, { headers });
      const status = upstream.status;
      const resHeaders: Record<string, string> = {
        "Content-Type": "video/mp4",
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
      };
      const cl = upstream.headers.get("content-length");
      if (cl) resHeaders["Content-Length"] = cl;
      const cr = upstream.headers.get("content-range");
      if (cr) resHeaders["Content-Range"] = cr;
      return new Response(upstream.body, { status, headers: resHeaders });
    } catch (err: any) {
      return c.json({ error: "Stream failed", details: err.message }, 500);
    }
  });
