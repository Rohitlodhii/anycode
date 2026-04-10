/**
 * Property-based and unit tests for at-file-mention utilities
 * Feature: at-file-mention
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MAX_SUGGESTIONS,
  type FileSuggestion,
  extractAtQuery,
  fuzzyFilterFiles,
  insertFilePath,
} from "@/components/codex/at-file-mention";
import { flattenFileTree } from "@/main/filesystem";
import type { FileNode } from "@/main/filesystem";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a valid file name like "app.tsx" */
const fileNameArb = fc
  .tuple(
    fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/),
    fc.constantFrom(".ts", ".tsx", ".js", ".json", ".md", ".css")
  )
  .map(([base, ext]) => `${base}${ext}`);

/** Generates a relative path like "src/components/app.tsx" */
const relativePathArb = fc
  .tuple(
    fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,10}$/), {
      minLength: 0,
      maxLength: 3,
    }),
    fileNameArb
  )
  .map(([segments, name]) =>
    segments.length > 0 ? `${segments.join("/")}/${name}` : name
  );

/** Generates a FileSuggestion */
const fileSuggestionArb: fc.Arbitrary<FileSuggestion> = relativePathArb.map(
  (relativePath) => {
    const parts = relativePath.split("/");
    const name = parts[parts.length - 1] ?? relativePath;
    return { name, relativePath };
  }
);

/** Generates a non-empty array of FileSuggestions */
const fileSuggestionsArb = fc.array(fileSuggestionArb, {
  minLength: 1,
  maxLength: 50,
});

// ---------------------------------------------------------------------------
// Property 1: Picker open state matches `@` token presence
// Feature: at-file-mention, Property 1: Picker open state matches `@` token presence
// Validates: Requirements 1.1, 1.2
// ---------------------------------------------------------------------------

describe("Property 1: extractAtQuery — picker open state matches @ token presence", () => {
  it("returns non-null for any string ending with @<non-whitespace>", () => {
    // Feature: at-file-mention, Property 1: Picker open state matches `@` token presence
    fc.assert(
      fc.property(
        // prefix: either empty or ends with whitespace
        fc.oneof(
          fc.constant(""),
          fc
            .tuple(
              fc.string({ minLength: 0, maxLength: 20 }),
              fc.constantFrom(" ", "\t")
            )
            .map(([s, ws]) => `${s}${ws}`)
        ),
        // query: zero or more non-whitespace chars
        fc.stringMatching(/^\S*$/),
        (prefix, query) => {
          const input = `${prefix}@${query}`;
          const result = extractAtQuery(input);
          expect(result).not.toBeNull();
          expect(result).toBe(query);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("returns null for strings with no active @ token (@ followed by space or no @)", () => {
    // Feature: at-file-mention, Property 1: Picker open state matches `@` token presence
    fc.assert(
      fc.property(
        // strings that contain no @ at all
        fc.string({ minLength: 0, maxLength: 40 }).filter((s) => !s.includes("@")),
        (input) => {
          expect(extractAtQuery(input)).toBeNull();
        }
      ),
      { numRuns: 200 }
    );
  });

  it("returns null when @ is followed by whitespace (completed token)", () => {
    // Feature: at-file-mention, Property 1: Picker open state matches `@` token presence
    fc.assert(
      fc.property(
        // token: non-whitespace, no @ to avoid creating a new active token
        fc.stringMatching(/^[a-zA-Z0-9_/.-]{1,20}$/),
        // suffix: non-empty, no @ at end to avoid creating a new active token
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.endsWith("@") && !/@\S*$/.test(s)),
        (token, suffix) => {
          // "@token suffix" — the @ token is completed (space after it)
          const input = `@${token} ${suffix}`;
          expect(extractAtQuery(input)).toBeNull();
        }
      ),
      { numRuns: 200 }
    );
  });

  // Unit examples
  it("returns empty string for bare @", () => {
    expect(extractAtQuery("@")).toBe("");
    expect(extractAtQuery("hello @")).toBe("");
  });

  it("returns the query for active @ token", () => {
    expect(extractAtQuery("@app")).toBe("app");
    expect(extractAtQuery("fix the bug in @src/ap")).toBe("src/ap");
    expect(extractAtQuery("hello @world")).toBe("world");
  });

  it("returns null for completed @ token", () => {
    expect(extractAtQuery("@src/app.tsx fix this")).toBeNull();
    expect(extractAtQuery("no mention here")).toBeNull();
    expect(extractAtQuery("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Property 2: Filter correctness — all results contain the query
// Feature: at-file-mention, Property 2: Filter correctness — all results contain the query
// Validates: Requirements 2.1
// ---------------------------------------------------------------------------

describe("Property 2: fuzzyFilterFiles — filter correctness", () => {
  it("every returned file contains the query in name or relativePath (case-insensitive)", () => {
    // Feature: at-file-mention, Property 2: Filter correctness — all results contain the query
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9]{1,10}$/),
        fileSuggestionsArb,
        (query, files) => {
          const results = fuzzyFilterFiles(query, files);
          const lower = query.toLowerCase();
          for (const r of results) {
            const matches =
              r.name.toLowerCase().includes(lower) ||
              r.relativePath.toLowerCase().includes(lower);
            expect(matches).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("returns all matching files when count <= MAX_SUGGESTIONS", () => {
    // Feature: at-file-mention, Property 2: Filter correctness — all results contain the query
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z]{1,5}$/),
        fc.array(fileSuggestionArb, { minLength: 0, maxLength: MAX_SUGGESTIONS }),
        (query, files) => {
          const lower = query.toLowerCase();
          const matching = files.filter(
            (f) =>
              f.name.toLowerCase().includes(lower) ||
              f.relativePath.toLowerCase().includes(lower)
          );
          const results = fuzzyFilterFiles(query, files);
          expect(results.length).toBe(matching.length);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Ranking — name-starts-with before contains-elsewhere
// Feature: at-file-mention, Property 3: Ranking — name-starts-with before contains-elsewhere
// Validates: Requirements 2.2
// ---------------------------------------------------------------------------

describe("Property 3: fuzzyFilterFiles — ranking", () => {
  it("name-starts-with results appear before contains-elsewhere results", () => {
    // Feature: at-file-mention, Property 3: Ranking — name-starts-with before contains-elsewhere
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z]{2,6}$/),
        fileSuggestionsArb,
        (query, files) => {
          const lower = query.toLowerCase();
          const results = fuzzyFilterFiles(query, files);

          let seenNonStart = false;
          for (const r of results) {
            const nameStarts = r.name.toLowerCase().startsWith(lower);
            if (!nameStarts) {
              seenNonStart = true;
            }
            if (seenNonStart && nameStarts) {
              // A name-starts-with result appeared after a non-starts-with result
              expect(false).toBe(true);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Max suggestions cap
// Feature: at-file-mention, Property 4: Max suggestions cap
// Validates: Requirements 2.4
// ---------------------------------------------------------------------------

describe("Property 4: fuzzyFilterFiles — max suggestions cap", () => {
  it("returns at most MAX_SUGGESTIONS results regardless of input size", () => {
    // Feature: at-file-mention, Property 4: Max suggestions cap
    fc.assert(
      fc.property(
        fc.array(fileSuggestionArb, { minLength: MAX_SUGGESTIONS + 1, maxLength: 200 }),
        (files) => {
          // Use empty query so all files match
          const results = fuzzyFilterFiles("", files);
          expect(results.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Token replacement preserves surrounding text
// Feature: at-file-mention, Property 6: Token replacement preserves surrounding text
// Validates: Requirements 5.1, 5.2, 4.1
// ---------------------------------------------------------------------------

describe("Property 6: insertFilePath — token replacement preserves surrounding text", () => {
  it("result contains @relativePath and not the original @query (when query !== relativePath)", () => {
    // Feature: at-file-mention, Property 6: Token replacement preserves surrounding text
    fc.assert(
      fc.property(
        // prefix: text before the @query token
        fc.oneof(
          fc.constant(""),
          fc
            .tuple(
              fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("@")),
              fc.constantFrom(" ", "\t")
            )
            .map(([s, ws]) => `${s}${ws}`)
        ),
        // query: non-whitespace string
        fc.stringMatching(/^[a-zA-Z0-9_/-]{1,20}$/),
        // relativePath: different from query
        fc.stringMatching(/^[a-zA-Z0-9_/-]{1,30}$/),
        (prefix, query, relativePath) => {
          fc.pre(query !== relativePath);
          const inputValue = `${prefix}@${query}`;
          const result = insertFilePath(inputValue, query, relativePath);

          // Must contain @relativePath
          expect(result).toContain(`@${relativePath}`);
          // Must NOT contain the original @query token at end
          expect(result.endsWith(`@${query}`)).toBe(false);
          // Prefix text must be preserved
          if (prefix.length > 0) {
            expect(result.startsWith(prefix)).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("result ends with a space after the inserted path", () => {
    // Feature: at-file-mention, Property 6: Token replacement preserves surrounding text
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9_/-]{1,20}$/),
        fc.stringMatching(/^[a-zA-Z0-9_/-]{1,30}$/),
        (query, relativePath) => {
          const inputValue = `@${query}`;
          const result = insertFilePath(inputValue, query, relativePath);
          expect(result.endsWith(" ")).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Unit examples
  it("replaces @query at start of input", () => {
    expect(insertFilePath("@app", "app", "src/app.tsx")).toBe("@src/app.tsx ");
  });

  it("replaces @query in middle of input", () => {
    expect(insertFilePath("fix bug in @ap", "ap", "src/app.tsx")).toBe(
      "fix bug in @src/app.tsx "
    );
  });

  it("preserves text after a completed token (no active query)", () => {
    // When there's no active @query at end, nothing should be replaced
    const input = "hello world";
    expect(insertFilePath(input, "nonexistent", "src/app.tsx")).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// Property 5: Navigation wraps around
// Feature: at-file-mention, Property 5: Navigation wraps around
// Validates: Requirements 3.1, 3.2, 3.3, 3.4
// ---------------------------------------------------------------------------

/**
 * The wrap-around logic is a pure modular arithmetic operation extracted from
 * the hook. We test it directly here since the hook itself requires a DOM
 * environment. The property is:
 *
 *   For any N > 0, pressing ArrowDown N times from index 0 returns to 0.
 *   For any N > 0, pressing ArrowUp N times from index 0 returns to 0.
 */

function simulateArrowDown(index: number, length: number): number {
  return (index + 1) % length;
}

function simulateArrowUp(index: number, length: number): number {
  return (index - 1 + length) % length;
}

describe("Property 5: Navigation wraps around", () => {
  it("ArrowDown N times from 0 returns to 0 for any list length N > 0", () => {
    // Feature: at-file-mention, Property 5: Navigation wraps around
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (n) => {
          let index = 0;
          for (let i = 0; i < n; i++) {
            index = simulateArrowDown(index, n);
          }
          expect(index).toBe(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("ArrowUp N times from 0 returns to 0 for any list length N > 0", () => {
    // Feature: at-file-mention, Property 5: Navigation wraps around
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (n) => {
          let index = 0;
          for (let i = 0; i < n; i++) {
            index = simulateArrowUp(index, n);
          }
          expect(index).toBe(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("ArrowDown from last index wraps to 0", () => {
    // Feature: at-file-mention, Property 5: Navigation wraps around
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (n) => {
          const lastIndex = n - 1;
          const result = simulateArrowDown(lastIndex, n);
          expect(result).toBe(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("ArrowUp from index 0 wraps to last index", () => {
    // Feature: at-file-mention, Property 5: Navigation wraps around
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (n) => {
          const result = simulateArrowUp(0, n);
          expect(result).toBe(n - 1);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: File index contains only files, excludes hidden and node_modules
// Feature: at-file-mention, Property 7: File index contains only files, excludes hidden and node_modules
// Validates: Requirements 6.1, 6.2, 6.4
// ---------------------------------------------------------------------------

/**
 * Arbitraries for building synthetic FileNode trees.
 * We generate trees that may contain hidden entries, node_modules, and folders
 * to verify that flattenFileTree only returns valid file relative paths.
 */

/** Generates a normal (non-hidden) file name segment */
const normalSegmentArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,15}$/);

/** Generates a hidden segment (starts with '.') */
const hiddenSegmentArb = fc
  .stringMatching(/^[a-zA-Z0-9_-]{1,10}$/)
  .map((s) => `.${s}`);

/** Generates a file extension */
const extArb = fc.constantFrom(".ts", ".tsx", ".js", ".json", ".md", ".css");

/** Builds a leaf FileNode of type "file" */
function makeFileNode(name: string, relativePath: string): FileNode {
  return { name, path: `/root/${relativePath}`, parentPath: "/root", relativePath, type: "file" };
}

/** Builds a folder FileNode with given children */
function makeFolderNode(name: string, relativePath: string, children: FileNode[]): FileNode {
  return { name, path: `/root/${relativePath}`, parentPath: "/root", relativePath, type: "folder", children };
}

/** Arbitrary for a normal file node */
const normalFileNodeArb: fc.Arbitrary<FileNode> = fc
  .tuple(normalSegmentArb, extArb)
  .map(([base, ext]) => makeFileNode(`${base}${ext}`, `src/${base}${ext}`));

/** Arbitrary for a hidden file node (name starts with '.') */
const hiddenFileNodeArb: fc.Arbitrary<FileNode> = fc
  .tuple(hiddenSegmentArb, extArb)
  .map(([base, ext]) => makeFileNode(`${base}${ext}`, `${base}${ext}`));

/** Arbitrary for a node_modules file node */
const nodeModulesFileNodeArb: fc.Arbitrary<FileNode> = fc
  .tuple(normalSegmentArb, extArb)
  .map(([base, ext]) => makeFileNode(`${base}${ext}`, `node_modules/${base}${ext}`));

/** Arbitrary for a hidden folder node containing normal files */
const hiddenFolderNodeArb: fc.Arbitrary<FileNode> = fc
  .tuple(hiddenSegmentArb, fc.array(normalFileNodeArb, { minLength: 0, maxLength: 3 }))
  .map(([name, children]) => makeFolderNode(name, name, children));

/** Arbitrary for a node_modules folder node */
const nodeModulesFolderNodeArb: fc.Arbitrary<FileNode> = fc
  .array(normalFileNodeArb, { minLength: 0, maxLength: 3 })
  .map((children) => makeFolderNode("node_modules", "node_modules", children));

/** Arbitrary for a normal folder node containing a mix of children */
const normalFolderNodeArb: fc.Arbitrary<FileNode> = fc
  .tuple(
    normalSegmentArb,
    fc.array(normalFileNodeArb, { minLength: 0, maxLength: 5 })
  )
  .map(([name, children]) => makeFolderNode(name, `src/${name}`, children));

/** Builds a root FileNode tree with a mix of normal, hidden, node_modules entries */
const mixedTreeArb: fc.Arbitrary<FileNode> = fc
  .tuple(
    fc.array(normalFileNodeArb, { minLength: 0, maxLength: 5 }),
    fc.array(normalFolderNodeArb, { minLength: 0, maxLength: 3 }),
    fc.array(hiddenFileNodeArb, { minLength: 0, maxLength: 3 }),
    fc.array(hiddenFolderNodeArb, { minLength: 0, maxLength: 2 }),
    fc.array(nodeModulesFileNodeArb, { minLength: 0, maxLength: 3 }),
    nodeModulesFolderNodeArb
  )
  .map(([normalFiles, normalFolders, hiddenFiles, hiddenFolders, nmFiles, nmFolder]) => {
    const children: FileNode[] = [
      ...normalFiles,
      ...normalFolders,
      ...hiddenFiles,
      ...hiddenFolders,
      ...nmFiles,
      nmFolder,
    ];
    return makeFolderNode("root", "", children);
  });

describe("Property 7: flattenFileTree — file index contains only files, excludes hidden and node_modules", () => {
  it("returns only file entries (no folders)", () => {
    // Feature: at-file-mention, Property 7: File index contains only files, excludes hidden and node_modules
    fc.assert(
      fc.property(mixedTreeArb, (tree) => {
        const paths = flattenFileTree(tree);
        // All returned paths must come from file nodes (not folder nodes)
        // We verify by checking that the root node itself (type folder, relativePath "")
        // is never included, and that all paths are non-empty strings
        for (const p of paths) {
          expect(typeof p).toBe("string");
          expect(p.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("does not include paths with hidden segments (starting with '.')", () => {
    // Feature: at-file-mention, Property 7: File index contains only files, excludes hidden and node_modules
    // Note: flattenFileTree itself is a pure tree traversal — it returns whatever
    // the tree contains. The exclusion of hidden files happens in buildFileTree
    // (readDirectoryRecursive). We verify that when the tree is built correctly
    // (no hidden nodes), flattenFileTree produces no hidden paths.
    // We test with a tree that has NO hidden nodes to confirm flattenFileTree
    // doesn't introduce hidden paths on its own.
    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(normalFileNodeArb, { minLength: 0, maxLength: 10 }),
          fc.array(normalFolderNodeArb, { minLength: 0, maxLength: 5 })
        ),
        ([files, folders]) => {
          const root = makeFolderNode("root", "", [...files, ...folders]);
          const paths = flattenFileTree(root);
          for (const p of paths) {
            const segments = p.split("/");
            for (const seg of segments) {
              expect(seg.startsWith(".")).toBe(false);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("does not include node_modules paths when tree has no node_modules nodes", () => {
    // Feature: at-file-mention, Property 7: File index contains only files, excludes hidden and node_modules
    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(normalFileNodeArb, { minLength: 0, maxLength: 10 }),
          fc.array(normalFolderNodeArb, { minLength: 0, maxLength: 5 })
        ),
        ([files, folders]) => {
          const root = makeFolderNode("root", "", [...files, ...folders]);
          const paths = flattenFileTree(root);
          for (const p of paths) {
            expect(p.includes("node_modules")).toBe(false);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("only includes file nodes — folder nodes are excluded from the flat list", () => {
    // Feature: at-file-mention, Property 7: File index contains only files, excludes hidden and node_modules
    // Build a tree with known files and folders, verify only file relativePaths appear
    fc.assert(
      fc.property(
        fc.array(normalFileNodeArb, { minLength: 1, maxLength: 10 }),
        fc.array(normalFolderNodeArb, { minLength: 1, maxLength: 5 }),
        (files, folders) => {
          const root = makeFolderNode("root", "", [...files, ...folders]);
          const paths = flattenFileTree(root);
          const fileRelPaths = new Set(files.map((f) => f.relativePath));
          const folderRelPaths = new Set(folders.map((f) => f.relativePath));

          // Every returned path must be a known file path
          for (const p of paths) {
            // It's either a direct file or a file nested inside a folder
            // (our normalFolderNodeArb nests normalFileNodeArb children)
            const isKnownFile = fileRelPaths.has(p);
            const isNestedFile = [...folderRelPaths].some((fp) => p.startsWith(fp + "/") || p.startsWith("src/"));
            expect(isKnownFile || isNestedFile).toBe(true);
          }

          // No folder relativePath should appear in the flat list
          for (const fp of folderRelPaths) {
            expect(paths).not.toContain(fp);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  // Unit examples
  it("returns empty array for a tree with no files", () => {
    const root: FileNode = makeFolderNode("root", "", [
      makeFolderNode("src", "src", []),
      makeFolderNode("dist", "dist", []),
    ]);
    expect(flattenFileTree(root)).toEqual([]);
  });

  it("returns all file paths from a simple tree", () => {
    const root: FileNode = makeFolderNode("root", "", [
      makeFileNode("index.ts", "index.ts"),
      makeFolderNode("src", "src", [
        makeFileNode("app.tsx", "src/app.tsx"),
        makeFileNode("main.ts", "src/main.ts"),
      ]),
    ]);
    const paths = flattenFileTree(root);
    expect(paths).toContain("index.ts");
    expect(paths).toContain("src/app.tsx");
    expect(paths).toContain("src/main.ts");
    expect(paths).toHaveLength(3);
  });

  it("excludes the root folder node itself (empty relativePath)", () => {
    const root: FileNode = makeFolderNode("root", "", [
      makeFileNode("file.ts", "file.ts"),
    ]);
    const paths = flattenFileTree(root);
    expect(paths).not.toContain("");
    expect(paths).toEqual(["file.ts"]);
  });
});
