import React, { useState } from 'react';
import { useSessionStore } from '../../state/session';
import ManifestEditor from './ManifestEditor';

export default function FacilitatorControls() {
  const { assets, control } = useSessionStore(s => ({
    assets: Array.from(s.remoteAssets),
    control: s.control,
  }));

  const [gain, setGain] = useState<Record<string, number>>({});
  const handlePlay = (id: string) => control?.play({ id }).catch(() => {});
  const handleStop = (id: string) => control?.stop({ id }).catch(() => {});
  const handleGain = (id: string, value: number) => {
    setGain(g => ({ ...g, [id]: value }));
    control?.setGain({ id, gainDb: value }).catch(() => {});
  };

  const handleCrossfade = () => {
    if (assets.length >= 2) {
      control?.crossfade({ fromId: assets[0], toId: assets[1], duration: 2 }).catch(() => {});
    }
  };

  const [duck, setDuck] = useState(false);
  const [threshold, setThreshold] = useState(-40);
  const [reduction, setReduction] = useState(-12);
  const attackMs = 10;
  const releaseMs = 300;

  const sendDucking = (enabled: boolean, nextThreshold = threshold, nextReduction = reduction) => {
    control
      ?.ducking({
        enabled,
        thresholdDb: nextThreshold,
        reduceDb: nextReduction,
        attackMs,
        releaseMs,
      })
      .catch(() => {});
  };

  const toggleDucking = () => {
    const next = !duck;
    setDuck(next);
    sendDucking(next);
  };

  const updateThreshold = (value: number) => {
    setThreshold(value);
    if (duck) {
      sendDucking(true, value, reduction);
    }
  };

  const updateReduction = (value: number) => {
    setReduction(value);
    if (duck) {
      sendDucking(true, threshold, value);
    }
  };

  return (
    <div className="section space-y-4">
      <h2>Facilitator Controls</h2>
      <ManifestEditor />
      <ul>
        {assets.map(id => (
          <li key={id} style={{ marginBottom: '0.5rem' }}>
            {id}
            <button onClick={() => handlePlay(id)} style={{ marginLeft: '0.5rem' }}>
              Play
            </button>
            <button onClick={() => handleStop(id)} style={{ marginLeft: '0.5rem' }}>
              Stop
            </button>
            <input
              type="range"
              min={-60}
              max={6}
              step={1}
              value={gain[id] ?? 0}
              onChange={e => handleGain(id, Number(e.target.value))}
              style={{ marginLeft: '0.5rem' }}
            />
            <span style={{ marginLeft: '0.25rem' }}>{(gain[id] ?? 0).toFixed(0)} dB</span>
          </li>
        ))}
      </ul>
      {assets.length >= 2 && (
        <div style={{ marginTop: '0.5rem' }}>
          <button onClick={handleCrossfade}>Crossfade first two</button>
        </div>
      )}
      <div style={{ marginTop: '0.5rem' }}>
        <label>
          <input type="checkbox" checked={duck} onChange={toggleDucking} /> Enable ducking
        </label>
        <div className="mt-2 space-y-2 text-sm text-gray-600">
          <div>
            Facilitator speech is mixed with the local microphone fallback before driving the
            ducking detector.
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <span className="w-32">Threshold</span>
              <input
                type="range"
                min={-80}
                max={-10}
                step={1}
                value={threshold}
                onChange={e => updateThreshold(Number(e.target.value))}
                disabled={!control}
              />
              <span className="w-16 text-right">{threshold} dBFS</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-32">Reduction</span>
              <input
                type="range"
                min={-24}
                max={0}
                step={1}
                value={reduction}
                onChange={e => updateReduction(Number(e.target.value))}
                disabled={!control}
              />
              <span className="w-16 text-right">{reduction} dB</span>
            </label>
            <div className="text-xs text-gray-500">
              Attack {attackMs} ms · Release {releaseMs} ms
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
