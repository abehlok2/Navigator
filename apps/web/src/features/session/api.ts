export type Role = 'facilitator' | 'explorer' | 'listener';

const BASE_URL = 'http://localhost:8080';

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function createRoom(token: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/rooms`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('failed to create room');
  const data = (await res.json()) as { roomId: string };
  return data.roomId;
}

export interface JoinResponse {
  participantId: string;
  turn: RTCIceServer[];
}

export async function joinRoom(
  roomId: string,
  role: Role,
  token: string
): Promise<JoinResponse> {
  const res = await fetch(`${BASE_URL}/rooms/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error('failed to join room');
  const data = (await res.json()) as { participantId: string; turn: RTCIceServer };
  return { participantId: data.participantId, turn: [data.turn] };
}

export async function leaveRoom(
  roomId: string,
  participantId: string,
  token: string
): Promise<void> {
  await fetch(`${BASE_URL}/rooms/${roomId}/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ participantId }),
  });
}
