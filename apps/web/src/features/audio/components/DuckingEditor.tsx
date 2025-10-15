import React, { useEffect, useMemo, useState } from 'react';

import type { ControlChannel } from '../../control/channel';
import { useSessionStore } from '../../../state/session';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
} from '../../../components/ui/glass-card';
import { cn } from '../../../lib/utils';

interface DuckingEditorProps {
  control: ControlChannel | null;
  className?: string;
}

interface DuckingPreset {
  name: string;
  thresholdDb: number;
  reduceDb: number;
  attackMs: number;
  releaseMs: number;
  description: string;
}

const THRESHOLD_MIN = -80;
const THRESHOLD_MAX = -10;
const REDUCTION_MIN = -24;
const REDUCTION_MAX = 0;
const ATTACK_MIN = 5;
const ATTACK_MAX = 200;
const RELEASE_MIN = 50;
const RELEASE_MAX = 2000;

const PRESETS: DuckingPreset[] = [
  {
    name: 'Gentle',
    thresholdDb: -55,
    reduceDb: -6,
    attackMs: 80,
    releaseMs: 650,
    description: 'Keeps ambience present while ducking dialogue lightly.',
  },
  {
    name: 'Moderate',
    thresholdDb: -48,
    reduceDb: -12,
    attackMs: 45,
    releaseMs: 420,
    description: 'Balanced settings that suit most facilitator-led sessions.',
  },
  {
    name: 'Aggressive',
    thresholdDb: -42,
    reduceDb: -18,
    attackMs: 25,
    releaseMs: 280,
    description: 'Snappy ducking for crowded mixes or noisy contributors.',
  },
];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const linearToDb = (value: number) => (value <= 0 ? -96 : 20 * Math.log10(value));
const dbToLinear = (value: number) => Math.pow(10, value / 20);
const formatDb = (value: number, digits = 1) => `${value.toFixed(digits)} dB`;
const formatMs = (value: number) => `${Math.round(value)} ms`;

const normalizeDb = (value: number, min: number, max: number) => {
  const clamped = Math.max(min, Math.min(max, value));
  return (clamped - min) / (max - min || 1);
};

export default function DuckingEditor({ control, className }: DuckingEditorProps) {
  const telemetry = useSessionStore(state => state.telemetry);
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState(-48);
  const [reduction, setReduction] = useState(-12);
  const [attack, setAttack] = useState(45);
  const [release, setRelease] = useState(420);

  const inputLevel = clamp01(telemetry?.mic ?? 0);
  const programLevel = clamp01(telemetry?.program ?? 0);
  const inputDb = linearToDb(inputLevel);
  const isActive = enabled && inputDb > threshold;
  const currentReductionDb = isActive ? reduction : 0;
  const outputLevel = programLevel * (enabled ? dbToLinear(currentReductionDb) : 1);
  const outputDb = linearToDb(outputLevel);
  const reductionAmountDb = Math.abs(currentReductionDb);

  useEffect(() => {
    if (!control) return;
    control
      .ducking({
        enabled,
        thresholdDb: threshold,
        reduceDb: reduction,
        attackMs: attack,
        releaseMs: release,
      })
      .catch(() => {});
  }, [control, enabled, threshold, reduction, attack, release]);

  const {
    thresholdY,
    attackPath,
    releasePath,
    reductionFill,
    currentReductionY,
  } = useMemo(() => {
    const width = 420;
    const height = 200;
    const padding = 28;
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;
    const zeroY = padding + innerHeight;

    const thresholdRatio = normalizeDb(threshold, THRESHOLD_MIN, THRESHOLD_MAX);
    const thresholdPosition = padding + (1 - thresholdRatio) * innerHeight;

    const reductionRatio = Math.min(1, Math.abs(reduction) / Math.abs(REDUCTION_MIN));
    const reductionY = zeroY - reductionRatio * innerHeight;

    const activeReductionRatio = Math.min(1, Math.abs(currentReductionDb) / Math.abs(REDUCTION_MIN));
    const currentReductionPosition = zeroY - activeReductionRatio * innerHeight;

    const totalTime = Math.max(attack + release, 1);
    const attackPortion = clamp01(attack / totalTime);
    const attackX = padding + attackPortion * innerWidth;
    const releaseX = padding + innerWidth;

    const attackControlX1 = padding + Math.max(attackPortion * innerWidth * 0.3, 24);
    const attackControlX2 = attackX - Math.max(innerWidth * 0.08, 16);
    const releaseControlX1 = attackX + Math.max(innerWidth * 0.08, 16);
    const releaseControlX2 = releaseX - Math.max((1 - attackPortion) * innerWidth * 0.3, 24);

    const attackCurve = `M ${padding},${zeroY} C ${attackControlX1},${zeroY} ${attackControlX2},${reductionY} ${attackX},${reductionY}`;
    const releaseCurve = `M ${attackX},${reductionY} C ${releaseControlX1},${reductionY} ${releaseControlX2},${zeroY} ${releaseX},${zeroY}`;

    return {
      thresholdY: thresholdPosition,
      attackPath: attackCurve,
      releasePath: releaseCurve,
      reductionFill: {
        x: padding,
        y: reductionY,
        height: zeroY - reductionY,
        width: innerWidth,
      },
      currentReductionY: currentReductionPosition,
    };
  }, [attack, release, threshold, reduction, currentReductionDb]);

  const disabled = !control;

  const applyPreset = (preset: DuckingPreset) => {
    setThreshold(preset.thresholdDb);
    setReduction(preset.reduceDb);
    setAttack(preset.attackMs);
    setRelease(preset.releaseMs);
    if (!enabled) {
      setEnabled(true);
    }
  };

  return (
    <GlassCard variant="elevated" glowColor="green" className={cn('w-full bg-emerald-900/30 text-emerald-100', className)}>
      <GlassCardHeader className="gap-3 border-white/10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <GlassCardTitle className="text-2xl text-emerald-50">Automatic ducking envelope</GlassCardTitle>
            <GlassCardDescription className="max-w-3xl text-emerald-100/80">
              Visualize the ducking response curve and fine-tune how facilitator speech attenuates the program feed.
            </GlassCardDescription>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(prev => !prev)}
            disabled={disabled}
            className={cn(
              'inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-emerald-900',
              enabled
                ? 'bg-emerald-400 text-emerald-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-300'
                : 'bg-emerald-800/70 text-emerald-200 hover:bg-emerald-700/80',
              disabled && 'cursor-not-allowed opacity-40'
            )}
            title="Enable or disable ducking processing on the explorer"
          >
            {enabled ? 'Ducking enabled' : 'Enable ducking'}
          </button>
        </div>
      </GlassCardHeader>
      <GlassCardContent className="gap-8">
        <div
          className={cn(
            'relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/70 via-emerald-900/60 to-emerald-950/90 p-6 shadow-inner',
            isActive && 'border-emerald-400/60 shadow-[0_0_45px_-15px_rgba(52,211,153,0.6)]'
          )}
        >
          <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-widest text-emerald-300/80">Envelope preview</h4>
              <p className="text-sm text-emerald-200/80">
                Threshold, attack, and release curves respond in real time. Active ducking glows to confirm engagement.
              </p>
            </div>
            <div
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition',
                isActive ? 'bg-emerald-400/20 text-emerald-200' : 'bg-emerald-800/60 text-emerald-400/70'
              )}
              title="Indicator glows when the input exceeds the threshold and reduction is being applied"
            >
              <span className={cn('h-2.5 w-2.5 rounded-full', isActive ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-500/30')} />
              {isActive ? 'Ducking active' : 'Standing by'}
            </div>
          </div>
          <div className="relative">
            <svg viewBox="0 0 420 200" className="h-48 w-full text-emerald-300/80">
              <defs>
                <linearGradient id="ducking-reduction" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(16,185,129,0.55)" />
                  <stop offset="100%" stopColor="rgba(16,185,129,0.05)" />
                </linearGradient>
              </defs>
              <rect x={20} y={20} width={380} height={160} rx={18} className="fill-emerald-900/40 stroke-emerald-500/20" />
              <line
                x1={20}
                x2={400}
                y1={thresholdY}
                y2={thresholdY}
                className="stroke-emerald-400/70"
                strokeDasharray="6 6"
                strokeWidth={1.5}
              />
              <text x={28} y={thresholdY - 8} className="fill-emerald-200 text-[11px] tracking-wide">
                Threshold {formatDb(threshold, 0)}
              </text>
              <path d={attackPath} className="fill-none stroke-emerald-300" strokeWidth={2.2} />
              <path d={releasePath} className="fill-none stroke-emerald-300" strokeWidth={2.2} />
              <rect
                x={reductionFill.x}
                y={reductionFill.y}
                width={reductionFill.width}
                height={reductionFill.height}
                className="fill-[url(#ducking-reduction)]"
              />
              <line
                x1={20}
                x2={400}
                y1={currentReductionY}
                y2={currentReductionY}
                className={cn('stroke-emerald-300/80', !isActive && 'opacity-40')}
                strokeWidth={1.8}
              />
              <circle cx={382} cy={currentReductionY} r={6} className="fill-emerald-400/60" />
            </svg>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <PreviewMeter
              label="Input level"
              value={inputDb}
              percent={inputLevel * 100}
              highlight={isActive}
              description="Combined facilitator speech and local mic feed"
            />
            <PreviewMeter
              label="Output level"
              value={outputDb}
              percent={clamp01(outputLevel) * 100}
              highlight={isActive}
              description="Program mix after ducking is applied"
            />
            <PreviewMeter
              label="Reduction"
              value={currentReductionDb}
              percent={(reductionAmountDb / Math.abs(REDUCTION_MIN)) * 100}
              highlight={isActive}
              description="Live gain change relative to the neutral mix"
            />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="grid gap-5 sm:grid-cols-2">
            <ParameterControl
              label="Threshold"
              value={threshold}
              onChange={setThreshold}
              min={THRESHOLD_MIN}
              max={THRESHOLD_MAX}
              step={1}
              unit="dBFS"
              disabled={disabled}
              title="Set the level above which facilitator speech triggers ducking"
              scale={[-80, -60, -40, -20]}
            />
            <ParameterControl
              label="Reduction"
              value={reduction}
              onChange={setReduction}
              min={REDUCTION_MIN}
              max={REDUCTION_MAX}
              step={1}
              unit="dB"
              disabled={disabled}
              title="Define how much the program feed is reduced when ducking engages"
              scale={[-24, -18, -12, -6, 0]}
            />
            <ParameterControl
              label="Attack"
              value={attack}
              onChange={setAttack}
              min={ATTACK_MIN}
              max={ATTACK_MAX}
              step={5}
              unit="ms"
              disabled={disabled}
              title="Control how quickly the program feed attenuates after speech is detected"
              scale={[10, 50, 100, 150, 200]}
            />
            <ParameterControl
              label="Release"
              value={release}
              onChange={setRelease}
              min={RELEASE_MIN}
              max={RELEASE_MAX}
              step={10}
              unit="ms"
              disabled={disabled}
              title="Determine how long the program feed takes to return to normal after speech"
              scale={[100, 400, 800, 1200, 1600, 2000]}
            />
          </div>
          <div className="flex flex-col gap-4 rounded-3xl border border-emerald-500/20 bg-emerald-950/60 p-5">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-widest text-emerald-300/80">Presets</h4>
              <p className="text-xs text-emerald-200/70">
                Use curated starting points tailored for different mix densities.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {PRESETS.map(preset => {
                const active =
                  threshold === preset.thresholdDb &&
                  reduction === preset.reduceDb &&
                  attack === preset.attackMs &&
                  release === preset.releaseMs &&
                  enabled;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    disabled={disabled}
                    className={cn(
                      'flex w-full flex-col rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-300/70 focus:ring-offset-2 focus:ring-offset-emerald-950',
                      active
                        ? 'border-emerald-400/80 bg-emerald-500/20 text-emerald-100 shadow-[0_0_25px_-12px_rgba(16,185,129,0.5)]'
                        : 'border-emerald-600/30 bg-emerald-900/60 text-emerald-200/80 hover:border-emerald-500/50 hover:bg-emerald-900/80',
                      disabled && 'cursor-not-allowed opacity-40'
                    )}
                    title={preset.description}
                  >
                    <span className="text-sm font-semibold text-emerald-100">{preset.name}</span>
                    <span className="text-[11px] uppercase tracking-wide text-emerald-300/70">
                      {formatDb(preset.reduceDb, 0)} · {formatDb(preset.thresholdDb, 0)} · {formatMs(preset.attackMs)} / {formatMs(preset.releaseMs)}
                    </span>
                    <span className="mt-1 text-xs text-emerald-200/70">{preset.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </GlassCardContent>
    </GlassCard>
  );
}

interface ParameterControlProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled?: boolean;
  title?: string;
  scale?: number[];
}

function ParameterControl({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  disabled,
  title,
  scale,
}: ParameterControlProps) {
  return (
    <label className="flex flex-col gap-3" title={title}>
      <span className="text-xs font-semibold uppercase tracking-widest text-emerald-300/80">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => {
          const next = Number(event.target.value);
          if (Number.isNaN(next)) return;
          onChange(Math.min(max, Math.max(min, next)));
        }}
        disabled={disabled}
        className="h-2 w-full appearance-none rounded-full bg-emerald-900/70 accent-emerald-400 disabled:opacity-50"
      />
      {scale && scale.length > 1 && (
        <div className="flex justify-between text-[10px] uppercase tracking-widest text-emerald-500/60">
          {scale.map(marker => (
            <span key={marker}>{marker}</span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-sm text-emerald-100/90">
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-semibold">
          {unit === 'dB' || unit === 'dBFS' ? formatDb(value, 0) : formatMs(value)}
        </span>
        <input
          type="number"
          value={Math.round(value)}
          min={min}
          max={max}
          step={step}
          onChange={event => {
            const next = Number(event.target.value);
            if (Number.isNaN(next)) return;
            onChange(Math.min(max, Math.max(min, next)));
          }}
          disabled={disabled}
          className="w-20 rounded-lg border border-emerald-500/30 bg-emerald-950/70 px-2 py-1 text-right text-xs text-emerald-200/80 focus:border-emerald-400 focus:outline-none"
        />
      </div>
    </label>
  );
}

interface PreviewMeterProps {
  label: string;
  value: number;
  percent: number;
  highlight: boolean;
  description: string;
}

function PreviewMeter({ label, value, percent, highlight, description }: PreviewMeterProps) {
  const safePercent = clamp01(percent / 100) * 100;
  return (
    <div className="rounded-2xl border border-emerald-600/30 bg-emerald-950/50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-emerald-300/80">{label}</div>
          <div className="text-lg font-semibold text-emerald-100">{formatDb(value, 1)}</div>
        </div>
        <span
          className={cn(
            'rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide',
            highlight ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-900/70 text-emerald-400/80'
          )}
        >
          {safePercent.toFixed(0)}%
        </span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-emerald-950/80">
        <div
          className={cn('h-full rounded-full transition-all duration-500', highlight ? 'bg-emerald-400' : 'bg-emerald-500/60')}
          style={{ width: `${safePercent}%` }}
        />
      </div>
      <p className="mt-3 text-[11px] text-emerald-200/70">{description}</p>
    </div>
  );
}
