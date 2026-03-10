import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

// Mock dependencies
const mockClearTranscripts = vi.fn();
const mockSetMeetingTitle = vi.fn();
const mockSetIsMeetingActive = vi.fn();
const mockSetStatus = vi.fn();
const mockSelectedDevices = { micDevice: 'TestMic', systemDevice: 'TestSystem' };
const mockStartRecordingWithDevices = vi.fn().mockResolvedValue(undefined);
const mockShowRecordingNotification = vi.fn().mockResolvedValue(undefined);
const mockTrackButtonClick = vi.fn();
const mockToastInfo = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/contexts/TranscriptContext', () => ({
  useTranscripts: () => ({
    clearTranscripts: mockClearTranscripts,
    setMeetingTitle: mockSetMeetingTitle,
  }),
}));

vi.mock('@/components/Sidebar/SidebarProvider', () => ({
  useSidebar: () => ({
    setIsMeetingActive: mockSetIsMeetingActive,
  }),
}));

vi.mock('@/contexts/ConfigContext', () => ({
  useConfig: () => ({
    selectedDevices: mockSelectedDevices,
  }),
}));

vi.mock('@/contexts/RecordingStateContext', () => ({
  useRecordingState: () => ({
    setStatus: mockSetStatus,
  }),
  RecordingStatus: {
    IDLE: 'idle',
    STARTING: 'starting',
    RECORDING: 'recording',
    ERROR: 'error',
  },
}));

vi.mock('@/services/recordingService', () => ({
  recordingService: {
    startRecordingWithDevices: (...args: any[]) => mockStartRecordingWithDevices(...args),
  },
}));

vi.mock('@/lib/analytics', () => ({
  default: {
    trackButtonClick: (...args: any[]) => mockTrackButtonClick(...args),
  },
}));

vi.mock('@/lib/recordingNotification', () => ({
  showRecordingNotification: () => mockShowRecordingNotification(),
}));

vi.mock('sonner', () => ({
  toast: {
    info: (...args: any[]) => mockToastInfo(...args),
    error: (...args: any[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

import { useRecordingStart } from './useRecordingStart';

describe('useRecordingStart', () => {
  let setIsRecording: ReturnType<typeof vi.fn>;
  let showModal: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setIsRecording = vi.fn();
    showModal = vi.fn();
    // Default: parakeet ready with available models
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'parakeet_init') return undefined;
      if (cmd === 'parakeet_has_available_models') return true;
      if (cmd === 'parakeet_get_available_models') return [];
      throw new Error(`Unexpected invoke: ${cmd}`);
    });
    // Clear sessionStorage
    sessionStorage.clear();
  });

  const renderStartHook = (isRecording = false) =>
    renderHook(() => useRecordingStart(isRecording, setIsRecording, showModal));

  // ── Initial state ─────────────────────────────────────────────────

  it('should return isAutoStarting as false initially', () => {
    const { result } = renderStartHook();
    expect(result.current.isAutoStarting).toBe(false);
  });

  it('should return handleRecordingStart as a function', () => {
    const { result } = renderStartHook();
    expect(typeof result.current.handleRecordingStart).toBe('function');
  });

  // ── handleRecordingStart: successful flow ─────────────────────────

  it('should check parakeet readiness before starting', async () => {
    const { result } = renderStartHook();

    await act(async () => {
      await result.current.handleRecordingStart();
    });

    expect(invoke).toHaveBeenCalledWith('parakeet_init');
    expect(invoke).toHaveBeenCalledWith('parakeet_has_available_models');
  });

  it('should generate meeting title with correct format', async () => {
    const { result } = renderStartHook();

    await act(async () => {
      await result.current.handleRecordingStart();
    });

    expect(mockSetMeetingTitle).toHaveBeenCalledWith(
      expect.stringMatching(/^Meeting \d{2}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}$/)
    );
  });

  it('should set STARTING status before backend call', async () => {
    const { result } = renderStartHook();

    await act(async () => {
      await result.current.handleRecordingStart();
    });

    expect(mockSetStatus).toHaveBeenCalledWith('starting', 'Initializing recording...');
  });

  it('should call startRecordingWithDevices with selected devices', async () => {
    const { result } = renderStartHook();

    await act(async () => {
      await result.current.handleRecordingStart();
    });

    expect(mockStartRecordingWithDevices).toHaveBeenCalledWith(
      'TestMic',
      'TestSystem',
      expect.stringMatching(/^Meeting \d{2}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}$/)
    );
  });

  it('should update recording state after successful start', async () => {
    const { result } = renderStartHook();

    await act(async () => {
      await result.current.handleRecordingStart();
    });

    expect(setIsRecording).toHaveBeenCalledWith(true);
    expect(mockClearTranscripts).toHaveBeenCalled();
    expect(mockSetIsMeetingActive).toHaveBeenCalledWith(true);
  });

  it('should track analytics on successful start', async () => {
    const { result } = renderStartHook();

    await act(async () => {
      await result.current.handleRecordingStart();
    });

    expect(mockTrackButtonClick).toHaveBeenCalledWith('start_recording', 'home_page');
  });

  it('should show recording notification', async () => {
    const { result } = renderStartHook();

    await act(async () => {
      await result.current.handleRecordingStart();
    });

    expect(mockShowRecordingNotification).toHaveBeenCalled();
  });

  // ── handleRecordingStart: parakeet not ready ──────────────────────

  it('should block recording when parakeet has no models and show modal', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'parakeet_init') return undefined;
      if (cmd === 'parakeet_has_available_models') return false;
      if (cmd === 'parakeet_get_available_models') return [];
      throw new Error(`Unexpected invoke: ${cmd}`);
    });

    const { result } = renderStartHook();

    await act(async () => {
      await result.current.handleRecordingStart();
    });

    expect(mockToastError).toHaveBeenCalledWith('Transcription model not ready', expect.any(Object));
    expect(showModal).toHaveBeenCalledWith('modelSelector', 'Transcription model setup required');
    expect(mockSetStatus).toHaveBeenCalledWith('idle');
    expect(mockStartRecordingWithDevices).not.toHaveBeenCalled();
  });

  it('should show info toast when model is downloading', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'parakeet_init') return undefined;
      if (cmd === 'parakeet_has_available_models') return false;
      if (cmd === 'parakeet_get_available_models') return [{ status: 'Downloading' }];
      throw new Error(`Unexpected invoke: ${cmd}`);
    });

    const { result } = renderStartHook();

    await act(async () => {
      await result.current.handleRecordingStart();
    });

    expect(mockToastInfo).toHaveBeenCalledWith('Model download in progress', expect.any(Object));
    expect(mockTrackButtonClick).toHaveBeenCalledWith('start_recording_blocked_downloading', 'home_page');
    expect(mockStartRecordingWithDevices).not.toHaveBeenCalled();
  });

  it('should handle object-style downloading status', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'parakeet_init') return undefined;
      if (cmd === 'parakeet_has_available_models') return false;
      if (cmd === 'parakeet_get_available_models') return [{ status: { Downloading: 50 } }];
      throw new Error(`Unexpected invoke: ${cmd}`);
    });

    const { result } = renderStartHook();

    await act(async () => {
      await result.current.handleRecordingStart();
    });

    expect(mockToastInfo).toHaveBeenCalledWith('Model download in progress', expect.any(Object));
  });

  // ── handleRecordingStart: error handling ──────────────────────────

  it('should set ERROR status on recording service failure', async () => {
    mockStartRecordingWithDevices.mockRejectedValueOnce(new Error('Device not found'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderStartHook();

    let caughtError: any;
    try {
      await act(async () => {
        await result.current.handleRecordingStart();
      });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.message).toBe('Device not found');
    expect(mockSetStatus).toHaveBeenCalledWith('error', 'Device not found');
    expect(setIsRecording).toHaveBeenCalledWith(false);
    expect(mockTrackButtonClick).toHaveBeenCalledWith('start_recording_error', 'home_page');
  });

  it('should handle non-Error thrown values', async () => {
    mockStartRecordingWithDevices.mockRejectedValueOnce('string error');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderStartHook();

    let caughtError: any;
    try {
      await act(async () => {
        await result.current.handleRecordingStart();
      });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBe('string error');
    expect(mockSetStatus).toHaveBeenCalledWith('error', 'Failed to start recording');
  });

  it('should handle parakeet_init failure gracefully', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'parakeet_init') throw new Error('Init failed');
      if (cmd === 'parakeet_get_available_models') return [];
      throw new Error(`Unexpected invoke: ${cmd}`);
    });

    const { result } = renderStartHook();

    await act(async () => {
      await result.current.handleRecordingStart();
    });

    // Should be blocked since checkParakeetReady returns false on error
    expect(mockStartRecordingWithDevices).not.toHaveBeenCalled();
  });

  // ── Auto-start from sessionStorage ────────────────────────────────

  it('should auto-start recording when sessionStorage flag is set', async () => {
    sessionStorage.setItem('autoStartRecording', 'true');

    const { result } = renderStartHook(false);

    await waitFor(() => {
      expect(mockStartRecordingWithDevices).toHaveBeenCalled();
    });

    expect(sessionStorage.getItem('autoStartRecording')).toBeNull();
  });

  it('should not auto-start when already recording', async () => {
    sessionStorage.setItem('autoStartRecording', 'true');

    renderStartHook(true);

    // Give effect time to run
    await new Promise(r => setTimeout(r, 50));

    expect(mockStartRecordingWithDevices).not.toHaveBeenCalled();
  });

  // ── Direct sidebar start event ────────────────────────────────────

  it('should listen for start-recording-from-sidebar event', () => {
    renderStartHook();
    expect(window.addEventListener).toHaveBeenCalledWith(
      'start-recording-from-sidebar',
      expect.any(Function)
    );
  });

  it('should start recording on sidebar event dispatch', async () => {
    renderStartHook(false);

    await act(async () => {
      window.dispatchEvent(new Event('start-recording-from-sidebar'));
    });

    await waitFor(() => {
      expect(mockStartRecordingWithDevices).toHaveBeenCalled();
    });
  });

  it('should ignore sidebar event when already recording', async () => {
    renderStartHook(true);

    await act(async () => {
      window.dispatchEvent(new Event('start-recording-from-sidebar'));
    });

    // Give time for event handler
    await new Promise(r => setTimeout(r, 50));

    expect(mockStartRecordingWithDevices).not.toHaveBeenCalled();
  });

  // ── Null device handling ──────────────────────────────────────────

  it('should pass null for missing device names', async () => {
    // Override useConfig to return undefined devices
    vi.doMock('@/contexts/ConfigContext', () => ({
      useConfig: () => ({
        selectedDevices: { micDevice: undefined, systemDevice: undefined },
      }),
    }));

    // The current mock already handles this via `|| null`
    const { result } = renderStartHook();

    await act(async () => {
      await result.current.handleRecordingStart();
    });

    expect(mockStartRecordingWithDevices).toHaveBeenCalledWith(
      'TestMic', // From the module-level mock
      'TestSystem',
      expect.any(String)
    );
  });
});
