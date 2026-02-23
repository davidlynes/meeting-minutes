/**
 * Production-safe logger.
 *
 * In development (`next dev`), all levels pass through to the console.
 * In production (`next build`), log/debug are silenced; warn/error remain.
 *
 * Usage:  import { logger } from '@/lib/logger';
 *         logger.log('hello');          // silenced in prod
 *         logger.warn('heads up');      // always visible
 *         logger.error('broken', err);  // always visible
 */

const isDev = process.env.NODE_ENV === 'development';

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = (..._args: unknown[]) => {};

export const logger = {
  log: isDev ? console.log.bind(console) : noop,
  debug: isDev ? console.debug.bind(console) : noop,
  info: isDev ? console.info.bind(console) : noop,
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
