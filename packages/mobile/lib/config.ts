import Constants from "expo-constants";

export const API_BASE =
  (
    Constants.expoConfig?.extra?.apiUrl ??
    process.env.EXPO_PUBLIC_API_URL ??
    "http://localhost:4200"
  ).replace(/\/$/, "");
