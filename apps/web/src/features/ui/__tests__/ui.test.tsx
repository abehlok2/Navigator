/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../ManifestEditor', () => ({
  __esModule: true,
  default: () => null,
}));

if (!(globalThis as any).requestAnimationFrame) {
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 16) as unknown as number;
  (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

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
        tone: {
          id: 'tone',
          sha256: 'hash1',
          bytes: 512,
          title: 'Soothing Tone',
          notes: 'Use for intro segment',
          url: 'https://example.com/tone.wav',
        },
      },
      assets: new Set(['tone']),
      remoteAssets: new Set(['tone']),
      assetProgress: { tone: { loaded: 512, total: 512 } },
    });

    render(<AssetAvailability />);

    expect(screen.getByText('Soothing Tone')).toBeTruthy();
    expect(screen.getByText('ID: tone')).toBeTruthy();
    expect(screen.getByText('Use for intro segment')).toBeTruthy();
    expect(screen.getByText(/Legacy remote reference/)).toBeTruthy();
    expect(screen.queryByText(/Explorer progress/)).toBeNull();
  });

  it('shows facilitator view of remote asset progress', async () => {
    const { useSessionStore } = await import('../../../state/session');
    const { default: AssetAvailability } = await import('../AssetAvailability');

    resetSessionStore(useSessionStore);
    useSessionStore.setState({
      role: 'facilitator',
      manifest: {
        tone: { id: 'tone', sha256: 'hash1', bytes: 256, title: 'Tone Pad' },
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
        chime: { id: 'chime', sha256: 'hash2', bytes: 2048 },
      },
      assets: new Set(['tone']),
    });

    render(<AssetDropZone />);

    const instructions = screen.getByText('Drop audio files matching: tone, chime');
    expect(instructions).toBeTruthy();
    expect(screen.getByText(/Loaded 1 \/ 2/)).toBeTruthy();

    const dropZone = instructions.parentElement as HTMLElement;
    fireEvent.drop(dropZone, { nativeEvent: { dataTransfer: {} } });

    expect(handleDropMock).toHaveBeenCalled();
  });

  it('prompts for recording consent and shows decline error', async () => {
    const startMixRecording = vi.fn(async (_mic, consent: () => Promise<boolean>) => {
      const allowed = await consent();
      if (!allowed) return null;
      return {
        startedAt: Date.now(),
        stop: vi.fn().mockResolvedValue(new Blob()),
        getLevels: () => ({ left: -120, right: -120 }),
      };
    });
    vi.doMock('../../audio/recorder', () => ({ startMixRecording }));

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
    expect(startMixRecording).toHaveBeenCalledWith(micStream, expect.any(Function));
    expect(screen.queryByText(/Recording in progress/)).toBeNull();
  });

  it('starts recording when consent is granted', async () => {
    const stopMock = vi.fn().mockResolvedValue(new Blob([1], { type: 'audio/webm' }));
    const startMixRecording = vi.fn(async (_mic, consent: () => Promise<boolean>) => {
      const allowed = await consent();
      if (!allowed) return null;
      return {
        startedAt: Date.now() - 1000,
        stop: stopMock,
        getLevels: () => ({ left: -12, right: -10 }),
      };
    });
    vi.doMock('../../audio/recorder', () => ({ startMixRecording }));

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { useSessionStore } = await import('../../../state/session');
    const { default: RecordingControls } = await import('../RecordingControls');

    resetSessionStore(useSessionStore);
    const micStream = { id: 'mic' } as unknown as MediaStream;
    useSessionStore.setState({ micStream });

    render(<RecordingControls />);

    fireEvent.click(screen.getByRole('button', { name: /Start Recording/i }));

    await screen.findByText('Recording in progress…');
    expect(screen.getByText(/Session mix level/i)).toBeTruthy();
    expect(startMixRecording).toHaveBeenCalledWith(micStream, expect.any(Function));
  });

  it('issues load command with status feedback', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const controlMock = {
      load,
      unload: vi.fn().mockResolvedValue(undefined),
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      setGain: vi.fn().mockResolvedValue(undefined),
      crossfade: vi.fn().mockResolvedValue(undefined),
      seek: vi.fn().mockResolvedValue(undefined),
      ducking: vi.fn().mockResolvedValue(undefined),
    };

    const { useSessionStore } = await import('../../../state/session');
    const { default: FacilitatorControls } = await import('../FacilitatorControls');

    resetSessionStore(useSessionStore);
    useSessionStore.setState({
      role: 'facilitator',
      manifest: { tone: { id: 'tone', sha256: 'abc', bytes: 1024 } },
      assets: new Set(),
      remoteAssets: new Set(),
      remoteMissing: new Set(['tone']),
      assetProgress: {},
      control: controlMock as any,
    });

    render(<FacilitatorControls />);

    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    expect(load).toHaveBeenCalledWith({ id: 'tone', sha256: 'abc', bytes: 1024 });
    await screen.findByText('Load command acknowledged.');
  });

  it('issues unload command when explorer has asset', async () => {
    const unload = vi.fn().mockResolvedValue(undefined);
    const controlMock = {
      load: vi.fn().mockResolvedValue(undefined),
      unload,
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      setGain: vi.fn().mockResolvedValue(undefined),
      crossfade: vi.fn().mockResolvedValue(undefined),
      seek: vi.fn().mockResolvedValue(undefined),
      ducking: vi.fn().mockResolvedValue(undefined),
    };

    const { useSessionStore } = await import('../../../state/session');
    const { default: FacilitatorControls } = await import('../FacilitatorControls');

    resetSessionStore(useSessionStore);
    useSessionStore.setState({
      role: 'facilitator',
      manifest: { tone: { id: 'tone', sha256: 'abc', bytes: 1024 } },
      assets: new Set(),
      remoteAssets: new Set(['tone']),
      remoteMissing: new Set(),
      assetProgress: {},
      control: controlMock as any,
    });

    render(<FacilitatorControls />);

    fireEvent.click(screen.getByRole('button', { name: 'Unload' }));

    expect(unload).toHaveBeenCalled();

    await waitFor(() => {
      expect(unload).toHaveBeenCalledWith({ id: 'tone' });
    });
    expect(screen.getByText('Unload command acknowledged.')).toBeTruthy();
  });

  it('shows errors when load command cannot be sent', async () => {
    const load = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const controlMock = {
      load,
      unload: vi.fn().mockResolvedValue(undefined),
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      setGain: vi.fn().mockResolvedValue(undefined),
      crossfade: vi.fn().mockResolvedValue(undefined),
      seek: vi.fn().mockResolvedValue(undefined),
      ducking: vi.fn().mockResolvedValue(undefined),
    };

    const { useSessionStore } = await import('../../../state/session');
    const { default: FacilitatorControls } = await import('../FacilitatorControls');

    resetSessionStore(useSessionStore);
    useSessionStore.setState({
      role: 'facilitator',
      manifest: { tone: { id: 'tone', sha256: 'def', bytes: 2048 } },
      assets: new Set(),
      remoteAssets: new Set(),
      remoteMissing: new Set(['tone']),
      assetProgress: {},
      control: controlMock as any,
    });

    render(<FacilitatorControls />);

    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    await screen.findByText('fetch failed');
    expect(load).toHaveBeenCalledWith({ id: 'tone', sha256: 'def', bytes: 2048 });

  });
});
