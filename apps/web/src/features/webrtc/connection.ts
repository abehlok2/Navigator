import type { Role } from '../session/api';
import { ControlChannel } from '../control/channel';
import { useSessionStore } from '../../state/session';
import { startTelemetry } from '../audio/telemetry';
import { PeerClock } from '../audio/peerClock';
import { watchClock } from '../audio/scheduler';

export interface ConnectOptions {
  roomId: string;
  participantId: string;
  targetId: string;
  token: string;
  turn: RTCIceServer[];
  role: Role;
  targetRole: Role;
  version: string;
  onTrack: (ev: RTCTrackEvent) => void;
  onDataChannel?: (dc: RTCDataChannel) => void;
  onControlError?: (err: string) => void;
}

export async function connect(
  opts: ConnectOptions
): Promise<{ pc: RTCPeerConnection; dc?: RTCDataChannel; control?: ControlChannel }> {
  const pc = new RTCPeerConnection({ iceServers: opts.turn });
  let dataChannel: RTCDataChannel | undefined;
  let control: ControlChannel | undefined;
  const session = useSessionStore.getState();
  session.setRole(opts.role);
  session.setConnection('connecting');
  if (opts.role === 'listener') {
    session.setMicStream(null);
  }

  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'connected') {
      session.setConnection('connected');
    } else if (pc.connectionState === 'connecting' || pc.connectionState === 'new') {
      session.setConnection('connecting');
    } else if (
      pc.connectionState === 'disconnected' ||
      pc.connectionState === 'failed' ||
      pc.connectionState === 'closed'
    ) {
      session.setConnection('disconnected');
    }
  });


  const signalUrl =
    import.meta.env.VITE_SIGNAL_URL ?? 'ws://localhost:8080';
  const ws = new WebSocket(
    `${signalUrl}?roomId=${opts.roomId}&participantId=${opts.participantId}`,
    opts.token
  );

  pc.onicecandidate = ev => {
    if (ev.candidate) {
      ws.send(
        JSON.stringify({
          type: 'ice',
          roomId: opts.roomId,
          target: opts.targetId,
          candidate: ev.candidate,
        })
      );
    }
  };

  pc.ontrack = opts.onTrack;

  let stopTelemetry: (() => void) | undefined;
  let peerClock: PeerClock | undefined;
  let localMicStream: MediaStream | null = null;

  function setup(dc: RTCDataChannel, ctrl: ControlChannel) {
    dc.addEventListener('open', () => {
      session.setConnection('connected');
      session.setControl(ctrl);
      const store = useSessionStore.getState();
      const manifestIds = Object.keys(store.manifest);
      if (manifestIds.length) {
        const have = manifestIds.filter(id => store.assets.has(id));
        const missing = manifestIds.filter(id => !store.assets.has(id));
        ctrl.send('asset.presence', { have, missing }, false).catch(() => {});
      }
      ctrl.setMicStream(localMicStream);
      if (opts.role === 'explorer') {
        peerClock = new PeerClock(ctrl);
        watchClock(peerClock);
        session.setPeerClock(peerClock);
        stopTelemetry = startTelemetry(ctrl);
      }
    });
    dc.addEventListener('close', () => {
    stopTelemetry?.();
      peerClock?.stop();
      session.setPeerClock(null);
      session.setConnection('disconnected');
      session.setControl(null);
      session.setTelemetry(null);
      ctrl.setMicStream(null);
      session.setMicStream(null);
    });
  }

  const shouldInitiateControlChannel =
    opts.role === 'facilitator' && opts.targetRole !== 'listener';
  const shouldReceiveControlChannel =
    opts.role === 'explorer' && opts.targetRole === 'facilitator';

  if (shouldInitiateControlChannel) {
    dataChannel = pc.createDataChannel('control', { ordered: true });
    control = new ControlChannel(dataChannel, {
      role: opts.role,
      roomId: opts.roomId,
      version: opts.version,
      onError: opts.onControlError,
    });
    setup(dataChannel, control);
    opts.onDataChannel?.(dataChannel);
  } else if (shouldReceiveControlChannel) {
    pc.ondatachannel = ev => {
      dataChannel = ev.channel;
      control = new ControlChannel(dataChannel!, {
        role: opts.role,
        roomId: opts.roomId,
        version: opts.version,
        onError: opts.onControlError,
      });
      setup(dataChannel!, control);
      opts.onDataChannel?.(dataChannel!);
    };
  }

  if (opts.role !== 'listener') {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
        latency: { ideal: 0 },
      } as any,
      video: false,
    });
    localMicStream = stream;
    session.setMicStream(stream);
    control?.setMicStream(stream);
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
  }

  ws.onmessage = async ev => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'sdp') {
      if (msg.description.type === 'offer' && (opts.role === 'explorer' || opts.role === 'listener')) {
        await pc.setRemoteDescription(msg.description);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(
          JSON.stringify({
            type: 'sdp',
            roomId: opts.roomId,
            target: opts.targetId,
            description: pc.localDescription,
          })
        );
      } else if (msg.description.type === 'answer' && opts.role === 'facilitator') {
        await pc.setRemoteDescription(msg.description);
      }
    } else if (msg.type === 'credentials') {
      const payload = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
      const iceServers: RTCIceServer[] = [];

      for (const raw of payload) {
        if (!raw || typeof raw !== 'object') {
          continue;
        }

        const urlsValue = (raw as { urls?: unknown }).urls;
        const urls = Array.isArray(urlsValue)
          ? urlsValue
          : typeof urlsValue === 'string'
          ? [urlsValue]
          : [];
        const normalizedUrls = urls.filter((url): url is string => typeof url === 'string' && url.length > 0);
        if (!normalizedUrls.length) {
          continue;
        }

        const server: RTCIceServer = { urls: normalizedUrls };
        const username = (raw as { username?: unknown }).username;
        const credential = (raw as { credential?: unknown }).credential;
        if (typeof username === 'string') {
          server.username = username;
        }
        if (typeof credential === 'string') {
          server.credential = credential;
        }
        iceServers.push(server);
      }

      if (iceServers.length) {
        opts.turn = iceServers;
        pc.setConfiguration({ iceServers });
      }
    } else if (msg.type === 'ice' && msg.candidate) {
      await pc.addIceCandidate(msg.candidate);
    }
  };

  if (opts.role === 'facilitator') {
    ws.addEventListener('open', async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(
        JSON.stringify({
          type: 'sdp',
          roomId: opts.roomId,
          target: opts.targetId,
          description: pc.localDescription,
        })
      );
    });
  }

  return { pc, dc: dataChannel, control };
}

export function connectWithReconnection(
  opts: ConnectOptions & { retryDelayMs?: number }
): () => void {
  const session = useSessionStore.getState();
  let stopped = false;
  let current: RTCPeerConnection | null = null;

  const attempt = async () => {
    if (stopped) return;
    try {
      const { pc, dc } = await connect(opts);
      current = pc;
      dc?.addEventListener('close', () => {
        if (!stopped) setTimeout(attempt, opts.retryDelayMs ?? 1000);
      });
      pc.addEventListener('connectionstatechange', () => {
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'disconnected' ||
          pc.connectionState === 'closed'
        ) {
          session.setConnection('disconnected');
          if (!stopped) {
            setTimeout(attempt, opts.retryDelayMs ?? 1000);
          }
        }
      });
    } catch {
      session.setConnection('disconnected');
      if (!stopped) setTimeout(attempt, opts.retryDelayMs ?? 1000);
    }
  };

  attempt();

  return () => {
    stopped = true;
    current?.close();
  };
}
