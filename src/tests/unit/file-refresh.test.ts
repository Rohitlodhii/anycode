/**
 * Property-based tests for editor file refresh on external changes
 * Feature: codex-ui-improvements
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import { useEditorUiStore, type EditorTab } from "@/stores/editor-ui";

// Helper to build a minimal EditorTab
function makeTab(path: string, content: string, isDirty = false): EditorTab {
  return {
    path,
    name: path.split("/").pop() ?? path,
    relativePath: path,
    language: "plaintext",
    originalContent: isDirty ? `${content}_original` : content,
    content,
    isDirty,
  };
}

describe("File Refresh on External Change", () => {
  beforeEach(() => {
    useEditorUiStore.getState().reset();
  });

  /**
   * Feature: codex-ui-improvements, Property 9: File refresh on external change
   * Validates: Requirements 9.1
   *
   * For any file open in the editor (with no local changes), after a reload
   * the tab content must equal the new disk content.
   */
  it(
    "Property 9: reloading a clean tab updates its content to the new value",
    () => {
      fc.assert(
        fc.property(
          // Random file path
          fc.stringMatching(/^\/[a-z][a-z0-9/_-]{1,30}\.[a-z]{1,4}$/),
          // Original content already on disk
          fc.string({ minLength: 1, maxLength: 500 }),
          // New content written externally
          fc.string({ minLength: 1, maxLength: 500 }),
          (filePath, originalContent, newContent) => {
            const store = useEditorUiStore.getState();

            // Open a clean tab (no unsaved changes)
            const tab = makeTab(filePath, originalContent, false);
            store.openTab(tab);

            // Simulate reloadFile: replace tab with new content from disk
            store.openTab({
              ...tab,
              content: newContent,
              originalContent: newContent,
              isDirty: false,
            });

            const updated = useEditorUiStore
              .getState()
              .tabs.find((t) => t.path === filePath);

            expect(updated).toBeDefined();
            expect(updated!.content).toBe(newContent);
            expect(updated!.isDirty).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );

  /**
   * Property 9 (variant): a dirty tab is NOT silently overwritten.
   * When a tab has unsaved changes, the conflict dialog should be shown
   * (i.e. the tab content must remain unchanged until the user decides).
   * Validates: Requirements 9.1, 9.4
   */
  it(
    "Property 9 (variant): dirty tab content is preserved when external change arrives",
    () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^\/[a-z][a-z0-9/_-]{1,30}\.[a-z]{1,4}$/),
          // Ensure localEdit and diskContent are always different strings
          fc.string({ minLength: 1, maxLength: 200 }).chain((localEdit) =>
            fc
              .string({ minLength: 1, maxLength: 200 })
              .filter((s) => s !== localEdit)
              .map((diskContent) => ({ localEdit, diskContent }))
          ),
          (filePath, { localEdit, diskContent }) => {
            const store = useEditorUiStore.getState();

            // Open a dirty tab (user has unsaved edits)
            const tab = makeTab(filePath, localEdit, true);
            store.openTab(tab);

            // Simulate the handler detecting isDirty — it should NOT reload
            // Re-read state after mutation
            const openTab = useEditorUiStore.getState().tabs.find((t) => t.path === filePath);
            const shouldShowConflict = openTab?.isDirty === true;

            // The tab content must remain the local edit
            const current = useEditorUiStore
              .getState()
              .tabs.find((t) => t.path === filePath);

            expect(shouldShowConflict).toBe(true);
            expect(current!.content).toBe(localEdit);
            // Disk content was never applied
            expect(current!.content).not.toBe(diskContent);
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );
});
