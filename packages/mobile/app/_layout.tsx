import { Slot } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { MiniPlayerProvider } from "../context/MiniPlayerContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { GoogleAuthProvider } from "../context/GoogleAuthContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
});

function AppShell() {
  const { isDark } = useTheme();
  const bg = isDark ? "#0F0F0F" : "#F5F5F5";
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={isDark ? "light" : "dark"} backgroundColor={bg} />
      <Slot />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <GoogleAuthProvider>
            <MiniPlayerProvider>
              <AppShell />
            </MiniPlayerProvider>
          </GoogleAuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
