import {
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '../../../lib/utils';

type WaveformColorScheme = {
  background: string;
  waveform: string;
  progress: string;
  grid: string;
  cursor: string;
};

export interface WaveformProps {
  /** AudioBuffer source for the waveform. */
  audioBuffer?: AudioBuffer | null;
  /** Raw PCM data for the waveform. */
  data?: Float32Array | number[];
  /** Explicit sample rate when providing raw data. */
  sampleRate?: number;
  /** Width of the canvas in CSS pixels. */
  width?: number;
  /** Height of the canvas in CSS pixels. */
  height?: number;
  /** Custom colors to match the host theme. */
  colorScheme?: Partial<WaveformColorScheme>;
  /** Enables hover, click-to-seek and zoom controls. */
  interactive?: boolean;
  /** Current playback head position in seconds. */
  currentTime?: number;
  /** Duration in seconds when not inferable from sources. */
  duration?: number;
  /** Callback fired when the user seeks via click interaction. */
  onSeek?: (time: number) => void;
  /** Optional CSS className for the outer wrapper. */
  className?: string;
  /** Accessible label announced for the waveform graphic. */
  ariaLabel?: string;
}

const DEFAULT_DIMENSIONS = { width: 640, height: 160 };

const DEFAULT_COLORS: WaveformColorScheme = {
  background: '#030712',
  waveform: '#38bdf8',
  progress: '#22d3ee',
  grid: 'rgba(148, 163, 184, 0.18)',
  cursor: '#f97316',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '–:––';
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const secs = clamped - minutes * 60;
  return `${minutes}:${secs.toFixed(2).padStart(5, '0')}`;
};

const mergeColorScheme = (custom?: Partial<WaveformColorScheme>): WaveformColorScheme => ({
  ...DEFAULT_COLORS,
  ...custom,
});

type Peaks = {
  min: Float32Array;
  max: Float32Array;
  startSample: number;
  endSample: number;
};

export function Waveform({
  audioBuffer,
  data,
  sampleRate,
  width: widthProp,
  height: heightProp,
  colorScheme,
  interactive = true,
  currentTime = 0,
  duration: durationProp,
  onSeek,
  className,
  ariaLabel = 'Waveform visualisation',
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const devicePixelRatioRef = useRef(1);
  const animationFrameRef = useRef<number>();
  const targetProgressRef = useRef(0);
  const displayedProgressRef = useRef(0);

  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewStart, setViewStart] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ clientX: number; startView: number } | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(widthProp ?? DEFAULT_DIMENSIONS.width);

  const width = Math.max(1, widthProp ?? measuredWidth);
  const height = heightProp ?? DEFAULT_DIMENSIONS.height;
  const colors = useMemo(() => mergeColorScheme(colorScheme), [colorScheme]);

  const resolvedSampleRate = useMemo(() => {
    if (audioBuffer) return audioBuffer.sampleRate;
    if (sampleRate) return sampleRate;
    return 44100;
  }, [audioBuffer, sampleRate]);

  const channelData = useMemo(() => {
    if (audioBuffer) {
      try {
        return audioBuffer.numberOfChannels > 0
          ? audioBuffer.getChannelData(0)
          : new Float32Array();
      } catch (error) {
        console.warn('Waveform: Unable to access AudioBuffer channel data', error);
        return new Float32Array();
      }
    }
    if (data instanceof Float32Array) {
      return data;
    }
    if (Array.isArray(data)) {
      return Float32Array.from(data);
    }
    return undefined;
  }, [audioBuffer, data]);

  const totalSamples = channelData?.length ?? 0;

  const duration = useMemo(() => {
    if (durationProp !== undefined) return durationProp;
    if (audioBuffer) return audioBuffer.duration;
    if (channelData && resolvedSampleRate) {
      return channelData.length / resolvedSampleRate;
    }
    return undefined;
  }, [audioBuffer, channelData, durationProp, resolvedSampleRate]);

  const visibleFraction = useMemo(() => 1 / zoomLevel, [zoomLevel]);
  const maxViewStart = useMemo(() => Math.max(0, 1 - visibleFraction), [visibleFraction]);

  useEffect(() => {
    setViewStart(prev => clamp(prev, 0, maxViewStart));
  }, [maxViewStart]);

  useEffect(() => {
    if (widthProp !== undefined) return;
    const element = areaRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      setMeasuredWidth(Math.max(80, entry.contentRect.width));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [widthProp]);

  const peaks = useMemo<Peaks | null>(() => {
    if (!channelData || width <= 0 || totalSamples === 0) {
      return null;
    }

    const startSample = Math.floor(totalSamples * viewStart);
    const endSample = Math.min(totalSamples, Math.ceil(totalSamples * (viewStart + visibleFraction)));
    const range = Math.max(1, endSample - startSample);
    const pixelCount = Math.max(1, Math.floor(width));
    const samplesPerPixel = Math.max(1, Math.floor(range / pixelCount));

    const min = new Float32Array(pixelCount);
    const max = new Float32Array(pixelCount);

    min.fill(1);
    max.fill(-1);

    for (let i = 0; i < pixelCount; i += 1) {
      const segmentStart = startSample + i * samplesPerPixel;
      if (segmentStart >= endSample) break;
      const segmentEnd = Math.min(endSample, segmentStart + samplesPerPixel);
      let minValue = 1;
      let maxValue = -1;

      for (let j = segmentStart; j < segmentEnd; j += 1) {
        const sample = channelData[j];
        if (sample < minValue) minValue = sample;
        if (sample > maxValue) maxValue = sample;
      }

      min[i] = minValue;
      max[i] = maxValue;
    }

    return {
      min,
      max,
      startSample,
      endSample,
    };
  }, [channelData, totalSamples, viewStart, visibleFraction, width]);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = devicePixelRatioRef.current;
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    context.fillStyle = colors.background;
    context.fillRect(0, 0, width, height);

    if (duration && duration > 0) {
      const visibleDuration = duration * visibleFraction;
      const startTime = duration * viewStart;
      const endTime = startTime + visibleDuration;
      const firstMarker = Math.ceil(startTime);

      context.strokeStyle = colors.grid;
      context.lineWidth = 1;
      context.setLineDash([4, 4]);

      for (let marker = firstMarker; marker < endTime; marker += 1) {
        const positionRatio = (marker - startTime) / visibleDuration;
        const x = positionRatio * width;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }

      context.setLineDash([]);
      context.fillStyle = 'rgba(148, 163, 184, 0.08)';
      context.fillRect(0, height / 2 - 0.5, width, 1);
    }

    if (peaks) {
      context.strokeStyle = colors.waveform;
      context.lineWidth = 1.5;
      context.beginPath();

      for (let x = 0; x < peaks.max.length; x += 1) {
        const maxValue = peaks.max[x];
        const minValue = peaks.min[x];
        const top = (1 - (maxValue + 1) / 2) * height;
        const bottom = (1 - (minValue + 1) / 2) * height;

        const drawX = x + 0.5;
        context.moveTo(drawX, top);
        context.lineTo(drawX, bottom);
      }

      context.stroke();
    }

    const visibleProgress = (() => {
      if (!duration || duration <= 0) return null;
      const clampedProgress = clamp(displayedProgressRef.current, 0, 1);
      const viewEnd = viewStart + visibleFraction;
      if (clampedProgress < viewStart || clampedProgress > viewEnd) {
        return null;
      }
      return (clampedProgress - viewStart) / visibleFraction;
    })();

    if (visibleProgress !== null) {
      context.save();
      context.globalAlpha = 0.12;
      context.fillStyle = colors.progress;
      context.fillRect(0, 0, visibleProgress * width, height);
      context.restore();

      context.strokeStyle = colors.progress;
      context.lineWidth = 2;
      const x = visibleProgress * width;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    if (hoverX !== null && interactive) {
      const clampedX = clamp(hoverX, 0, width);
      context.strokeStyle = colors.cursor;
      context.setLineDash([3, 6]);
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(clampedX, 0);
      context.lineTo(clampedX, height);
      context.stroke();
      context.setLineDash([]);
    }

    context.restore();
  }, [colors.background, colors.cursor, colors.grid, colors.progress, colors.waveform, duration, height, hoverX, interactive, peaks, viewStart, visibleFraction, width]);

  useEffect(() => {
    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      devicePixelRatioRef.current = dpr;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      drawWaveform();
    };

    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawWaveform, height, width]);

  useEffect(() => {
    targetProgressRef.current = duration && duration > 0 ? clamp(currentTime / duration, 0, 1) : 0;
  }, [currentTime, duration]);

  useEffect(() => {
    const animate = () => {
      const target = targetProgressRef.current;
      const current = displayedProgressRef.current;
      const next = current + (target - current) * 0.15;
      if (Math.abs(next - target) < 0.0002) {
        displayedProgressRef.current = target;
      } else {
        displayedProgressRef.current = next;
      }
      drawWaveform();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [drawWaveform]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!duration || !interactive) return;
    const progress = duration > 0 ? clamp(currentTime / duration, 0, 1) : 0;
    const progressStart = progress - visibleFraction;
    if (progress > viewStart + visibleFraction) {
      setViewStart(prev => clamp(progress - visibleFraction + visibleFraction * 0.1, 0, maxViewStart));
    } else if (progressStart < viewStart) {
      setViewStart(prev => clamp(progress - visibleFraction * 0.1, 0, maxViewStart));
    }
  }, [currentTime, duration, interactive, maxViewStart, viewStart, visibleFraction]);

  const updateHover = useCallback(
    (clientX: number) => {
      if (!interactive) return;
      const canvas = canvasRef.current;
      if (!canvas || !duration) return;
      const rect = canvas.getBoundingClientRect();
      const x = clamp(clientX - rect.left, 0, rect.width);
      const ratioWithinView = rect.width > 0 ? x / rect.width : 0;
      const time = duration * (viewStart + ratioWithinView * visibleFraction);
      setHoverX(x);
      setHoverTime(time);
    },
    [duration, interactive, viewStart, visibleFraction],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (!interactive) return;
      if (isPanning && panStart) {
        const delta = event.clientX - panStart.clientX;
        const nextViewStart = clamp(panStart.startView - (delta / width) * visibleFraction, 0, maxViewStart);
        setViewStart(nextViewStart);
        return;
      }
      updateHover(event.clientX);
    },
    [interactive, isPanning, maxViewStart, panStart, updateHover, visibleFraction, width],
  );

  const handlePointerLeave = useCallback(() => {
    if (!interactive) return;
    setHoverX(null);
    setHoverTime(null);
    setIsPanning(false);
    setPanStart(null);
  }, [interactive]);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      if (!interactive || !onSeek || !duration) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, rect.width);
      const ratioWithinView = rect.width > 0 ? x / rect.width : 0;
      const time = duration * (viewStart + ratioWithinView * visibleFraction);
      onSeek(time);
    },
    [duration, interactive, onSeek, viewStart, visibleFraction],
  );

  const changeZoom = useCallback(
    (factor: number, anchorRatio = 0.5) => {
      setZoomLevel(prev => {
        const maxZoom = totalSamples > 0 ? Math.min(128, Math.max(1, totalSamples / Math.max(width / 4, 1))) : 64;
        const nextZoom = clamp(prev * factor, 1, maxZoom);
        if (nextZoom === prev) return prev;
        setViewStart(prevStart => {
          const previousVisible = 1 / prev;
          const targetPosition = prevStart + previousVisible * anchorRatio;
          const nextVisible = 1 / nextZoom;
          const nextStart = clamp(targetPosition - nextVisible * anchorRatio, 0, Math.max(0, 1 - nextVisible));
          return nextStart;
        });
        return nextZoom;
      });
    },
    [totalSamples, width],
  );

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (!interactive) return;
      if (!event.ctrlKey && Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
        return;
      }
      event.preventDefault();
      const zoomFactor = event.deltaY > 0 ? 1 / 1.1 : 1.1;
      changeZoom(zoomFactor, 0.5);
    },
    [changeZoom, interactive],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (!interactive) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setIsPanning(true);
      setPanStart({ clientX: event.clientX, startView: viewStart });
      updateHover(event.clientX);
    },
    [interactive, updateHover, viewStart],
  );

  const handlePointerUp = useCallback((event?: PointerEvent<HTMLCanvasElement>) => {
    if (event) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    setIsPanning(false);
    setPanStart(null);
  }, []);

  const hoverLabel = hoverTime !== null ? formatTime(hoverTime) : null;
  const tooltipLeft = hoverX !== null ? clamp(hoverX, 12, width - 12) : 0;

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'relative flex select-none flex-col gap-2 rounded-xl border border-white/5 bg-slate-950/70 p-4 shadow-lg shadow-sky-950/20',
        className,
      )}
    >
      <div className="flex items-center justify-between text-xs font-medium text-slate-300">
        <span>{ariaLabel}</span>
        {interactive && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-7 items-center justify-center rounded-md border border-white/10 bg-white/5 px-2 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-200 shadow-sm transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              onClick={() => changeZoom(1 / 1.2)}
              aria-label="Zoom out waveform"
            >
              –
            </button>
            <button
              type="button"
              className="inline-flex h-7 items-center justify-center rounded-md border border-white/10 bg-white/5 px-2 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-200 shadow-sm transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              onClick={() => changeZoom(1.2)}
              aria-label="Zoom in waveform"
            >
              +
            </button>
            <button
              type="button"
              className="inline-flex h-7 items-center justify-center rounded-md border border-white/10 bg-white/5 px-2 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-200 shadow-sm transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              onClick={() => {
                setZoomLevel(1);
                setViewStart(0);
              }}
              aria-label="Reset waveform zoom"
            >
              Reset
            </button>
          </div>
        )}
      </div>
      <div ref={areaRef} className="relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={ariaLabel}
          tabIndex={interactive ? 0 : -1}
          className={cn('block rounded-lg bg-transparent', interactive ? 'cursor-crosshair' : 'cursor-default')}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={handleClick}
        />
        {hoverLabel && interactive && (
          <div
            aria-hidden
            className="pointer-events-none absolute -top-3 translate-y-[-100%] rounded-md bg-slate-900/95 px-2 py-1 text-[0.65rem] font-semibold text-slate-100 shadow-lg"
            style={{
              left: tooltipLeft,
              transform: 'translate(-50%, -8px)',
            }}
          >
            {hoverLabel}
          </div>
        )}
        <span className="sr-only" aria-live="polite">
          {hoverLabel ? `Pointer at ${hoverLabel}` : 'No pointer over waveform'}
        </span>
      </div>
      <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-wide text-slate-400">
        <span>Zoom ×{zoomLevel.toFixed(2)}</span>
        <span>
          {duration ? formatTime(duration * viewStart) : '–:––'} –{' '}
          {duration ? formatTime(duration * (viewStart + visibleFraction)) : '–:––'}
        </span>
      </div>
    </div>
  );
}

export default Waveform;
