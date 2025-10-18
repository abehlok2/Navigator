import { apiUrl } from '../../config';

export type Role = 'facilitator' | 'explorer' | 'listener';

function normalizeToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error('Authentication token is required.');
  }
  return trimmed;
}

function authHeaders(token: string): HeadersInit {
  const normalized = normalizeToken(token);
  return {
    Authorization: `Bearer ${normalized}`,
  };
}

export interface CreateRoomResponse {
  roomId: string;
  participantId: string;
  participants: ParticipantSummary[];
  turn: RTCIceServer[];
}

export async function createRoom(token: string, role: Role = 'facilitator'): Promise<CreateRoomResponse> {
  if (role !== 'facilitator') {
    throw new Error('Only facilitators can create rooms.');
  }

  const res = await fetch(apiUrl('/rooms'), {
    method: 'POST',
    headers: authHeaders(token),
  });

  if (!res.ok) {
    // Try to get error details from response
    let errorMessage = 'failed to create room';
    try {
      const errorData = await res.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // Response wasn't JSON, use status text
      errorMessage = `${res.status}: ${res.statusText}`;
    }
    throw new Error(errorMessage);
  }

  const data = (await res.json()) as {
    roomId: string;
    participantId: string;
    participants?: ParticipantSummary[];
    turn: RTCIceServer;
  };
  return {
    roomId: data.roomId,
    participantId: data.participantId,
    participants: data.participants ?? [],
    turn: [data.turn],
  };
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
  token: string,
  password?: string
): Promise<JoinResponse> {
  const res = await fetch(apiUrl(`/rooms/${roomId}/join`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(password ? { role, password } : { role }),
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

export async function setRoomPassword(roomId: string, token: string, password?: string): Promise<void> {
  const res = await fetch(apiUrl(`/rooms/${roomId}/password`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(password ? { password } : {}),
  });
  if (!res.ok) throw new Error('failed to set room password');
}

export async function updateParticipantRole(
  roomId: string,
  participantId: string,
  role: Role,
  token: string
): Promise<void> {
  const res = await fetch(apiUrl(`/rooms/${roomId}/role`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ participantId, role }),
  });
  if (!res.ok) throw new Error('failed to update participant role');
}

export async function removeRoomParticipant(
  roomId: string,
  participantId: string,
  token: string
): Promise<void> {
  const res = await fetch(apiUrl(`/rooms/${roomId}/kick`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ participantId }),
  });
  if (!res.ok) throw new Error('failed to remove participant');
}
