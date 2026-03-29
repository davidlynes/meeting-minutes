import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  ParakeetAPI,
  getModelIcon,
  getModelDisplayName,
  getModelDisplayInfo,
  getStatusColor,
  formatFileSize,
  isQuantizedModel,
  getModelPerformanceBadge,
  getRecommendedModel,
  MODEL_DISPLAY_CONFIG,
  PARAKEET_MODEL_CONFIGS,
} from './parakeet';

describe('ParakeetAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('init calls parakeet_init', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await ParakeetAPI.init();
    expect(invoke).toHaveBeenCalledWith('parakeet_init');
  });

  it('getAvailableModels calls parakeet_get_available_models', async () => {
    const models = [{ name: 'parakeet-tdt-0.6b-v3-int8' }];
    vi.mocked(invoke).mockResolvedValueOnce(models);
    const result = await ParakeetAPI.getAvailableModels();
    expect(invoke).toHaveBeenCalledWith('parakeet_get_available_models');
    expect(result).toEqual(models);
  });

  it('loadModel calls parakeet_load_model', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await ParakeetAPI.loadModel('parakeet-tdt-0.6b-v3-int8');
    expect(invoke).toHaveBeenCalledWith('parakeet_load_model', {
      modelName: 'parakeet-tdt-0.6b-v3-int8',
    });
  });

  it('getCurrentModel calls parakeet_get_current_model', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('parakeet-tdt-0.6b-v3-int8');
    const result = await ParakeetAPI.getCurrentModel();
    expect(result).toBe('parakeet-tdt-0.6b-v3-int8');
  });

  it('isModelLoaded calls parakeet_is_model_loaded', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(false);
    const result = await ParakeetAPI.isModelLoaded();
    expect(result).toBe(false);
  });

  it('transcribeAudio calls parakeet_transcribe_audio', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('Transcription result');
    const result = await ParakeetAPI.transcribeAudio([0.5]);
    expect(invoke).toHaveBeenCalledWith('parakeet_transcribe_audio', {
      audioData: [0.5],
    });
    expect(result).toBe('Transcription result');
  });

  it('downloadModel calls parakeet_download_model', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await ParakeetAPI.downloadModel('parakeet-tdt-0.6b-v3-int8');
    expect(invoke).toHaveBeenCalledWith('parakeet_download_model', {
      modelName: 'parakeet-tdt-0.6b-v3-int8',
    });
  });

  it('cancelDownload calls parakeet_cancel_download', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await ParakeetAPI.cancelDownload('parakeet-tdt-0.6b-v3-int8');
    expect(invoke).toHaveBeenCalledWith('parakeet_cancel_download', {
      modelName: 'parakeet-tdt-0.6b-v3-int8',
    });
  });

  it('hasAvailableModels calls parakeet_has_available_models', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true);
    const result = await ParakeetAPI.hasAvailableModels();
    expect(result).toBe(true);
  });

  it('openModelsFolder calls open_parakeet_models_folder', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await ParakeetAPI.openModelsFolder();
    expect(invoke).toHaveBeenCalledWith('open_parakeet_models_folder');
  });
});

describe('getModelIcon', () => {
  it('returns fire for High', () => {
    expect(getModelIcon('High')).toBe('🔥');
  });
  it('returns lightning for Good', () => {
    expect(getModelIcon('Good')).toBe('⚡');
  });
  it('returns rocket for Decent', () => {
    expect(getModelIcon('Decent')).toBe('🚀');
  });
});

describe('getModelDisplayName', () => {
  it('returns friendly name for known model', () => {
    expect(getModelDisplayName('parakeet-tdt-0.6b-v3-int8')).toBe('Lightning');
  });
  it('returns raw name for unknown model', () => {
    expect(getModelDisplayName('unknown-model')).toBe('unknown-model');
  });
});

describe('getModelDisplayInfo', () => {
  it('returns display info for known model', () => {
    const info = getModelDisplayInfo('parakeet-tdt-0.6b-v3-int8');
    expect(info).not.toBeNull();
    expect(info!.recommended).toBe(true);
    expect(info!.tier).toBe('fastest');
  });
  it('returns null for unknown model', () => {
    expect(getModelDisplayInfo('unknown')).toBeNull();
  });
});

describe('getStatusColor', () => {
  it('returns green for Available', () => {
    expect(getStatusColor('Available')).toBe('green');
  });
  it('returns gray for Missing', () => {
    expect(getStatusColor('Missing')).toBe('gray');
  });
  it('returns blue for Downloading', () => {
    expect(getStatusColor({ Downloading: 25 })).toBe('blue');
  });
  it('returns red for Error', () => {
    expect(getStatusColor({ Error: 'error' })).toBe('red');
  });
});

describe('formatFileSize', () => {
  it('formats MB', () => {
    expect(formatFileSize(670)).toBe('670MB');
  });
  it('formats GB', () => {
    expect(formatFileSize(2554)).toBe('2.6GB');
  });
});

describe('isQuantizedModel', () => {
  it('returns true for int8 models', () => {
    expect(isQuantizedModel('parakeet-tdt-0.6b-v3-int8')).toBe(true);
  });
  it('returns false for fp32 models', () => {
    expect(isQuantizedModel('parakeet-tdt-0.6b-v3-fp32')).toBe(false);
  });
});

describe('getModelPerformanceBadge', () => {
  it('returns Full Precision for FP32', () => {
    expect(getModelPerformanceBadge('FP32')).toEqual({ label: 'Full Precision', color: 'blue' });
  });
  it('returns Int8 Quantized for Int8', () => {
    expect(getModelPerformanceBadge('Int8')).toEqual({ label: 'Int8 Quantized', color: 'green' });
  });
});

describe('getRecommendedModel', () => {
  it('returns int8 model by default', () => {
    expect(getRecommendedModel()).toBe('parakeet-tdt-0.6b-v3-int8');
  });
  it('returns int8 model even with system specs', () => {
    expect(getRecommendedModel({ ram: 32000, cores: 16 })).toBe('parakeet-tdt-0.6b-v3-int8');
  });
});

describe('MODEL_DISPLAY_CONFIG', () => {
  it('has entry for v3-int8', () => {
    expect(MODEL_DISPLAY_CONFIG['parakeet-tdt-0.6b-v3-int8']).toBeDefined();
  });
  it('has entry for v3-fp32', () => {
    expect(MODEL_DISPLAY_CONFIG['parakeet-tdt-0.6b-v3-fp32']).toBeDefined();
  });
});

describe('PARAKEET_MODEL_CONFIGS', () => {
  it('has size info for v3-int8', () => {
    expect(PARAKEET_MODEL_CONFIGS['parakeet-tdt-0.6b-v3-int8']?.size_mb).toBe(670);
  });
  it('has quantization info', () => {
    expect(PARAKEET_MODEL_CONFIGS['parakeet-tdt-0.6b-v3-int8']?.quantization).toBe('Int8');
  });
});
