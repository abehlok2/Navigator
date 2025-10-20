/* @vitest-environment jsdom */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../DashboardPage';
import { useAuthStore } from '../../state/auth';
import { listParticipants, RoomNotFoundError } from '../../features/session/api';

vi.mock('../../features/session/api', async () => {
  const actual = await vi.importActual<typeof import('../../features/session/api')>(
    '../../features/session/api'
  );
  return {
    ...actual,
    listParticipants: vi.fn(),
  };
});

describe('DashboardPage session presence', () => {
  const STORAGE_KEY = 'navigator-dashboard-sessions';
  const mockedListParticipants = listParticipants as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockedListParticipants.mockReset();
    window.localStorage.clear();
    useAuthStore.setState({ token: null, username: null, role: null });
  });

  it('removes stored sessions when the room no longer exists', async () => {
    const now = new Date().toISOString();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          roomId: 'missing-room',
          label: 'Test Room',
          createdAt: now,
          lastAccessed: now,
        },
      ])
    );

    mockedListParticipants.mockRejectedValue(new RoomNotFoundError('room not found'));

    useAuthStore.setState({ token: 'test-token', username: 'Tester', role: 'facilitator' });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(mockedListParticipants).toHaveBeenCalledTimes(1));

    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('[]');
    });

    expect(
      await screen.findByText(/expired and was removed from your dashboard\.$/i)
    ).toBeTruthy();
    expect(screen.queryByText('Test Room')).toBeNull();
  });
});
