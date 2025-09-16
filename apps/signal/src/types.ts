import { z } from 'zod';

export const roleSchema = z.enum(['facilitator', 'explorer', 'listener']);

const forwardingEnvelope = z.object({
  roomId: z.string(),
  target: z.string(),
});

const controlEnvelope = forwardingEnvelope.extend({
  txn: z.string().optional(),
  sentAt: z.number().optional(),
});

export const helloMessage = controlEnvelope.extend({
  type: z.literal('hello'),
  payload: z.object({
    role: roleSchema,
    roomId: z.string(),
    version: z.string(),
  }),
});

export const ackMessage = controlEnvelope.extend({
  type: z.literal('ack'),
  payload: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    forTxn: z.string(),
  }),
});

export const clockPingMessage = controlEnvelope.extend({
  type: z.literal('clock.ping'),
  payload: z.object({
    pingId: z.string(),
  }),
});

export const clockPongMessage = controlEnvelope.extend({
  type: z.literal('clock.pong'),
  payload: z.object({
    pingId: z.string(),
    responderNow: z.number(),
  }),
});

const assetEntrySchema = z.object({
  id: z.string(),
  sha256: z.string(),
  bytes: z.number(),
});

export const assetManifestMessage = controlEnvelope.extend({
  type: z.literal('asset.manifest'),
  payload: z.object({
    entries: z.array(assetEntrySchema),
  }),
});

export const assetPresenceMessage = controlEnvelope.extend({
  type: z.literal('asset.presence'),
  payload: z.object({
    have: z.array(z.string()),
    missing: z.array(z.string()),
  }),
});

export const cmdPlayMessage = controlEnvelope.extend({
  type: z.literal('cmd.play'),
  payload: z.object({
    id: z.string(),
    atPeerTime: z.number().optional(),
    offset: z.number().optional(),
    gainDb: z.number().optional(),
  }),
});

export const cmdStopMessage = controlEnvelope.extend({
  type: z.literal('cmd.stop'),
  payload: z.object({
    id: z.string(),
  }),
});

export const cmdCrossfadeMessage = controlEnvelope.extend({
  type: z.literal('cmd.crossfade'),
  payload: z.object({
    fromId: z.string(),
    toId: z.string(),
    duration: z.number(),
    toOffset: z.number().optional(),
  }),
});

export const cmdLoadMessage = controlEnvelope.extend({
  type: z.literal('cmd.load'),
  payload: z.object({
    id: z.string(),
    sha256: z.string().optional(),
    bytes: z.number().optional(),
    source: z.string().optional(),
  }),
});

export const cmdUnloadMessage = controlEnvelope.extend({
  type: z.literal('cmd.unload'),
  payload: z.object({
    id: z.string(),
  }),
});

export const cmdSeekMessage = controlEnvelope.extend({
  type: z.literal('cmd.seek'),
  payload: z.object({
    id: z.string(),
    offset: z.number(),
  }),
});

export const cmdSetGainMessage = controlEnvelope.extend({
  type: z.literal('cmd.setGain'),
  payload: z.object({
    id: z.string(),
    gainDb: z.number(),
  }),
});

export const cmdDuckingMessage = controlEnvelope.extend({
  type: z.literal('cmd.ducking'),
  payload: z.object({
    enabled: z.boolean(),
    thresholdDb: z.number(),
    reduceDb: z.number(),
    attackMs: z.number(),
    releaseMs: z.number(),
  }),
});

export const telemetryLevelsMessage = controlEnvelope.extend({
  type: z.literal('telemetry.levels'),
  payload: z.object({
    mic: z.number(),
    program: z.number(),
  }),
});

export const sdpMessage = forwardingEnvelope.extend({
  type: z.literal('sdp'),
  description: z.any(),
});

export const iceMessage = forwardingEnvelope.extend({
  type: z.literal('ice'),
  candidate: z.any(),
});

export const messageSchema = z.union([
  sdpMessage,
  iceMessage,
  helloMessage,
  ackMessage,
  clockPingMessage,
  clockPongMessage,
  assetManifestMessage,
  assetPresenceMessage,
  cmdLoadMessage,
  cmdUnloadMessage,
  cmdPlayMessage,
  cmdStopMessage,
  cmdSeekMessage,
  cmdCrossfadeMessage,
  cmdSetGainMessage,
  cmdDuckingMessage,
  telemetryLevelsMessage,
]);

export type WireMessage = z.infer<typeof messageSchema>;
export type Role = z.infer<typeof roleSchema>;

