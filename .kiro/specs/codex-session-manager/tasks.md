# Implementation Plan: Codex Session Manager (Full App-Server Integration)

## Overview

Bottom-up implementation: store and types first, then IPC wiring, then event dispatcher, then UI components (chat panel, sidebar, MCP panel, thread history), then startup integration. All tests are required.

## Tasks

- [x] 1. Define all data types and create the SessionStore
  - Create `src/stores/session-store.ts` with Zustand store
  - Define all types: `Session`, `SessionStatus`, `ChatMessage`, `TurnItem` union (`CommandItem`, `FileChangeItem`, `McpToolCallItem`, `WebSearchItem`, `ReasoningItem`, `PlanItem`, `ContextCompactionItem`), `PlanStep`, `RateLimit`, `AuthState`, `SessionMeta`
  - Implement all store actions listed in the design (session lifecycle, messages, items, approvals, rate limits, auth)
  - Persist `SessionMeta` fields (id, name, projectPath, threadId, createdAt, isArchived) to localStorage via `persist` middleware; exclude `messages` and `items`
  - _Requirements: 2.1, 4.1, 4.2, 4.3, 4.5, 4.6, 5.5, 8.1_

- [x] 1.1 Write property test: session isolation (Property 1)
  - **Property 1: Session isolation — messages never cross sessions**
  - **Validates: Requirements 2.1, 5.3**
  - Use fast-check: generate two distinct session IDs and random messages; verify appending to session A does not change session B

- [x] 1.2 Write property test: streaming flag consistency (Property 2)
  - **Property 2: Streaming flag consistency**
  - **Validates: Requirements 3.4, 5.4**
  - Generate random sequences of turn/started and turn/completed events; verify `status === "streaming"` matches event history

- [x] 1.3 Write property test: hasStreamingSession aggregate (Property 3)
  - **Property 3: hasStreamingSession aggregate correctness**
  - **Validates: Requirements 5.5, 6.1**
  - Generate random sets of sessions with random statuses; verify `hasStreamingSession` returns true iff at least one session is streaming

- [x] 1.4 Write property test: session creation uniqueness (Property 4)
  - **Property 4: Session creation uniqueness**
  - **Validates: Requirements 4.2, 5.1**
  - Generate random sequences of `createSession` calls on the same project path; verify all IDs are distinct

- [x] 1.5 Write property test: deleteSession removes completely (Property 5)
  - **Property 5: Delete removes session completely**
  - **Validates: Requirements 4.6**
  - Generate random store state; call `deleteSession`; verify session absent from `sessions` and `getSessionsForProject`

- [x] 1.6 Write property test: renameSession is synchronous (Property 6)
  - **Property 6: Rename is reflected immediately**
  - **Validates: Requirements 4.5**
  - Generate random session + name string; call `renameSession`; verify `sessions[id].name === newName` immediately

- [x] 1.7 Write property test: delta append is order-preserving (Property 7)
  - **Property 7: Delta append is order-preserving**
  - **Validates: Requirements 2.4, 7.3, 10.1**
  - Generate random arrays of delta strings; append each via `appendDelta` and `appendReasoningDelta`; verify final content equals concatenation in order

- [x] 1.8 Write property test: setActiveSession does not mutate messages (Property 8)
  - **Property 8: Active session switch does not mutate messages**
  - **Validates: Requirements 2.2, 3.1**
  - Generate random store state with multiple sessions; call `setActiveSession`; verify all message arrays and item maps are unchanged

- [x] 1.9 Write property test: plan step status mapping (Property 9)
  - **Property 9: Plan step status mapping is consistent**
  - **Validates: Requirements 9.1, 9.4**
  - Generate random sequences of `updatePlanSteps` calls; verify store reflects only the most recent step statuses

- [x] 1.10 Write property test: item upsert is idempotent on ID (Property 10)
  - **Property 10: Item upsert is idempotent on ID**
  - **Validates: Requirements 11.1, 11.3, 11.4**
  - Generate random item ID and two different item payloads; call `upsertItem` twice; verify store contains only the second version

- [x] 1.11 Write property test: error classification preserves codexErrorInfo type (Property 11)
  - **Property 11: Error classification preserves codexErrorInfo type**
  - **Validates: Requirements 14.1, 14.3, 14.4, 14.5**
  - Generate random `codexErrorInfo` type strings; process a failed `turn/completed` event; verify `errorMessage` contains the type string

- [x] 2. Extend IPC bridge with new channels
  - Add `codex:session:create` handler in `src/main.ts`: calls `codexManager.ensure(sessionId, { cwd })`
  - Add `codex:rpc:call` handler in `src/main.ts`: forwards `{ agentId, method, params }` to the agent's RPC and returns the result — this is the generic passthrough for skills/list, thread/list, account/read, mcpServerStatus/list, etc.
  - Add `codex:turn:interrupt` handler: calls `turn/interrupt` on the agent RPC
  - Add `codex:turn:steer` handler: calls `turn/steer` on the agent RPC
  - Update `src/preload.ts` to expose all new channels on `window.codex`: `createSession`, `rpcCall`, `interruptTurn`, `steerTurn`, `onSessionReady`
  - Update `src/types/codex-bridge.ts` with new payload types
  - _Requirements: 4.2, 5.1, 8.2, 8.3, 8.4, 8.5, 15.1, 15.3_

- [x] 3. Implement startup connection in main process
  - In `src/main.ts`, after `restoreLastProjectOrShowHome()`, call `codexManager.ensure` for the default session of the last project path
  - Emit `codex:session:ready` to the renderer window once the agent is ready
  - Handle the case where no last project path exists (skip silently)
  - _Requirements: 1.1, 1.2, 1.4_

- [x] 4. Create the Codex event dispatcher
  - Create `src/lib/codex-events.ts` with `initCodexEventDispatcher()` function
  - Subscribe to `window.codex.onEvent` and `window.codex.onRequest` once at app startup
  - Implement full routing table from the design: turn events, item events, item deltas, plan updates, account/auth events, rate limit events, error events
  - Call `initCodexEventDispatcher()` in `src/app.tsx` inside a `useEffect` with empty deps
  - _Requirements: 2.4, 3.4, 5.4, 9.1, 10.1, 11.1–11.7, 14.2, 16.2_

- [x] 4.1 Write unit tests for event dispatcher routing
  - Test each event method produces the correct store mutation
  - Test that events for a non-active session do not change `activeSessionId`
  - Test `turn/completed` with `status: "failed"` routes to `setSessionError` with correct error info
  - _Requirements: 5.4, 14.1_

- [x] 5. Checkpoint — Ensure all store and IPC tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Add MDX rendering dependencies and create the markdown renderer component
  - Install `react-markdown`, `remark-gfm`, `rehype-highlight`, `highlight.js` (or `rehype-prism-plus`)
  - Create `src/components/codex/markdown-renderer.tsx` that wraps `react-markdown` with `remark-gfm` and syntax highlighting
  - Add copy-to-clipboard button to every code block using `navigator.clipboard.writeText`
  - Open links via `shell.openExternal` (expose `shell:openExternal` IPC if not already present)
  - _Requirements: 7.5, 7.6_

- [x] 6.1 Write unit tests for markdown renderer
  - Snapshot tests for headings, bold, italic, inline code, fenced code blocks, blockquotes, lists, tables
  - Test that copy button is rendered for code blocks
  - _Requirements: 7.5, 7.6_

- [x] 7. Build turn item display components
  - Create `src/components/codex/items/reasoning-block.tsx`: collapsible "Thinking" section, streams `summaryText`, shows elapsed-time counter while `isStreaming`, collapses on `turn/completed`
  - Create `src/components/codex/items/plan-card.tsx`: shows plan steps with `pending` / `inProgress` (animated dot) / `completed` (checkmark) states
  - Create `src/components/codex/items/command-card.tsx`: shows command, cwd, streaming output, exit code, duration
  - Create `src/components/codex/items/file-change-card.tsx`: shows affected files and diff kind badges
  - Create `src/components/codex/items/mcp-tool-card.tsx`: shows server, tool, status badge
  - Create `src/components/codex/items/web-search-card.tsx`: shows query and action type
  - Create `src/components/codex/items/context-compaction-banner.tsx`: system message for compaction
  - _Requirements: 9.1–9.4, 10.1–10.4, 11.1–11.7_

- [x] 8. Refactor ChatPanel to use SessionStore and new item components
  - Update `src/components/codex/codex-chat-panel.tsx` to accept `sessionId: string` prop
  - Remove all local `useState` for messages, session, status, isStreaming, pendingRequest — read from `useSessionStore`
  - Add session selector dropdown at the top (all sessions for current project); clicking calls `setActiveSession`
  - Add "New Session" button: calls `createSession` then `window.codex.createSession`
  - Add fork / archive / rollback / compact actions in session header (call `window.codex.rpcCall` with appropriate methods)
  - Render `ChatMessage` entries using `MarkdownRenderer` for assistant messages
  - Render `TurnItem` entries using the item components from task 7
  - Add auto-scroll: `useEffect` watching `messages.length` and `items` size scrolls a `ref` to bottom
  - Add streaming cursor `▋` at end of last assistant message when `status === "streaming"`
  - Add Stop button (calls `window.codex.interruptTurn`) while streaming
  - Add Steer input (calls `window.codex.steerTurn`) while streaming
  - Show disabled input with explanatory placeholder when `status === "connecting"` or `status === "error"` with reconnect button
  - _Requirements: 2.2, 3.4, 4.4, 7.1–7.6, 8.2–8.5, 9.1–9.4, 10.1–10.4, 11.1–11.7, 15.1–15.4_

- [x] 9. Build SkillsPicker component
  - Create `src/components/codex/skills-picker.tsx`
  - Fetch `skills/list` via `window.codex.rpcCall("skills/list", { cwds: [projectPath] })` when the session connects
  - Show popover when user types `$` in the input bar
  - On skill selection, inject `$skill-name` into the text input and add a `skill` input item to the `turn/start` call
  - Show skill invocation indicator in the message bubble
  - _Requirements: 12.1–12.4_

- [x] 10. Build McpStatusPanel component
  - Create `src/components/codex/mcp-status-panel.tsx`
  - Fetch `mcpServerStatus/list` via `window.codex.rpcCall`
  - Show server name, connection status, tool count
  - OAuth login button: calls `mcpServer/oauth/login` via `rpcCall`, opens returned `authUrl` via `shell.openExternal`
  - Handle `mcpServer/oauthLogin/completed` event to update server status
  - "Reload MCP config" button: calls `config/mcpServer/reload` via `rpcCall`
  - _Requirements: 13.1–13.4_

- [x] 11. Build ThreadHistoryPanel component
  - Create `src/components/codex/thread-history-panel.tsx`
  - Fetch `thread/list` via `window.codex.rpcCall` with `cwd` filter and cursor pagination
  - Show thread name, preview, creation date
  - Actions: resume (calls `thread/resume` via `rpcCall`, updates session `threadId` in store), archive, fork (calls `thread/fork`, creates new session entry)
  - _Requirements: 8.1–8.6_

- [x] 12. Build authentication status UI
  - Add auth badge to session header: shows "API Key", "ChatGPT (email)", or "Not logged in"
  - Call `account/read` via `window.codex.rpcCall` when session connects; store result via `setAuthState`
  - When unauthenticated, show login prompt with API key input and "Login with ChatGPT" button
  - "Login with ChatGPT" calls `account/login/start` via `rpcCall`; on result, open `authUrl` via `shell.openExternal`
  - Handle `account/updated` event in event dispatcher to update auth state
  - _Requirements: 16.1–16.4_

- [x] 13. Build rate limit display
  - Add rate limit indicator to session header: shows usage bar when `usedPercent > 0`
  - Call `account/rateLimits/read` via `rpcCall` when session connects; store result via `setRateLimits`
  - Handle `account/rateLimits/updated` event in event dispatcher
  - When `UsageLimitExceeded` error occurs, show banner with `resetsAt` countdown timer
  - _Requirements: 14.1, 14.2_

- [x] 14. Refactor Sidebar to use SessionStore
  - In `src/routes/editor.tsx`, update the chat sidebar to be sessions-aware
  - For each project in recent projects, show `Loader2` spinner if `hasStreamingSession(project.path)` is true
  - Under the active project, list all sessions from `getSessionsForProject(resolvedFolderPath)` with name + status label
  - Clicking a session calls `setActiveSession(session.id)` and switches to chat view
  - Add rename (inline edit on double-click) and delete (trash icon) actions per session
  - Pass `activeSessionId` to `CodexChatPanel` instead of `folderPath`
  - _Requirements: 4.4, 4.5, 4.6, 5.2, 6.1–6.4_

- [x] 15. Wire startup session into renderer
  - In `src/app.tsx`, subscribe to `window.codex.onSessionReady`; on receipt call `setSessionReady(sessionId, data)`
  - On app load, read persisted session metadata from the store; for each non-archived session call `window.codex.ensureAgent` to reconnect
  - _Requirements: 1.1, 1.3, 4.3, 8.1_

- [x] 16. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Extend SessionStore with collaboration mode, approval policy, and reasoning effort
  - Add `collaborationMode: "plan" | "default"` field to `Session` type (default: `"default"`)
  - Add `approvalPolicy: "untrusted" | "never"` field to `Session` type (default: `"untrusted"`)
  - Add `reasoningEffort: ReasoningEffort` field to `Session` type (default: `"medium"`)
  - Implement `setCollaborationMode`, `setApprovalPolicy`, `setReasoningEffort` store actions
  - Persist all three fields in `SessionMeta` / `partialize` so they survive restarts
  - Update `makeEmptySession` to initialize all three fields with their defaults
  - Pass `collaborationMode`, `approvalPolicy`, and `effort` into the `turn/start` payload inside `handleSubmit` in `codex-chat-panel.tsx`
  - _Requirements: 17.1, 17.5, 18.1, 18.5, 19.1_

- [x] 17.1 Write property test: session settings round-trip (Property 12)

  - **Property 12: Session settings round-trip**
  - **Validates: Requirements 17.1, 17.5, 18.1, 18.5, 19.1**
  - Use fast-check: generate random valid values for each setting; call the setter; verify the store reflects the exact value immediately

- [x] 17.2 Write property test: reasoning effort filter (Property 13)

  - **Property 13: Reasoning effort filter respects model support**
  - **Validates: Requirements 19.3**
  - Generate random model objects with random `supportedReasoningEfforts` arrays; verify the filter function includes an effort iff it appears in the model's supported list

- [x] 17.3 Write property test: reasoning effort reset on model change (Property 14)

  - **Property 14: Reasoning effort resets to model default when unsupported**
  - **Validates: Requirements 19.5**
  - Generate random models and unsupported effort values; apply the model-change handler; verify `reasoningEffort === model.defaultReasoningEffort`

- [x] 18. Build InputBar toolbar controls (mode toggle, access toggle, effort picker)
  - Add a compact toolbar row in `codex-chat-panel.tsx` between the message list and `AI_Prompt`, visible only when `isConnected`
  - Mode toggle: two-segment pill ("Plan" / "Chat") — clicking calls `setCollaborationMode`; active segment highlighted
  - Access toggle: two-segment pill ("Supervised" / "Full Access") — clicking calls `setApprovalPolicy`; active segment highlighted
  - Effort picker: small dropdown button showing current effort label; popover lists only `model.supportedReasoningEfforts`; selecting calls `setReasoningEffort`; resets to `model.defaultReasoningEffort` when model changes and current effort is unsupported
  - _Requirements: 17.2, 17.3, 17.4, 18.2, 18.3, 18.4, 19.2, 19.3, 19.4, 19.5_

- [x] 19. Build SlashCommandSystem
  - Implement `useSlashCommands(inputValue, context)` hook in `src/components/codex/slash-commands.tsx`
  - Hook sets `isOpen = true` when `inputValue.startsWith("/")`, filters `ALL_COMMANDS` by query suffix (case-insensitive name or description match), tracks `selectedIndex` for ArrowUp/ArrowDown/Enter/Escape keyboard navigation
  - Define command registry with at minimum: `/model`, `/plan`, `/default`, `/mcp`, `/effort`, `/supervised`, `/full-access` — each with icon, description, and action callback
  - Implement `SlashCommandCard` component: absolutely positioned with `bottom: calc(100% + 8px)` relative to `inputWrapperRef`, shows icon + bold `/name` + muted description per row, highlights `selectedIndex` row
  - Wire into `codex-chat-panel.tsx`: render `SlashCommandCard` above `AI_Prompt` when `slashCommands.isOpen && slashCommands.filtered.length > 0`; on selection call `cmd.action()` and clear input
  - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8_

- [x] 19.1 Write property test: slash command filter correctness (Property 15)

  - **Property 15: Slash command filter correctness**
  - **Validates: Requirements 20.2, 20.6**
  - Generate random input strings; verify filter returns non-empty list iff input starts with `/` and suffix matches at least one command; verify empty list for all non-`/` inputs

- [x] 20. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required — comprehensive testing from the start
- Session IDs: `{projectPath}:{index}` (e.g. `C:\projects\app:1`)
- Messages and items are in-memory only; only `SessionMeta` fields are persisted to localStorage
- `agentId` in all existing IPC payloads maps 1:1 to `sessionId` — no renaming needed in the main process
- `codex:rpc:call` is the generic passthrough for any app-server method not already handled by a dedicated IPC channel
- fast-check is the property-based testing library (available via vitest ecosystem — install if not present)
- MDX dependencies (`react-markdown`, `remark-gfm`, `rehype-highlight`) must be added to `package.json`
