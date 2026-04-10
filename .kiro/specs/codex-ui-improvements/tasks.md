# Implementation Plan: Codex UI Improvements

## Overview

Incremental implementation: logging control first, then UX improvements (stop button, confirmations, loading screen), then the comprehensive diff viewer with editor integration, and finally file watching for auto-refresh.

## Tasks

- [x] 1. Implement console log suppression
  - Create `src/main/logger.ts` with environment-based log level control
  - Add `LOG_LEVEL` constant based on `NODE_ENV`
  - Add `DEBUG_CODEX` environment variable check
  - Implement `logCodexRpc(method, params)` function that only logs if `DEBUG_CODEX === 'true'`
  - Implement `logCodexEvent(event, data)` function that only logs if `DEBUG_CODEX === 'true'`
  - Update all RPC logging calls in `src/main/codex/codex-rpc.ts` to use `logCodexRpc`
  - Update all event logging calls in `src/lib/codex-events.ts` to use `logCodexEvent`
  - Ensure errors and warnings always log regardless of environment
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 1.1 Write property test: log suppression in production (Property 1)
  - **Property 1: Log suppression in production**
  - **Validates: Requirements 1.1, 1.2, 1.3**
  - Generate random RPC methods and events; verify no console output when `DEBUG_CODEX !== 'true'`

- [x] 2. Add stop button to ChatPanel
  - Update `src/components/codex/codex-chat-panel.tsx` to show stop button when `status === "streaming"`
  - Position button in the input area (absolute positioning or flex layout)
  - Implement `handleStop` function that calls `window.codex.interruptTurn`
  - Pass `agentId`, `threadId`, and `currentTurnId` to interrupt call
  - Show success toast on successful interruption
  - Show error toast on failure with error message
  - Disable stop button while interrupt request is in flight
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2.1 Write property test: stop button visibility (Property 2)
  - **Property 2: Stop button visibility**
  - **Validates: Requirements 2.1**
  - Generate random session states; verify stop button visible iff `status === "streaming"` and `currentTurnId !== null`

- [x] 3. Fix responsive layout in ChatPanel
  - Update `src/components/codex/codex-chat-panel.tsx` to use flexbox layout
  - Set parent container to `flex flex-col h-full`
  - Set header to `flex-shrink-0` (fixed height)
  - Set message list container to `flex-1 overflow-y-auto min-h-0` (grows to fill space)
  - Set input area to `flex-shrink-0` (fixed height)
  - Remove any fixed pixel widths that prevent responsive behavior
  - Test window resize during streaming to ensure layout adapts
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 3.1 Write property test: layout responsiveness (Property 3)
  - **Property 3: Layout responsiveness**
  - **Validates: Requirements 4.1, 4.2**
  - Simulate window resize events; verify chat panel height equals container height

- [x] 4. Add project removal from recents
  - Update `src/routes/editor.tsx` sidebar to add context menu to project entries
  - Use shadcn ContextMenu component
  - Add "Remove from Recents" menu item with Trash2 icon
  - Implement `handleRemoveProject(projectPath)` function
  - Call `removeRecentProject` from recent projects store
  - Persist updated list to localStorage
  - Show success toast after removal
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 4.1 Write property test: project removal persistence (Property 4)
  - **Property 4: Project removal persistence**
  - **Validates: Requirements 5.3**
  - Generate random project lists; remove projects; verify they don't appear after simulated restart

- [x] 5. Add session deletion confirmation dialog
  - Update `src/routes/editor.tsx` to add confirmation dialog before session deletion
  - Use shadcn AlertDialog component
  - Add state for `deleteDialogOpen` and `sessionToDelete`
  - Update delete button click handler to open dialog instead of deleting immediately
  - Show session name in dialog description
  - Add "This action cannot be undone" warning
  - Implement `confirmDelete` function that calls `deleteSession` from store
  - Add cancel button that closes dialog without deleting
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 5.1 Write property test: deletion confirmation requirement (Property 5)
  - **Property 5: Deletion confirmation requirement**
  - **Validates: Requirements 6.1, 6.3, 6.4**
  - Generate random session states; verify session not deleted unless confirmation received

- [x] 6. Create loading screen component
  - Create `src/components/loading-screen.tsx`
  - Accept props: `status: string`, `error?: string`, `onRetry?: () => void`
  - Use fixed positioning to cover entire viewport (`fixed inset-0 z-50`)
  - Center content with flexbox
  - Display app logo (use existing logo asset)
  - Show Loader2 spinner when loading
  - Show AlertCircle icon when error
  - Display status message below icon
  - Add retry button when error present
  - Add fade-out animation using CSS transition
  - _Requirements: 7.1, 7.2, 7.5_

- [x] 6.1 Integrate loading screen in app.tsx
  - Update `src/app.tsx` to add loading state
  - Add `appReady` state (default: false)
  - Add `loadingStatus` state (default: "Initializing...")
  - Add `loadingError` state
  - Create `initializeApp` async function
  - Update status to "Starting Codex..." before agent connection
  - Update status to "Loading workspace..." after agent ready
  - Set `appReady = true` after 500ms delay (for fade animation)
  - Render `<LoadingScreen />` when `!appReady`
  - Handle initialization errors by setting `loadingError`
  - _Requirements: 7.3, 7.4_

- [x] 6.2 Write property test: loading screen visibility (Property 6)
  - **Property 6: Loading screen visibility**
  - **Validates: Requirements 7.1, 7.4**
  - Generate random initialization states; verify loading screen visible until `appReady === true`

- [x] 7. Install diff viewer dependencies
  - Run `npm install react-diff-view diff2html unidiff chokidar`
  - Run `npm install -D @types/diff2html @types/chokidar`
  - Import CSS in app: `import 'react-diff-view/style/index.css'`
  - _Requirements: 8.1, 8.3, 9.5_

- [x] 8. Create DiffViewer component
  - Create `src/components/codex/diff-viewer.tsx`
  - Accept props: `changes: FileChangeItem['changes']`, `onOpenFile: (path, line?) => void`
  - Use shadcn Accordion for collapsible file list
  - Add view type toggle (unified/split) using shadcn Tabs
  - For each file change, parse diff using `parseDiff` from `react-diff-view`
  - Render AccordionItem per file with file path and change kind badge
  - In AccordionTrigger, show FileChangeIcon based on kind
  - In AccordionContent, render "Open in Editor" button
  - Render Diff component from `react-diff-view` with hunks
  - Implement `getFirstChangedLine` helper to extract first changed line number
  - Implement `getChangeBadgeVariant` helper for badge colors
  - Implement `FileChangeIcon` component with FilePlus/FileX/FileEdit icons
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8_

- [x] 8.1 Write property test: diff viewer file count (Property 7)
  - **Property 7: Diff viewer file count**
  - **Validates: Requirements 8.2**
  - Generate random file change items with N files; verify diff viewer displays exactly N accordion items

- [x] 9. Update FileChangeCard to integrate DiffViewer
  - Update `src/components/codex/items/file-change-card.tsx`
  - Add `showDiff` state (default: false)
  - Add "View Diff" / "Hide Diff" button in card header
  - When `showDiff === false`, show simple file list (current behavior)
  - When `showDiff === true`, render `<DiffViewer />` component
  - Implement `handleOpenFile` function that calls `window.editor.openFile({ path, line })`
  - Pass `handleOpenFile` to DiffViewer as `onOpenFile` prop
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 10. Add IPC handler for opening files in editor
  - Update `src/main.ts` to add `editor:openFile` IPC handler
  - Handler accepts `{ path: string, line?: number }`
  - Handler sends `editor:openFile` event to renderer with same payload
  - Update `src/preload.ts` to expose `window.editor.openFile` function
  - Update `src/types/codex-bridge.ts` to add editor types
  - _Requirements: 8.6_

- [x] 10.1 Write property test: editor navigation correctness (Property 8)
  - **Property 8: Editor navigation correctness**
  - **Validates: Requirements 8.6**
  - Generate random file paths; verify editor opens exact file when clicked in diff viewer

- [x] 11. Implement editor file opening handler
  - Update editor component (likely in `src/routes/editor.tsx` or editor panel component)
  - Subscribe to `window.electron.on('editor:openFile', handler)`
  - Handler extracts `path` and optional `line` from event
  - Load file content using existing file loading logic
  - If `line` is provided, set editor cursor to that line and scroll into view
  - Switch to editor tab if not already active
  - _Requirements: 8.6_

- [x] 12. Create FileWatcher class in main process
  - Create `src/main/file-watcher.ts`
  - Import chokidar
  - Create `FileWatcher` class with `watchers` Map
  - Implement `watchProject(projectPath, window)` method
  - Use `chokidar.watch` with ignore patterns for dotfiles and node_modules
  - Set `ignoreInitial: true` to skip initial scan
  - Listen to `change` event and send `file:changed` IPC event to renderer
  - Implement `unwatchProject(projectPath)` method to close watcher
  - Store watcher instance in Map keyed by project path
  - _Requirements: 9.5_

- [x] 13. Integrate FileWatcher in main process
  - Update `src/main.ts` to create FileWatcher instance
  - Call `fileWatcher.watchProject` when a project is opened
  - Call `fileWatcher.unwatchProject` when a project is closed
  - Pass BrowserWindow instance to watcher for IPC communication
  - _Requirements: 9.5_

- [x] 14. Implement editor file refresh on external changes
  - Update editor component to subscribe to `file:changed` events
  - Handler checks if changed file matches currently open file
  - If user has unsaved changes (`editor.getModel()?.isModified()`), show conflict dialog
  - If no unsaved changes, call `reloadFile(path)` function
  - Implement `reloadFile` function:
    - Read file content from disk
    - Save current cursor position and scroll position
    - Update editor value with new content
    - Restore cursor position if line still exists
    - Restore scroll position
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 14.1 Write property test: file refresh on external change (Property 9)
  - **Property 9: File refresh on external change**
  - **Validates: Requirements 9.1**
  - Simulate external file modifications; verify editor content updates to match disk

- [x] 14.2 Write property test: cursor preservation on reload (Property 10)
  - **Property 10: Cursor preservation on reload**
  - **Validates: Requirements 9.2**
  - Generate random cursor positions and file reloads; verify cursor preserved when line exists

- [x] 15. Implement file conflict dialog
  - Create `src/components/editor/file-conflict-dialog.tsx`
  - Use shadcn AlertDialog
  - Show when external file change detected and user has unsaved changes
  - Display three options:
    - "Keep Local Changes" — dismiss dialog, keep editor content
    - "Reload from Disk" — discard local changes, reload file
    - "Show Diff" — open diff viewer showing local vs disk changes
  - Implement handlers for each option
  - _Requirements: 9.4_

- [x] 16. Add unit tests for DiffViewer
  - Test parsing of various diff formats (unified, context, git)
  - Test handling of new file creation (no old content)
  - Test handling of file deletion (no new content)
  - Test accordion expand/collapse behavior
  - Test view type toggle (unified/split)
  - _Requirements: 8.1, 8.3, 10.4, 10.5_

- [x] 17. Add unit tests for LoadingScreen
  - Test status message display
  - Test error state rendering
  - Test retry button click
  - Test fade-out animation trigger
  - _Requirements: 7.1, 7.2, 7.5_

- [x] 18. Add E2E tests for UI improvements
  - Test: Start app → loading screen appears → fades out when ready
  - Test: Send message → click stop button → turn interrupts
  - Test: Resize window during streaming → layout adapts smoothly
  - Test: Right-click project → remove from recents → project disappears
  - Test: Click delete session → confirm dialog appears → cancel → session remains
  - Test: File change arrives → click "View Diff" → diff viewer expands
  - Test: Click file path in diff → editor opens to that file
  - Test: Modify file externally → editor auto-refreshes content
  - _Requirements: All_

- [ ] 19. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required — comprehensive testing from the start
- Use `react-diff-view` for diff rendering (mature library with syntax highlighting)
- Use `chokidar` for file watching (cross-platform, reliable)
- Use shadcn/ui components for consistency (Accordion, AlertDialog, ContextMenu, Tabs)
- Environment variable `DEBUG_CODEX=true` enables verbose logging in any mode
- Loading screen should have smooth fade-out transition (500ms)
- Diff viewer should handle edge cases: new files, deleted files, binary files
- File watcher should ignore dotfiles, node_modules, and other common ignore patterns
- Editor conflict dialog is critical for preventing data loss
