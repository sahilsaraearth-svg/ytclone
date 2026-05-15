/**
 * GoogleAuthContext — Google Sign-In (session polling flow)
 *
 * Flow:
 * 1. App calls POST /api/auth/google/session → gets sessionId + callbackUrl
 * 2. App opens browser with Google auth URL (redirect_uri = callbackUrl)
 * 3. User approves → Google hits our backend /callback
 * 4. Backend exchanges code, stores user in sessionStore
 * 5. App polls GET /api/auth/google/session/:id until status = "done"
 * 6. App reads user data from poll response → logged in
 *
 * Works in Expo Go, dev build, standalone APK, and production.
 * Pure JS PKCE (js-sha256) — no native modules.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sha256 } from "js-sha256";
import { API_BASE } from "../lib/config";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const STORAGE_KEY = "zuno_google_user";

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
  refreshToken?: string | null;
  expiresIn?: number;
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
      .then(async (raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as GoogleUser;
        // Always re-register token in backend (in-memory store resets on server restart)
        try {
          await fetch(`${API_BASE}/api/auth/google/store`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: saved.userId,
              accessToken: saved.accessToken,
              refreshToken: saved.refreshToken ?? null,
              expiresIn: saved.expiresIn ?? 3600,
            }),
          });
        } catch { /* non-fatal, feed will get 401 but user is still shown as logged in */ }
        setUser(saved);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async () => {
    try {
      setLoading(true);

      // Step 1: Create session on backend
      const sessionRes = await fetch(`${API_BASE}/api/auth/google/session`, { method: "POST" });
      const { sessionId, callbackUrl } = await sessionRes.json() as any;

      const verifier = randomBase64url(64);
      const challenge = sha256Base64url(verifier);

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(SCOPES)}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&code_challenge=${challenge}` +
        `&code_challenge_method=S256` +
        `&state=${encodeURIComponent(JSON.stringify({ verifier, sessionId }))}`;

      // Step 2: Open browser — don't wait for deep link, just open
      WebBrowser.openBrowserAsync(authUrl);

      // Step 3: Poll backend every 2s for up to 3 minutes
      const maxAttempts = 90;
      let attempts = 0;
      const poll = (): Promise<GoogleUser> => new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
          attempts++;
          if (attempts > maxAttempts) {
            clearInterval(interval);
            reject(new Error("Sign-in timed out"));
            return;
          }
          try {
            const r = await fetch(`${API_BASE}/api/auth/google/session/${sessionId}`);
            const data = await r.json() as any;
            if (data.status === "done" && data.user) {
              clearInterval(interval);
              resolve(data.user);
            } else if (data.status === "error") {
              clearInterval(interval);
              reject(new Error(data.error ?? "Sign-in failed"));
            }
          } catch { /* network hiccup, keep polling */ }
        }, 2000);
      });

      const googleUser = await poll();

      // Step 4: Close browser + save user
      WebBrowser.dismissBrowser();
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
