import React from 'react';
import { useSessionStore } from '../../state/session';

export default function AssetAvailability() {
  const assets = useSessionStore(s => Array.from(s.assets));
  if (assets.length === 0) {
    return (
      <div className="section">
        <h3>Assets</h3>
        <div>No assets available</div>
      </div>
    );
  }
  return (
    <div className="section">
      <h3>Assets</h3>
      <ul>
        {assets.map(id => (
          <li key={id}>{id}</li>
        ))}
      </ul>
    </div>
  );
}
