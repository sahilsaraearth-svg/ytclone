/**
 * Google OAuth + YouTube feed routes
 */
import { Hono } from "hono";
import { db } from "../database";
import { googleTokens } from "../database/schema";
import { eq } from "drizzle-orm";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

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

async function storeToken(userId: string, data: { access_token: string; refresh_token?: string; expires_in: number }) {
  const expiry = Date.now() + data.expires_in * 1000 - 60_000;
  await db.insert(googleTokens).values({
    userId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiry,
  }).onConflictDoUpdate({
    target: googleTokens.userId,
    set: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiry,
    },
  });
}

async function getValidToken(userId: string): Promise<string | null> {
  const [entry] = await db.select().from(googleTokens).where(eq(googleTokens.userId, userId)).limit(1);
  if (!entry) return null;

  // Still valid
  if (Date.now() < entry.expiry) return entry.accessToken;

  // Try refresh
  if (!entry.refreshToken) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: entry.refreshToken,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
      }),
    });
    const data = await res.json() as any;
    if (data.access_token) {
      await storeToken(userId, {
        access_token: data.access_token,
        refresh_token: entry.refreshToken,
        expires_in: data.expires_in ?? 3600,
      });
      return data.access_token;
    }
  } catch { /* */ }
  return null;
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
    if (userId) await db.delete(googleTokens).where(eq(googleTokens.userId, userId));
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

    const token = await getValidToken(userId);
    if (!token) return c.json({ error: "Not authenticated" }, 401);

    try {
      // Step 1: get subscribed channel IDs
      const subRes = await fetch(
        "https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50&order=relevance",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const subJson = await subRes.json() as any;
      if (!subRes.ok) {
        console.error("[feed] subscriptions error:", JSON.stringify(subJson?.error));
        return c.json({ error: subJson?.error?.message ?? "subscriptions failed" }, 500);
      }

      const channelIds: string[] = (subJson.items ?? [])
        .map((i: any) => i.snippet?.resourceId?.channelId)
        .filter(Boolean);

      if (channelIds.length === 0) return c.json({ videos: [] });

      // Step 2: get uploads playlist IDs for those channels
      const chanRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelIds.slice(0, 50).join(",")}&maxResults=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const chanJson = await chanRes.json() as any;
      if (!chanRes.ok) {
        console.error("[feed] channels error:", JSON.stringify(chanJson?.error));
        return c.json({ error: chanJson?.error?.message ?? "channels failed" }, 500);
      }

      const playlists: string[] = (chanJson.items ?? [])
        .map((i: any) => i.contentDetails?.relatedPlaylists?.uploads)
        .filter(Boolean);

      if (playlists.length === 0) return c.json({ videos: [] });

      // Step 3: fetch latest 2 videos from first 15 channels in parallel
      const videoIdSet = new Set<string>();
      await Promise.all(
        playlists.slice(0, 15).map(async (plId: string) => {
          try {
            const r = await fetch(
              `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${plId}&maxResults=3`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            const j = await r.json() as any;
            for (const item of (j.items ?? [])) {
              const vid = item.contentDetails?.videoId;
              if (vid) videoIdSet.add(vid);
            }
          } catch { /* skip failed playlist */ }
        })
      );

      const videoIds = Array.from(videoIdSet).slice(0, 40);
      if (videoIds.length === 0) return c.json({ videos: [] });

      // Step 4: batch fetch video details
      const vidRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(",")}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const vidJson = await vidRes.json() as any;
      if (!vidRes.ok) {
        console.error("[feed] videos error:", JSON.stringify(vidJson?.error));
        return c.json({ error: vidJson?.error?.message ?? "videos fetch failed" }, 500);
      }

      const sorted = (vidJson.items ?? []).sort((a: any, b: any) =>
        new Date(b.snippet?.publishedAt ?? 0).getTime() - new Date(a.snippet?.publishedAt ?? 0).getTime()
      );

      const videos = sorted.map(mapYTItem).filter((v: any) => v.id);
      console.log(`[feed] returning ${videos.length} videos for ${userId}`);
      return c.json({ videos });
    } catch (err: any) {
      console.error("[feed/subscriptions/videos] error:", err.message);
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
