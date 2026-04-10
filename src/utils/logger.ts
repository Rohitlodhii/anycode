export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Anycode logger.
 *
 * Requirement: Codex request spam must not show in terminal.
 * We keep warn/error for real failures, but silence debug/info.
 */
export const logger = {
  debug: (_message: string, _meta?: unknown) => {},
  info: (_message: string, _meta?: unknown) => {},
  warn: (message: string, meta?: unknown) => {
    if (typeof meta === "undefined") {
      console.warn(message);
      return;
    }
    console.warn(message, meta);
  },
  error: (message: string, meta?: unknown) => {
    if (typeof meta === "undefined") {
      console.error(message);
      return;
    }
    console.error(message, meta);
  },
} as const;

