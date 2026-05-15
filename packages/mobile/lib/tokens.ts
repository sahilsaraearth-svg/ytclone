// ─── Design tokens ────────────────────────────────────────────────────────────
// Single source of truth for radius, spacing, and type scale.
// Import these in every screen/component instead of hardcoding values.

/** Border radius scale */
export const R = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  28,
  full: 999,
} as const;

/** Spacing scale */
export const SP = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
} as const;

/** Type / font-size scale */
export const T = {
  xs:   10,
  sm:   11,
  base: 12,
  md:   13,
  lg:   14,
  xl:   16,
  xxl:  18,
  h:    22,
} as const;

/** Dark palette (default) */
export const C = {
  bg:       "#0B0B0B",
  card:     "#151515",
  surface:  "#1A1A1A",
  surface2: "#1E1E1E",
  glass:    "rgba(255,255,255,0.06)",
  border:   "rgba(255,255,255,0.08)",
  red:      "#FF0000",
  redGlow:  "rgba(255,0,0,0.35)",
  white:    "#FFFFFF",
  muted:    "#A0A0A0",
  dim:      "#444444",
  overlay:  "rgba(0,0,0,0.65)",
} as const;

/** Light palette */
export const CLight = {
  bg:       "#F5F5F5",
  card:     "#FFFFFF",
  surface:  "#EFEFEF",
  surface2: "#E8E8E8",
  glass:    "rgba(0,0,0,0.04)",
  border:   "rgba(0,0,0,0.08)",
  red:      "#FF0000",
  redGlow:  "rgba(255,0,0,0.20)",
  white:    "#111111",
  muted:    "#666666",
  dim:      "#BBBBBB",
  overlay:  "rgba(0,0,0,0.4)",
} as const;
