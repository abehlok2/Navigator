import { PeerClock } from './peerClock';
import { getAudioContext } from './context';
import { getBuffer } from './assets';
import { FilePlayer, crossfade } from './filePlayer';

const players = new Map<string, FilePlayer>();

/**
 * Schedules playback of a previously loaded asset at the specified peer time.
 * Converts the peer's clock to local AudioContext time using PeerClock.
 */
export function playAt(
  id: string,
  clock: PeerClock,
  atPeerTime?: number,
  offset = 0,
  gainDb = 0
): FilePlayer {
  const buffer = getBuffer(id);
  if (!buffer) throw new Error(`Unknown asset: ${id}`);
  let player = players.get(id);
  if (!player) {
    player = new FilePlayer(buffer);
    players.set(id, player);
  }
  const ctx = getAudioContext();
  const nowPeer = clock.now();
  const deltaMs = (atPeerTime ?? nowPeer) - nowPeer;
  const when = Math.max(0, deltaMs / 1000);
  player.setGain(gainDb);
  player.start(when, offset);
  return player;
}

export function stop(id: string) {
  players.get(id)?.stop();
}

export function seek(id: string, offset: number) {
  players.get(id)?.seek(offset);
}

export function setGain(id: string, db: number) {
  players.get(id)?.setGain(db);
}

export { crossfade };
