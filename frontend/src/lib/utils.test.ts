import { describe, it, expect } from 'vitest';
import { cn, isOllamaNotInstalledError } from './utils';

describe('cn (class name utility)', () => {
  it('merges simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('handles undefined and null inputs', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end');
  });

  it('merges tailwind conflicting classes (last wins)', () => {
    const result = cn('p-4', 'p-2');
    expect(result).toBe('p-2');
  });

  it('handles empty input', () => {
    expect(cn()).toBe('');
  });

  it('handles array of classes', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });
});

describe('isOllamaNotInstalledError', () => {
  it('returns false for empty string', () => {
    expect(isOllamaNotInstalledError('')).toBe(false);
  });

  it('returns false for null/undefined-like empty input', () => {
    expect(isOllamaNotInstalledError('')).toBe(false);
  });

  it('detects "cannot connect" errors', () => {
    expect(isOllamaNotInstalledError('Cannot connect to Ollama server')).toBe(true);
  });

  it('detects "connection refused" errors', () => {
    expect(isOllamaNotInstalledError('Error: Connection Refused')).toBe(true);
  });

  it('detects "cli not found" errors', () => {
    expect(isOllamaNotInstalledError('Ollama CLI not found')).toBe(true);
  });

  it('detects "not in path" errors', () => {
    expect(isOllamaNotInstalledError('ollama not in PATH')).toBe(true);
  });

  it('detects "econnrefused" errors', () => {
    expect(isOllamaNotInstalledError('ECONNREFUSED')).toBe(true);
  });

  it('detects "please check if the server is running" errors', () => {
    expect(isOllamaNotInstalledError('Please check if the server is running')).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isOllamaNotInstalledError('Model not found: llama2')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isOllamaNotInstalledError('CANNOT CONNECT')).toBe(true);
  });
});
