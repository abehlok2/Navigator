import { colors } from "./colors";
import type { ColorTokens } from "./colors";
import { typography } from "./typography";
import type { TypographyTokens } from "./typography";
import { spacing } from "./spacing";
import type { SpacingTokens } from "./spacing";
import { animations } from "./animations";
import type { AnimationTokens } from "./animations";

export { colors, typography, spacing, animations };
export type { ColorTokens, TypographyTokens, SpacingTokens, AnimationTokens };

/**
 * Aggregated theme object combining all token categories.
 * Import this when a full theme reference is required, such as context providers
 * or style systems that expect a single theme object.
 */
export const theme = {
  colors,
  typography,
  spacing,
  animations,
} as const;

/** Consolidated type definition for the theme object. */
export type ThemeTokens = typeof theme;
