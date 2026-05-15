import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  StatusBar, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { User, EnvelopeSimple } from "phosphor-react-native";

const C = {
  bg: "#0B0B0B",
  surface: "#151515",
  card: "#1A1A1A",
  border: "rgba(255,255,255,0.08)",
  red: "#FF0000",
  white: "#FFFFFF",
  muted: "#A0A0A0",
  dim: "#383838",
};

export default function LoginScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 700));
    setLoading(false);
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={s.container} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* ── Zuno Logo centered ── */}
          <View style={s.logoSection}>
            <Image
              source={require("../assets/icon.png")}
              style={s.logoImg}
              resizeMode="contain"
            />
            <Text style={s.appName}>Zuno</Text>
            <Text style={s.tagline}>Sign in to continue</Text>
          </View>

          {/* ── Form card ── */}
          <View style={s.formCard}>
            {/* Full name */}
            <View style={s.inputWrap}>
              <Text style={s.inputLabel}>Full name</Text>
              <View style={s.inputBox}>
                <User size={18} color={C.muted} />
                <TextInput
                  style={s.input}
                  placeholder="Your full name"
                  placeholderTextColor={C.dim}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  selectionColor={C.red}
                />
              </View>
            </View>

            {/* Email */}
            <View style={s.inputWrap}>
              <Text style={s.inputLabel}>Email</Text>
              <View style={s.inputBox}>
                <EnvelopeSimple size={18} color={C.muted} />
                <TextInput
                  style={s.input}
                  placeholder="your@email.com"
                  placeholderTextColor={C.dim}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  selectionColor={C.red}
                />
              </View>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={s.submitBtn}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={C.white} size="small" />
                : <Text style={s.submitTxt}>Continue</Text>}
            </TouchableOpacity>
          </View>

          {/* Skip */}
          <TouchableOpacity style={s.skipBtn} onPress={() => router.replace("/(tabs)")}>
            <Text style={s.skipTxt}>Skip for now</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40, justifyContent: "center" },

  logoSection: { alignItems: "center", paddingVertical: 40, gap: 10 },
  logoImg: { width: 100, height: 100, borderRadius: 26 },
  appName: { fontSize: 36, fontWeight: "800", color: "#FFFFFF", letterSpacing: -1 },
  tagline: { color: C.muted, fontSize: 14 },

  formCard: {
    backgroundColor: C.surface,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    padding: 20,
    gap: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.30,
    shadowRadius: 24,
    elevation: 10,
  },

  inputWrap: { gap: 7 },
  inputLabel: { color: C.muted, fontSize: 12, fontWeight: "500", paddingLeft: 2 },
  inputBox: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    paddingHorizontal: 16, paddingVertical: 15, gap: 10,
  },
  input: { flex: 1, color: C.white, fontSize: 15, padding: 0 },

  submitBtn: {
    backgroundColor: C.red,
    borderRadius: 20,
    paddingVertical: 16, alignItems: "center",
    marginTop: 4,
    shadowColor: C.red, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.40, shadowRadius: 12, elevation: 8,
  },
  submitTxt: { color: C.white, fontSize: 16, fontWeight: "700" },

  skipBtn: { alignItems: "center", marginTop: 28 },
  skipTxt: { color: C.muted, fontSize: 14 },
});
