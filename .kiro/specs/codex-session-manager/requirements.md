# Requirements Document

## Introduction

This feature overhauls how the application connects to and manages Codex CLI agents, and exposes the full breadth of the `codex app-server` JSON-RPC API. The goals are: persistent startup connections, per-project named sessions with full conversation history, multiple parallel agents, non-interrupting tab switching, thread management (resume/fork/archive/rollback/compact), plan mode, skills, MCP servers, apps/connectors, rate limiting, structured error handling, rich chat UI with reasoning display and task progress, and full MDX rendering.

## Glossary

- **Session**: A single Codex agent process (`codex app-server`) tied to a project folder, with its own thread, conversation history, and lifecycle.
- **Thread**: A conversation between a user and the Codex agent, identified by a `threadId` returned by `thread/start` or `thread/resume`. Threads persist on disk as JSONL rollout files.
- **Turn**: A single user request and the agent work that follows. Turns contain items and stream incremental updates.
- **Item**: A unit of input or output within a turn (user message, agent message, command execution, file change, tool call, reasoning, plan, etc.).
- **Session_Store**: The client-side Zustand store that holds all session state, conversation messages, and session metadata.
- **Agent_Manager**: The main-process class (`AgentManager`) that owns and manages `CodexAgent` instances.
- **Codex_Agent**: A single running `codex app-server` process communicating via JSON-RPC over stdio.
- **Chat_Panel**: The renderer-side UI component that displays messages and the input for a given session.
- **Sidebar**: The left panel visible in the chat view, listing projects and sessions.
- **Active_Session**: The session whose conversation is currently displayed in the Chat_Panel.
- **Background_Session**: A session that is running but not currently displayed.
- **Project**: A folder path that the user has opened in the editor.
- **Skill**: A named instruction set stored in `.codex/skills/` that can be invoked in a turn via `$skill-name`.
- **MCP_Server**: A Model Context Protocol server configured in Codex that provides additional tools to the agent.
- **Rate_Limit**: A usage quota enforced by the upstream API, tracked per `limitId` with `usedPercent` and `resetsAt`.

## Requirements

### Requirement 1: Startup Connection

**User Story:** As a user, I want Codex to connect to my last project automatically when the app starts, so that I don't have to wait for a connection every time I open the chat tab.

#### Acceptance Criteria

1. WHEN the application starts and a last-used project path exists, THE Session_Store SHALL initialize a default session for that project without requiring the user to open the chat tab.
2. WHEN the application starts and no last-used project path exists, THE Session_Store SHALL remain idle until the user opens a project.
3. WHILE a startup session is being established, THE Sidebar SHALL display a spinner indicator next to the session entry.
4. IF the startup connection fails, THEN THE Session_Store SHALL record the error state on the session and THE Sidebar SHALL display an error indicator instead of the spinner.

### Requirement 2: Persistent Conversation History

**User Story:** As a user, I want my conversation history to be preserved when I switch tabs or change projects, so that I can freely navigate the app without losing context.

#### Acceptance Criteria

1. THE Session_Store SHALL store all chat messages (user, assistant, system) for every session in memory for the lifetime of the application.
2. WHEN a user switches from the chat tab to the editor tab and back, THE Chat_Panel SHALL display the same messages that were visible before the switch.
3. WHEN a user switches to a different project and then returns to a previous project, THE Chat_Panel SHALL restore the conversation history for the previously active session of that project.
4. WHEN a new assistant message delta arrives for a Background_Session, THE Session_Store SHALL append the delta to that session's message history without affecting the Chat_Panel display.

### Requirement 3: Non-Interrupting Tab Switching

**User Story:** As a user, I want to switch between the chat and editor tabs freely without stopping any ongoing Codex work, so that I can review code while Codex is processing.

#### Acceptance Criteria

1. WHEN a user switches from the chat tab to the editor tab, THE Codex_Agent SHALL continue running and processing its current turn.
2. WHEN a user switches from the editor tab back to the chat tab, THE Chat_Panel SHALL reflect any messages or deltas that arrived while the editor tab was active.
3. WHEN a user switches projects while a session is active, THE Codex_Agent for the previous project's session SHALL continue running in the background.
4. THE Session_Store SHALL track the `isStreaming` state per session so the Sidebar can show a spinner for any session that is actively processing.

### Requirement 4: Session Management per Project

**User Story:** As a user, I want each project to have named sessions so I can organize and revisit different conversations, so that I can maintain separate contexts for different tasks.

#### Acceptance Criteria

1. WHEN a project is opened for the first time, THE Session_Store SHALL create one default session for that project.
2. WHEN a user creates a new session for a project, THE Session_Store SHALL create a new session entry with a unique ID and an auto-generated name (e.g., "Session 2"), and THE Agent_Manager SHALL start a new Codex_Agent for it.
3. THE Session_Store SHALL persist session metadata (session ID, name, project path, creation timestamp) to local storage so sessions survive app restarts.
4. WHEN a user selects a session from the Sidebar, THE Chat_Panel SHALL display that session's conversation history and become the Active_Session.
5. WHEN a user renames a session, THE Session_Store SHALL update the session name immediately.
6. WHEN a user deletes a session, THE Agent_Manager SHALL kill the associated Codex_Agent and THE Session_Store SHALL remove the session and its message history.

### Requirement 5: Parallel Agent Sessions

**User Story:** As a user, I want to run multiple Codex agents simultaneously on the same project, so that I can work on different tasks in parallel without waiting for one to finish.

#### Acceptance Criteria

1. THE Agent_Manager SHALL support running multiple Codex_Agent instances concurrently, each with a unique session ID.
2. WHEN multiple sessions are running for the same project, THE Sidebar SHALL list all sessions under that project with individual status indicators.
3. WHEN a message is sent to a specific session, THE Agent_Manager SHALL route it only to the Codex_Agent associated with that session ID.
4. WHEN events arrive from a Background_Session, THE Session_Store SHALL update that session's state without switching the Active_Session.
5. THE Session_Store SHALL expose the count of actively streaming sessions per project so the Sidebar can show an aggregate activity indicator.

### Requirement 6: Sidebar Activity Indicator

**User Story:** As a user, I want to see a spinner in the sidebar when any Codex session is actively processing, so that I know work is happening even when I'm on the editor tab.

#### Acceptance Criteria

1. WHILE any session for the current project is in the `isStreaming` state, THE Sidebar SHALL display an animated spinner next to that project's entry.
2. WHEN all sessions for a project finish streaming, THE Sidebar SHALL replace the spinner with a static status icon.
3. WHEN a session encounters an error, THE Sidebar SHALL display an error indicator for that session entry.
4. THE Sidebar SHALL show the session name and a brief status label (e.g., "Thinking…", "Connected", "Error") for each session listed under a project.

### Requirement 7: Rich Chat UI with MDX Rendering

**User Story:** As a user, I want a clean and functional chat interface that clearly shows message history, session context, and input state, so that I can interact with Codex comfortably.

#### Acceptance Criteria

1. THE Chat_Panel SHALL display a session selector at the top that shows the current session name and allows switching between sessions for the same project.
2. WHEN a new message is added to the conversation, THE Chat_Panel SHALL auto-scroll to the bottom of the message list.
3. WHEN the assistant is streaming a response, THE Chat_Panel SHALL show a visible streaming indicator (e.g., animated cursor or pulsing dots) within the assistant message bubble.
4. WHEN the input is disabled (no session connected), THE Chat_Panel SHALL display a clear placeholder explaining why input is unavailable.
5. THE Chat_Panel SHALL render assistant messages with full MDX support: headings, bold, italic, inline code, fenced code blocks with syntax highlighting, blockquotes, ordered and unordered lists, and horizontal rules.
6. WHEN a code block is rendered, THE Chat_Panel SHALL display a copy-to-clipboard button on the code block.

### Requirement 8: Thread Management

**User Story:** As a user, I want to manage my conversation threads (resume, fork, archive, rollback, compact) so that I can organize my history and branch conversations.

#### Acceptance Criteria

1. WHEN a user resumes a session after an app restart, THE Codex_Agent SHALL call `thread/resume` with the stored `threadId` so conversation context is preserved.
2. WHEN a user forks a session, THE Codex_Agent SHALL call `thread/fork` and THE Session_Store SHALL create a new session entry pointing to the forked `threadId`.
3. WHEN a user archives a session, THE Codex_Agent SHALL call `thread/archive` and THE Session_Store SHALL mark the session as archived.
4. WHEN a user rolls back a session by N turns, THE Codex_Agent SHALL call `thread/rollback` with `numTurns` and THE Chat_Panel SHALL remove the rolled-back messages from the display.
5. WHEN a user triggers compaction, THE Codex_Agent SHALL call `thread/compact/start` and THE Chat_Panel SHALL show a `contextCompaction` item indicating compaction is in progress.
6. THE Chat_Panel SHALL display a thread history list accessible from the session header, showing threads from `thread/list` with name, preview, and creation date.

### Requirement 9: Plan Mode

**User Story:** As a user, I want to see Codex's plan before it executes, so that I can understand and verify what it intends to do.

#### Acceptance Criteria

1. WHEN a `turn/plan/updated` notification is received, THE Chat_Panel SHALL display a plan card showing each step with its status (`pending`, `inProgress`, `completed`).
2. WHEN a plan step transitions to `inProgress`, THE Chat_Panel SHALL highlight that step with an animated indicator.
3. WHEN a plan step transitions to `completed`, THE Chat_Panel SHALL show a checkmark on that step.
4. WHEN the final `plan` item arrives via `item/completed`, THE Chat_Panel SHALL treat it as the authoritative plan and update the display accordingly.

### Requirement 10: Reasoning Display

**User Story:** As a user, I want to see Codex's reasoning process so that I can understand how it arrived at its answer.

#### Acceptance Criteria

1. WHEN `item/reasoning/summaryTextDelta` notifications arrive, THE Chat_Panel SHALL display a collapsible "Thinking" section that streams the reasoning summary text.
2. THE Chat_Panel SHALL show a timer counting elapsed seconds while the reasoning section is actively streaming.
3. WHEN `turn/completed` is received, THE Chat_Panel SHALL stop the timer and display the final elapsed time in the "Thinking" section header.
4. WHEN a `reasoning` item is received via `item/completed`, THE Chat_Panel SHALL collapse the thinking section by default and allow the user to expand it.

### Requirement 11: Task Progress Items

**User Story:** As a user, I want to see live progress for commands, file changes, MCP tool calls, and web searches so that I know what Codex is doing.

#### Acceptance Criteria

1. WHEN a `commandExecution` item is received via `item/started`, THE Chat_Panel SHALL display a command card showing the command, working directory, and a running spinner.
2. WHEN `item/commandExecution/outputDelta` notifications arrive, THE Chat_Panel SHALL stream the output into the command card.
3. WHEN a `commandExecution` item is received via `item/completed`, THE Chat_Panel SHALL update the card with exit code and duration, replacing the spinner with a status icon.
4. WHEN a `fileChange` item is received via `item/started`, THE Chat_Panel SHALL display a file change card listing the affected files and their change kinds.
5. WHEN a `mcpToolCall` item is received, THE Chat_Panel SHALL display a tool call card showing server name, tool name, and status.
6. WHEN a `webSearch` item is received, THE Chat_Panel SHALL display a web search card showing the query and action type.
7. WHEN a `contextCompaction` item is received, THE Chat_Panel SHALL display a system message indicating that conversation history was compacted.

### Requirement 12: Skills Integration

**User Story:** As a user, I want to browse and invoke available skills so that I can use pre-built instruction sets for common tasks.

#### Acceptance Criteria

1. WHEN the Chat_Panel is connected to a session, THE Chat_Panel SHALL fetch available skills via `skills/list` for the current project path.
2. THE Chat_Panel SHALL display a skills picker (triggered by typing `$` in the input) showing available skill names and descriptions.
3. WHEN a user selects a skill from the picker, THE Chat_Panel SHALL include both the `text` input with `$skill-name` and a `skill` input item in the `turn/start` call.
4. WHEN a skill is invoked, THE Chat_Panel SHALL display a skill invocation indicator in the message.

### Requirement 13: MCP Server Status

**User Story:** As a user, I want to see the status of configured MCP servers so that I know which tools are available to Codex.

#### Acceptance Criteria

1. THE Chat_Panel SHALL provide access to an MCP status panel that lists servers from `mcpServerStatus/list` with their connection status and available tools.
2. WHEN an MCP server requires OAuth authentication, THE Chat_Panel SHALL display a login button that triggers `mcpServer/oauth/login` and opens the returned `authUrl`.
3. WHEN `mcpServer/oauthLogin/completed` is received, THE Chat_Panel SHALL update the server status to reflect the new auth state.
4. THE Chat_Panel SHALL provide a "Reload MCP config" button that calls `config/mcpServer/reload`.

### Requirement 14: Rate Limiting and Error Handling

**User Story:** As a user, I want clear feedback when I hit rate limits or encounter errors so that I know what happened and when I can retry.

#### Acceptance Criteria

1. WHEN a `turn/completed` event arrives with `status: "failed"` and `codexErrorInfo.type === "UsageLimitExceeded"`, THE Chat_Panel SHALL display a rate limit banner showing the `resetsAt` time and usage percentage from `account/rateLimits/read`.
2. WHEN `account/rateLimits/updated` is received, THE Chat_Panel SHALL update the rate limit display in real time.
3. WHEN a turn fails with `codexErrorInfo.type === "ContextWindowExceeded"`, THE Chat_Panel SHALL display a suggestion to compact the thread or start a new session.
4. WHEN a turn fails with `codexErrorInfo.type === "Unauthorized"`, THE Chat_Panel SHALL display an authentication error with a re-login prompt.
5. WHEN a turn fails with any other `codexErrorInfo` type, THE Chat_Panel SHALL display the error message with the `codexErrorInfo` type as a badge.
6. WHEN the Codex process exits unexpectedly, THE Session_Store SHALL set the session status to `error` and THE Chat_Panel SHALL offer a reconnect button.

### Requirement 15: Turn Interruption and Steering

**User Story:** As a user, I want to stop or redirect an in-progress turn so that I can correct Codex mid-flight without waiting for it to finish.

#### Acceptance Criteria

1. WHILE a turn is in progress, THE Chat_Panel SHALL display a "Stop" button that calls `turn/interrupt`.
2. WHEN `turn/interrupt` succeeds, THE Chat_Panel SHALL update the turn status to `interrupted` and re-enable the input.
3. WHILE a turn is in progress, THE Chat_Panel SHALL allow the user to submit additional input via `turn/steer` without creating a new turn.
4. WHEN `turn/steer` is called, THE Chat_Panel SHALL append the steered input as a user message in the conversation display.

### Requirement 16: Authentication Status

**User Story:** As a user, I want to see my authentication status and manage my login so that I know Codex has valid credentials.

#### Acceptance Criteria

1. WHEN the Chat_Panel connects, THE Chat_Panel SHALL call `account/read` and display the current auth mode (API key, ChatGPT, or unauthenticated) in the session header.
2. WHEN `account/updated` is received, THE Chat_Panel SHALL update the auth status display immediately.
3. WHEN the user is unauthenticated, THE Chat_Panel SHALL display a login prompt with options for API key or ChatGPT browser login.
4. WHEN `account/login/start` with `type: "chatgpt"` returns an `authUrl`, THE Chat_Panel SHALL open the URL in the system browser.
