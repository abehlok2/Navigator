import { ControlChannel } from '../control/channel';

/**
 * PeerClock estimates a remote peer's clock by periodically exchanging
 * ping/pong messages over the control channel. It exposes the current clock
 * offset and round-trip time (RTT) which can be used by the audio scheduler
 * to align events.
 */
export class PeerClock {
  private control: ControlChannel;
  private offset = 0;
  private rtt = 0;
  private pending = new Map<string, number>();
  private timer: ReturnType<typeof setInterval>;
  private listeners = new Set<(offset: number, rtt: number) => void>();

  constructor(control: ControlChannel) {
    this.control = control;
    this.control.setClockPongHandler(pong => this.handlePong(pong));
    // kick off periodic pings every 3s
    this.timer = setInterval(() => this.ping(), 3000);
    this.ping();
  }

  private ping() {
    const pingId = Math.random().toString(36).slice(2);
    const sentAt = performance.now();
    this.pending.set(pingId, sentAt);
    // fire and forget; we don't wait for ack
    this.control
      .send('clock.ping', { pingId }, false)
      .catch(() => this.pending.delete(pingId));
  }

  private handlePong(pong: { pingId: string; responderNow: number }) {
    const sentAt = this.pending.get(pong.pingId);
    if (sentAt === undefined) return;
    this.pending.delete(pong.pingId);
    const recvAt = performance.now();
    const rtt = recvAt - sentAt;
    this.rtt = rtt;
    this.offset = pong.responderNow - (sentAt + rtt / 2);
    this.listeners.forEach(l => l(this.offset, this.rtt));
  }

  /**
   * Returns the remote peer's current time estimate in milliseconds.
   */
  now(): number {
    return performance.now() + this.offset;
  }

  getOffset(): number {
    return this.offset;
  }

  getRtt(): number {
    return this.rtt;
  }

  stop() {
    clearInterval(this.timer);
  }

  onUpdate(listener: (offset: number, rtt: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
