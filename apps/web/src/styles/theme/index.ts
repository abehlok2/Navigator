export { colors } from "./colors";
export type { ColorTokens } from "./colors";
export { typography } from "./typography";
export type { TypographyTokens } from "./typography";
export { spacing } from "./spacing";
export type { SpacingTokens } from "./spacing";
export { animations } from "./animations";
export type { AnimationTokens } from "./animations";

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
