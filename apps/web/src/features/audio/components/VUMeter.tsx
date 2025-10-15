import { useMemo } from 'react';
import { motion } from 'framer-motion';

import { cn } from '../../../lib/utils';

const DEFAULT_MIN_DB = -60;
const DEFAULT_MAX_DB = 6;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const normalise = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return 0;
  if (max - min === 0) return 0;
  return clamp01((value - min) / (max - min));
};

export interface VUMeterProps {
  rmsDb: number;
  peakDb?: number;
  minDb?: number;
  maxDb?: number;
  orientation?: 'vertical' | 'horizontal';
  muted?: boolean;
  className?: string;
  showTicks?: boolean;
}

export function VUMeter({
  rmsDb,
  peakDb,
  minDb = DEFAULT_MIN_DB,
  maxDb = DEFAULT_MAX_DB,
  orientation = 'vertical',
  muted = false,
  className,
  showTicks = true,
}: VUMeterProps) {
  const rmsNorm = useMemo(() => normalise(rmsDb, minDb, maxDb), [maxDb, minDb, rmsDb]);
  const peakNorm = useMemo(
    () => (peakDb !== undefined ? normalise(peakDb, minDb, maxDb) : normalise(rmsDb, minDb, maxDb)),
    [maxDb, minDb, peakDb, rmsDb]
  );

  const vertical = orientation === 'vertical';

  return (
    <div
      className={cn(
        'relative flex overflow-hidden rounded-full border border-white/10 bg-slate-950/70 p-[3px]',
        vertical ? 'flex-col' : 'h-3 w-full items-center',
        className
      )}
    >
      <div className={cn('relative flex-1 overflow-hidden rounded-full bg-slate-900/80', vertical ? 'flex flex-col' : '')}>
        <motion.div
          aria-hidden
          className={cn(
            'absolute left-0 top-0 rounded-full bg-gradient-to-t from-emerald-400 via-sky-500 to-purple-400 shadow-[0_0_30px_rgba(56,189,248,0.45)]',
            vertical ? 'w-full origin-bottom' : 'h-full origin-left'
          )}
          animate={vertical ? { scaleY: muted ? 0 : rmsNorm } : { scaleX: muted ? 0 : rmsNorm }}
          transition={{ type: 'spring', stiffness: 240, damping: 32, mass: 0.5 }}
        />
        {showTicks && (
          <div
            className={cn(
              'pointer-events-none absolute inset-0 flex justify-between px-1 text-[0.55rem] uppercase tracking-[0.4em] text-white/20',
              vertical ? 'flex-col py-2' : 'items-center'
            )}
          >
            <span className="h-px w-full bg-white/15" />
            <span className="h-px w-full bg-white/10" />
            <span className="h-px w-full bg-white/15" />
          </div>
        )}
        <motion.div
          aria-hidden
          className={cn(
            'pointer-events-none absolute rounded-full bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.5)]',
            vertical ? 'left-1/2 h-0.5 w-[70%] -translate-x-1/2' : 'top-1/2 h-[70%] w-0.5 -translate-y-1/2'
          )}
          style={
            vertical
              ? { bottom: `${clamp01(peakNorm) * 100}%` }
              : { left: `${clamp01(peakNorm) * 100}%` }
          }
          transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.4 }}
        />
        <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/10 via-transparent to-white/5" />
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";

type Orientation = "vertical" | "horizontal";

export interface VUMeterProps {
  /** Current RMS or averaged level in decibels. */
  level: number;
  /** Peak level in decibels. */
  peak: number;
  /** Optional channel label (e.g. "L", "R"). */
  channel?: string;
  /** Meter orientation. Defaults to vertical. */
  orientation?: Orientation;
  /** Optional override for ARIA label. */
  ariaLabel?: string;
}

const MIN_DB = -60;
const MAX_DB = 3;
const SCALE_MARKS = [-60, -40, -20, -10, -6, -3, 0, 3];
const PEAK_DECAY_DB_PER_SEC = 12;
const LEVEL_SMOOTHING = 0.18;
const CLIP_HOLD_MS = 180;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const dbToUnit = (db: number) => {
  const clamped = clamp(db, MIN_DB, MAX_DB);
  return (clamped - MIN_DB) / (MAX_DB - MIN_DB);
};

const VUMeter = ({
  level,
  peak,
  channel = "",
  orientation = "vertical",
  ariaLabel,
}: VUMeterProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number>();
  const devicePixelRatioRef = useRef(1);
  const targetLevelRef = useRef(level);
  const displayedLevelRef = useRef(level);
  const targetPeakRef = useRef(peak);
  const displayedPeakHoldRef = useRef(peak);
  const clipTimestampRef = useRef<number>(0);
  const lastTimestampRef = useRef<number>();

  useEffect(() => {
    targetLevelRef.current = level;
  }, [level]);

  useEffect(() => {
    targetPeakRef.current = peak;
  }, [peak]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const resizeCanvas = () => {
      const baseWidth = orientation === "vertical" ? 64 : 220;
      const baseHeight = orientation === "vertical" ? 220 : 64;
      const dpr = window.devicePixelRatio || 1;
      devicePixelRatioRef.current = dpr;
      canvas.width = baseWidth * dpr;
      canvas.height = baseHeight * dpr;
      canvas.style.width = `${baseWidth}px`;
      canvas.style.height = `${baseHeight}px`;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(dpr, dpr);
    };

    resizeCanvas();
    displayedLevelRef.current = clamp(targetLevelRef.current, MIN_DB, MAX_DB);
    displayedPeakHoldRef.current = clamp(targetPeakRef.current, MIN_DB, MAX_DB);

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resizeCanvas) : null;
    observer?.observe(canvas);

    const animate = (timestamp: number) => {
      if (!canvasRef.current) {
        return;
      }

      const now = timestamp;
      const last = lastTimestampRef.current ?? now;
      const deltaSeconds = (now - last) / 1000;
      lastTimestampRef.current = now;

      // Smooth level animation
      const targetLevel = clamp(targetLevelRef.current, MIN_DB, MAX_DB);
      const displayedLevel = displayedLevelRef.current;
      const levelDelta = targetLevel - displayedLevel;
      displayedLevelRef.current = displayedLevel + levelDelta * LEVEL_SMOOTHING;

      // Peak hold logic with decay
      const targetPeak = clamp(targetPeakRef.current, MIN_DB, MAX_DB);
      const currentPeak = displayedPeakHoldRef.current;
      if (targetPeak > currentPeak) {
        displayedPeakHoldRef.current = targetPeak;
      } else {
        displayedPeakHoldRef.current = Math.max(
          MIN_DB,
          currentPeak - PEAK_DECAY_DB_PER_SEC * deltaSeconds,
        );
      }

      if (Math.max(targetPeak, targetLevel) > 0) {
        clipTimestampRef.current = now;
      }

      drawMeter(context, orientation, now);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      observer?.disconnect();
      lastTimestampRef.current = undefined;
    };
  }, [orientation]);

  const drawMeter = (
    context: CanvasRenderingContext2D,
    direction: Orientation,
    timestamp: number,
  ) => {
    const canvas = context.canvas;
    const width = canvas.width / devicePixelRatioRef.current;
    const height = canvas.height / devicePixelRatioRef.current;

    context.clearRect(0, 0, width, height);

    const padding = 12;
    const meterThickness = direction === "vertical" ? width - padding * 2 : height - padding * 2;
    const meterLength = direction === "vertical" ? height - padding * 2 : width - padding * 2;

    // Background
    context.fillStyle = "#141414";
    context.fillRect(0, 0, width, height);

    // Gradient for meter fill
    const gradient =
      direction === "vertical"
        ? context.createLinearGradient(0, height - padding, 0, padding)
        : context.createLinearGradient(padding, padding, width - padding, padding);
    gradient.addColorStop(0, "#0f0");
    gradient.addColorStop(0.6, "#ff0");
    gradient.addColorStop(0.85, "#f90");
    gradient.addColorStop(1, "#f00");

    const borderRadius = 6;
    const cornerWidth = direction === "vertical" ? meterThickness : meterLength;
    const cornerHeight = direction === "vertical" ? meterLength : meterThickness;

    // Draw meter background track
    context.save();
    context.translate(padding, padding);

    context.fillStyle = "#1f1f1f";
    roundRect(context, 0, 0, cornerWidth, cornerHeight, borderRadius);
    context.fill();

    const normalizedLevel = dbToUnit(displayedLevelRef.current);
    const normalizedPeak = dbToUnit(displayedPeakHoldRef.current);

    context.fillStyle = gradient;
    if (direction === "vertical") {
      const fillHeight = normalizedLevel * cornerHeight;
      if (fillHeight > 0) {
        context.save();
        roundRect(
          context,
          0,
          cornerHeight - fillHeight,
          cornerWidth,
          fillHeight,
          borderRadius,
        );
        context.clip();
        context.fillRect(0, cornerHeight - fillHeight, cornerWidth, fillHeight);
        context.restore();
      }
    } else {
      const fillWidth = normalizedLevel * cornerWidth;
      if (fillWidth > 0) {
        context.save();
        roundRect(context, 0, 0, fillWidth, cornerHeight, borderRadius);
        context.clip();
        context.fillRect(0, 0, fillWidth, cornerHeight);
        context.restore();
      }
    }

    // Peak hold indicator
    context.strokeStyle = "rgba(255,255,255,0.9)";
    context.lineWidth = 2;
    context.beginPath();
    if (direction === "vertical") {
      const peakY = cornerHeight - normalizedPeak * cornerHeight;
      context.moveTo(0, peakY);
      context.lineTo(cornerWidth, peakY);
    } else {
      const peakX = normalizedPeak * cornerWidth;
      context.moveTo(peakX, 0);
      context.lineTo(peakX, cornerHeight);
    }
    context.stroke();

    // Scale markings
    context.fillStyle = "#cfcfcf";
    context.font = "10px Inter, system-ui, sans-serif";
    context.textAlign = direction === "vertical" ? "left" : "center";
    context.textBaseline = direction === "vertical" ? "middle" : "top";

    SCALE_MARKS.forEach((mark) => {
      const unit = dbToUnit(mark);
      if (direction === "vertical") {
        const y = cornerHeight - unit * cornerHeight;
        context.strokeStyle = "rgba(255,255,255,0.2)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(cornerWidth, y);
        context.lineTo(cornerWidth + 8, y);
        context.stroke();
        context.fillText(`${mark > 0 ? "+" : ""}${mark}`, cornerWidth + 12, y);
      } else {
        const x = unit * cornerWidth;
        context.strokeStyle = "rgba(255,255,255,0.2)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, cornerHeight);
        context.lineTo(x, cornerHeight + 8);
        context.stroke();
        context.fillText(`${mark > 0 ? "+" : ""}${mark}`, x, cornerHeight + 12);
      }
    });

    // Clip flash overlay
    const clipActive = timestamp - clipTimestampRef.current < CLIP_HOLD_MS;
    if (clipActive) {
      context.fillStyle = "rgba(255, 0, 0, 0.25)";
      context.fillRect(-padding, -padding, width, height);
    }

    context.restore();

    // Channel label
    if (channel) {
      context.fillStyle = "#e4e4e4";
      context.font = "12px Inter, system-ui, sans-serif";
      if (direction === "vertical") {
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(channel, width / 2, height - 16);
      } else {
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.fillText(channel, width - 12, height / 2);
      }
    }
  };

  return (
    <div
      className="flex flex-col items-center"
      role="meter"
      aria-label={ariaLabel ?? `VU meter ${channel ? `for channel ${channel}` : ""}`.trim()}
      aria-valuemin={MIN_DB}
      aria-valuemax={MAX_DB}
      aria-valuenow={clamp(level, MIN_DB, MAX_DB)}
      aria-valuetext={`${Math.round(level * 10) / 10} dB`}
    >
      <canvas ref={canvasRef} className="rounded-md shadow-inner" />
    </div>
  );
};

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

export default VUMeter;
