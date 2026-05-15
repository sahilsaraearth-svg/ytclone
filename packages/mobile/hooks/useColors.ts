import { useTheme } from "../context/ThemeContext";
import { C, CLight } from "../lib/tokens";

export function useColors() {
  const { isDark } = useTheme();
  return isDark ? C : CLight;
}
