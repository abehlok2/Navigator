/**
 * Mission control inspired color tokens for the Explorer Sessions app.
 * These tokens are organized by usage contexts such as backgrounds, surfaces, and status states.
 * Import these values to ensure color consistency across components.
 */
export const colors = {
  /**
   * Dark neutral backgrounds that form the base of the mission control theme.
   */
  background: {
    /** Primary app background color. */
    primary: "#0a0a0f",
    /** Secondary background for panels and nested sections. */
    secondary: "#12121a",
    /** Tertiary background for subtle contrast against secondary sections. */
    tertiary: "#1a1a26",
  },
  /**
   * Semi-transparent surfaces used to achieve a glassmorphic effect.
   * These colors should be applied to cards, overlays, and HUD-like containers.
   */
  surface: {
    /** Light glass panel with subtle transparency. */
    glassLight: "rgba(26, 26, 38, 0.6)",
    /** Darker glass layer for elevated elements. */
    glassDark: "rgba(10, 10, 15, 0.72)",
    /** Highlighted glass used for focus states or modals. */
    glassHighlight: "rgba(59, 130, 246, 0.2)",
  },
  /**
   * Accent colors for call-to-action elements, active states, and interactive focus outlines.
   */
  accent: {
    /** Primary purple accent used for buttons and key interactive elements. */
    missionPurple: "#8b5cf6",
    /** Secondary blue accent for complementary emphasis and gradients. */
    orbitalBlue: "#3b82f6",
  },
  /**
   * Status colors communicate system states such as success, warning, or danger.
   */
  status: {
    /** Indicates successful operations or confirmations. */
    success: "#10b981",
    /** Highlights warning scenarios that need attention. */
    warning: "#f59e0b",
    /** Alerts users to critical failures or destructive actions. */
    danger: "#ef4444",
  },
  /**
   * Glow colors applied to shadows, outlines, and atmospheric effects.
   */
  glow: {
    /** Primary glow for key interactive or highlighted elements. */
    primary: "rgba(139, 92, 246, 0.35)",
    /** Secondary glow for supporting states or hover effects. */
    secondary: "rgba(59, 130, 246, 0.4)",
    /** Critical glow to reinforce danger states. */
    danger: "rgba(239, 68, 68, 0.45)",
  },
} as const;

/**
 * TypeScript helper representing the color token structure.
 * Use this type when extending or consuming tokens to maintain type-safety.
 */
export type ColorTokens = typeof colors;
