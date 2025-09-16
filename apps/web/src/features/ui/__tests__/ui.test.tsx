/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

function resetSessionStore(store: any) {
  store.setState({
    role: null,
    connection: 'disconnected',
    manifest: {},
    assets: new Set(),
    remoteAssets: new Set(),
    remoteMissing: new Set(),
    assetProgress: {},
    control: null,
    telemetry: null,
    lastHeartbeat: null,
    peerClock: null,
    micStream: null,
  });
}

describe('UI components', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders asset availability without explorer progress for non-facilitators', async () => {
    const { useSessionStore } = await import('../../../state/session');
    const { default: AssetAvailability } = await import('../AssetAvailability');

    resetSessionStore(useSessionStore);
    useSessionStore.setState({
      role: 'explorer',
      manifest: {
        tone: { id: 'tone', sha256: 'hash1', bytes: 512 },
      },
      assets: new Set(['tone']),
      remoteAssets: new Set(['tone']),
      assetProgress: { tone: { loaded: 512, total: 512 } },
    });

    render(<AssetAvailability />);

    expect(screen.queryByText(/Explorer progress/)).toBeNull();
  });

  it('shows facilitator view of remote asset progress', async () => {
    const { useSessionStore } = await import('../../../state/session');
    const { default: AssetAvailability } = await import('../AssetAvailability');

    resetSessionStore(useSessionStore);
    useSessionStore.setState({
      role: 'facilitator',
      manifest: {
        tone: { id: 'tone', sha256: 'hash1', bytes: 256 },
      },
      assets: new Set(['tone']),
      remoteAssets: new Set(['tone']),
      assetProgress: { tone: { loaded: 256, total: 256 } },
    });

    render(<AssetAvailability />);

    expect(screen.getByText(/Explorer progress: 1\/1 \(100%\)/)).toBeTruthy();
    expect(screen.getByText(/Explorer: Loaded/)).toBeTruthy();
  });

  it('handles asset drop interactions with manifest guidance', async () => {
    const handleDropMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../audio/assets', () => ({ handleDrop: handleDropMock }));

    const { useSessionStore } = await import('../../../state/session');
    const { default: AssetDropZone } = await import('../AssetDropZone');

    resetSessionStore(useSessionStore);
    useSessionStore.setState({
      manifest: {
        tone: { id: 'tone', sha256: 'hash1', bytes: 1024 },
        noise: { id: 'noise', sha256: 'hash2', bytes: 2048 },
      },
      assets: new Set(['tone']),
    });

    render(<AssetDropZone />);

    const instructions = screen.getByText('Drop audio files matching: tone, noise');
    expect(instructions).toBeTruthy();
    expect(screen.getByText(/Loaded 1 \/ 2/)).toBeTruthy();

    const dropZone = instructions.parentElement as HTMLElement;
    fireEvent.drop(dropZone, { nativeEvent: { dataTransfer: {} } });

    expect(handleDropMock).toHaveBeenCalled();
  });

  it('prompts for recording consent and shows decline error', async () => {
    const startMixRecording = vi.fn(async (_mic, _program, consent: () => Promise<boolean>) => {
      const allowed = await consent();
      if (!allowed) return null;
      return { stop: vi.fn().mockResolvedValue(new Blob()) };
    });
    vi.doMock('../../audio/recorder', () => ({ startMixRecording }));
    vi.doMock('../../audio/context', () => ({ getProgramStream: vi.fn(() => ({ id: 'program' })) }));

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { useSessionStore } = await import('../../../state/session');
    const { default: RecordingControls } = await import('../RecordingControls');

    resetSessionStore(useSessionStore);
    const micStream = { id: 'mic' } as unknown as MediaStream;
    useSessionStore.setState({ micStream });

    render(<RecordingControls />);

    fireEvent.click(screen.getByRole('button', { name: /Start Recording/i }));

    expect(confirmSpy).toHaveBeenCalled();
    await screen.findByText('Recording consent was declined.');
    expect(startMixRecording).toHaveBeenCalledWith(micStream, expect.anything(), expect.any(Function), expect.any(Function));
    expect(screen.queryByText(/Recording in progress/)).toBeNull();
  });

  it('starts recording when consent is granted', async () => {
    const stopMock = vi.fn().mockResolvedValue(new Blob());
    const startMixRecording = vi.fn(async (_mic, _program, consent: () => Promise<boolean>) => {
      const allowed = await consent();
      if (!allowed) return null;
      return { stop: stopMock };
    });
    vi.doMock('../../audio/recorder', () => ({ startMixRecording }));
    vi.doMock('../../audio/context', () => ({ getProgramStream: vi.fn(() => ({ id: 'program' })) }));

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { useSessionStore } = await import('../../../state/session');
    const { default: RecordingControls } = await import('../RecordingControls');

    resetSessionStore(useSessionStore);
    const micStream = { id: 'mic' } as unknown as MediaStream;
    useSessionStore.setState({ micStream });

    render(<RecordingControls />);

    fireEvent.click(screen.getByRole('button', { name: /Start Recording/i }));

    await screen.findByText('Recording in progress…');
    expect(startMixRecording).toHaveBeenCalled();
  });
});
