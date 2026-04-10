/**
 * Main process logger with environment-based log level control.
 * 
 * In production mode (NODE_ENV === 'production'), only warnings and errors are logged.
 * In development mode, debug logs are only shown if DEBUG_CODEX === 'true'.
 * 
 * This prevents verbose RPC and event logs from cluttering the terminal.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL = process.env.NODE_ENV === "production" ? "warn" : "debug";
const DEBUG_CODEX = process.env.DEBUG_CODEX === "true";

/**
 * Log a Codex RPC call (request or notification).
 * Only logs if DEBUG_CODEX is explicitly enabled.
 */
export function logCodexRpc(method: string, params?: unknown): void {
  if (DEBUG_CODEX) {
    console.log(`[Codex RPC] ${method}`, params);
  }
}

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
    if (LOG_LEVEL === "debug" && DEBUG_CODEX) {
      if (typeof meta === "undefined") {
        console.log(`[DEBUG] ${message}`);
      } else {
        console.log(`[DEBUG] ${message}`, meta);
      }
    }
  },
  
  info: (message: string, meta?: unknown) => {
    if (LOG_LEVEL === "debug") {
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
