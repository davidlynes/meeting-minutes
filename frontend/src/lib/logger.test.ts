import { describe, it, expect, vi } from 'vitest';

// We need to test the logger under different NODE_ENV values.
// Since the module caches isDev at import time, we need dynamic imports.

describe('logger', () => {
  describe('in development mode (default test env)', () => {
    it('exports log, debug, info, warn, error functions', async () => {
      const { logger } = await import('./logger');
      expect(typeof logger.log).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('warn passes through to console.warn', async () => {
      // Spy must be installed BEFORE module import because .bind() captures
      // the function reference at module evaluation time.
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.resetModules();
      const { logger } = await import('./logger');

      logger.warn('test warning');

      expect(spy).toHaveBeenCalledWith('test warning');
      spy.mockRestore();
    });

    it('error passes through to console.error', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.resetModules();
      const { logger } = await import('./logger');

      logger.error('test error', new Error('boom'));

      expect(spy).toHaveBeenCalledWith('test error', expect.any(Error));
      spy.mockRestore();
    });

    it('log is callable without errors', async () => {
      const { logger } = await import('./logger');
      // Should not throw
      expect(() => logger.log('test')).not.toThrow();
    });

    it('debug is callable without errors', async () => {
      const { logger } = await import('./logger');
      expect(() => logger.debug('debug msg')).not.toThrow();
    });

    it('info is callable without errors', async () => {
      const { logger } = await import('./logger');
      expect(() => logger.info('info msg')).not.toThrow();
    });
  });
});
