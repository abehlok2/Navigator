import { apiUrl } from '../../config';

export type Role = 'facilitator' | 'explorer' | 'listener';

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function createRoom(token: string): Promise<string> {
  const res = await fetch(apiUrl('/rooms'), {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('failed to create room');
  const data = (await res.json()) as { roomId: string };
  return data.roomId;
}

export interface ParticipantSummary {
  id: string;
  role: Role;
  connected: boolean;
}

export interface JoinResponse {
  participantId: string;
  turn: RTCIceServer[];
  participants: ParticipantSummary[];
}

export async function joinRoom(
  roomId: string,
  role: Role,
  token: string
): Promise<JoinResponse> {
  const res = await fetch(apiUrl(`/rooms/${roomId}/join`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error('failed to join room');
  const data = (await res.json()) as {
    participantId: string;
    turn: RTCIceServer;
    participants?: ParticipantSummary[];
  };
  return {
    participantId: data.participantId,
    turn: [data.turn],
    participants: data.participants ?? [],
  };
}

export async function leaveRoom(
  roomId: string,
  participantId: string,
  token: string
): Promise<void> {
  await fetch(apiUrl(`/rooms/${roomId}/leave`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ participantId }),
  });
}

export async function listParticipants(roomId: string, token: string): Promise<ParticipantSummary[]> {
  const res = await fetch(apiUrl(`/rooms/${roomId}/participants`), {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('failed to list participants');
  const data = (await res.json()) as { participants?: ParticipantSummary[] };
  return data.participants ?? [];
}
