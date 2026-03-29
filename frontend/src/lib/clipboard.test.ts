import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore navigator.clipboard to a working mock so previous test overrides don't leak
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Restore original clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  it('uses Tauri clipboard plugin by default', async () => {
    // The setup.ts already mocks @tauri-apps/plugin-clipboard-manager
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');

    await copyToClipboard('test text');

    expect(writeText).toHaveBeenCalledWith('test text');
  });

  it('falls back to navigator.clipboard if Tauri fails', async () => {
    // Make Tauri plugin fail
    const clipboardModule = await import('@tauri-apps/plugin-clipboard-manager');
    vi.mocked(clipboardModule.writeText).mockRejectedValueOnce(new Error('Tauri not available'));

    // Set up navigator.clipboard mock
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    await copyToClipboard('fallback text');

    expect(writeTextMock).toHaveBeenCalledWith('fallback text');
  });

  it('falls back to execCommand if both Tauri and navigator fail', async () => {
    // Make Tauri plugin fail
    const clipboardModule = await import('@tauri-apps/plugin-clipboard-manager');
    vi.mocked(clipboardModule.writeText).mockRejectedValueOnce(new Error('Tauri not available'));

    // Make navigator.clipboard fail
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('Not allowed')) },
      writable: true,
      configurable: true,
    });

    // Define document.execCommand since jsdom doesn't provide it
    document.execCommand = vi.fn().mockReturnValue(true);

    // Mock document methods for legacy fallback
    const mockTextarea = {
      value: '',
      style: { position: '', left: '', top: '' },
      focus: vi.fn(),
      select: vi.fn(),
    } as unknown as HTMLTextAreaElement;

    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockTextarea);
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockTextarea);
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockTextarea);
    const execCommandSpy = vi.spyOn(document, 'execCommand');

    await copyToClipboard('legacy text');

    expect(createElementSpy).toHaveBeenCalledWith('textarea');
    expect(mockTextarea.value).toBe('legacy text');
    expect(mockTextarea.focus).toHaveBeenCalled();
    expect(mockTextarea.select).toHaveBeenCalled();
    expect(execCommandSpy).toHaveBeenCalledWith('copy');
    expect(removeChildSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    execCommandSpy.mockRestore();
    delete (document as any).execCommand;
  });

  it('copies empty string', async () => {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');

    await copyToClipboard('');

    expect(writeText).toHaveBeenCalledWith('');
  });

  it('copies long text', async () => {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
    const longText = 'a'.repeat(10000);

    await copyToClipboard(longText);

    expect(writeText).toHaveBeenCalledWith(longText);
  });
});
