/**
 * Renderer process logger with environment-based log level control.
 * 
 * In production mode, only warnings and errors are logged.
 * In development mode, debug logs are only shown if DEBUG_CODEX === 'true'.
 * 
 * This prevents verbose event logs from cluttering the console.
 */

const DEBUG_CODEX = import.meta.env.VITE_DEBUG_CODEX === "true";
const IS_PRODUCTION = import.meta.env.MODE === "production";

/**
 * Log a Codex event notification.
 * Only logs if DEBUG_CODEX is explicitly enabled.
 */
export function logCodexEvent(event: string, data?: unknown): void {
  if (DEBUG_CODEX) {
    console.log(`[Codex Event] ${event}`, data);
  }
}

/**
 * General-purpose logger with environment-aware log levels.
 */
export const logger = {
  debug: (message: string, meta?: unknown) => {
    if (!IS_PRODUCTION && DEBUG_CODEX) {
      if (typeof meta === "undefined") {
        console.log(`[DEBUG] ${message}`);
      } else {
        console.log(`[DEBUG] ${message}`, meta);
      }
    }
  },
  
  info: (message: string, meta?: unknown) => {
    if (!IS_PRODUCTION) {
      if (typeof meta === "undefined") {
        console.info(`[INFO] ${message}`);
      } else {
        console.info(`[INFO] ${message}`, meta);
      }
    }
  },
  
  warn: (message: string, meta?: unknown) => {
    if (typeof meta === "undefined") {
      console.warn(`[WARN] ${message}`);
    } else {
      console.warn(`[WARN] ${message}`, meta);
    }
  },
  
  error: (message: string, meta?: unknown) => {
    if (typeof meta === "undefined") {
      console.error(`[ERROR] ${message}`);
    } else {
      console.error(`[ERROR] ${message}`, meta);
    }
  },
} as const;
