import { z } from 'zod';
import type { Role } from '../session/api';
import { useSessionStore } from '../../state/session';
import {
  playAt,
  stop as stopPlayback,
  crossfade,
  setGain,
  seek as seekTo,
  unload as unloadPlayer,
  invalidate as invalidatePlayer,
  getPlayer,
} from '../audio/scheduler';
import { getMasterGain } from '../audio/context';
import { cleanupSpeechDucking, setupSpeechDucking } from '../audio/ducking';
import { hasSpeechInput, setLocalSpeechFallback } from '../audio/speech';
import { hasBuffer, removeBuffer } from '../audio/assets';
import {
  wireMessageSchema,
  payloadSchemaByType,
  type WireMessage,
  type Ack,
  type CmdLoad,
  type CmdUnload,
  type CmdSeek,
  type CmdPlay,
  type CmdStop,
  type CmdCrossfade,
  type CmdSetGain,
  type CmdDucking,
  type TelemetryLevels,
  type AssetManifest,
  type AssetPresence,
} from './protocol';

interface ControlChannelOptions {
  role: Role;
  roomId: string;
  version: string;
  onError?: (err: string) => void;
  onClockPong?: (pong: { pingId: string; responderNow: number }) => void;
}

interface Pending {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class ControlChannel {
  private dc: RTCDataChannel;
  private opts: ControlChannelOptions;
  private pending = new Map<string, Pending>();
  private duckingConfig: CmdDucking | null = null;
  private lastManifest: AssetManifest['entries'] | null = null;

  constructor(dc: RTCDataChannel, opts: ControlChannelOptions) {
    this.dc = dc;
    this.opts = opts;
    this.dc.addEventListener('open', () => this.onOpen());
    this.dc.addEventListener('message', ev => this.onMessage(ev));
    this.dc.addEventListener('error', () => this.opts.onError?.('data channel error'));
    this.dc.addEventListener('close', () => {});
  }

  setClockPongHandler(handler: (pong: { pingId: string; responderNow: number }) => void) {
    this.opts.onClockPong = handler;
  }

  setMicStream(stream: MediaStream | null) {
    setLocalSpeechFallback(stream);
    if (this.duckingConfig?.enabled) {
      this.applyDucking(this.duckingConfig);
    } else if (!hasSpeechInput()) {
      cleanupSpeechDucking();
    }
  }

  private applyDucking(cmd: CmdDucking) {
    if (!hasSpeechInput()) {
      this.opts.onError?.('ducking enabled but no speech input available');
    }
    setupSpeechDucking(getMasterGain(), {
      thresholdDb: cmd.thresholdDb,
      reducedDb: cmd.reduceDb,
      attack: cmd.attackMs / 1000,
      release: cmd.releaseMs / 1000,
    });
  }

  private onOpen() {
    this.send('hello', {
      role: this.opts.role,
      roomId: this.opts.roomId,
      version: this.opts.version,
    })
      .then(() => this.resendManifestIfNeeded())
      .catch(err => this.opts.onError?.(err.message));
  }

  private onMessage(ev: MessageEvent) {
    let msg: WireMessage;
    try {
      msg = wireMessageSchema.parse(JSON.parse(ev.data));
      const schema = payloadSchemaByType[msg.type as keyof typeof payloadSchemaByType];
      if (schema) msg.payload = schema.parse(msg.payload);
    } catch (err) {
      const raw = (() => { try { return JSON.parse(ev.data); } catch { return null; } })();
      if (raw?.txn) this.sendAck(raw.txn, false, (err as Error).message);
      this.opts.onError?.((err as Error).message);
      return;
    }

    switch (msg.type) {
      case 'ack': {
        const ack = msg.payload as Ack;
        const pending = this.pending.get(ack.forTxn);
        if (pending) {
          this.pending.delete(ack.forTxn);
          clearTimeout(pending.timer);
          if (ack.ok) pending.resolve();
          else pending.reject(new Error(ack.error || 'remote error'));
        }
        break;
      }
      case 'clock.ping': {
        this.sendAck(msg.txn, true);
        const ping = msg.payload as { pingId: string };
        this.send('clock.pong', { pingId: ping.pingId, responderNow: performance.now() }, false).catch(err =>
          this.opts.onError?.(err.message)
        );
        break;
      }
      case 'clock.pong': {
        this.sendAck(msg.txn, true);
        const pong = msg.payload as { pingId: string; responderNow: number };
        this.opts.onClockPong?.(pong);
        const { setHeartbeat } = useSessionStore.getState();
        setHeartbeat();
        break;
      }
      case 'asset.manifest': {
        this.sendAck(msg.txn, true);
        const { setManifest } = useSessionStore.getState();
        const manifest = msg.payload as AssetManifest;
        setManifest(manifest.entries);
        break;
      }
      case 'asset.presence': {
        this.sendAck(msg.txn, true);
        const { updateRemotePresence } = useSessionStore.getState();
        updateRemotePresence(msg.payload as AssetPresence);
        break;
      }
      case 'telemetry.levels': {
        this.sendAck(msg.txn, true);
        const { setTelemetry, setHeartbeat } = useSessionStore.getState();
        setTelemetry(msg.payload as TelemetryLevels);
        setHeartbeat();
        break;
      }
      case 'cmd.play': {
        this.sendAck(msg.txn, true);
        const { peerClock } = useSessionStore.getState();
        const cmd = msg.payload as CmdPlay;
        if (peerClock) {
          playAt(cmd.id, peerClock, cmd.atPeerTime, cmd.offset, cmd.gainDb);
        }
        break;
      }
      case 'cmd.stop': {
        this.sendAck(msg.txn, true);
        const cmd = msg.payload as CmdStop;
        stopPlayback(cmd.id);
        break;
      }
      case 'cmd.seek': {
        this.sendAck(msg.txn, true);
        const cmd = msg.payload as CmdSeek;
        seekTo(cmd.id, cmd.offset);
        break;
      }
      case 'cmd.crossfade': {
        this.sendAck(msg.txn, true);
        const cmd = msg.payload as CmdCrossfade;
        const { peerClock } = useSessionStore.getState();
        if (peerClock) {
          const existing = getPlayer(cmd.fromId);
          const fromPlayer =
            existing && existing.isPlaying() ? existing : playAt(cmd.fromId, peerClock);
          const toPlayer = playAt(cmd.toId, peerClock, undefined, cmd.toOffset ?? 0);
          crossfade(fromPlayer, toPlayer, cmd.duration);
        }
        break;
      }
      case 'cmd.load': {
        const cmd = msg.payload as CmdLoad;
        void this.handleLoadCommand(msg.txn, cmd);
        break;
      }
      case 'cmd.unload': {
        const cmd = msg.payload as CmdUnload;
        this.handleUnloadCommand(msg.txn, cmd);
        break;
      }
      case 'cmd.setGain': {
        this.sendAck(msg.txn, true);
        const cmd = msg.payload as CmdSetGain;
        setGain(cmd.id, cmd.gainDb);
        break;
      }
      case 'cmd.ducking': {
        this.sendAck(msg.txn, true);
        const cmd = msg.payload as CmdDucking;
        this.duckingConfig = cmd.enabled ? cmd : null;
        if (cmd.enabled) {
          this.applyDucking(cmd);
        } else {
          cleanupSpeechDucking();
        }
        break;
      }
      default: {
        this.sendAck(msg.txn, true);
        break;
      }
    }
  }

  private async resendManifestIfNeeded() {
    if (this.opts.role !== 'facilitator') return;
    if (this.lastManifest === null) return;
    try {
      await this.send('asset.manifest', { entries: this.lastManifest });
    } catch (err) {
      this.opts.onError?.((err as Error).message);
    }
  }

  private sendAck(txn: string | undefined, ok: boolean, error?: string) {
    if (!txn) return;
    const ackMsg: WireMessage = {
      type: 'ack',
      payload: { ok, forTxn: txn, ...(error ? { error } : {}) },
      sentAt: performance.now(),
    };
    this.dc.send(JSON.stringify(ackMsg));
  }

  private newId() {
    return Math.random().toString(36).slice(2);
  }

  send<T extends keyof typeof payloadSchemaByType>(
    type: T,
    payload: z.infer<(typeof payloadSchemaByType)[T]>,
    waitForAck = true
  ): Promise<void> {
    const txn = this.newId();
    const msg: WireMessage = {
      type: type as any,
      txn,
      payload,
      sentAt: performance.now(),
    };
    this.dc.send(JSON.stringify(msg));
    if (!waitForAck) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(txn);
        reject(new Error('ack timeout'));
        this.opts.onError?.('ack timeout');
      }, 5000);
      this.pending.set(txn, {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: err => {
          clearTimeout(timer);
          reject(err);
        },
        timer,
      });
    });
  }

  setManifest(entries: AssetManifest['entries']) {
    this.lastManifest = entries.map(entry => ({ ...entry }));
    return this.send('asset.manifest', { entries });
  }

  play(cmd: CmdPlay) {
    return this.send('cmd.play', cmd);
  }

  stop(cmd: CmdStop) {
    return this.send('cmd.stop', cmd);
  }

  seek(cmd: CmdSeek) {
    return this.send('cmd.seek', cmd);
  }

  crossfade(cmd: CmdCrossfade) {
    return this.send('cmd.crossfade', cmd);
  }

  setGain(cmd: CmdSetGain) {
    return this.send('cmd.setGain', cmd);
  }

  ducking(cmd: CmdDucking) {
    return this.send('cmd.ducking', cmd);
  }

  load(cmd: CmdLoad) {
    return this.send('cmd.load', cmd);
  }

  unload(cmd: CmdUnload) {
    return this.send('cmd.unload', cmd);
  }

  private async handleLoadCommand(txn: string | undefined, cmd: CmdLoad) {
    const state = useSessionStore.getState();
    const manifestEntry = state.manifest[cmd.id];
    const baseTotal = cmd.bytes ?? manifestEntry?.bytes ?? state.assetProgress[cmd.id]?.total ?? 0;
    const normalisedTotal = baseTotal > 0 ? baseTotal : 1;

    if (!manifestEntry) {
      state.setAssetProgress(cmd.id, 0, normalisedTotal);
      const message = `no manifest entry for asset "${cmd.id}"`;
      this.sendAck(txn, false, message);
      this.opts.onError?.(message);
      return;
    }

    if (!hasBuffer(cmd.id)) {
      state.setAssetProgress(cmd.id, 0, normalisedTotal);
      const message = `asset "${cmd.id}" is not available locally`;
      this.sendAck(txn, false, message);
      this.opts.onError?.(message);
      return;
    }

    state.addAsset(cmd.id, { broadcast: false });
    state.setAssetProgress(cmd.id, normalisedTotal, normalisedTotal);
    invalidatePlayer(cmd.id);
    this.sendAck(txn, true);
  }

  private handleUnloadCommand(txn: string | undefined, cmd: CmdUnload) {
    const state = useSessionStore.getState();
    unloadPlayer(cmd.id);
    removeBuffer(cmd.id);
    state.removeAsset(cmd.id, { broadcast: true });
    this.sendAck(txn, true);
  }
}
