/**
 * Unit and property-based tests for DiffViewer component
 * Feature: codex-ui-improvements
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiffViewer } from "@/components/codex/diff-viewer";
import type { FileChangeItem } from "@/stores/session-store";

type Change = FileChangeItem["changes"][number];

/** Arbitrary for a single file change entry */
const arbChange = fc.record<Change>({
  path: fc.stringMatching(/^[a-z][a-z0-9/_-]{1,20}\.[a-z]{1,4}$/),
  kind: fc.constantFrom("create", "update", "delete"),
  diff: fc.constant(undefined),
});

describe("DiffViewer", () => {
  /**
   * Feature: codex-ui-improvements, Property 7: Diff viewer file count
   * Validates: Requirements 8.2
   *
   * For any file change item with N files, the diff viewer must display
   * exactly N accordion items.
   */
  it(
    "Property 7: displays exactly N accordion items for N file changes",
    () => {
      fc.assert(
        fc.property(
          fc.array(arbChange, { minLength: 1, maxLength: 5 }),
          (changes) => {
            const { container, unmount } = render(
              <DiffViewer changes={changes} onOpenFile={() => {}} />
            );

            // Each file change renders one AccordionItem (data-slot="accordion-item")
            const items = container.querySelectorAll(
              "[data-slot='accordion-item']"
            );

            expect(items.length).toBe(changes.length);

            unmount();
          }
        ),
        { numRuns: 50 }
      );
    },
    30_000
  );

  /**
   * Verify each file path appears in the rendered accordion triggers
   */
  it(
    "Property 7 (variant): each file path is rendered in the accordion triggers",
    () => {
      fc.assert(
        fc.property(
          fc.array(arbChange, { minLength: 1, maxLength: 3 }),
          (changes) => {
            const { container, unmount } = render(
              <DiffViewer changes={changes} onOpenFile={() => {}} />
            );

            const triggers = container.querySelectorAll(
              "[data-slot='accordion-trigger']"
            );
            const triggerTexts = Array.from(triggers).map(
              (el) => el.textContent ?? ""
            );

            for (const change of changes) {
              const found = triggerTexts.some((t) => t.includes(change.path));
              expect(found).toBe(true);
            }

            unmount();
          }
        ),
        { numRuns: 50 }
      );
    },
    30_000
  );
});

// ---------------------------------------------------------------------------
// Unit tests — diff format parsing
// ---------------------------------------------------------------------------

const UNIFIED_DIFF = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 line1
-line2
+line2 modified
+line3 added
 line4`;

const GIT_DIFF = `diff --git a/src/bar.ts b/src/bar.ts
index abc1234..def5678 100644
--- a/src/bar.ts
+++ b/src/bar.ts
@@ -1,2 +1,3 @@
 existing
+new line
 end`;

const NEW_FILE_DIFF = `--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,3 @@
+export const x = 1;
+export const y = 2;
+export const z = 3;`;

const DELETED_FILE_DIFF = `--- a/src/old-file.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export const a = 1;
-export const b = 2;
-export const c = 3;`;

describe("DiffViewer — diff format parsing", () => {
  it("renders a unified diff without crashing", () => {
    const changes: FileChangeItem["changes"] = [
      { path: "src/foo.ts", kind: "update", diff: UNIFIED_DIFF },
    ];
    const { container } = render(
      <DiffViewer changes={changes} onOpenFile={() => {}} />
    );
    expect(container.querySelectorAll("[data-slot='accordion-item']").length).toBe(1);
  });

  it("renders a git-style diff without crashing", () => {
    const changes: FileChangeItem["changes"] = [
      { path: "src/bar.ts", kind: "update", diff: GIT_DIFF },
    ];
    const { container } = render(
      <DiffViewer changes={changes} onOpenFile={() => {}} />
    );
    expect(container.querySelectorAll("[data-slot='accordion-item']").length).toBe(1);
  });

  it("renders a change with no diff field (shows 'No diff available' fallback when expanded)", async () => {
    const changes: FileChangeItem["changes"] = [
      { path: "src/unknown.ts", kind: "update" },
    ];
    const { container } = render(
      <DiffViewer changes={changes} onOpenFile={() => {}} />
    );
    // Expand the accordion item
    const trigger = container.querySelector("[data-slot='accordion-trigger']") as HTMLElement;
    fireEvent.click(trigger);

    expect(screen.getByText(/no diff available/i)).toBeTruthy();
  });
});

describe("DiffViewer — new file creation (no old content)", () => {
  it("renders a new-file diff with create badge", () => {
    const changes: FileChangeItem["changes"] = [
      { path: "src/new-file.ts", kind: "create", diff: NEW_FILE_DIFF },
    ];
    const { container } = render(
      <DiffViewer changes={changes} onOpenFile={() => {}} />
    );
    const trigger = container.querySelector("[data-slot='accordion-trigger']") as HTMLElement;
    expect(trigger.textContent).toContain("create");
  });

  it("shows the file path for a newly created file", () => {
    const changes: FileChangeItem["changes"] = [
      { path: "src/new-file.ts", kind: "create", diff: NEW_FILE_DIFF },
    ];
    render(<DiffViewer changes={changes} onOpenFile={() => {}} />);
    expect(screen.getByText("src/new-file.ts")).toBeTruthy();
  });
});

describe("DiffViewer — file deletion (no new content)", () => {
  it("renders a deleted-file diff with delete badge", () => {
    const changes: FileChangeItem["changes"] = [
      { path: "src/old-file.ts", kind: "delete", diff: DELETED_FILE_DIFF },
    ];
    const { container } = render(
      <DiffViewer changes={changes} onOpenFile={() => {}} />
    );
    const trigger = container.querySelector("[data-slot='accordion-trigger']") as HTMLElement;
    expect(trigger.textContent).toContain("delete");
  });

  it("shows the file path for a deleted file", () => {
    const changes: FileChangeItem["changes"] = [
      { path: "src/old-file.ts", kind: "delete", diff: DELETED_FILE_DIFF },
    ];
    render(<DiffViewer changes={changes} onOpenFile={() => {}} />);
    expect(screen.getByText("src/old-file.ts")).toBeTruthy();
  });
});

describe("DiffViewer — accordion expand/collapse", () => {
  it("accordion content is not visible before expanding", () => {
    const changes: FileChangeItem["changes"] = [
      { path: "src/foo.ts", kind: "update", diff: UNIFIED_DIFF },
    ];
    const { container } = render(
      <DiffViewer changes={changes} onOpenFile={() => {}} />
    );
    // Content panel should be hidden (data-state="closed")
    const content = container.querySelector("[data-slot='accordion-content']");
    expect(content?.getAttribute("data-state")).toBe("closed");
  });

  it("accordion content becomes visible after clicking trigger", () => {
    const changes: FileChangeItem["changes"] = [
      { path: "src/foo.ts", kind: "update", diff: UNIFIED_DIFF },
    ];
    const { container } = render(
      <DiffViewer changes={changes} onOpenFile={() => {}} />
    );
    const trigger = container.querySelector("[data-slot='accordion-trigger']") as HTMLElement;
    fireEvent.click(trigger);

    const content = container.querySelector("[data-slot='accordion-content']");
    expect(content?.getAttribute("data-state")).toBe("open");
  });

  it("clicking trigger again collapses the accordion", () => {
    const changes: FileChangeItem["changes"] = [
      { path: "src/foo.ts", kind: "update", diff: UNIFIED_DIFF },
    ];
    const { container } = render(
      <DiffViewer changes={changes} onOpenFile={() => {}} />
    );
    const trigger = container.querySelector("[data-slot='accordion-trigger']") as HTMLElement;
    fireEvent.click(trigger); // open
    fireEvent.click(trigger); // close

    const content = container.querySelector("[data-slot='accordion-content']");
    expect(content?.getAttribute("data-state")).toBe("closed");
  });

  it("multiple files can be expanded independently", () => {
    const changes: FileChangeItem["changes"] = [
      { path: "src/a.ts", kind: "update", diff: UNIFIED_DIFF },
      { path: "src/b.ts", kind: "create", diff: NEW_FILE_DIFF },
    ];
    const { container } = render(
      <DiffViewer changes={changes} onOpenFile={() => {}} />
    );
    const triggers = container.querySelectorAll("[data-slot='accordion-trigger']");
    fireEvent.click(triggers[0]); // expand first only

    const contents = container.querySelectorAll("[data-slot='accordion-content']");
    expect(contents[0].getAttribute("data-state")).toBe("open");
    expect(contents[1].getAttribute("data-state")).toBe("closed");
  });
});

describe("DiffViewer — view type toggle (unified/split)", () => {
  it("renders unified and split tab triggers", () => {
    const changes: FileChangeItem["changes"] = [
      { path: "src/foo.ts", kind: "update", diff: UNIFIED_DIFF },
    ];
    render(<DiffViewer changes={changes} onOpenFile={() => {}} />);
    expect(screen.getByRole("tab", { name: /unified/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /split/i })).toBeTruthy();
  });

  it("unified tab is selected by default", () => {
    const changes: FileChangeItem["changes"] = [
      { path: "src/foo.ts", kind: "update", diff: UNIFIED_DIFF },
    ];
    render(<DiffViewer changes={changes} onOpenFile={() => {}} />);
    const unifiedTab = screen.getByRole("tab", { name: /unified/i });
    expect(unifiedTab.getAttribute("aria-selected")).toBe("true");
  });

  it("clicking split tab activates it", async () => {
    const changes: FileChangeItem["changes"] = [
      { path: "src/foo.ts", kind: "update", diff: UNIFIED_DIFF },
    ];
    render(<DiffViewer changes={changes} onOpenFile={() => {}} />);
    const splitTab = screen.getByRole("tab", { name: /split/i });
    await userEvent.click(splitTab);
    // Radix Tabs uses aria-selected to indicate the active tab
    expect(splitTab.getAttribute("aria-selected")).toBe("true");
  });
});
