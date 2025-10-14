/**
 * Spacing tokens define the consistent rhythm for paddings, margins, and gaps.
 * All values are derived from a 4px base unit to make layout math predictable.
 */
export const spacing = {
  /** Base unit used to derive the spacing scale. */
  baseUnit: 4,
  /**
   * Scalar spacing values expressed in pixels. Keys are the pixel amounts for ease of lookup.
   */
  scale: {
    0: "0px",
    4: "4px",
    8: "8px",
    12: "12px",
    16: "16px",
    20: "20px",
    24: "24px",
    28: "28px",
    32: "32px",
    36: "36px",
    40: "40px",
    44: "44px",
    48: "48px",
    52: "52px",
    56: "56px",
    60: "60px",
    64: "64px",
    68: "68px",
    72: "72px",
    76: "76px",
    80: "80px",
    84: "84px",
    88: "88px",
    92: "92px",
    96: "96px",
  } as const,
  /**
   * Semantic spacing tokens for frequently used layout patterns.
   */
  layout: {
    /** Default gap between stacked sections. */
    sectionGap: "48px",
    /** Padding applied inside cards and glass panels. */
    cardPadding: "24px",
    /** Standard gutter used for responsive containers. */
    containerGutter: "32px",
  },
} as const;

/**
 * TypeScript helper representing the spacing token structure.
 */
export type SpacingTokens = typeof spacing;
