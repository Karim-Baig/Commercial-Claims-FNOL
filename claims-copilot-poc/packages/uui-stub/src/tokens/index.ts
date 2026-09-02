/** Design tokens. Approximates the Aon brand palette; real values come from UUI. */
export const tokens = {
  color: {
    navy900: "#0A1F42",
    navy700: "#0F2B5B",
    navy500: "#1D4380",
    red500: "#E8112D",
    red050: "#FDF0F2",
    grey900: "#1F2933",
    grey700: "#3E4C59",
    grey500: "#7B8794",
    grey400: "#9AA5B1",
    grey300: "#CBD2D9",
    grey200: "#E4E7EB",
    grey100: "#F1F4F7",
    grey050: "#F8FAFC",
    white: "#FFFFFF",
    green600: "#0E7C5A",
    green050: "#E7F5F0",
    amber600: "#A85B00",
    amber050: "#FDF3E7",
    blue600: "#0B6BB5",
    blue050: "#EAF4FC",
    /** Accent for borders and large text. 4.5:1 on white - do not use for small text on a tint. */
    teal600: "#00857D",
    /** Text-safe teal: 6.9:1 on white, 6.1:1 on teal050 (WCAG 2.2 AA at any size). */
    teal700: "#00655F",
    teal050: "#E4F4F3",
  },
  space: (n: number) => `${n * 4}px`,
  radius: { sm: "3px", md: "6px", lg: "10px", pill: "999px" },
  font: {
    family: `"Segoe UI", Inter, -apple-system, Roboto, Helvetica, Arial, sans-serif`,
    mono: `Consolas, "SF Mono", Menlo, monospace`,
    size: { xs: "11px", sm: "12px", md: "14px", lg: "16px", xl: "20px", xxl: "28px" },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  },
  shadow: {
    sm: "0 1px 2px rgba(15,43,91,.08)",
    md: "0 2px 8px rgba(15,43,91,.10)",
    lg: "0 8px 24px rgba(15,43,91,.14)",
  },
  breakpoint: { md: 992, lg: 1200 },
} as const;

export type Tokens = typeof tokens;
