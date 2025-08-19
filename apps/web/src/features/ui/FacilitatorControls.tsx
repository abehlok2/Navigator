import React, { useState } from 'react';
import { useSessionStore } from '../../state/session';

export default function FacilitatorControls() {
  const { assets, control } = useSessionStore(s => ({
    assets: Array.from(s.assets),
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
  const toggleDucking = () => {
    const next = !duck;
    setDuck(next);
    control
      ?.ducking({ enabled: next, thresholdDb: -40, reduceDb: -12, attackMs: 10, releaseMs: 300 })
      .catch(() => {});
  };

  return (
    <div className="section">
      <h2>Facilitator Controls</h2>
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
      </div>
    </div>
  );
}
