import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  WhisperAPI,
  getModelIcon,
  getStatusColor,
  formatFileSize,
  getModelType,
  getModelBaseName,
  isQuantizedModel,
  getModelPerformanceBadge,
  getModelTagline,
  groupModelsByBase,
  getRecommendedModel,
  MODEL_CONFIGS,
  ModelInfo,
} from './whisper';

describe('WhisperAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('init calls whisper_init', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await WhisperAPI.init();
    expect(invoke).toHaveBeenCalledWith('whisper_init');
  });

  it('getAvailableModels calls whisper_get_available_models', async () => {
    const models = [{ name: 'tiny', path: '/path', size_mb: 39 }];
    vi.mocked(invoke).mockResolvedValueOnce(models);
    const result = await WhisperAPI.getAvailableModels();
    expect(invoke).toHaveBeenCalledWith('whisper_get_available_models');
    expect(result).toEqual(models);
  });

  it('loadModel calls whisper_load_model with name', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await WhisperAPI.loadModel('small');
    expect(invoke).toHaveBeenCalledWith('whisper_load_model', { modelName: 'small' });
  });

  it('getCurrentModel calls whisper_get_current_model', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('medium');
    const result = await WhisperAPI.getCurrentModel();
    expect(result).toBe('medium');
  });

  it('isModelLoaded calls whisper_is_model_loaded', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true);
    const result = await WhisperAPI.isModelLoaded();
    expect(result).toBe(true);
  });

  it('transcribeAudio calls whisper_transcribe_audio', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('Hello world');
    const result = await WhisperAPI.transcribeAudio([0.1, 0.2, 0.3]);
    expect(invoke).toHaveBeenCalledWith('whisper_transcribe_audio', {
      audioData: [0.1, 0.2, 0.3],
    });
    expect(result).toBe('Hello world');
  });

  it('downloadModel calls whisper_download_model', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await WhisperAPI.downloadModel('large-v3');
    expect(invoke).toHaveBeenCalledWith('whisper_download_model', { modelName: 'large-v3' });
  });

  it('cancelDownload calls whisper_cancel_download', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await WhisperAPI.cancelDownload('small');
    expect(invoke).toHaveBeenCalledWith('whisper_cancel_download', { modelName: 'small' });
  });

  it('hasAvailableModels calls whisper_has_available_models', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true);
    const result = await WhisperAPI.hasAvailableModels();
    expect(result).toBe(true);
  });

  it('validateModelReady calls whisper_validate_model_ready', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('ready');
    const result = await WhisperAPI.validateModelReady();
    expect(result).toBe('ready');
  });

  it('openModelsFolder calls open_models_folder', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await WhisperAPI.openModelsFolder();
    expect(invoke).toHaveBeenCalledWith('open_models_folder');
  });
});

describe('getModelIcon', () => {
  it('returns fire for High accuracy', () => {
    expect(getModelIcon('High')).toBe('🔥');
  });
  it('returns lightning for Good', () => {
    expect(getModelIcon('Good')).toBe('⚡');
  });
  it('returns rocket for Decent', () => {
    expect(getModelIcon('Decent')).toBe('🚀');
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
    expect(getStatusColor({ Downloading: 50 })).toBe('blue');
  });
  it('returns red for Error', () => {
    expect(getStatusColor({ Error: 'bad' })).toBe('red');
  });
});

describe('formatFileSize', () => {
  it('formats MB for small sizes', () => {
    expect(formatFileSize(500)).toBe('500MB');
  });
  it('formats GB for large sizes', () => {
    expect(formatFileSize(1500)).toBe('1.5GB');
  });
  it('formats exactly 1000MB as 1.0GB', () => {
    expect(formatFileSize(1000)).toBe('1.0GB');
  });
});

describe('getModelType', () => {
  it('returns f16 for standard models', () => {
    expect(getModelType('medium')).toBe('f16');
  });
  it('returns q5_1 for q5_1 quantized', () => {
    expect(getModelType('small-q5_1')).toBe('q5_1');
  });
  it('returns q5_0 for q5_0 quantized', () => {
    expect(getModelType('large-v3-q5_0')).toBe('q5_0');
  });
});

describe('getModelBaseName', () => {
  it('returns base name for quantized model', () => {
    expect(getModelBaseName('small-q5_1')).toBe('small');
  });
  it('returns name unchanged for f16 model', () => {
    expect(getModelBaseName('medium')).toBe('medium');
  });
  it('handles large-v3-turbo-q5_0', () => {
    expect(getModelBaseName('large-v3-turbo-q5_0')).toBe('large-v3-turbo');
  });
});

describe('isQuantizedModel', () => {
  it('returns true for quantized models', () => {
    expect(isQuantizedModel('small-q5_1')).toBe(true);
  });
  it('returns false for f16 models', () => {
    expect(isQuantizedModel('medium')).toBe(false);
  });
});

describe('getModelPerformanceBadge', () => {
  it('returns Full Precision for f16', () => {
    expect(getModelPerformanceBadge('medium').label).toBe('Full Precision');
  });
  it('returns Balanced+ for q5_1', () => {
    expect(getModelPerformanceBadge('small-q5_1').label).toBe('Balanced+');
  });
  it('returns Balanced for q5_0', () => {
    expect(getModelPerformanceBadge('large-v3-q5_0').label).toBe('Balanced');
  });
});

describe('getModelTagline', () => {
  it('includes speed and feature for tiny', () => {
    const tagline = getModelTagline('tiny', 'Very Fast', 'Decent');
    expect(tagline).toContain('Real time');
    expect(tagline).toContain('Fastest option');
  });

  it('includes optimised note for quantized q5_0', () => {
    const tagline = getModelTagline('medium-q5_0', 'Medium', 'High');
    expect(tagline).toContain('optimised');
  });
});

describe('groupModelsByBase', () => {
  it('groups models by base name', () => {
    const models: ModelInfo[] = [
      { name: 'small', path: '', size_mb: 466, accuracy: 'Good', speed: 'Medium', status: 'Available' },
      { name: 'small-q5_1', path: '', size_mb: 181, accuracy: 'Good', speed: 'Fast', status: 'Available' },
      { name: 'medium', path: '', size_mb: 1463, accuracy: 'High', speed: 'Slow', status: 'Missing' },
    ];

    const grouped = groupModelsByBase(models);

    expect(Object.keys(grouped)).toContain('small');
    expect(Object.keys(grouped)).toContain('medium');
    expect(grouped['small']).toHaveLength(2);
    expect(grouped['medium']).toHaveLength(1);
  });

  it('sorts f16 before quantized within group', () => {
    const models: ModelInfo[] = [
      { name: 'small-q5_1', path: '', size_mb: 181, accuracy: 'Good', speed: 'Fast', status: 'Available' },
      { name: 'small', path: '', size_mb: 466, accuracy: 'Good', speed: 'Medium', status: 'Available' },
    ];

    const grouped = groupModelsByBase(models);
    expect(grouped['small'][0].name).toBe('small');
    expect(grouped['small'][1].name).toBe('small-q5_1');
  });
});

describe('getRecommendedModel', () => {
  it('returns medium-q5_0 with no system specs', () => {
    expect(getRecommendedModel()).toBe('medium-q5_0');
  });

  it('returns large-v3 for high-end system', () => {
    expect(getRecommendedModel({ ram: 16000, cores: 16 })).toBe('large-v3');
  });

  it('returns medium for mid-range system', () => {
    expect(getRecommendedModel({ ram: 4000, cores: 4 })).toBe('medium');
  });

  it('returns small for low-spec system', () => {
    expect(getRecommendedModel({ ram: 2000, cores: 2 })).toBe('small');
  });
});

describe('MODEL_CONFIGS', () => {
  it('has entries for standard models', () => {
    expect(MODEL_CONFIGS['tiny']).toBeDefined();
    expect(MODEL_CONFIGS['small']).toBeDefined();
    expect(MODEL_CONFIGS['medium']).toBeDefined();
    expect(MODEL_CONFIGS['large-v3']).toBeDefined();
  });

  it('has entries for quantized models', () => {
    expect(MODEL_CONFIGS['small-q5_1']).toBeDefined();
    expect(MODEL_CONFIGS['medium-q5_0']).toBeDefined();
  });
});
