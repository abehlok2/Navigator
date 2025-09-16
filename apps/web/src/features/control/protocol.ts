import { z } from 'zod';

export const helloSchema = z.object({
  role: z.enum(['facilitator', 'explorer', 'listener']),
  roomId: z.string(),
  version: z.string(),
});
export type Hello = z.infer<typeof helloSchema>;

export const ackSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  forTxn: z.string(),
});
export type Ack = z.infer<typeof ackSchema>;

export const clockPingSchema = z.object({
  pingId: z.string(),
});
export type ClockPing = z.infer<typeof clockPingSchema>;

export const clockPongSchema = z.object({
  pingId: z.string(),
  responderNow: z.number(),
});
export type ClockPong = z.infer<typeof clockPongSchema>;

export const cmdPlaySchema = z.object({
  id: z.string(),
  atPeerTime: z.number().optional(),
  offset: z.number().optional(),
  gainDb: z.number().optional(),
});
export type CmdPlay = z.infer<typeof cmdPlaySchema>;

export const cmdStopSchema = z.object({
  id: z.string(),
});
export type CmdStop = z.infer<typeof cmdStopSchema>;

export const cmdCrossfadeSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  duration: z.number(),
  toOffset: z.number().optional(),
});
export type CmdCrossfade = z.infer<typeof cmdCrossfadeSchema>;

export const cmdLoadSchema = z.object({
  id: z.string(),
  sha256: z.string().optional(),
  bytes: z.number().optional(),
  source: z.string().optional(),
});
export type CmdLoad = z.infer<typeof cmdLoadSchema>;

export const cmdUnloadSchema = z.object({
  id: z.string(),
});
export type CmdUnload = z.infer<typeof cmdUnloadSchema>;

export const cmdSeekSchema = z.object({
  id: z.string(),
  offset: z.number(),
});
export type CmdSeek = z.infer<typeof cmdSeekSchema>;

export const cmdSetGainSchema = z.object({
  id: z.string(),
  gainDb: z.number(),
});
export type CmdSetGain = z.infer<typeof cmdSetGainSchema>;

export const cmdDuckingSchema = z.object({
  enabled: z.boolean(),
  thresholdDb: z.number(),
  reduceDb: z.number(),
  attackMs: z.number(),
  releaseMs: z.number(),
});
export type CmdDucking = z.infer<typeof cmdDuckingSchema>;

export const assetEntrySchema = z.object({
  id: z.string(),
  sha256: z.string(),
  bytes: z.number(),
});

export const assetManifestSchema = z.object({
  entries: z.array(assetEntrySchema),
});
export type AssetManifest = z.infer<typeof assetManifestSchema>;

export const assetPresenceSchema = z.object({
  have: z.array(z.string()),
  missing: z.array(z.string()),
});
export type AssetPresence = z.infer<typeof assetPresenceSchema>;

export const telemetryLevelsSchema = z.object({
  mic: z.number(),
  program: z.number(),
});
export type TelemetryLevels = z.infer<typeof telemetryLevelsSchema>;

export const payloadSchemaByType = {
  hello: helloSchema,
  ack: ackSchema,
  'clock.ping': clockPingSchema,
  'clock.pong': clockPongSchema,
  'cmd.load': cmdLoadSchema,
  'cmd.unload': cmdUnloadSchema,
  'cmd.play': cmdPlaySchema,
  'cmd.stop': cmdStopSchema,
  'cmd.seek': cmdSeekSchema,
  'cmd.crossfade': cmdCrossfadeSchema,
  'cmd.setGain': cmdSetGainSchema,
  'cmd.ducking': cmdDuckingSchema,
  'asset.manifest': assetManifestSchema,
  'asset.presence': assetPresenceSchema,
  'telemetry.levels': telemetryLevelsSchema,
} as const;

export const messageTypes = Object.keys(payloadSchemaByType) as [keyof typeof payloadSchemaByType];

export const wireMessageSchema = z.object({
  type: z.enum(messageTypes),
  txn: z.string().optional(),
  payload: z.unknown().optional(),
  sentAt: z.number().optional(),
});
export type WireMessage = {
  type: keyof typeof payloadSchemaByType;
  txn?: string;
  payload?: unknown;
  sentAt?: number;
};
