import React, { useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

import { cn } from '../../../lib/utils';

export interface WaveformProps {
  left?: Float32Array | null;
  right?: Float32Array | null;
  className?: string;
  highlight?: 'sky' | 'emerald' | 'rose';
}

const GRADIENTS: Record<NonNullable<WaveformProps['highlight']>, [string, string, string]> = {
  sky: ['rgba(56,189,248,0.55)', 'rgba(99,102,241,0.5)', 'rgba(59,130,246,0.35)'],
  emerald: ['rgba(52,211,153,0.55)', 'rgba(16,185,129,0.45)', 'rgba(56,189,248,0.35)'],
  rose: ['rgba(244,63,94,0.6)', 'rgba(236,72,153,0.5)', 'rgba(251,113,133,0.35)'],
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const mapSampleToY = (sample: number, height: number) => {
  const clamped = clamp(sample, -1, 1);
  return ((1 - clamped) * height) / 2;
};

const computeExtents = (samples: Float32Array | null | undefined, width: number) => {
  const min = new Float32Array(width);
  const max = new Float32Array(width);
  min.fill(0);
  max.fill(0);
  if (!samples || samples.length === 0 || width === 0) {
    return { min, max };
  }
  const bucketSize = Math.max(1, Math.floor(samples.length / width));
  for (let x = 0; x < width; x++) {
    const start = x * bucketSize;
    let bucketMin = 1;
    let bucketMax = -1;
    for (let i = 0; i < bucketSize && start + i < samples.length; i++) {
      const sample = samples[start + i];
      if (sample < bucketMin) bucketMin = sample;
      if (sample > bucketMax) bucketMax = sample;
    }
    if (bucketMin > bucketMax) {
      bucketMin = bucketMax = 0;
    }
    min[x] = bucketMin;
    max[x] = bucketMax;
  }
  return { min, max };
};

const Waveform: React.FC<WaveformProps> = ({ left, right, className, highlight = 'sky' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gradient = GRADIENTS[highlight];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = Math.max(1, Math.floor(canvas.clientWidth || 1));
    const logicalHeight = Math.max(1, Math.floor(canvas.clientHeight || 1));
    if (canvas.width !== logicalWidth * dpr || canvas.height !== logicalHeight * dpr) {
      canvas.width = logicalWidth * dpr;
      canvas.height = logicalHeight * dpr;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, logicalWidth, logicalHeight);

    const leftExtents = computeExtents(left ?? null, logicalWidth);
    const rightExtents = computeExtents(right ?? null, logicalWidth);

    const min = new Float32Array(logicalWidth);
    const max = new Float32Array(logicalWidth);
    for (let x = 0; x < logicalWidth; x++) {
      min[x] = Math.min(leftExtents.min[x], rightExtents.min[x]);
      max[x] = Math.max(leftExtents.max[x], rightExtents.max[x]);
    }

    const gradientFill = context.createLinearGradient(0, 0, 0, logicalHeight);
    gradientFill.addColorStop(0, gradient[0]);
    gradientFill.addColorStop(0.5, gradient[1]);
    gradientFill.addColorStop(1, gradient[2]);

    context.fillStyle = gradientFill;

    for (let x = 0; x < logicalWidth; x++) {
      const top = mapSampleToY(max[x], logicalHeight);
      const bottom = mapSampleToY(min[x], logicalHeight);
      const height = Math.max(1, bottom - top);
      context.fillRect(x, top, 1, height);
    }

    // Overlay glow
    const overlay = context.createLinearGradient(0, 0, 0, logicalHeight);
    overlay.addColorStop(0, 'rgba(255,255,255,0.1)');
    overlay.addColorStop(0.5, 'rgba(255,255,255,0)');
    overlay.addColorStop(1, 'rgba(15,23,42,0.35)');
    context.fillStyle = overlay;
    context.fillRect(0, 0, logicalWidth, logicalHeight);
  }, [gradient, left, right]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-950/70 via-slate-950/60 to-slate-950/80 shadow-[0_20px_80px_-60px_rgba(59,130,246,0.65)]',
        className
      )}
    >
      <canvas ref={canvasRef} className="h-48 w-full" aria-hidden />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-slate-950/40"
        initial={{ opacity: 0.35 }}
        animate={{ opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.2),transparent_60%)]"
        initial={{ opacity: 0.3 }}
        animate={{ opacity: [0.2, 0.45, 0.2] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
      />
    </div>
  );
};

export default Waveform;
