import { Hono } from "hono";
import { readFileSync } from "fs";

const ICON_PATH = "/home/user/ytclone/packages/web/public/zuno-icon.png";
let iconBuffer: Buffer;
try {
  iconBuffer = readFileSync(ICON_PATH);
} catch {
  iconBuffer = Buffer.alloc(0);
}

const EAS_APK_URL =
  "https://expo.dev/artifacts/eas/wemHfEcqdcqB8d4t6QgBJm.apk";

// Read the landing page HTML once at startup
let landingHtml: string;
try {
  landingHtml = readFileSync("/home/user/zuno-site/index.html", "utf-8");
} catch {
  landingHtml = "<h1>Zuno - Coming Soon</h1>";
}

export const zuno = new Hono()
  // Landing page
  .get("/zuno", (c) => {
    return c.html(landingHtml);
  })
  // App icon
  .get("/zuno-icon.png", (c) => {
    return new Response(iconBuffer, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
    });
  })
  // APK proxy — streams from EAS with proper filename
  .get("/download/apk", async (c) => {
    const upstream = await fetch(EAS_APK_URL, {
      headers: { "User-Agent": "Mozilla/5.0 ZunoDownloader/1.0" },
      redirect: "follow",
    });

    if (!upstream.ok) {
      return c.json({ error: "APK not available" }, 502);
    }

    const contentLength = upstream.headers.get("content-length");
    const headers: Record<string, string> = {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": 'attachment; filename="Zuno.apk"',
    };
    if (contentLength) headers["Content-Length"] = contentLength;

    return new Response(upstream.body, { status: 200, headers });
  });
