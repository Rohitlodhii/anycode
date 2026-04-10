# Requirements Document

## Introduction

This feature enhances the Codex chat interface with improved logging control, better user experience features, and a comprehensive diff viewer for file changes. The goals are: suppress verbose console logs, add turn interruption capability, improve message rendering with proper formatting, fix responsive layout issues, add project management features, add confirmation dialogs for destructive actions, implement a loading screen, create a rich diff viewer with syntax highlighting, and ensure editor file refresh on external changes.

## Glossary

- **Chat_Panel**: The renderer-side UI component that displays messages and the input for a given session.
- **Turn**: A single user request and the agent work that follows. Turns contain items and stream incremental updates.
- **Diff_Viewer**: A UI component that displays file changes with side-by-side or unified diff view, syntax highlighting, and navigation controls.
- **File_Change_Item**: A turn item representing file modifications made by the Codex agent.
- **Console_Log**: Debug output written to the terminal or developer console.
- **Loading_Screen**: A full-screen overlay displayed during application initialization.
- **Session**: A single Codex agent process tied to a project folder.
- **Recent_Projects**: The list of recently opened project folders displayed in the sidebar.
- **Editor_Panel**: The Monaco-based code editor component.
- **File_Watcher**: A system that monitors file changes on disk and updates the editor.

## Requirements

### Requirement 1: Console Log Suppression

**User Story:** As a user, I want the application to suppress verbose debug logs in the terminal, so that I can focus on important information without clutter.

#### Acceptance Criteria

1. WHEN the application runs in production mode, THE System SHALL NOT log individual RPC requests to the console.
2. WHEN the application runs in production mode, THE System SHALL NOT log Codex event notifications to the console.
3. WHEN the application runs in development mode, THE System SHALL log debug information only if an environment variable or debug flag is explicitly set.
4. THE System SHALL continue to log errors and warnings to the console regardless of mode.

### Requirement 2: Turn Interruption (Stop Button)

**User Story:** As a user, I want a visible stop button while Codex is processing, so that I can interrupt long-running operations.

#### Acceptance Criteria

1. WHILE a turn is in progress (`status === "streaming"`), THE Chat_Panel SHALL display a prominent "Stop" button in the input area.
2. WHEN a user clicks the "Stop" button, THE Chat_Panel SHALL call `turn/interrupt` via the IPC bridge.
3. WHEN `turn/interrupt` succeeds, THE Chat_Panel SHALL update the UI to show the turn was interrupted and re-enable the input field.
4. WHEN `turn/interrupt` fails, THE Chat_Panel SHALL display an error message explaining the failure.

### Requirement 3: Rich Message Formatting

**User Story:** As a user, I want all message content (text, file searches, code blocks, etc.) to be properly formatted with syntax highlighting and structure, so that I can easily read and understand Codex's responses.

#### Acceptance Criteria

1. THE Chat_Panel SHALL render all assistant message text with full MDX support including headings, bold, italic, inline code, fenced code blocks, blockquotes, lists, and tables.
2. WHEN a code block is rendered, THE Chat_Panel SHALL apply syntax highlighting based on the language identifier.
3. WHEN a code block is rendered, THE Chat_Panel SHALL display a copy-to-clipboard button.
4. WHEN file search results are displayed, THE Chat_Panel SHALL format them as a structured list with file paths and match context.
5. THE Chat_Panel SHALL render all turn items (commands, file changes, tool calls, web searches) with consistent styling and clear visual hierarchy.

### Requirement 4: Responsive Layout During Streaming

**User Story:** As a user, I want the chat interface to remain responsive when I resize the window during streaming, so that the layout adapts smoothly without getting stuck.

#### Acceptance Criteria

1. WHEN a user resizes the application window while a turn is streaming, THE Chat_Panel SHALL reflow the message list to fit the new dimensions.
2. WHEN a user resizes the application window, THE Chat_Panel SHALL maintain scroll position relative to the bottom of the message list.
3. THE Chat_Panel SHALL use CSS flexbox or grid layouts that automatically adapt to container size changes.
4. THE Chat_Panel SHALL NOT use fixed pixel widths that prevent responsive behavior.

### Requirement 5: Project Removal from Recents

**User Story:** As a user, I want to remove entire projects from my recent projects list, so that I can clean up projects I no longer work on.

#### Acceptance Criteria

1. WHEN a user right-clicks on a project in the recent projects list, THE Sidebar SHALL display a context menu with a "Remove from Recents" option.
2. WHEN a user selects "Remove from Recents", THE System SHALL remove the project from the recent projects list.
3. WHEN a project is removed from recents, THE System SHALL persist the change so it remains removed after app restart.
4. WHEN a project is removed from recents, THE System SHALL NOT delete any sessions or data associated with that project.

### Requirement 6: Session Deletion Confirmation

**User Story:** As a user, I want to confirm before deleting a session, so that I don't accidentally lose conversation history.

#### Acceptance Criteria

1. WHEN a user clicks the delete button on a session, THE Sidebar SHALL display a confirmation dialog before proceeding.
2. THE confirmation dialog SHALL clearly state which session will be deleted and that the action cannot be undone.
3. WHEN a user confirms deletion, THE System SHALL proceed with deleting the session and its message history.
4. WHEN a user cancels the confirmation dialog, THE System SHALL NOT delete the session.

### Requirement 7: Application Loading Screen

**User Story:** As a user, I want to see a loading screen with a progress indicator when the app starts, so that I know the application is initializing and not frozen.

#### Acceptance Criteria

1. WHEN the application starts, THE System SHALL display a full-screen loading overlay with the application logo and a spinner.
2. THE loading screen SHALL display a status message indicating what is being initialized (e.g., "Starting Codex...", "Loading workspace...").
3. WHEN the Codex agent connection is established, THE System SHALL update the loading screen status to reflect the connection state.
4. WHEN all initialization is complete, THE System SHALL fade out the loading screen and reveal the main application UI.
5. IF initialization fails, THEN THE loading screen SHALL display an error message with a retry button.

### Requirement 8: Comprehensive Diff Viewer

**User Story:** As a user, I want to see file changes in a rich diff viewer with syntax highlighting and navigation, so that I can review what Codex modified before accepting changes.

#### Acceptance Criteria

1. WHEN a `fileChange` item is received, THE Chat_Panel SHALL display a collapsible diff viewer component showing all modified files.
2. THE Diff_Viewer SHALL use an accordion layout where each file is a separate expandable section showing the file path.
3. WHEN a file section is expanded, THE Diff_Viewer SHALL display the diff with syntax highlighting based on the file extension.
4. THE Diff_Viewer SHALL support both unified diff view and side-by-side diff view, selectable by the user.
5. THE Diff_Viewer SHALL highlight added lines in green, removed lines in red, and modified lines in yellow.
6. WHEN a user clicks on a file path in the diff viewer, THE System SHALL open that file in the Editor_Panel at the first changed line.
7. THE Diff_Viewer SHALL display line numbers for both old and new versions of the file.
8. THE Diff_Viewer SHALL provide navigation buttons to jump between changed files.

### Requirement 9: Editor File Refresh

**User Story:** As a user, I want the editor to automatically refresh when Codex modifies a file, so that I always see the latest content without restarting the app.

#### Acceptance Criteria

1. WHEN a file is modified by the Codex agent, THE Editor_Panel SHALL detect the change and reload the file content.
2. WHEN a file is reloaded in the editor, THE Editor_Panel SHALL preserve the user's cursor position if the line still exists.
3. WHEN a file is reloaded in the editor, THE Editor_Panel SHALL preserve the user's scroll position if possible.
4. IF the user has unsaved changes in the editor when a file is modified externally, THEN THE Editor_Panel SHALL display a conflict warning and offer to reload or keep local changes.
5. THE System SHALL use a file watcher to detect external file changes in real-time.

### Requirement 10: Diff Viewer Integration with File Changes

**User Story:** As a developer, I want the diff viewer to integrate seamlessly with the existing file change card, so that users have a consistent experience.

#### Acceptance Criteria

1. THE File_Change_Card SHALL include a "View Diff" button that expands the Diff_Viewer inline.
2. WHEN the Diff_Viewer is expanded, THE File_Change_Card SHALL display the full diff for all files in that change item.
3. THE Diff_Viewer SHALL use the `diff` field from the `FileChangeItem` if available, otherwise compute the diff from file contents.
4. THE Diff_Viewer SHALL handle cases where the original file does not exist (new file creation).
5. THE Diff_Viewer SHALL handle cases where the new file does not exist (file deletion).
