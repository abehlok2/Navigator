import { z } from 'zod';
import type { Role } from '../session/api';
import { useSessionStore } from '../../state/session';
import {
  wireMessageSchema,
  payloadSchemaByType,
  type WireMessage,
  type Ack,
  type CmdPlay,
  type CmdStop,
  type CmdCrossfade,
  type CmdSetGain,
  type CmdDucking,
  type Telemetry,
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

  private onOpen() {
    this.send('hello', {
      role: this.opts.role,
      roomId: this.opts.roomId,
      version: this.opts.version,
    }).catch(err => this.opts.onError?.(err.message));
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
      case 'manifest.presence': {
        this.sendAck(msg.txn, true);
        const { addAsset } = useSessionStore.getState();
        const { have } = msg.payload as { have: string[] };
        have.forEach(id => addAsset(id));
        break;
      }
      case 'telemetry': {
        this.sendAck(msg.txn, true);
        const { setTelemetry, setHeartbeat } = useSessionStore.getState();
        setTelemetry(msg.payload as Telemetry);
        setHeartbeat();
        break;
      }
      default: {
        this.sendAck(msg.txn, true);
        break;
      }
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

  play(cmd: CmdPlay) {
    return this.send('cmd.play', cmd);
  }

  stop(cmd: CmdStop) {
    return this.send('cmd.stop', cmd);
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
}
