import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

import { colors, animations } from "../../styles/theme";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg";

type ButtonCSSVariables = React.CSSProperties & {
  "--tw-ring-color"?: string;
  "--tw-ring-offset-color"?: string;
};

interface VariantDefinition {
  background: string;
  foreground: string;
  border?: string;
  hoverBackground?: string;
  activeBackground?: string;
  shadow: string;
  hoverShadow: string;
  activeShadow: string;
  focusRing: string;
  spinnerColor?: string;
}

export interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "color"> {
  /** Visual style of the button. */
  variant?: ButtonVariant;
  /** Size scale of the button. */
  size?: ButtonSize;
  /** Indicates a loading state and disables interaction. */
  loading?: boolean;
  /** Enables the glassmorphic styling overlay. */
  glass?: boolean;
  /** Icon rendered before the button label. */
  leadingIcon?: React.ReactNode;
  /** Icon rendered after the button label. */
  trailingIcon?: React.ReactNode;
  /** Accessible label announced while loading. */
  spinnerLabel?: string;
}

const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

const clampChannel = (value: number) => Math.max(0, Math.min(255, value));

const adjustHexBrightness = (hex: string, amount: number) => {
  if (!HEX_PATTERN.test(hex)) {
    return hex;
  }

  let normalized = hex.slice(1);
  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((char) => char + char)
      .join("");
  }

  const num = parseInt(normalized, 16);
  const delta = Math.round((amount / 100) * 255);
  const r = clampChannel((num >> 16) + delta);
  const g = clampChannel(((num >> 8) & 0xff) + delta);
  const b = clampChannel((num & 0xff) + delta);

  return `#${((1 << 24) + (r << 16) + (g << 8) + b)
    .toString(16)
    .slice(1)}`;
};

const hexToRgba = (hex: string, alpha: number) => {
  if (!HEX_PATTERN.test(hex)) {
    return hex;
  }

  let normalized = hex.slice(1);
  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((char) => char + char)
      .join("");
  }

  const int = parseInt(normalized, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const VARIANTS: Record<ButtonVariant, VariantDefinition> = {
  primary: {
    background: colors.accent.missionPurple,
    foreground: "#ffffff",
    hoverBackground: adjustHexBrightness(colors.accent.missionPurple, 10),
    activeBackground: adjustHexBrightness(colors.accent.missionPurple, -8),
    shadow: `0 16px 45px -24px ${colors.glow.primary}`,
    hoverShadow: `0 18px 60px -24px ${colors.glow.secondary}`,
    activeShadow: `0 12px 30px -18px ${colors.glow.primary}`,
    focusRing: colors.accent.orbitalBlue,
    spinnerColor: "#ffffff",
  },
  secondary: {
    background: colors.background.tertiary,
    foreground: "#f8fafc",
    hoverBackground: adjustHexBrightness(colors.background.tertiary, 6),
    activeBackground: adjustHexBrightness(colors.background.tertiary, -6),
    border: "rgba(148, 163, 184, 0.35)",
    shadow: `0 14px 40px -28px ${colors.glow.secondary}`,
    hoverShadow: `0 18px 50px -24px ${colors.glow.secondary}`,
    activeShadow: `0 12px 28px -20px ${colors.glow.secondary}`,
    focusRing: colors.accent.orbitalBlue,
    spinnerColor: "#f8fafc",
  },
  ghost: {
    background: colors.surface.glassLight,
    foreground: "#e2e8f0",
    hoverBackground: colors.surface.glassHighlight,
    activeBackground: colors.surface.glassDark,
    border: "rgba(226, 232, 240, 0.18)",
    shadow: `0 12px 36px -26px ${colors.glow.secondary}`,
    hoverShadow: `0 20px 45px -25px ${colors.glow.secondary}`,
    activeShadow: `0 10px 28px -22px ${colors.glow.secondary}`,
    focusRing: colors.accent.orbitalBlue,
    spinnerColor: colors.accent.orbitalBlue,
  },
  danger: {
    background: colors.status.danger,
    foreground: "#ffffff",
    hoverBackground: adjustHexBrightness(colors.status.danger, 12),
    activeBackground: adjustHexBrightness(colors.status.danger, -10),
    shadow: `0 16px 45px -24px ${colors.glow.danger}`,
    hoverShadow: `0 20px 55px -26px ${colors.glow.danger}`,
    activeShadow: `0 12px 32px -22px ${colors.glow.danger}`,
    focusRing: colors.status.danger,
    spinnerColor: "#ffffff",
  },
  success: {
    background: colors.status.success,
    foreground: "#052e16",
    hoverBackground: adjustHexBrightness(colors.status.success, 14),
    activeBackground: adjustHexBrightness(colors.status.success, -10),
    shadow: `0 18px 50px -28px ${colors.status.success}55`,
    hoverShadow: `0 22px 60px -26px ${colors.status.success}66`,
    activeShadow: `0 14px 36px -24px ${colors.status.success}55`,
    focusRing: colors.status.success,
    spinnerColor: "#052e16",
  },
};

const SIZE_MAP: Record<
  ButtonSize,
  { button: string; icon: string; contentGap: string }
> = {
  sm: { button: "text-sm px-4 py-2", icon: "h-4 w-4", contentGap: "gap-2" },
  md: { button: "text-base px-5 py-2.5", icon: "h-5 w-5", contentGap: "gap-2.5" },
  lg: { button: "text-lg px-6 py-3", icon: "h-6 w-6", contentGap: "gap-3" },
};

const Spinner: React.FC<{ color: string }> = ({ color }) => (
  <span
    className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-t-transparent"
    style={{ color }}
    aria-hidden="true"
  />
);

const MotionButton = motion.button;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      glass = false,
      leadingIcon,
      trailingIcon,
      spinnerLabel = "Processing",
      className,
      children,
      disabled,
      type,
      ...motionProps
    },
    ref,
  ) => {
    const variantStyles = React.useMemo(() => VARIANTS[variant], [variant]);
    const baseBackground = variantStyles.background;
    const computedBackground = glass
      ? `linear-gradient(135deg, ${hexToRgba(baseBackground, 0.88)}, ${colors.surface.glassLight})`
      : baseBackground;
    const hoverBackground = glass
      ? `linear-gradient(135deg, ${hexToRgba(
          adjustHexBrightness(baseBackground, 10),
          0.95,
        )}, ${colors.surface.glassHighlight})`
      : variantStyles.hoverBackground ?? baseBackground;
    const activeBackground = glass
      ? `linear-gradient(135deg, ${hexToRgba(
          adjustHexBrightness(baseBackground, -12),
          0.92,
        )}, ${colors.surface.glassDark})`
      : variantStyles.activeBackground ?? baseBackground;

    const isDisabled = Boolean(disabled) || loading;

    const buttonStyle: ButtonCSSVariables = {
      background: computedBackground,
      color: variantStyles.foreground,
      borderColor: variantStyles.border ?? "transparent",
      boxShadow: glass
        ? `${variantStyles.shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.18)`
        : variantStyles.shadow,
      backdropFilter: glass ? "blur(18px)" : undefined,
      WebkitBackdropFilter: glass ? "blur(18px)" : undefined,
      "--tw-ring-color": variantStyles.focusRing,
      "--tw-ring-offset-color": colors.background.secondary,
    };

    return (
      <MotionButton
        ref={ref}
        type={type ?? "button"}
        className={cn(
          "relative inline-flex select-none items-center justify-center overflow-hidden rounded-full border font-semibold tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70",
          SIZE_MAP[size].button,
          glass && "before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:bg-white/5 before:opacity-0 before:transition-opacity before:duration-200",
          !isDisabled &&
            "hover:before:opacity-100 focus-visible:before:opacity-100",
          className,
        )}
        style={buttonStyle}
        aria-busy={loading || undefined}
        aria-disabled={isDisabled || undefined}
        disabled={isDisabled}
        data-variant={variant}
        data-size={size}
        whileHover={
          isDisabled
            ? undefined
            : {
                scale: 1.02,
                boxShadow: glass
                  ? `${variantStyles.hoverShadow}, inset 0 1px 0 rgba(255, 255, 255, 0.28)`
                  : variantStyles.hoverShadow,
                background: hoverBackground,
              }
        }
        whileTap={
          isDisabled
            ? undefined
            : {
                scale: 0.97,
                boxShadow: glass
                  ? `${variantStyles.activeShadow}, inset 0 0 0 rgba(255, 255, 255, 0.18)`
                  : variantStyles.activeShadow,
                background: activeBackground,
              }
        }
        transition={{
          duration: animations.duration.fast,
          ease: animations.easing.easeOut,
        }}
        {...motionProps}
      >
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center" aria-live="polite">
            <Spinner color={variantStyles.spinnerColor ?? variantStyles.foreground} />
            <span className="sr-only">{spinnerLabel}</span>
          </span>
        )}
        <span
          className={cn(
            "flex w-full items-center justify-center",
            loading ? "opacity-0" : "opacity-100",
            SIZE_MAP[size].contentGap,
          )}
        >
          {leadingIcon && (
            <span
              className={cn(
                "inline-flex items-center justify-center shrink-0",
                SIZE_MAP[size].icon,
              )}
            >
              {leadingIcon}
            </span>
          )}
          <span className="relative z-10 whitespace-nowrap">{children}</span>
          {trailingIcon && (
            <span
              className={cn(
                "inline-flex items-center justify-center shrink-0",
                SIZE_MAP[size].icon,
              )}
            >
              {trailingIcon}
            </span>
          )}
        </span>
      </MotionButton>
    );
  },
);

Button.displayName = "Button";
