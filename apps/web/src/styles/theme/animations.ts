/**
 * Animation tokens encapsulate shared easing curves, durations, and motion variants.
 * They are optimized for use with CSS transitions or Framer Motion components.
 */
export const animations = {
  /**
   * Common easing curves expressed as cubic-bezier tuples or Framer Motion spring configs.
   */
  easing: {
    /**
     * Spring configuration ideal for subtle interface micro-interactions (Framer Motion).
     */
    spring: {
      type: "spring" as const,
      stiffness: 220,
      damping: 28,
      mass: 1,
    },
    /** Balanced ease-in-out cubic-bezier for smooth enter/exit transitions. */
    easeInOut: [0.45, 0, 0.55, 1] as const,
    /** Fast ease-out curve suited for hover states and quick reveals. */
    easeOut: [0.16, 1, 0.3, 1] as const,
    /** Linear timing for continuous animations like progress indicators. */
    linear: [0, 0, 1, 1] as const,
  },
  /**
   * Duration presets expressed in seconds to standardize timing across transitions.
   */
  duration: {
    /** Snappy interactions such as hover states or icon toggles. */
    fast: 0.18,
    /** Default duration for modals, dropdowns, and fade transitions. */
    medium: 0.32,
    /** Use for onboarding steps or significant layout shifts. */
    slow: 0.6,
  },
  /**
   * Reusable motion variants for Framer Motion animations.
   */
  variants: {
    /** Fade upward entrance, commonly used for list items or cards. */
    fadeInUp: {
      hidden: { opacity: 0, y: 16 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const },
      },
    },
    /** Slight zoom-in combined with fade for emphasizing key content. */
    scaleIn: {
      hidden: { opacity: 0, scale: 0.95 },
      visible: {
        opacity: 1,
        scale: 1,
        transition: { duration: 0.32, ease: [0.45, 0, 0.55, 1] as const },
      },
    },
    /** Fade with horizontal movement for slide-over panels. */
    fadeInRight: {
      hidden: { opacity: 0, x: 32 },
      visible: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
      },
    },
  },
} as const;

/**
 * TypeScript helper representing the animation token structure.
 */
export type AnimationTokens = typeof animations;
