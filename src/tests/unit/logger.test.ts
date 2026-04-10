/**
 * Property-based tests for logger module
 * Feature: codex-ui-improvements
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

describe("Logger - Log Suppression", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.resetModules();
  });

  /**
   * Feature: codex-ui-improvements, Property 1: Log suppression in production
   * Validates: Requirements 1.1, 1.2, 1.3
   * 
   * For any RPC call or event in production mode with DEBUG_CODEX !== 'true',
   * no console log output should be generated.
   */
  it("Property 1: should suppress RPC and event logs in production when DEBUG_CODEX is not true", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }), // RPC method
        fc.oneof(fc.constant(undefined), fc.object()), // RPC params
        fc.string({ minLength: 1, maxLength: 50 }), // Event name
        fc.oneof(fc.constant(undefined), fc.object()), // Event data
        async (rpcMethod, rpcParams, eventName, eventData) => {
          // Set production environment without DEBUG_CODEX
          process.env.NODE_ENV = "production";
          delete process.env.DEBUG_CODEX;

          // Clear previous calls
          consoleLogSpy.mockClear();
          consoleWarnSpy.mockClear();
          consoleErrorSpy.mockClear();

          // Dynamically import to get fresh module with new env vars
          const { logCodexRpc, logCodexEvent } = await import("@/main/logger");

          // Call logging functions
          logCodexRpc(rpcMethod, rpcParams);
          logCodexEvent(eventName, eventData);

          // Verify no console.log calls were made
          expect(consoleLogSpy).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 1 (variant): should log RPC and events when DEBUG_CODEX is true", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }), // RPC method
        fc.oneof(fc.constant(undefined), fc.object()), // RPC params
        fc.string({ minLength: 1, maxLength: 50 }), // Event name
        fc.oneof(fc.constant(undefined), fc.object()), // Event data
        async (rpcMethod, rpcParams, eventName, eventData) => {
          // Set DEBUG_CODEX to true
          process.env.DEBUG_CODEX = "true";

          // Clear previous calls
          consoleLogSpy.mockClear();
          consoleWarnSpy.mockClear();
          consoleErrorSpy.mockClear();

          // Dynamically import to get fresh module with new env vars
          const { logCodexRpc, logCodexEvent } = await import("@/main/logger");

          // Call logging functions
          logCodexRpc(rpcMethod, rpcParams);
          logCodexEvent(eventName, eventData);

          // Verify console.log was called for both RPC and event
          expect(consoleLogSpy).toHaveBeenCalledTimes(2);
          expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining(rpcMethod),
            rpcParams
          );
          expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining(eventName),
            eventData
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirement 1.4
   * Errors and warnings should always log regardless of environment
   */
  it("should always log errors and warnings regardless of DEBUG_CODEX setting", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }), // Error message
        fc.oneof(fc.constant(undefined), fc.object()), // Error meta
        fc.string({ minLength: 1, maxLength: 100 }), // Warning message
        fc.oneof(fc.constant(undefined), fc.object()), // Warning meta
        async (errorMsg, errorMeta, warnMsg, warnMeta) => {
          // Set production environment without DEBUG_CODEX
          process.env.NODE_ENV = "production";
          delete process.env.DEBUG_CODEX;

          // Clear previous calls
          consoleLogSpy.mockClear();
          consoleWarnSpy.mockClear();
          consoleErrorSpy.mockClear();

          // Dynamically import to get fresh module with new env vars
          const { logger } = await import("@/main/logger");

          // Call error and warn
          logger.error(errorMsg, errorMeta);
          logger.warn(warnMsg, warnMeta);

          // Verify error and warn were called
          expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
          expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
          
          // Check that the message is included (logger adds [ERROR] and [WARN] prefixes)
          const errorCall = consoleErrorSpy.mock.calls[0];
          const warnCall = consoleWarnSpy.mock.calls[0];
          
          expect(errorCall[0]).toContain(errorMsg);
          expect(warnCall[0]).toContain(warnMsg);
          
          // If meta is provided, it should be the second argument
          if (errorMeta !== undefined) {
            expect(errorCall[1]).toEqual(errorMeta);
          }
          if (warnMeta !== undefined) {
            expect(warnCall[1]).toEqual(warnMeta);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
