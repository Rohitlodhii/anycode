#   Implementation Plan: At-File Mention

## Overview

Implement `@`-triggered file path autocomplete in the Codex chat input. Pure utility functions first, then IPC plumbing, then the hook + UI component, then wiring into the chat panel.

## Tasks

- [x] 1. Add `fs:listFiles` IPC handler
  - In `src/ipc/app/` add a handler for `"fs:listFiles"` that calls `buildFileTree(rootPath)` from `src/main/filesystem.ts` and returns a flat `string[]` of relative paths for files only (no folders, no hidden, no node_modules)
  - Register the handler in the main IPC setup
  - Expose `listFiles(rootPath: string): Promise<string[]>` on `window.api` in `src/preload.ts`
  - Add `listFiles` to the `window.api` type declaration in `src/types.d.ts`
  - _Requirements: 6.1, 6.2, 6.4_

- [x] 2. Implement pure utility functions
  - [x] 2.1 Create `src/components/codex/at-file-mention.tsx` with the `FileSuggestion` type and three pure functions:
    - `extractAtQuery(inputValue: string): string | null` — regex `/(?:^|(?<=\s))@(\S*)$/` to find active `@query` token
    - `fuzzyFilterFiles(query: string, files: FileSuggestion[]): FileSuggestion[]` — case-insensitive filter, name-starts-with ranked first, capped at `MAX_SUGGESTIONS = 10`
    - `insertFilePath(inputValue: string, query: string, relativePath: string): string` — replaces `@query` token with `@relativePath ` preserving surrounding text
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.4, 5.1, 5.2_

  - [x] 2.2 Write property test for `extractAtQuery` — Property 1: picker open state matches `@` token presence
    - **Property 1: Picker open state matches `@` token presence**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 2.3 Write property test for `fuzzyFilterFiles` — Properties 2, 3, 4
    - **Property 2: Filter correctness — all results contain the query**
    - **Property 3: Ranking — name-starts-with before contains-elsewhere**
    - **Property 4: Max suggestions cap**
    - **Validates: Requirements 2.1, 2.2, 2.4**

  - [x] 2.4 Write property test for `insertFilePath` — Property 6
    - **Property 6: Token replacement preserves surrounding text**
    - **Validates: Requirements 5.1, 5.2, 4.1**

- [x] 3. Implement `useAtFileMention` hook
  - Add `useAtFileMention(inputValue, projectPath, onValueChange)` to `src/components/codex/at-file-mention.tsx`
  - Load file index via `window.api.listFiles(projectPath)` on mount and when `projectPath` changes; map results to `FileSuggestion[]`
  - Detect active query with `extractAtQuery`, compute suggestions with `fuzzyFilterFiles`
  - Manage `selectedIndex` state with ArrowUp/Down wrap-around and reset on query change
  - On selection (Enter or `onSelect` callback): call `insertFilePath`, pass result to `onValueChange`, close picker
  - On Escape: dismiss picker (keep `@` in input)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1–3.5, 6.1, 6.3_

  - [x] 3.1 Write property test for navigation wrap-around — Property 5
    - **Property 5: Navigation wraps around**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 4. Implement `AtFileMentionCard` component
  - Add `AtFileMentionCard` to `src/components/codex/at-file-mention.tsx`
  - Style identically to `SlashCommandCard`: `absolute bottom-[calc(100%+8px)] left-0 right-0 z-50`, border, backdrop-blur, popover background
  - Show file name prominently and dimmed relative path beside it
  - Highlight selected row with `bg-accent`; hover highlights with `bg-accent/50`
  - Show "No files found" when `fileIndex` is empty; show "No matches" when suggestions are empty but query is non-empty
  - Use `onPointerDown` (not `onClick`) to prevent textarea blur before selection
  - _Requirements: 1.4, 2.3, 4.1, 4.2, 7.1, 7.2, 7.3_

- [x] 5. Wire into `CodexChatPanel`
  - In `src/components/codex/codex-chat-panel.tsx`, import `useAtFileMention` and `AtFileMentionCard`
  - Call `useAtFileMention(inputValue, projectPath, setInputValue)` alongside `useSlashCommands`
  - Pass `atFileMention.onKeyDown` to `AI_Prompt`'s `onKeyDown` prop (chain with existing slash-command handler — at-file-mention takes priority when its picker is open)
  - Render `<AtFileMentionCard>` inside the same relative-positioned wrapper as `SlashCommandCard`, shown when `atFileMention.isOpen`
  - Pass `inputWrapperRef` as `anchorRef`
  - _Requirements: 1.1, 3.1–3.5, 4.1, 7.1_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Write property test for file index correctness — Property 7
  - **Property 7: File index contains only files, excludes hidden and node_modules**
  - **Validates: Requirements 6.1, 6.2, 6.4**

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Pure functions in step 2 are fully testable without DOM or IPC
- Property tests use `fast-check` with ≥ 100 iterations; each is tagged `// Feature: at-file-mention, Property N: ...`
- The `lookbehind` regex (`(?<=\s)`) is supported in V8/Node — safe for Electron
