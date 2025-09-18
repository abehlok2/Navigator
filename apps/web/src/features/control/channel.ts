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
import { getAudioContext, getMasterGain } from '../audio/context';
import { cleanupSpeechDucking, setupSpeechDucking } from '../audio/ducking';
import { hasSpeechInput, setLocalSpeechFallback } from '../audio/speech';
import {
  hasBuffer,
  removeBuffer,
  setBuffer,
  registerRawAsset,
  getRawAssetBySha,
  digestSha256,
} from '../audio/assets';
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
  private lastFetchedContentType: string | null = null;

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

  private async fetchAssetSource(
    source: string,
    totalBytes: number,
    state: ReturnType<typeof useSessionStore.getState>,
    id: string,
    expectedBytes?: number,
  ): Promise<ArrayBuffer> {
    this.lastFetchedContentType = null;
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch asset (${response.status})`);
    }
    this.lastFetchedContentType = response.headers.get('content-type');
    const array = await response.arrayBuffer();
    const declaredTotal = expectedBytes && expectedBytes > 0 ? expectedBytes : totalBytes;
    const finalTotal = declaredTotal > 0 ? declaredTotal : array.byteLength || 1;
    const loaded = Math.min(array.byteLength, finalTotal);
    state.setAssetProgress(id, loaded, finalTotal);
    if (expectedBytes && expectedBytes > 0 && array.byteLength !== expectedBytes) {
      throw new Error('Fetched asset size mismatch; verify facilitator-provided media.');
    }
    return array;
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
    const previousProgress = state.assetProgress[cmd.id]
      ? { ...state.assetProgress[cmd.id] }
      : undefined;
    const hadAsset = state.assets.has(cmd.id);
    const baseTotal = cmd.bytes ?? state.manifest[cmd.id]?.bytes ?? previousProgress?.total ?? 0;
    const initialTotal = baseTotal > 0 ? baseTotal : 1;
    const optimisticLoaded = Math.min(initialTotal, Math.max(1, initialTotal * 0.01));
    state.setAssetProgress(cmd.id, optimisticLoaded, initialTotal);

    const manifestEntry = state.manifest[cmd.id];
    const total = manifestEntry?.bytes ?? baseTotal;
    const normalisedTotal = total > 0 ? total : initialTotal;
    const expectedSha = (cmd.sha256 ?? manifestEntry?.sha256)?.toLowerCase();

    if (hasBuffer(cmd.id) || hadAsset) {
      state.setAssetProgress(cmd.id, normalisedTotal, normalisedTotal);
      invalidatePlayer(cmd.id);
      state.addAsset(cmd.id, { broadcast: true });
      this.sendAck(txn, true);
      return;
    }

    const ctx = getAudioContext();
    const useRaw = expectedSha ? getRawAssetBySha(expectedSha) : undefined;

    if (useRaw || cmd.source) {
      try {
        const arrayBuffer = useRaw
          ? useRaw.data.slice(0)
          : await this.fetchAssetSource(
              cmd.source!,
              normalisedTotal,
              state,
              cmd.id,
              cmd.bytes ?? manifestEntry?.bytes ?? undefined,
            );

        const actualSha = await digestSha256(arrayBuffer);
        if (expectedSha && actualSha !== expectedSha) {
          throw new Error('Asset hash mismatch; expected facilitator-provided file.');
        }

        if (!useRaw) {
          const contentType = this.lastFetchedContentType;
          registerRawAsset(expectedSha ?? actualSha, arrayBuffer, contentType ?? undefined);
        }

        const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        setBuffer(cmd.id, buffer);
        state.setAssetProgress(cmd.id, normalisedTotal, normalisedTotal);
        invalidatePlayer(cmd.id);
        state.addAsset(cmd.id, { broadcast: true });
        this.sendAck(txn, true);
        return;
      } catch (err) {
        const message = (err as Error).message || 'Failed to load asset from facilitator source.';
        if (previousProgress) {
          state.setAssetProgress(cmd.id, previousProgress.loaded, previousProgress.total);
        } else {
          state.setAssetProgress(cmd.id, 0, normalisedTotal);
          state.removeAsset(cmd.id, { broadcast: false });
          removeBuffer(cmd.id);
        }
        this.sendAck(txn, false, message);
        this.opts.onError?.(message);
        return;
      }
    }

    const message =
      'Asset is not available locally. Provide facilitator-supplied files before issuing load commands.';
    if (previousProgress) {
      state.setAssetProgress(cmd.id, previousProgress.loaded, previousProgress.total);
    } else {
      state.setAssetProgress(cmd.id, 0, normalisedTotal);
      state.removeAsset(cmd.id, { broadcast: false });
      removeBuffer(cmd.id);
    }
    this.sendAck(txn, false, message);
    this.opts.onError?.(message);
  }

  private handleUnloadCommand(txn: string | undefined, cmd: CmdUnload) {
    const state = useSessionStore.getState();
    unloadPlayer(cmd.id);
    removeBuffer(cmd.id);
    state.removeAsset(cmd.id, { broadcast: true });
    this.sendAck(txn, true);
  }
}
