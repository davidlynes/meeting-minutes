import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  BuiltInAIAPI,
  isModelAvailable,
  isModelDownloading,
  isModelNotDownloaded,
  isModelCorrupted,
  isModelError,
  getStatusColor,
  getStatusLabel,
  BuiltInModelStatus,
} from './builtin-ai';

describe('BuiltInAIAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listModels calls builtin_ai_list_models', async () => {
    const models = [{ name: 'gemma3:1b', display_name: 'Gemma 3 1B' }];
    vi.mocked(invoke).mockResolvedValueOnce(models);
    const result = await BuiltInAIAPI.listModels();
    expect(invoke).toHaveBeenCalledWith('builtin_ai_list_models');
    expect(result).toEqual(models);
  });

  it('getModelInfo calls builtin_ai_get_model_info', async () => {
    const info = { name: 'gemma3:1b', status: { type: 'available' } };
    vi.mocked(invoke).mockResolvedValueOnce(info);
    const result = await BuiltInAIAPI.getModelInfo('gemma3:1b');
    expect(invoke).toHaveBeenCalledWith('builtin_ai_get_model_info', { modelName: 'gemma3:1b' });
    expect(result).toEqual(info);
  });

  it('isModelReady calls builtin_ai_is_model_ready', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true);
    const result = await BuiltInAIAPI.isModelReady('gemma3:1b', true);
    expect(invoke).toHaveBeenCalledWith('builtin_ai_is_model_ready', {
      modelName: 'gemma3:1b',
      refresh: true,
    });
    expect(result).toBe(true);
  });

  it('isModelReady defaults refresh to false', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(false);
    await BuiltInAIAPI.isModelReady('gemma3:1b');
    expect(invoke).toHaveBeenCalledWith('builtin_ai_is_model_ready', {
      modelName: 'gemma3:1b',
      refresh: false,
    });
  });

  it('getAvailableModel calls builtin_ai_get_available_summary_model', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('gemma3:1b');
    const result = await BuiltInAIAPI.getAvailableModel();
    expect(result).toBe('gemma3:1b');
  });

  it('downloadModel calls builtin_ai_download_model', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await BuiltInAIAPI.downloadModel('gemma3:4b');
    expect(invoke).toHaveBeenCalledWith('builtin_ai_download_model', { modelName: 'gemma3:4b' });
  });

  it('cancelDownload calls builtin_ai_cancel_download', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await BuiltInAIAPI.cancelDownload('gemma3:1b');
    expect(invoke).toHaveBeenCalledWith('builtin_ai_cancel_download', { modelName: 'gemma3:1b' });
  });

  it('deleteModel calls builtin_ai_delete_model', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await BuiltInAIAPI.deleteModel('gemma3:1b');
    expect(invoke).toHaveBeenCalledWith('builtin_ai_delete_model', { modelName: 'gemma3:1b' });
  });

  it('getModelsDirectory calls builtin_ai_get_models_directory', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('/path/to/models');
    const result = await BuiltInAIAPI.getModelsDirectory();
    expect(result).toBe('/path/to/models');
  });
});

describe('status helper functions', () => {
  describe('isModelAvailable', () => {
    it('returns true for available status', () => {
      expect(isModelAvailable({ type: 'available' })).toBe(true);
    });
    it('returns false for other statuses', () => {
      expect(isModelAvailable({ type: 'not_downloaded' })).toBe(false);
      expect(isModelAvailable({ type: 'downloading', progress: 50 })).toBe(false);
    });
  });

  describe('isModelDownloading', () => {
    it('returns true for downloading status', () => {
      expect(isModelDownloading({ type: 'downloading', progress: 75 })).toBe(true);
    });
    it('returns false for other statuses', () => {
      expect(isModelDownloading({ type: 'available' })).toBe(false);
    });
  });

  describe('isModelNotDownloaded', () => {
    it('returns true for not_downloaded status', () => {
      expect(isModelNotDownloaded({ type: 'not_downloaded' })).toBe(true);
    });
    it('returns false for available', () => {
      expect(isModelNotDownloaded({ type: 'available' })).toBe(false);
    });
  });

  describe('isModelCorrupted', () => {
    it('returns true for corrupted status', () => {
      expect(isModelCorrupted({ type: 'corrupted', file_size: 100, expected_min_size: 500 })).toBe(true);
    });
    it('returns false for available', () => {
      expect(isModelCorrupted({ type: 'available' })).toBe(false);
    });
  });

  describe('isModelError', () => {
    it('returns true for error status', () => {
      expect(isModelError({ type: 'error', Error: 'something failed' })).toBe(true);
    });
    it('returns false for available', () => {
      expect(isModelError({ type: 'available' })).toBe(false);
    });
  });
});

describe('getStatusColor', () => {
  it('returns green for available', () => {
    expect(getStatusColor({ type: 'available' })).toBe('green');
  });
  it('returns blue for downloading', () => {
    expect(getStatusColor({ type: 'downloading', progress: 50 })).toBe('blue');
  });
  it('returns gray for not_downloaded', () => {
    expect(getStatusColor({ type: 'not_downloaded' })).toBe('gray');
  });
  it('returns red for corrupted', () => {
    expect(getStatusColor({ type: 'corrupted', file_size: 10, expected_min_size: 100 })).toBe('red');
  });
  it('returns red for error', () => {
    expect(getStatusColor({ type: 'error', Error: 'fail' })).toBe('red');
  });
});

describe('getStatusLabel', () => {
  it('returns "Available" for available', () => {
    expect(getStatusLabel({ type: 'available' })).toBe('Available');
  });
  it('returns downloading percentage', () => {
    expect(getStatusLabel({ type: 'downloading', progress: 42 })).toBe('Downloading 42%');
  });
  it('returns "Not Downloaded" for not_downloaded', () => {
    expect(getStatusLabel({ type: 'not_downloaded' })).toBe('Not Downloaded');
  });
  it('returns "Corrupted" for corrupted', () => {
    expect(getStatusLabel({ type: 'corrupted', file_size: 10, expected_min_size: 100 })).toBe('Corrupted');
  });
  it('returns "Error" for error', () => {
    expect(getStatusLabel({ type: 'error', Error: 'fail' })).toBe('Error');
  });
});
