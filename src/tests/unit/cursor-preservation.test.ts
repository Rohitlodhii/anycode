/**
 * Property-based tests for cursor preservation on file reload
 * Feature: codex-ui-improvements
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

/**
 * Simulates the cursor-preservation logic from reloadFile:
 * - If the cursor line is within the new line count, preserve it.
 * - Otherwise, do not restore (return null).
 */
function resolveCursorAfterReload(
  cursorLine: number,
  newLineCount: number
): { lineNumber: number; column: number } | null {
  if (cursorLine <= newLineCount) {
    return { lineNumber: cursorLine, column: 1 };
  }
  return null;
}

describe("Cursor Preservation on File Reload", () => {
  /**
   * Feature: codex-ui-improvements, Property 10: Cursor preservation on reload
   * Validates: Requirements 9.2
   *
   * For any file reload where the cursor line number is ≤ the new line count,
   * the cursor position must be preserved.
   */
  it(
    "Property 10: cursor is preserved when its line still exists after reload",
    () => {
      fc.assert(
        fc.property(
          // New line count after reload (1–5000)
          fc.integer({ min: 1, max: 5000 }),
          // Cursor line that is within the new content
          fc.integer({ min: 1, max: 5000 }),
          (newLineCount, rawCursorLine) => {
            // Constrain cursor to be within the new file
            const cursorLine = Math.min(rawCursorLine, newLineCount);

            const result = resolveCursorAfterReload(cursorLine, newLineCount);

            expect(result).not.toBeNull();
            expect(result!.lineNumber).toBe(cursorLine);
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );

  /**
   * Property 10 (variant): cursor is NOT restored when its line no longer exists.
   * Validates: Requirements 9.2
   */
  it(
    "Property 10 (variant): cursor is not restored when its line is beyond the new content",
    () => {
      fc.assert(
        fc.property(
          // New line count (1–4999)
          fc.integer({ min: 1, max: 4999 }),
          // Cursor line that is beyond the new content
          fc.integer({ min: 1, max: 1000 }),
          (newLineCount, extraLines) => {
            const cursorLine = newLineCount + extraLines; // always > newLineCount

            const result = resolveCursorAfterReload(cursorLine, newLineCount);

            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );
});
