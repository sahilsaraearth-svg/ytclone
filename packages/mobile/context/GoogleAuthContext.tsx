/**
 * GoogleAuthContext — Google Sign-In
 * Flow: app opens browser → Google consent → redirects to API /callback
 *       → API exchanges code → redirects to ytclone://auth?... deep link
 *       → openAuthSessionAsync catches it → user is signed in
 *
 * Pure JS PKCE (js-sha256) — no native modules needed
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sha256 } from "js-sha256";
import { API_BASE } from "../lib/config";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const STORAGE_KEY = "zuno_google_user";

// Our backend callback — Google redirects here, backend deep-links back to app
const REDIRECT_URI = `${API_BASE}/api/auth/google/callback`;

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

// ─── Pure JS PKCE ─────────────────────────────────────────────────────────────
function randomBase64url(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  for (let i = 0; i < length; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function sha256Base64url(plain: string): string {
  const hexStr = sha256(plain);
  const bytes: number[] = [];
  for (let i = 0; i < hexStr.length; i += 2) bytes.push(parseInt(hexStr.slice(i, i + 2), 16));
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface GoogleUser {
  userId: string;
  name: string;
  email: string;
  avatar: string;
  accessToken: string;
}

interface GoogleAuthCtx {
  user: GoogleUser | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<GoogleAuthCtx>({
  user: null,
  loading: false,
  signIn: async () => {},
  signOut: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export function GoogleAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => { if (raw) setUser(JSON.parse(raw)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async () => {
    try {
      setLoading(true);

      const verifier = randomBase64url(64);
      const challenge = sha256Base64url(verifier);

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(SCOPES)}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&code_challenge=${challenge}` +
        `&code_challenge_method=S256` +
        `&state=${encodeURIComponent(verifier)}`;

      // Watches for ytclone:// deep link — works in standalone/dev build, not Expo Go
      const result = await WebBrowser.openAuthSessionAsync(authUrl, "ytclone://");

      if (result.type !== "success") {
        console.log("[GoogleAuth] cancelled:", result.type);
        return;
      }

      const urlStr = (result as any).url as string;
      const queryStr = urlStr.includes("?") ? urlStr.split("?")[1] : urlStr.split("#")[1] ?? "";
      const params = new URLSearchParams(queryStr);

      const error = params.get("error");
      if (error) throw new Error(decodeURIComponent(error));

      const userId = params.get("userId");
      const accessToken = params.get("accessToken");
      if (!userId || !accessToken) throw new Error("Missing user data in callback");

      const googleUser: GoogleUser = {
        userId,
        name: decodeURIComponent(params.get("name") ?? ""),
        email: decodeURIComponent(params.get("email") ?? ""),
        avatar: decodeURIComponent(params.get("avatar") ?? ""),
        accessToken,
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(googleUser));
      setUser(googleUser);
    } catch (err) {
      console.error("[GoogleAuth] signIn error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (user?.userId) {
      fetch(`${API_BASE}/api/auth/google/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId }),
      }).catch(() => {});
    }
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    setUser(null);
  }, [user]);

  return (
    <Ctx.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useGoogleAuth() {
  return useContext(Ctx);
}
