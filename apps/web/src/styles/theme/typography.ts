/**
 * Typography tokens define scalable, reusable text styles for Explorer Sessions.
 * Use these tokens in styled components, Tailwind overrides, or CSS-in-JS utilities
 * to align typography across the application.
 */
export const typography = {
  /**
   * Font family stacks used throughout the interface.
   */
  fontFamily: {
    /** Primary sans-serif stack for content and UI elements. */
    primary: '"Inter", "Helvetica Neue", Arial, sans-serif',
    /** Monospace stack for code snippets, telemetry readouts, and data displays. */
    mono: '"JetBrains Mono", "Fira Code", "SFMono-Regular", Menlo, monospace',
  },
  /**
   * Font size scale rooted in a mission control aesthetic ranging from compact labels to large displays.
   */
  fontSize: {
    /** 10px - Micro text such as timestamps or annotations. */
    nano: "10px",
    /** 12px - Secondary labels and helper text. */
    xs: "12px",
    /** 14px - Body copy and regular UI text. */
    sm: "14px",
    /** 16px - Primary body text and form inputs. */
    md: "16px",
    /** 18px - Emphasized body text or small headings. */
    lg: "18px",
    /** 20px - Large body text or compact subheadings. */
    xl: "20px",
    /** 24px - Section headings. */
    h4: "24px",
    /** 30px - Secondary page titles. */
    h3: "30px",
    /** 36px - Primary page titles. */
    h2: "36px",
    /** 48px - Hero and mission-critical callouts. */
    h1: "48px",
  },
  /**
   * Font weight options for varying emphasis.
   */
  fontWeight: {
    /** Regular weight for most body text. */
    regular: 400,
    /** Medium weight for emphasized text and buttons. */
    medium: 500,
    /** Semi-bold weight for subheadings and key labels. */
    semibold: 600,
    /** Bold weight for headlines and critical emphasis. */
    bold: 700,
  },
  /**
   * Line height scale used to maintain vertical rhythm across text sizes.
   */
  lineHeight: {
    /** Tight line height for compact labels. */
    tight: 1.2,
    /** Standard body line height for readability. */
    normal: 1.5,
    /** Relaxed line height for dense data tables or paragraphs. */
    relaxed: 1.7,
    /** Spaced line height for display text to create impact. */
    display: 1.1,
  },
} as const;

/**
 * TypeScript helper representing the typography token structure.
 */
export type TypographyTokens = typeof typography;
