import type { Role } from '../session/api';
import { ControlChannel } from '../control/channel';
import { useSessionStore } from '../../state/session';
import { startTelemetry } from '../audio/telemetry';

interface ConnectOptions {
  roomId: string;
  participantId: string;
  targetId: string;
  token: string;
  turn: RTCIceServer[];
  role: Role;
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

  const ws = new WebSocket(
    `ws://localhost:8080?roomId=${opts.roomId}&participantId=${opts.participantId}&token=${opts.token}`
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

  function setup(dc: RTCDataChannel, ctrl: ControlChannel) {
    dc.addEventListener('open', () => {
      session.setConnection('connected');
      session.setControl(ctrl);
      const have = Array.from(useSessionStore.getState().assets);
      if (have.length) ctrl.send('manifest.presence', { have }, false).catch(() => {});
      if (opts.role === 'explorer') {
        stopTelemetry = startTelemetry(ctrl);
      }
    });
    dc.addEventListener('close', () => {
      stopTelemetry?.();
      session.setConnection('disconnected');
      session.setControl(null);
    });
  }

  if (opts.role === 'facilitator') {
    dataChannel = pc.createDataChannel('control', { ordered: true });
    control = new ControlChannel(dataChannel, {
      role: opts.role,
      roomId: opts.roomId,
      version: opts.version,
      onError: opts.onControlError,
    });
    setup(dataChannel, control);
    opts.onDataChannel?.(dataChannel);
  } else {
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

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
      latency: { ideal: 0 },
    } as any,
    video: false,
  });
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  ws.onmessage = async ev => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'sdp') {
      if (msg.description.type === 'offer' && opts.role === 'explorer') {
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
