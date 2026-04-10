# Requirements Document

## Introduction

A dedicated diff review panel that gives users a clear, visual way to review file changes proposed by the AI agent. The panel shows added lines in green and removed lines in red, supports accept/reject per file, and wires into the filesystem so accepting/rejecting actually applies or reverts the changes on disk.

## Glossary

- **Diff_Panel**: The full-screen or slide-over panel that renders the diff for all changed files in a turn.
- **File_Change_Card**: The inline card in the chat timeline that summarises changed files and contains the "Review" button.
- **Diff_Viewer**: The component that renders unified/split diff with coloured lines.
- **Accept**: Persist the AI-proposed file content to disk (keep the change).
- **Reject**: Revert the file to its pre-change content (undo the change).
- **Turn_Diff**: The raw unified-diff string attached to a `TurnDiffItem` or `FileChangeItem`.

---

## Requirements

### Requirement 1: Review Button on File Change Cards

**User Story:** As a user, I want a "Review" button on every file-change card in the chat, so that I can open the diff panel for that specific set of changes without leaving the conversation.

#### Acceptance Criteria

1. THE File_Change_Card SHALL display a "Review" button that is always visible (not hidden behind "View Diff").
2. WHEN the user clicks the "Review" button, THE Diff_Panel SHALL open and display the diffs for all files in that card.
3. WHEN the Diff_Panel is open, THE File_Change_Card SHALL visually indicate the panel is active (e.g. button label changes to "Close Review").
4. WHEN the user closes the Diff_Panel, THE File_Change_Card SHALL return to its default state.

---

### Requirement 2: Diff Panel Layout and Navigation

**User Story:** As a user, I want the diff panel to show all changed files clearly, so that I can navigate between them and understand what changed.

#### Acceptance Criteria

1. THE Diff_Panel SHALL display a header showing the total number of changed files (e.g. "3 files changed").
2. THE Diff_Panel SHALL list each changed file with its path, change kind badge (CREATE / UPDATE / DELETE), and line-count stats (+N / -N).
3. WHEN a file entry is clicked, THE Diff_Panel SHALL expand to show the full diff for that file.
4. THE Diff_Panel SHALL support Unified and Split view modes, switchable via tabs.
5. THE Diff_Panel SHALL allow the user to open any file directly in the editor via an "Open in Editor" button per file.

---

### Requirement 3: Coloured Diff Lines

**User Story:** As a user, I want added lines shown in green and removed lines shown in red, so that I can instantly understand what changed.

#### Acceptance Criteria

1. THE Diff_Viewer SHALL render inserted lines with a green background and a "+" prefix.
2. THE Diff_Viewer SHALL render deleted lines with a red background and a "−" prefix.
3. THE Diff_Viewer SHALL render unchanged context lines with a neutral background and no prefix colour.
4. WHILE in Split view, THE Diff_Viewer SHALL show the old version on the left (red) and the new version on the right (green).
5. THE Diff_Viewer SHALL display line numbers for both old and new sides.

---

### Requirement 4: Per-File Accept / Reject

**User Story:** As a user, I want to accept or reject each file's changes individually, so that I can keep some changes and discard others.

#### Acceptance Criteria

1. THE Diff_Panel SHALL show an "Accept" button and a "Reject" button for each file.
2. WHEN the user clicks "Accept" for a file, THE Diff_Panel SHALL write the new file content to disk and mark the file as "Accepted".
3. WHEN the user clicks "Reject" for a file, THE Diff_Panel SHALL restore the original file content on disk and mark the file as "Rejected".
4. WHEN a file is marked "Accepted", THE Diff_Panel SHALL disable the Accept button and visually distinguish the row (green tint).
5. WHEN a file is marked "Rejected", THE Diff_Panel SHALL disable the Reject button and visually distinguish the row (red tint, reduced opacity).
6. IF a file has already been accepted or rejected, THEN THE Diff_Panel SHALL allow the user to undo that decision via an "Undo" button.

---

### Requirement 5: Accept All / Reject All

**User Story:** As a user, I want to accept or reject all changes at once, so that I can quickly approve or discard an entire turn's output.

#### Acceptance Criteria

1. WHEN more than one file is changed, THE Diff_Panel SHALL display "Accept All" and "Reject All" buttons in the toolbar.
2. WHEN the user clicks "Accept All", THE Diff_Panel SHALL accept every file that has not already been individually rejected.
3. WHEN the user clicks "Reject All", THE Diff_Panel SHALL reject every file that has not already been individually accepted.

---

### Requirement 6: Filesystem Accept / Reject Implementation

**User Story:** As a developer, I want accept and reject to actually write or revert files on disk, so that the UI decisions have real effect.

#### Acceptance Criteria

1. WHEN a file is accepted, THE System SHALL call `window.api.writeFile(path, newContent)` with the content reconstructed from the diff.
2. WHEN a file is rejected, THE System SHALL call `window.api.writeFile(path, originalContent)` with the content reconstructed from the diff.
3. IF `window.api.writeFile` throws an error, THEN THE Diff_Panel SHALL display an inline error message for that file.
4. THE System SHALL reconstruct original and new file content from the unified diff hunks without requiring a separate network call.

---

### Requirement 7: Undo / Revert Support

**User Story:** As a user, I want to undo an accept or reject decision, so that I can change my mind after reviewing.

#### Acceptance Criteria

1. WHEN a file has been accepted, THE Diff_Panel SHALL show an "Undo" button that reverts the file to its pre-accept state.
2. WHEN a file has been rejected, THE Diff_Panel SHALL show an "Undo" button that re-applies the accepted content.
3. WHEN the user clicks "Undo", THE Diff_Panel SHALL write the appropriate content to disk and clear the accepted/rejected status for that file.
4. THE System SHALL keep the original and new content in memory for the lifetime of the Diff_Panel so undo is always possible.
