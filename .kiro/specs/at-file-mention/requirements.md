# Requirements Document

## Introduction

This feature adds `@`-mention file path autocomplete to the chat input in the Codex panel. When a user types `@` in the chat input, the system scans the current working project folder for files and presents a fuzzy-matched popup menu above the input. Selecting a file inserts its relative path into the message, which Codex CLI interprets as a file reference (e.g. `@src/app.tsx`).

## Glossary

- **At-mention**: The `@` character typed in the chat input that triggers file path autocomplete.
- **File_Picker**: The popup menu component that displays fuzzy-matched file suggestions above the chat input.
- **Query**: The text typed after `@` used to filter file suggestions.
- **Project_Root**: The `projectPath` of the active session — the root directory scanned for files.
- **Relative_Path**: A file path expressed relative to the `Project_Root` (e.g. `src/app.tsx`).
- **File_Index**: The in-memory flat list of all file paths (files only, not folders) under the `Project_Root`.
- **Fuzzy_Match**: A substring or fuzzy ranking algorithm that scores file names against the query.
- **Chat_Input**: The `AI_Prompt` textarea component used to compose messages in the Codex chat panel.

---

## Requirements

### Requirement 1: Trigger File Picker on `@`

**User Story:** As a developer, I want to trigger a file suggestion popup by typing `@` in the chat input, so that I can quickly reference project files without leaving the keyboard.

#### Acceptance Criteria

1. WHEN a user types `@` in the Chat_Input, THE File_Picker SHALL open and display file suggestions from the File_Index.
2. WHEN the Chat_Input value does not contain an active `@` query, THE File_Picker SHALL remain closed.
3. WHEN a user types `@` and then presses Escape, THE File_Picker SHALL close and the `@` character SHALL remain in the input.
4. WHEN the File_Index is empty or the Project_Root has no files, THE File_Picker SHALL display a "No files found" message instead of suggestions.

---

### Requirement 2: Fuzzy File Search

**User Story:** As a developer, I want the file suggestions to be filtered by what I type after `@`, so that I can narrow down to the file I need quickly.

#### Acceptance Criteria

1. WHEN a user types characters after `@` (e.g. `@app`), THE File_Picker SHALL display only files whose name or Relative_Path contains the Query (case-insensitive).
2. WHEN the Query matches multiple files, THE File_Picker SHALL rank results so that files whose name starts with the Query appear before files that only contain the Query elsewhere.
3. WHEN the Query matches no files, THE File_Picker SHALL display a "No matches" message.
4. THE File_Picker SHALL display at most 10 suggestions at a time to avoid overwhelming the user.

---

### Requirement 3: Keyboard Navigation

**User Story:** As a developer, I want to navigate the file suggestions with arrow keys and select with Enter, so that I can pick a file without using the mouse.

#### Acceptance Criteria

1. WHEN the File_Picker is open, pressing ArrowDown SHALL move the selection highlight to the next suggestion.
2. WHEN the File_Picker is open, pressing ArrowUp SHALL move the selection highlight to the previous suggestion.
3. WHEN the selection is on the last suggestion and ArrowDown is pressed, THE File_Picker SHALL wrap the selection to the first suggestion.
4. WHEN the selection is on the first suggestion and ArrowUp is pressed, THE File_Picker SHALL wrap the selection to the last suggestion.
5. WHEN a suggestion is highlighted and Enter is pressed, THE File_Picker SHALL insert the selected file's Relative_Path into the Chat_Input and close the File_Picker.

---

### Requirement 4: Mouse Selection

**User Story:** As a developer, I want to click a file suggestion to select it, so that I can use the mouse when preferred.

#### Acceptance Criteria

1. WHEN a user clicks a suggestion in the File_Picker, THE Chat_Input SHALL replace the `@query` token with `@<Relative_Path>` and close the File_Picker.
2. WHEN a user hovers over a suggestion, THE File_Picker SHALL highlight that suggestion visually.

---

### Requirement 5: Path Insertion Format

**User Story:** As a developer, I want the selected file path to be inserted in the format Codex CLI expects, so that Codex can correctly reference the file.

#### Acceptance Criteria

1. WHEN a file is selected from the File_Picker, THE Chat_Input SHALL insert the file reference as `@<relative_path>` (e.g. `@src/app.tsx`).
2. WHEN a file is selected, THE Chat_Input SHALL replace only the `@<query>` token with the full `@<relative_path>`, preserving any other text already in the input.
3. WHEN a file is selected, THE Chat_Input SHALL place the cursor immediately after the inserted path followed by a space.

---

### Requirement 6: File Index Loading

**User Story:** As a developer, I want the file list to be loaded from the current project folder, so that suggestions are always relevant to the open project.

#### Acceptance Criteria

1. WHEN the Codex chat panel mounts with a valid `projectPath`, THE File_Index SHALL be populated by scanning all files under the `Project_Root` up to a reasonable depth.
2. THE File_Index SHALL exclude hidden files and folders (names starting with `.`) and the `node_modules` directory.
3. WHEN the `projectPath` changes, THE File_Index SHALL be refreshed to reflect the new project.
4. THE File_Index SHALL contain only files (not folders) with their Relative_Path from the `Project_Root`.

---

### Requirement 7: Popup Positioning

**User Story:** As a developer, I want the file suggestion popup to appear above the chat input, so that it does not obscure the conversation history.

#### Acceptance Criteria

1. WHEN the File_Picker is open, THE File_Picker SHALL be rendered above the Chat_Input, anchored to the input wrapper element.
2. WHEN the File_Picker list is taller than the available space, THE File_Picker SHALL be scrollable.
3. THE File_Picker SHALL visually match the existing SlashCommandCard style (border, backdrop blur, popover background).
