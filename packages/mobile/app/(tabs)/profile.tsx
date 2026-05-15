/**
 * Profile / You tab — YouTube-style
 * Signed out: glassmorphism sign-in screen
 * Signed in: full profile page with account info + menu
 */
import React, { useRef } from "react";
import {
  View, Text, StyleSheet, StatusBar,
  TouchableOpacity, Image, ScrollView,
  Animated, Switch, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import {
  GoogleLogo, SignOut, Gear, Info, Bell,
  UserCircle, ChartLine, ClockCounterClockwise,
  Moon, Sun, ArrowRight, Shield, Question,
} from "phosphor-react-native";
import { useRouter } from "expo-router";
import { useGoogleAuth } from "../../context/GoogleAuthContext";
import { useColors } from "../../hooks/useColors";
import { useTheme } from "../../context/ThemeContext";
import { C } from "../../lib/tokens";

const { width: W, height: H } = Dimensions.get("window");

// ─── Glassmorphism Sign-in Screen ────────────────────────────────────────────
function SignInScreen({ onSignIn, loading }: { onSignIn: () => void; loading: boolean }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={si.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Background gradient */}
      <LinearGradient
        colors={["#0B0B0B", "#0f0f1a", "#120a0a"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Red glow orb top */}
      <Animated.View style={[si.orb, si.orbTop, { transform: [{ scale: pulseAnim }] }]} />
      {/* Red glow orb bottom */}
      <Animated.View style={[si.orb, si.orbBottom]} />

      <ScrollView
        contentContainerStyle={si.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Logo / branding */}
        <View style={si.brandWrap}>
          <View style={si.logoCircle}>
            <View style={si.playIcon} />
          </View>
          <Text style={si.appName}>YTClone</Text>
          <Text style={si.tagline}>Your YouTube. Reimagined.</Text>
        </View>

        {/* Glass card */}
        <View style={si.glassCard}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={si.cardInner}>
            <Text style={si.cardTitle}>Sign in to unlock</Text>
            <Text style={si.cardSub}>Get your personalized YouTube experience</Text>

            {/* Features list */}
            <View style={si.featureList}>
              {[
                { icon: "▶", text: "Subscriptions feed" },
                { icon: "👍", text: "Liked videos" },
                { icon: "🕐", text: "Watch Later" },
                { icon: "📊", text: "Personalized recommendations" },
              ].map((f, i) => (
                <View key={i} style={si.featureRow}>
                  <Text style={si.featureIcon}>{f.icon}</Text>
                  <Text style={si.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>

            {/* Sign in button */}
            <TouchableOpacity
              style={[si.signInBtn, loading && si.signInBtnDisabled]}
              onPress={onSignIn}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={["#FF0000", "#CC0000"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={si.signInGradient}
              >
                <GoogleLogo size={22} color="#fff" weight="fill" />
                <Text style={si.signInTxt}>
                  {loading ? "Signing in…" : "Continue with Google"}
                </Text>
                {!loading && <ArrowRight size={18} color="#fff" weight="bold" />}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={si.disclaimer}>
              By signing in, you agree to Google's Terms of Service
            </Text>
          </View>
        </View>

        {/* Bottom note */}
        <Text style={si.bottomNote}>
          Your data stays on your device. We never store passwords.
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Profile Screen (signed in) ──────────────────────────────────────────────
function ProfileScreen({
  onSignOut,
  onNavigate,
}: {
  onSignOut: () => void;
  onNavigate: (route: string) => void;
}) {
  const { user } = useGoogleAuth();
  const col = useColors();
  const { isDark, toggleTheme } = useTheme();

  const menuSections = [
    {
      title: "Your stuff",
      items: [
        { icon: ClockCounterClockwise, label: "History", route: "/library" },
        { icon: Bell, label: "Notifications", route: null },
        { icon: ChartLine, label: "Activity", route: null },
      ],
    },
    {
      title: "Settings",
      items: [
        { icon: Gear, label: "Settings & privacy", route: "/settings" },
        { icon: Shield, label: "Privacy & safety", route: null },
        { icon: Question, label: "Help & feedback", route: null },
      ],
    },
  ];

  return (
    <SafeAreaView style={[ps.container, { backgroundColor: col.bg }]} edges={["top", "left", "right"]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={col.bg} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Header */}
        <Text style={[ps.screenTitle, { color: col.white }]}>You</Text>

        {/* Account card */}
        <View style={[ps.accountCard, { backgroundColor: col.surface, borderColor: col.border }]}>
          {/* Avatar + glow */}
          <View style={ps.avatarWrap}>
            <LinearGradient
              colors={["#FF0000", "#880000"]}
              style={ps.avatarGlow}
            />
            {user?.avatar
              ? <Image source={{ uri: user.avatar }} style={ps.avatar} />
              : <UserCircle size={64} color={col.white} weight="fill" />
            }
          </View>

          <Text style={[ps.userName, { color: col.white }]}>{user?.name ?? "User"}</Text>
          <Text style={[ps.userEmail, { color: col.muted }]}>{user?.email ?? ""}</Text>

          {/* Google badge */}
          <View style={ps.googleBadge}>
            <GoogleLogo size={14} color="#EA4335" weight="fill" />
            <Text style={ps.googleBadgeTxt}>Google Account</Text>
          </View>
        </View>

        {/* Dark mode toggle */}
        <View style={[ps.toggleRow, { backgroundColor: col.surface, borderColor: col.border }]}>
          <View style={ps.toggleLeft}>
            {isDark
              ? <Moon size={20} color="#7C83FD" weight="fill" />
              : <Sun size={20} color="#FFB800" weight="fill" />
            }
            <Text style={[ps.toggleLabel, { color: col.white }]}>
              {isDark ? "Dark mode" : "Light mode"}
            </Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: "#555", true: C.red }}
            thumbColor={col.white}
          />
        </View>

        {/* Menu sections */}
        {menuSections.map((section, si) => (
          <View key={si} style={ps.section}>
            <Text style={[ps.sectionTitle, { color: col.muted }]}>{section.title}</Text>
            <View style={[ps.sectionCard, { backgroundColor: col.surface, borderColor: col.border }]}>
              {section.items.map((item, ii) => (
                <TouchableOpacity
                  key={ii}
                  style={[
                    ps.menuRow,
                    ii < section.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: col.border },
                  ]}
                  onPress={() => item.route && onNavigate(item.route)}
                  activeOpacity={0.7}
                >
                  <View style={[ps.menuIconWrap, { backgroundColor: col.glass }]}>
                    <item.icon size={18} color={col.white} weight="fill" />
                  </View>
                  <Text style={[ps.menuLabel, { color: col.white }]}>{item.label}</Text>
                  <ArrowRight size={16} color={col.dim} weight="bold" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Sign out */}
        <TouchableOpacity
          style={[ps.signOutBtn, { borderColor: "rgba(255,0,0,0.3)", backgroundColor: "rgba(255,0,0,0.07)" }]}
          onPress={onSignOut}
          activeOpacity={0.8}
        >
          <SignOut size={18} color="#FF4444" weight="fill" />
          <Text style={ps.signOutTxt}>Sign out</Text>
        </TouchableOpacity>

        {/* App version */}
        <View style={ps.versionRow}>
          <Info size={13} color={col.dim} weight="fill" />
          <Text style={[ps.versionTxt, { color: col.dim }]}>YTClone v1.0.0</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function ProfileTab() {
  const { user, signIn, signOut, loading } = useGoogleAuth();
  const router = useRouter();

  if (!user) {
    return <SignInScreen onSignIn={signIn} loading={loading} />;
  }

  return (
    <ProfileScreen
      onSignOut={signOut}
      onNavigate={(route) => router.push(route as any)}
    />
  );
}

// ─── Sign-in styles ───────────────────────────────────────────────────────────
const si = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0B0B" },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 60,
    gap: 28,
  },

  orb: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(255,0,0,0.12)",
  },
  orbTop: { top: -60, right: -80 },
  orbBottom: { bottom: -40, left: -100, backgroundColor: "rgba(255,0,0,0.07)" },

  brandWrap: { alignItems: "center", gap: 12 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: C.red,
    alignItems: "center", justifyContent: "center",
    shadowColor: C.red, shadowOpacity: 0.6,
    shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  playIcon: {
    width: 0, height: 0,
    borderTopWidth: 12, borderBottomWidth: 12, borderLeftWidth: 22,
    borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: "#fff",
    marginLeft: 4,
  },
  appName: {
    color: "#fff", fontSize: 32, fontWeight: "800",
    letterSpacing: -0.5,
  },
  tagline: { color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: "400" },

  glassCard: {
    width: "100%",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  cardInner: {
    padding: 24,
    gap: 6,
  },
  cardTitle: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 2 },
  cardSub: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 16 },

  featureList: { gap: 12, marginBottom: 24 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  featureIcon: { fontSize: 18, width: 28, textAlign: "center" },
  featureText: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "500" },

  signInBtn: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
  signInBtnDisabled: { opacity: 0.6 },
  signInGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 16, paddingHorizontal: 24, gap: 10,
  },
  signInTxt: { color: "#fff", fontSize: 16, fontWeight: "700", flex: 1 },

  disclaimer: {
    color: "rgba(255,255,255,0.3)", fontSize: 11,
    textAlign: "center", marginTop: 10,
  },

  bottomNote: {
    color: "rgba(255,255,255,0.25)", fontSize: 12,
    textAlign: "center", paddingHorizontal: 16,
  },
});

// ─── Profile styles ───────────────────────────────────────────────────────────
const ps = StyleSheet.create({
  container: { flex: 1 },

  screenTitle: {
    fontSize: 24, fontWeight: "800",
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
  },

  accountCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    overflow: "hidden",
  },
  avatarWrap: { position: "relative", marginBottom: 8 },
  avatarGlow: {
    position: "absolute",
    width: 80, height: 80, borderRadius: 40,
    opacity: 0.4,
    top: -4, left: -4,
  },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  userName: { fontSize: 20, fontWeight: "700" },
  userEmail: { fontSize: 13 },
  googleBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: "rgba(234,67,53,0.12)",
    borderRadius: 999, marginTop: 6,
    borderWidth: 1, borderColor: "rgba(234,67,53,0.25)",
  },
  googleBadgeTxt: { color: "#EA4335", fontSize: 12, fontWeight: "600" },

  toggleRow: {
    marginHorizontal: 16, marginBottom: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
  },
  toggleLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleLabel: { fontSize: 14, fontWeight: "500" },

  section: { marginBottom: 12, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.8,
    textTransform: "uppercase", marginBottom: 8, paddingHorizontal: 4,
  },
  sectionCard: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 14,
  },
  menuIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: "500" },

  signOutBtn: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 14,
    borderRadius: 16, borderWidth: 1,
  },
  signOutTxt: { color: "#FF4444", fontSize: 14, fontWeight: "600" },

  versionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 8,
  },
  versionTxt: { fontSize: 12 },
});
