/**
 * Copy text to clipboard with triple-fallback for Tauri webview.
 *
 * 1. Tauri clipboard-manager plugin (native OS access)
 * 2. navigator.clipboard.writeText (browser API)
 * 3. execCommand('copy') via temporary textarea (legacy)
 */
export async function copyToClipboard(text: string): Promise<void> {
  // Try Tauri plugin first
  try {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeText(text);
    return;
  } catch (e) {
    console.warn('Tauri clipboard plugin failed, trying browser API:', e);
  }

  // Try browser clipboard API
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (e) {
    console.warn('navigator.clipboard failed, trying execCommand:', e);
  }

  // Legacy fallback
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}
