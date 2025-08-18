import { z } from 'zod';

export const roleSchema = z.enum(['facilitator', 'explorer', 'listener']);

export const sdpMessage = z.object({
  type: z.literal('sdp'),
  roomId: z.string(),
  target: z.string(),
  description: z.any(),
});

export const iceMessage = z.object({
  type: z.literal('ice'),
  roomId: z.string(),
  target: z.string(),
  candidate: z.any(),
});

export const messageSchema = z.union([sdpMessage, iceMessage]);

export type WireMessage = z.infer<typeof messageSchema>;
export type Role = z.infer<typeof roleSchema>;

