/**
 * Copy text to clipboard with fallback for Tauri webview.
 *
 * `navigator.clipboard.writeText()` can throw NotAllowedError in Tauri's
 * webview context. This helper falls back to the legacy `execCommand('copy')`
 * approach via a temporary textarea element.
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback: create a temporary textarea, select its content, and copy
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
}
