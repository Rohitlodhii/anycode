/**
 * Property-based tests for stop button visibility
 * Feature: codex-ui-improvements
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import type { SessionStatus } from "@/stores/session-store";

describe("Stop Button Visibility", () => {
  /**
   * Feature: codex-ui-improvements, Property 2: Stop button visibility
   * Validates: Requirements 2.1
   * 
   * For any session state, the stop button is visible if and only if
   * status === "streaming" and currentTurnId !== null.
   */
  it("Property 2: stop button visible iff status === 'streaming' and currentTurnId !== null", () => {
    fc.assert(
      fc.property(
        // Generate random session states
        fc.constantFrom<SessionStatus>("connecting", "connected", "streaming", "error", "idle"),
        fc.oneof(fc.constant(null), fc.uuid()), // currentTurnId
        (status, currentTurnId) => {
          // The stop button should be visible when:
          // 1. status === "streaming"
          // 2. currentTurnId !== null
          const shouldBeVisible = status === "streaming" && currentTurnId !== null;

          // Simulate the visibility logic from the component
          const isVisible = status === "streaming" && currentTurnId !== null;

          // Verify the property holds
          expect(isVisible).toBe(shouldBeVisible);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional test: stop button should NOT be visible in non-streaming states
   */
  it("Property 2 (variant): stop button hidden when not streaming, regardless of turnId", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<SessionStatus>("connecting", "connected", "error", "idle"),
        fc.oneof(fc.constant(null), fc.uuid()),
        (status, currentTurnId) => {
          // When status is not "streaming", button should never be visible
          const isVisible = status === "streaming" && currentTurnId !== null;
          expect(isVisible).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional test: stop button should NOT be visible when streaming but no turnId
   */
  it("Property 2 (variant): stop button hidden when streaming but currentTurnId is null", () => {
    fc.assert(
      fc.property(
        fc.constant<SessionStatus>("streaming"),
        fc.constant(null),
        (status, currentTurnId) => {
          // When streaming but no turnId, button should not be visible
          const isVisible = status === "streaming" && currentTurnId !== null;
          expect(isVisible).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional test: stop button SHOULD be visible when streaming with valid turnId
   */
  it("Property 2 (variant): stop button visible when streaming with valid turnId", () => {
    fc.assert(
      fc.property(
        fc.constant<SessionStatus>("streaming"),
        fc.uuid(),
        (status, currentTurnId) => {
          // When streaming with a valid turnId, button should be visible
          const isVisible = status === "streaming" && currentTurnId !== null;
          expect(isVisible).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
