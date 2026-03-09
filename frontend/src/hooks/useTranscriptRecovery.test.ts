import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

const mockGetAllMeetings = vi.fn();
const mockGetMeetingMetadata = vi.fn();
const mockGetTranscripts = vi.fn();
const mockMarkMeetingSaved = vi.fn();
const mockDeleteMeeting = vi.fn();
const mockSaveMeeting = vi.fn();

vi.mock('@/services/indexedDBService', () => ({
  indexedDBService: {
    getAllMeetings: () => mockGetAllMeetings(),
    getMeetingMetadata: (id: string) => mockGetMeetingMetadata(id),
    getTranscripts: (id: string) => mockGetTranscripts(id),
    markMeetingSaved: (id: string) => mockMarkMeetingSaved(id),
    deleteMeeting: (id: string) => mockDeleteMeeting(id),
  },
}));

vi.mock('@/services/storageService', () => ({
  storageService: {
    saveMeeting: (...args: any[]) => mockSaveMeeting(...args),
  },
}));

import { useTranscriptRecovery } from './useTranscriptRecovery';

describe('useTranscriptRecovery', () => {
  const now = Date.now();
  // Meeting from 1 hour ago (within retention, old enough)
  const validMeeting = {
    meetingId: 'meeting-1',
    title: 'Team Standup',
    startTime: now - 3600000,
    lastUpdated: now - 3600000,
    transcriptCount: 5,
    savedToSQLite: false,
    folderPath: '/recordings/meeting-1',
  };

  // Meeting from 10 days ago (outside retention)
  const oldMeeting = {
    meetingId: 'meeting-old',
    title: 'Old Meeting',
    startTime: now - 10 * 24 * 3600000,
    lastUpdated: now - 10 * 24 * 3600000,
    transcriptCount: 3,
    savedToSQLite: false,
  };

  // Meeting from 5 seconds ago (too recent)
  const recentMeeting = {
    meetingId: 'meeting-recent',
    title: 'Just Now',
    startTime: now - 5000,
    lastUpdated: now - 5000,
    transcriptCount: 1,
    savedToSQLite: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllMeetings.mockResolvedValue([]);
    mockGetTranscripts.mockResolvedValue([]);
    mockMarkMeetingSaved.mockResolvedValue(undefined);
    mockDeleteMeeting.mockResolvedValue(undefined);
    mockSaveMeeting.mockResolvedValue({ meeting_id: 'saved-123' });

    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'has_audio_checkpoints') return true;
      if (cmd === 'recover_audio_from_checkpoints') return {
        status: 'success',
        chunk_count: 10,
        estimated_duration_seconds: 300,
        audio_file_path: '/recordings/meeting-1/recovered.wav',
        message: 'Audio recovered successfully',
      };
      if (cmd === 'get_meeting_folder_path') return '/recordings/fallback';
      if (cmd === 'cleanup_checkpoints') return undefined;
      throw new Error(`Unexpected invoke: ${cmd}`);
    });
  });

  const renderRecoveryHook = () => renderHook(() => useTranscriptRecovery());

  // ── Initial state ─────────────────────────────────────────────────

  it('should return empty recoverableMeetings initially', () => {
    const { result } = renderRecoveryHook();
    expect(result.current.recoverableMeetings).toEqual([]);
  });

  it('should return isLoading as false initially', () => {
    const { result } = renderRecoveryHook();
    expect(result.current.isLoading).toBe(false);
  });

  it('should return isRecovering as false initially', () => {
    const { result } = renderRecoveryHook();
    expect(result.current.isRecovering).toBe(false);
  });

  // ── checkForRecoverableTranscripts ────────────────────────────────

  it('should set isLoading during check', async () => {
    let resolveGetAll: (value: any) => void;
    mockGetAllMeetings.mockReturnValue(new Promise(r => { resolveGetAll = r; }));

    const { result } = renderRecoveryHook();

    let checkPromise: Promise<void>;
    act(() => {
      checkPromise = result.current.checkForRecoverableTranscripts();
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveGetAll!([]);
      await checkPromise!;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('should filter out meetings older than 7 days', async () => {
    mockGetAllMeetings.mockResolvedValue([validMeeting, oldMeeting]);

    const { result } = renderRecoveryHook();

    await act(async () => {
      await result.current.checkForRecoverableTranscripts();
    });

    expect(result.current.recoverableMeetings).toHaveLength(1);
    expect(result.current.recoverableMeetings[0].meetingId).toBe('meeting-1');
  });

  it('should filter out meetings newer than 15 seconds', async () => {
    mockGetAllMeetings.mockResolvedValue([recentMeeting]);

    const { result } = renderRecoveryHook();

    await act(async () => {
      await result.current.checkForRecoverableTranscripts();
    });

    expect(result.current.recoverableMeetings).toHaveLength(0);
  });

  it('should check audio checkpoint availability for meetings with folder path', async () => {
    mockGetAllMeetings.mockResolvedValue([validMeeting]);

    const { result } = renderRecoveryHook();

    await act(async () => {
      await result.current.checkForRecoverableTranscripts();
    });

    expect(invoke).toHaveBeenCalledWith('has_audio_checkpoints', {
      meetingFolder: '/recordings/meeting-1',
    });
  });

  it('should clear folderPath when no audio checkpoints exist', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'has_audio_checkpoints') return false;
      throw new Error(`Unexpected invoke: ${cmd}`);
    });

    mockGetAllMeetings.mockResolvedValue([validMeeting]);

    const { result } = renderRecoveryHook();

    await act(async () => {
      await result.current.checkForRecoverableTranscripts();
    });

    expect(result.current.recoverableMeetings[0].folderPath).toBeUndefined();
  });

  it('should handle errors in checkForRecoverableTranscripts', async () => {
    mockGetAllMeetings.mockRejectedValue(new Error('IndexedDB error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderRecoveryHook();

    await act(async () => {
      await result.current.checkForRecoverableTranscripts();
    });

    expect(result.current.recoverableMeetings).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    consoleSpy.mockRestore();
  });

  it('should handle audio checkpoint check failure gracefully', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'has_audio_checkpoints') throw new Error('File system error');
      throw new Error(`Unexpected invoke: ${cmd}`);
    });

    mockGetAllMeetings.mockResolvedValue([validMeeting]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderRecoveryHook();

    await act(async () => {
      await result.current.checkForRecoverableTranscripts();
    });

    // Should clear folderPath on error
    expect(result.current.recoverableMeetings[0].folderPath).toBeUndefined();
    vi.mocked(console.warn).mockRestore();
  });

  // ── loadMeetingTranscripts ────────────────────────────────────────

  it('should load and sort transcripts by sequenceId', async () => {
    const transcripts = [
      { id: 3, meetingId: 'meeting-1', text: 'Third', timestamp: '', confidence: 0.9, sequenceId: 3, storedAt: 0 },
      { id: 1, meetingId: 'meeting-1', text: 'First', timestamp: '', confidence: 0.9, sequenceId: 1, storedAt: 0 },
      { id: 2, meetingId: 'meeting-1', text: 'Second', timestamp: '', confidence: 0.9, sequenceId: 2, storedAt: 0 },
    ];
    mockGetTranscripts.mockResolvedValue([...transcripts]);

    const { result } = renderRecoveryHook();

    let loaded: any[];
    await act(async () => {
      loaded = await result.current.loadMeetingTranscripts('meeting-1');
    });

    expect(loaded![0].text).toBe('First');
    expect(loaded![1].text).toBe('Second');
    expect(loaded![2].text).toBe('Third');
  });

  it('should return empty array on load error', async () => {
    mockGetTranscripts.mockRejectedValue(new Error('Load failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderRecoveryHook();

    let loaded: any[];
    await act(async () => {
      loaded = await result.current.loadMeetingTranscripts('meeting-1');
    });

    expect(loaded!).toEqual([]);
    vi.mocked(console.error).mockRestore();
  });

  // ── recoverMeeting ────────────────────────────────────────────────

  it('should set isRecovering during recovery', async () => {
    mockGetMeetingMetadata.mockResolvedValue(validMeeting);
    mockGetTranscripts.mockResolvedValue([
      { id: 1, meetingId: 'meeting-1', text: 'Hello', timestamp: '10:00', confidence: 0.9, sequenceId: 1, storedAt: 0 },
    ]);

    const { result } = renderRecoveryHook();

    let recoverPromise: Promise<any>;
    act(() => {
      recoverPromise = result.current.recoverMeeting('meeting-1');
    });

    expect(result.current.isRecovering).toBe(true);

    await act(async () => {
      await recoverPromise;
    });

    expect(result.current.isRecovering).toBe(false);
  });

  it('should recover meeting with audio checkpoints', async () => {
    mockGetMeetingMetadata.mockResolvedValue(validMeeting);
    mockGetTranscripts.mockResolvedValue([
      { id: 1, meetingId: 'meeting-1', text: 'Hello', timestamp: '10:00', confidence: 0.9, sequenceId: 1, storedAt: 0 },
    ]);

    const { result } = renderRecoveryHook();

    let response: any;
    await act(async () => {
      response = await result.current.recoverMeeting('meeting-1');
    });

    expect(response.success).toBe(true);
    expect(response.audioRecoveryStatus?.status).toBe('success');
    expect(response.meetingId).toBe('saved-123');
  });

  it('should save transcripts to backend during recovery', async () => {
    mockGetMeetingMetadata.mockResolvedValue(validMeeting);
    mockGetTranscripts.mockResolvedValue([
      { id: 1, meetingId: 'meeting-1', text: 'Hello', timestamp: '10:00', confidence: 0.9, sequenceId: 1, storedAt: 0 },
    ]);

    const { result } = renderRecoveryHook();

    await act(async () => {
      await result.current.recoverMeeting('meeting-1');
    });

    expect(mockSaveMeeting).toHaveBeenCalledWith(
      'Team Standup',
      expect.arrayContaining([expect.objectContaining({ text: 'Hello' })]),
      '/recordings/meeting-1'
    );
  });

  it('should mark meeting as saved in IndexedDB', async () => {
    mockGetMeetingMetadata.mockResolvedValue(validMeeting);
    mockGetTranscripts.mockResolvedValue([
      { id: 1, meetingId: 'meeting-1', text: 'Hello', timestamp: '10:00', confidence: 0.9, sequenceId: 1, storedAt: 0 },
    ]);

    const { result } = renderRecoveryHook();

    await act(async () => {
      await result.current.recoverMeeting('meeting-1');
    });

    expect(mockMarkMeetingSaved).toHaveBeenCalledWith('meeting-1');
  });

  it('should clean up checkpoints after recovery', async () => {
    mockGetMeetingMetadata.mockResolvedValue(validMeeting);
    mockGetTranscripts.mockResolvedValue([
      { id: 1, meetingId: 'meeting-1', text: 'Hello', timestamp: '10:00', confidence: 0.9, sequenceId: 1, storedAt: 0 },
    ]);

    const { result } = renderRecoveryHook();

    await act(async () => {
      await result.current.recoverMeeting('meeting-1');
    });

    expect(invoke).toHaveBeenCalledWith('cleanup_checkpoints', {
      meetingFolder: '/recordings/meeting-1',
    });
  });

  it('should remove recovered meeting from recoverableMeetings list', async () => {
    mockGetAllMeetings.mockResolvedValue([validMeeting]);
    mockGetMeetingMetadata.mockResolvedValue(validMeeting);
    mockGetTranscripts.mockResolvedValue([
      { id: 1, meetingId: 'meeting-1', text: 'Hello', timestamp: '10:00', confidence: 0.9, sequenceId: 1, storedAt: 0 },
    ]);

    const { result } = renderRecoveryHook();

    await act(async () => {
      await result.current.checkForRecoverableTranscripts();
    });

    expect(result.current.recoverableMeetings).toHaveLength(1);

    await act(async () => {
      await result.current.recoverMeeting('meeting-1');
    });

    expect(result.current.recoverableMeetings).toHaveLength(0);
  });

  it('should throw when meeting metadata is not found', async () => {
    mockGetMeetingMetadata.mockResolvedValue(null);

    const { result } = renderRecoveryHook();

    await expect(
      act(async () => {
        await result.current.recoverMeeting('nonexistent');
      })
    ).rejects.toThrow('Meeting metadata not found');
  });

  it('should throw when no transcripts found', async () => {
    mockGetMeetingMetadata.mockResolvedValue(validMeeting);
    mockGetTranscripts.mockResolvedValue([]);

    const { result } = renderRecoveryHook();

    await expect(
      act(async () => {
        await result.current.recoverMeeting('meeting-1');
      })
    ).rejects.toThrow('No transcripts found for this meeting');
  });

  it('should handle meeting without folderPath', async () => {
    const meetingNoFolder = { ...validMeeting, folderPath: undefined };
    mockGetMeetingMetadata.mockResolvedValue(meetingNoFolder);
    mockGetTranscripts.mockResolvedValue([
      { id: 1, meetingId: 'meeting-1', text: 'Hello', timestamp: '10:00', confidence: 0.9, sequenceId: 1, storedAt: 0 },
    ]);

    // Mock get_meeting_folder_path to throw (no backend folder)
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_meeting_folder_path') throw new Error('No folder');
      if (cmd === 'has_audio_checkpoints') return false;
      if (cmd === 'cleanup_checkpoints') return undefined;
      throw new Error(`Unexpected: ${cmd}`);
    });

    const { result } = renderRecoveryHook();

    let response: any;
    await act(async () => {
      response = await result.current.recoverMeeting('meeting-1');
    });

    expect(response.success).toBe(true);
    expect(response.audioRecoveryStatus?.status).toBe('none');
  });

  it('should handle audio recovery failure gracefully', async () => {
    mockGetMeetingMetadata.mockResolvedValue(validMeeting);
    mockGetTranscripts.mockResolvedValue([
      { id: 1, meetingId: 'meeting-1', text: 'Hello', timestamp: '10:00', confidence: 0.9, sequenceId: 1, storedAt: 0 },
    ]);

    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'has_audio_checkpoints') return true;
      if (cmd === 'recover_audio_from_checkpoints') throw new Error('Corrupt audio');
      if (cmd === 'cleanup_checkpoints') return undefined;
      throw new Error(`Unexpected: ${cmd}`);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderRecoveryHook();

    let response: any;
    await act(async () => {
      response = await result.current.recoverMeeting('meeting-1');
    });

    expect(response.success).toBe(true);
    expect(response.audioRecoveryStatus?.status).toBe('failed');
    vi.mocked(console.error).mockRestore();
  });

  it('should handle checkpoint cleanup failure gracefully (non-fatal)', async () => {
    mockGetMeetingMetadata.mockResolvedValue(validMeeting);
    mockGetTranscripts.mockResolvedValue([
      { id: 1, meetingId: 'meeting-1', text: 'Hello', timestamp: '10:00', confidence: 0.9, sequenceId: 1, storedAt: 0 },
    ]);

    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'has_audio_checkpoints') return true;
      if (cmd === 'recover_audio_from_checkpoints') return {
        status: 'success', chunk_count: 1, estimated_duration_seconds: 10, message: 'ok'
      };
      if (cmd === 'cleanup_checkpoints') throw new Error('Permission denied');
      throw new Error(`Unexpected: ${cmd}`);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderRecoveryHook();

    let response: any;
    await act(async () => {
      response = await result.current.recoverMeeting('meeting-1');
    });

    // Should still succeed despite cleanup failure
    expect(response.success).toBe(true);
    vi.mocked(console.warn).mockRestore();
  });

  // ── deleteRecoverableMeeting ──────────────────────────────────────

  it('should delete meeting from IndexedDB', async () => {
    const { result } = renderRecoveryHook();

    await act(async () => {
      await result.current.deleteRecoverableMeeting('meeting-1');
    });

    expect(mockDeleteMeeting).toHaveBeenCalledWith('meeting-1');
  });

  it('should remove deleted meeting from recoverableMeetings list', async () => {
    mockGetAllMeetings.mockResolvedValue([validMeeting]);

    const { result } = renderRecoveryHook();

    await act(async () => {
      await result.current.checkForRecoverableTranscripts();
    });

    expect(result.current.recoverableMeetings).toHaveLength(1);

    await act(async () => {
      await result.current.deleteRecoverableMeeting('meeting-1');
    });

    expect(result.current.recoverableMeetings).toHaveLength(0);
  });

  it('should throw on delete failure', async () => {
    mockDeleteMeeting.mockRejectedValue(new Error('Delete failed'));

    const { result } = renderRecoveryHook();

    await expect(
      act(async () => {
        await result.current.deleteRecoverableMeeting('meeting-1');
      })
    ).rejects.toThrow('Delete failed');
  });

  // ── isRecovering reset on failure ─────────────────────────────────

  it('should reset isRecovering on recovery failure', async () => {
    mockGetMeetingMetadata.mockRejectedValue(new Error('DB error'));

    const { result } = renderRecoveryHook();

    try {
      await act(async () => {
        await result.current.recoverMeeting('meeting-1');
      });
    } catch {
      // Expected
    }

    expect(result.current.isRecovering).toBe(false);
  });
});
