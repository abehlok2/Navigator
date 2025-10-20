import { apiUrl } from '../../config';

export type Role = 'facilitator' | 'explorer' | 'listener';

export class RoomNotFoundError extends Error {
  payload?: unknown;

  constructor(message: string, payload?: unknown) {
    super(message);
    this.name = 'RoomNotFoundError';
    this.payload = payload;
  }
}

function logError(context: string, details?: Record<string, unknown>): void {
  if (details && Object.keys(details).length > 0) {
    console.error(`[Session API] ${context}`, details);
  } else {
    console.error(`[Session API] ${context}`);
  }
}

async function extractErrorMessage(
  res: Response,
  fallbackMessage: string
): Promise<{ message: string; payload?: unknown }> {
  try {
    const data = await res.json();
    const message =
      (typeof data === 'object' && data !== null &&
        ('message' in data || 'error' in data))
        ? ((data as { message?: string; error?: string }).message ||
            (data as { message?: string; error?: string }).error ||
            fallbackMessage)
        : fallbackMessage;
    return { message, payload: data };
  } catch {
    return {
      message: `${res.status}: ${res.statusText}` || fallbackMessage,
    };
  }
}

function normalizeToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    const message = 'Authentication token is required.';
    logError('Missing authentication token', { providedTokenLength: token.length });
    throw new Error(message);
  }
  return trimmed;
}

function authHeaders(token: string): HeadersInit {
  const normalized = normalizeToken(token);
  return {
    Authorization: `Bearer ${normalized}`,
  };
}

function isRoomNotFound(status: number, message: string, payload?: unknown): boolean {
  if (status === 404) return true;
  const normalized = message.trim().toLowerCase();
  if (normalized.includes('room not found')) return true;
  if (normalized === 'room-not-found') return true;
  if (payload && typeof payload === 'object') {
    const candidate = (payload as Record<string, unknown>).code;
    if (typeof candidate === 'string') {
      const code = candidate.trim().toLowerCase();
      if (code === 'room_not_found' || code === 'room-not-found') {
        return true;
      }
    }
  }
  return false;
}

export interface CreateRoomResponse {
  roomId: string;
  participantId: string;
  participants: ParticipantSummary[];
  turn: RTCIceServer[];
}

export async function createRoom(token: string, role: Role = 'facilitator'): Promise<CreateRoomResponse> {
  if (role !== 'facilitator') {
    const message = 'Only facilitators can create rooms.';
    logError('Attempted to create room with non-facilitator role', { role });
    throw new Error(message);
  }

  const res = await fetch(apiUrl('/rooms'), {
    method: 'POST',
    headers: authHeaders(token),
  });

  if (!res.ok) {
    const { message: errorMessage, payload } = await extractErrorMessage(
      res,
      'failed to create room'
    );
    logError('Failed to create room', {
      role,
      status: res.status,
      statusText: res.statusText,
      url: res.url,
      errorMessage,
      errorPayload: payload,
    });
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
  if (!res.ok) {
    const { message: errorMessage, payload } = await extractErrorMessage(
      res,
      'failed to join room'
    );
    logError('Failed to join room', {
      roomId,
      role,
      hasPassword: Boolean(password),
      status: res.status,
      statusText: res.statusText,
      url: res.url,
      errorMessage,
      errorPayload: payload,
    });
    if (isRoomNotFound(res.status, errorMessage, payload)) {
      throw new RoomNotFoundError(errorMessage || 'Room not found', payload);
    }
    throw new Error(errorMessage);
  }
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
  if (!res.ok) {
    const { message: errorMessage, payload } = await extractErrorMessage(
      res,
      'failed to list participants'
    );
    logError('Failed to list participants', {
      roomId,
      status: res.status,
      statusText: res.statusText,
      url: res.url,
      errorMessage,
      errorPayload: payload,
    });
    if (isRoomNotFound(res.status, errorMessage, payload)) {
      throw new RoomNotFoundError(errorMessage || 'Room not found', payload);
    }
    throw new Error(errorMessage);
  }
  const data = (await res.json()) as { participants?: ParticipantSummary[] };
  return data.participants ?? [];
}

export async function setRoomPassword(roomId: string, token: string, password?: string): Promise<void> {
  const res = await fetch(apiUrl(`/rooms/${roomId}/password`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(password ? { password } : {}),
  });
  if (!res.ok) {
    const { message: errorMessage, payload } = await extractErrorMessage(
      res,
      'failed to set room password'
    );
    logError('Failed to set room password', {
      roomId,
      hasPassword: Boolean(password),
      status: res.status,
      statusText: res.statusText,
      url: res.url,
      errorMessage,
      errorPayload: payload,
    });
    throw new Error(errorMessage);
  }
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
  if (!res.ok) {
    const { message: errorMessage, payload } = await extractErrorMessage(
      res,
      'failed to update participant role'
    );
    logError('Failed to update participant role', {
      roomId,
      participantId,
      role,
      status: res.status,
      statusText: res.statusText,
      url: res.url,
      errorMessage,
      errorPayload: payload,
    });
    throw new Error(errorMessage);
  }
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
  if (!res.ok) {
    const { message: errorMessage, payload } = await extractErrorMessage(
      res,
      'failed to remove participant'
    );
    logError('Failed to remove room participant', {
      roomId,
      participantId,
      status: res.status,
      statusText: res.statusText,
      url: res.url,
      errorMessage,
      errorPayload: payload,
    });
    throw new Error(errorMessage);
  }
}
