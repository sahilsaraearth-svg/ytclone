/**
 * Google OAuth + YouTube feed routes (youtubei.js scraping — no API key needed)
 */
import { Hono } from "hono";
import { Innertube, Platform } from "youtubei.js";
import crypto from "crypto";

// Provide Node.js vm for youtubei.js
import vm from "vm";
(Platform as any).load({
  runtime: "node",
  server: true,
  sha1Hash: async (data: string) => crypto.createHash("sha1").update(data).digest("hex"),
  uuidv4: () => crypto.randomUUID(),
  fetch: globalThis.fetch,
  Headers: globalThis.Headers,
  Request: globalThis.Request,
  Response: globalThis.Response,
  ReadableStream: globalThis.ReadableStream as any,
  CustomEvent: class CustomEvent extends Event {
    detail: any;
    constructor(e: string, init?: any) { super(e); this.detail = init?.detail; }
  },
  evaluate: (code: string) => { const s = new vm.Script(code); return s.runInNewContext({}); },
} as any);

// Per-user Innertube instance cache (keyed by userId)
const innertubeCache = new Map<string, { yt: Innertube; expiry: number }>();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

// Simple in-memory token store (replace with DB in production)
const tokenStore = new Map<string, { access_token: string; refresh_token?: string; expiry: number }>();

// Session store for polling-based auth (works in Expo Go + APK + production)
const sessionStore = new Map<string, {
  status: "pending" | "done" | "error";
  user?: { userId: string; name: string; email: string; avatar: string; accessToken: string; refreshToken?: string | null; expiresIn?: number };
  error?: string;
  createdAt: number;
}>();

// Cleanup old sessions every 10 mins
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessionStore.entries()) {
    if (now - s.createdAt > 10 * 60 * 1000) sessionStore.delete(id);
  }
}, 10 * 60 * 1000);

function storeToken(userId: string, data: { access_token: string; refresh_token?: string; expires_in: number }) {
  tokenStore.set(userId, {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry: Date.now() + data.expires_in * 1000 - 60_000,
  });
}

async function getValidToken(userId: string): Promise<string | null> {
  const entry = tokenStore.get(userId);
  if (!entry) return null;

  // Still valid
  if (Date.now() < entry.expiry) return entry.access_token;

  // Try refresh
  if (!entry.refresh_token) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: entry.refresh_token,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
      }),
    });
    const data = await res.json() as any;
    if (data.access_token) {
      storeToken(userId, {
        access_token: data.access_token,
        refresh_token: entry.refresh_token,
        expires_in: data.expires_in ?? 3600,
      });
      return data.access_token;
    }
  } catch { /* */ }
  return null;
}

// Get an authenticated Innertube instance for a user (cached 50 min)
async function getAuthInnertube(userId: string): Promise<Innertube | null> {
  const cached = innertubeCache.get(userId);
  if (cached && Date.now() < cached.expiry) return cached.yt;

  const entry = tokenStore.get(userId);
  if (!entry) return null;

  try {
    const yt = await Innertube.create({ retrieve_player: false });
    await yt.session.oauth.init({
      access_token: entry.access_token,
      refresh_token: entry.refresh_token ?? "",
      expiry_date: new Date(entry.expiry).toISOString(),
    });
    innertubeCache.set(userId, { yt, expiry: Date.now() + 50 * 60 * 1000 });
    return yt;
  } catch (e) {
    console.error("[getAuthInnertube] error:", e);
    return null;
  }
}

// Map a youtubei.js video item to our VideoData shape
function mapInnertubeVideo(item: any): any {
  try {
    const id = item.video_id ?? item.id ?? "";
    if (!id) return null;
    const title = item.title?.text ?? item.title ?? "";
    const thumb = item.thumbnails?.[0]?.url ?? item.thumbnail?.[0]?.url ?? "";
    const channel = item.author?.name ?? item.short_byline_text?.text ?? "";
    const channelId = item.author?.id ?? "";
    const views = item.view_count?.text ?? item.short_view_count_text?.text ?? "";
    const published = item.published?.text ?? item.publishedAt ?? "";
    const duration = item.duration?.text ?? item.thumbnail_overlays?.find((o: any) => o.type === "ThumbnailOverlayTimeStatus")?.text?.text ?? "";
    return { id, title, thumbnail: thumb, channelName: channel, channelId, viewCount: views, publishedAt: published, duration };
  } catch { return null; }
}

async function ytFetch(endpoint: string, params: Record<string, string>, token: string) {
  const url = new URL(`${YT_API_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any;
    const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.message ?? res.status;
    throw new Error(`YT API error ${res.status}: ${reason}`);
  }
  return res.json() as Promise<any>;
}

function mapYTItem(item: any) {
  const snippet = item.snippet ?? {};
  const contentDetails = item.contentDetails ?? {};
  const stats = item.statistics ?? {};
  const vidId = item.id?.videoId ?? item.id ?? item.contentDetails?.videoId ?? "";
  const thumbs = snippet.thumbnails ?? {};
  const thumb = thumbs.maxres?.url ?? thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? "";

  // Parse ISO 8601 duration
  function parseDuration(d?: string) {
    if (!d) return "";
    const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return "";
    const h = parseInt(m[1] ?? "0");
    const min = parseInt(m[2] ?? "0");
    const sec = parseInt(m[3] ?? "0");
    if (h > 0) return `${h}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${min}:${String(sec).padStart(2, "0")}`;
  }

  function formatViews(n?: string) {
    const v = parseInt(n ?? "0");
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B views`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M views`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K views`;
    return v ? `${v} views` : "";
  }

  function timeAgo(iso?: string) {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days < 1) return "Today";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }

  return {
    id: vidId,
    title: snippet.title ?? "Unknown",
    thumbnail: thumb,
    channelName: snippet.channelTitle ?? snippet.videoOwnerChannelTitle ?? "",
    channelId: snippet.channelId ?? snippet.videoOwnerChannelId ?? "",
    viewCount: formatViews(stats.viewCount),
    publishedAt: timeAgo(snippet.publishedAt),
    duration: parseDuration(contentDetails.duration),
    isLive: snippet.liveBroadcastContent === "live",
  };
}

export const googleAuth = new Hono()

  // ── Create auth session (app calls this to start login) ─────────────
  .post("/auth/google/session", async (c) => {
    const sessionId = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    sessionStore.set(sessionId, { status: "pending", createdAt: Date.now() });
    // Use PUBLIC_API_URL env var so it always returns the correct public URL
    const publicBase = (process.env.EXPO_PUBLIC_API_URL ?? process.env.API_BASE_URL ?? "").replace(/\/$/, "");
    const reqUrl = new URL(c.req.url);
    const fallback = `${reqUrl.protocol}//${reqUrl.host}`;
    const callbackUrl = `${publicBase || fallback}/api/auth/google/callback`;
    return c.json({ sessionId, callbackUrl });
  })

  // ── Poll session status (app polls this after opening browser) ───────
  .get("/auth/google/session/:id", async (c) => {
    const session = sessionStore.get(c.req.param("id"));
    if (!session) return c.json({ status: "not_found" }, 404);
    return c.json(session);
  })

  // ── OAuth callback (browser redirects here from Google) ─────────────
  .get("/auth/google/callback", async (c) => {
    const code = c.req.query("code");
    const error = c.req.query("error");
    const stateRaw = c.req.query("state") ?? "";

    // state is JSON { verifier, sessionId } or plain verifier string (legacy)
    let codeVerifier = stateRaw;
    let sessionId = "";
    try {
      const parsed = JSON.parse(decodeURIComponent(stateRaw));
      codeVerifier = parsed.verifier ?? stateRaw;
      sessionId = parsed.sessionId ?? "";
    } catch { /* plain verifier */ }

    const publicBase = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
    const reqUrl = new URL(c.req.url);
    const fallback = `${reqUrl.protocol}//${reqUrl.host}`;
    const redirectUri = `${publicBase || fallback}/api/auth/google/callback`;
    console.log("[callback] redirectUri:", redirectUri);

    // HTML shown in browser after auth — tells user to go back to app
    const successHtml = (msg: string) => c.html(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f0f;color:#fff">
        <h2>${msg}</h2>
        <p>You can close this tab and return to the app.</p>
      </body></html>
    `);

    if (error || !code) {
      if (sessionId) sessionStore.set(sessionId, { status: "error", error: error ?? "no_code", createdAt: Date.now() });
      return successHtml("❌ Sign-in failed. Please try again.");
    }

    try {
      const tokenBody: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
      };
      if (codeVerifier) tokenBody.code_verifier = codeVerifier;

      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(tokenBody),
      });
      const data = await res.json() as any;
      if (!res.ok || !data.access_token) {
        if (sessionId) sessionStore.set(sessionId, { status: "error", error: data.error_description ?? "token_failed", createdAt: Date.now() });
        return successHtml("❌ Sign-in failed. Please try again.");
      }

      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const user = await userRes.json() as any;
      const userId = user.id ?? user.sub ?? "default";

      storeToken(userId, {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in ?? 3600,
      });

      const userData = {
        userId,
        name: user.name ?? "",
        email: user.email ?? "",
        avatar: user.picture ?? "",
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        expiresIn: data.expires_in ?? 3600,
      };

      // Store in session for app to poll
      if (sessionId) {
        sessionStore.set(sessionId, { status: "done", user: userData, createdAt: Date.now() });
      }

      return successHtml(`✅ Signed in as ${user.name}! You can close this tab and return to the app.`);
    } catch (err: any) {
      if (sessionId) sessionStore.set(sessionId, { status: "error", error: err.message, createdAt: Date.now() });
      return successHtml("❌ Sign-in failed. Please try again.");
    }
  })

  // ── Exchange OAuth code for tokens (manual/direct) ──────────────────
  .post("/auth/google/token", async (c) => {
    try {
      const { code, redirectUri, codeVerifier } = await c.req.json() as any;
      if (!code || !redirectUri) return c.json({ error: "Missing code or redirectUri" }, 400);

      const body: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
      };
      if (codeVerifier) body.code_verifier = codeVerifier;

      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body),
      });
      const data = await res.json() as any;
      if (!res.ok || !data.access_token) {
        return c.json({ error: data.error_description ?? "Token exchange failed" }, 400);
      }

      // Fetch user info
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const user = await userRes.json() as any;
      const userId = user.id ?? user.sub ?? "default";

      storeToken(userId, {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in ?? 3600,
      });

      return c.json({
        userId,
        name: user.name ?? "",
        email: user.email ?? "",
        avatar: user.picture ?? "",
        accessToken: data.access_token,
      });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  })

  // ── Store token from client-side OAuth (expo-auth-session flow) ─────
  .post("/auth/google/store", async (c) => {
    try {
      const { userId, accessToken, refreshToken, expiresIn } = await c.req.json() as any;
      if (!userId || !accessToken) return c.json({ error: "Missing userId or accessToken" }, 400);
      storeToken(userId, {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresIn ?? 3600,
      });
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  })

  // ── Revoke / logout ─────────────────────────────────────────────────
  .post("/auth/google/revoke", async (c) => {
    const { userId } = await c.req.json() as any;
    if (userId) tokenStore.delete(userId);
    return c.json({ ok: true });
  })

  // ── Subscription feed ───────────────────────────────────────────────
  .get("/feed/subscriptions", async (c) => {
    const userId = c.req.query("userId");
    const token = userId ? await getValidToken(userId) : null;
    if (!token) return c.json({ error: "Not authenticated" }, 401);

    try {
      // Get subscriptions list
      const subData = await ytFetch("/subscriptions", {
        part: "snippet",
        mine: "true",
        maxResults: "50",
        order: "alphabetical",
      }, token);

      const channels = (subData.items ?? []).map((item: any) => ({
        id: item.snippet?.resourceId?.channelId ?? "",
        name: item.snippet?.title ?? "",
        avatar: item.snippet?.thumbnails?.default?.url ?? "",
        description: item.snippet?.description ?? "",
      })).filter((c: any) => c.id);

      return c.json({ channels });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  })

  // ── Subscription feed videos ─────────────────────────────────────────
  .get("/feed/subscriptions/videos", async (c) => {
    const userId = c.req.query("userId");
    if (!userId) return c.json({ error: "Not authenticated" }, 401);

    // Ensure token is in store
    const token = await getValidToken(userId);
    if (!token) return c.json({ error: "Not authenticated" }, 401);

    try {
      // Use youtubei.js with OAuth — scrapes YouTube directly, no API quota
      const yt = await getAuthInnertube(userId);
      if (!yt) return c.json({ error: "Could not init YouTube session" }, 500);

      const feed = await yt.getSubscriptionsFeed();
      const items: any[] = (feed as any).videos ?? (feed as any).contents ?? [];

      const videos = items
        .map(mapInnertubeVideo)
        .filter((v: any) => v && v.id)
        .slice(0, 60);

      console.log(`[feed/subscriptions/videos] got ${videos.length} videos for ${userId}`);
      return c.json({ videos });
    } catch (err: any) {
      console.error("[feed/subscriptions/videos] error:", err.message, err.stack?.split("\n")[1]);
      return c.json({ error: err.message }, 500);
    }
  })

  // ── Home / Recommended feed ─────────────────────────────────────────
  .get("/feed/home", async (c) => {
    const userId = c.req.query("userId");
    const token = userId ? await getValidToken(userId) : null;
    if (!token) return c.json({ error: "Not authenticated" }, 401);

    try {
      // YouTube Data API doesn't expose personalized home feed directly.
      // Best proxy: mix of subscriptions activities + trending
      const actData = await ytFetch("/activities", {
        part: "snippet,contentDetails",
        home: "true",
        maxResults: "50",
      }, token);

      const videoIds = (actData.items ?? [])
        .filter((i: any) => i.snippet?.type === "upload")
        .map((i: any) => i.contentDetails?.upload?.videoId)
        .filter(Boolean)
        .slice(0, 30);

      if (videoIds.length === 0) return c.json({ videos: [], source: "empty" });

      const detailData = await ytFetch("/videos", {
        part: "snippet,contentDetails,statistics",
        id: videoIds.join(","),
      }, token);

      const videos = (detailData.items ?? []).map(mapYTItem).filter((v: any) => v.id);
      return c.json({ videos, source: "subscriptions" });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  })

  // ── Liked videos ─────────────────────────────────────────────────────
  .get("/feed/liked", async (c) => {
    const userId = c.req.query("userId");
    const token = userId ? await getValidToken(userId) : null;
    if (!token) return c.json({ error: "Not authenticated" }, 401);

    try {
      // "LL" is the liked videos playlist ID
      const data = await ytFetch("/playlistItems", {
        part: "snippet,contentDetails",
        playlistId: "LL",
        maxResults: "50",
      }, token);

      const videoIds = (data.items ?? [])
        .map((i: any) => i.contentDetails?.videoId)
        .filter(Boolean);

      if (videoIds.length === 0) return c.json({ videos: [] });

      const detailData = await ytFetch("/videos", {
        part: "snippet,contentDetails,statistics",
        id: videoIds.join(","),
      }, token);

      const videos = (detailData.items ?? []).map(mapYTItem).filter((v: any) => v.id);
      return c.json({ videos, total: data.pageInfo?.totalResults ?? videos.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  })

  // ── Watch Later ──────────────────────────────────────────────────────
  .get("/feed/watch-later", async (c) => {
    const userId = c.req.query("userId");
    const token = userId ? await getValidToken(userId) : null;
    if (!token) return c.json({ error: "Not authenticated" }, 401);

    try {
      // "WL" is the Watch Later playlist ID
      const data = await ytFetch("/playlistItems", {
        part: "snippet,contentDetails",
        playlistId: "WL",
        maxResults: "50",
      }, token);

      const videoIds = (data.items ?? [])
        .map((i: any) => i.contentDetails?.videoId)
        .filter(Boolean);

      if (videoIds.length === 0) return c.json({ videos: [] });

      const detailData = await ytFetch("/videos", {
        part: "snippet,contentDetails,statistics",
        id: videoIds.join(","),
      }, token);

      const videos = (detailData.items ?? []).map(mapYTItem).filter((v: any) => v.id);
      return c.json({ videos, total: data.pageInfo?.totalResults ?? videos.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });
