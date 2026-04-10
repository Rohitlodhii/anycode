# Design Document: At-File Mention

## Overview

This feature adds `@`-triggered file path autocomplete to the Codex chat input. When the user types `@` (optionally followed by a query), a popup menu appears above the input showing fuzzy-matched files from the current project. Selecting a file inserts `@<relative_path>` into the message, which Codex CLI interprets as a file reference.

The implementation mirrors the existing slash-command pattern: a custom React hook manages state, and a presentational card component renders the popup. No new IPC channels are needed — the existing `window.api.readDirectory` (recursive) or the already-available `buildFileTree` logic in `src/main/filesystem.ts` is reused via a new IPC handler.

---

## Architecture

```mermaid
flowchart TD
    A[User types @ in AI_Prompt textarea] --> B[useAtFileMention hook detects @ token]
    B --> C{File_Index loaded?}
    C -- yes --> D[fuzzyFilterFiles(query, fileIndex)]
    C -- no --> E[Load File_Index via IPC fs:listFiles]
    E --> D
    D --> F[AtFileMentionCard renders above input]
    F --> G{User action}
    G -- ArrowUp/Down --> H[Update selectedIndex]
    G -- Enter / Click --> I[insertFilePath(inputValue, query, relativePath)]
    I --> J[Update Chat_Input value, close picker]
    G -- Escape --> K[Dismiss picker]
```

---

## Components and Interfaces

### 1. `useAtFileMention` hook

Location: `src/components/codex/at-file-mention.tsx`

```ts
export type UseAtFileMentionReturn = {
  isOpen: boolean;
  suggestions: FileSuggestion[];
  selectedIndex: number;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSelect: (suggestion: FileSuggestion) => void;
  dismiss: () => void;
};

export function useAtFileMention(
  inputValue: string,
  projectPath: string,
  onValueChange: (newValue: string) => void
): UseAtFileMentionReturn;
```

Responsibilities:
- Detect the active `@query` token in `inputValue` (the last `@...` segment with no space after it)
- Load and cache the `File_Index` for `projectPath`
- Run `fuzzyFilterFiles(query, fileIndex)` to produce suggestions
- Manage `selectedIndex` and keyboard navigation
- Call `insertFilePath(inputValue, query, relativePath)` on selection and pass result to `onValueChange`

### 2. `AtFileMentionCard` component

Location: `src/components/codex/at-file-mention.tsx` (same file)

```tsx
type AtFileMentionCardProps = {
  suggestions: FileSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: FileSuggestion) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
};

export function AtFileMentionCard(props: AtFileMentionCardProps): JSX.Element;
```

Styled identically to `SlashCommandCard` — absolute positioned, `bottom: calc(100% + 8px)`, border, backdrop-blur, popover background.

### 3. Pure utility functions

Location: `src/components/codex/at-file-mention.tsx`

```ts
/** Returns the active @query token from the input, or null if none. */
export function extractAtQuery(inputValue: string): string | null;

/** Fuzzy-filter and rank files against query. Returns at most MAX_SUGGESTIONS results. */
export function fuzzyFilterFiles(
  query: string,
  files: FileSuggestion[]
): FileSuggestion[];

/** Replace the @query token in inputValue with @relativePath + space. */
export function insertFilePath(
  inputValue: string,
  query: string,
  relativePath: string
): string;
```

### 4. IPC: `fs:listFiles`

New IPC handler in `src/ipc/app/` that returns a flat list of all file relative paths under a given root (reusing `buildFileTree` from `src/main/filesystem.ts`).

```ts
// main process handler
ipcMain.handle("fs:listFiles", async (_event, rootPath: string): Promise<string[]> => {
  const tree = await buildFileTree(rootPath);
  return flattenFiles(tree); // returns relativePath[] for files only
});

// preload exposure
listFiles: (rootPath: string): Promise<string[]> =>
  ipcRenderer.invoke("fs:listFiles", rootPath),
```

---

## Data Models

```ts
export type FileSuggestion = {
  /** File name only, e.g. "app.tsx" */
  name: string;
  /** Path relative to project root, e.g. "src/app.tsx" */
  relativePath: string;
};
```

### File Index loading

- Loaded once per `projectPath` via `window.api.listFiles(projectPath)`
- Cached in the hook's `useState` — refreshed when `projectPath` changes
- Max depth: 5 (inherited from `buildFileTree`)
- Excludes: hidden files/folders (`.` prefix), `node_modules`

### `@query` token detection

The active query is the last `@`-prefixed word in the input that has not yet been completed (no space after it):

```
"fix the bug in @src/ap"  → query = "src/ap"
"@app"                    → query = "app"
"@src/app.tsx fix this"   → no active query (space after the token)
"hello @"                 → query = ""  (empty query → show all files)
```

Regex: `/(?:^|(?<=\s))@(\S*)$/` — matches `@` preceded by start-of-string or whitespace, followed by non-whitespace characters to end of string.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Picker open state matches `@` token presence

*For any* input string, `extractAtQuery` returns a non-null value if and only if the string contains an active `@query` token (i.e. `@` preceded by start or whitespace, followed by non-whitespace characters at end of string).

**Validates: Requirements 1.1, 1.2**

---

### Property 2: Filter correctness — all results contain the query

*For any* query string and any list of `FileSuggestion` objects, every item returned by `fuzzyFilterFiles(query, files)` must have its `name` or `relativePath` contain the query (case-insensitive).

**Validates: Requirements 2.1**

---

### Property 3: Ranking — name-starts-with before contains-elsewhere

*For any* query and file list where some files have `name.startsWith(query)` and others only have `relativePath.includes(query)`, all name-starts-with results must appear before all contains-elsewhere results in the output of `fuzzyFilterFiles`.

**Validates: Requirements 2.2**

---

### Property 4: Max suggestions cap

*For any* file list of arbitrary size where all files match the query, `fuzzyFilterFiles` returns at most `MAX_SUGGESTIONS` (10) results.

**Validates: Requirements 2.4**

---

### Property 5: Navigation wraps around

*For any* suggestion list of length N > 0, pressing ArrowDown N times from index 0 returns the selected index to 0 (modular arithmetic). Symmetrically, pressing ArrowUp N times from index 0 also returns to 0.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

---

### Property 6: Token replacement preserves surrounding text

*For any* input string containing an `@query` token and any `relativePath`, `insertFilePath(inputValue, query, relativePath)` returns a string that:
- Contains `@relativePath`
- Does NOT contain the original `@query` token (unless query === relativePath)
- Preserves all text before and after the `@query` token

**Validates: Requirements 5.1, 5.2, 4.1**

---

### Property 7: File index contains only files, excludes hidden and node_modules

*For any* directory tree, the flat file list produced by `flattenFiles(buildFileTree(root))` must:
- Contain no paths with a segment starting with `.`
- Contain no paths containing `node_modules`
- Contain only file entries (no folder-only paths)

**Validates: Requirements 6.1, 6.2, 6.4**

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `fs:listFiles` IPC fails | Hook catches error, sets `fileIndex` to `[]`, picker shows "No files found" |
| `projectPath` is empty string | Hook skips loading, `fileIndex` stays `[]` |
| Query produces no matches | `fuzzyFilterFiles` returns `[]`, card shows "No matches" message |
| User types `@` then immediately submits | `insertFilePath` is not called; raw `@` is sent as-is |

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are used:

- **Unit tests** (`src/tests/unit/at-file-mention.test.ts`): specific examples, edge cases (empty query, empty file list, query with path separators), and the Escape/Enter interaction examples.
- **Property tests** (same file, using `fast-check`): universal properties 1–7 above, each run with ≥ 100 generated inputs.

### Property-Based Testing Library

**`fast-check`** — already available in the JS/TS ecosystem and compatible with Vitest. Each property test is tagged:

```
// Feature: at-file-mention, Property N: <property text>
```

### Unit Test Coverage

- `extractAtQuery`: empty string, string with no `@`, string with completed `@path `, string with active `@query`
- `fuzzyFilterFiles`: empty list, empty query (returns all up to cap), query with no matches
- `insertFilePath`: `@` at start, `@` in middle, `@` at end, multiple `@` tokens (only last active one replaced)
- `useAtFileMention` hook: file index loads on mount, refreshes on projectPath change (example test)

### Property Test Configuration

Minimum 100 iterations per property. Each property test references its design property number via a comment tag.
