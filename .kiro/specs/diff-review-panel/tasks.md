# Implementation Plan: Diff Review Panel

## Overview

Implement the diff review panel by enhancing the existing `DiffViewer` and `FileChangeCard` components, adding a new `DiffReviewPanel` with per-file accept/reject/undo backed by `window.api.writeFile`.

## Tasks

- [ ] 1. Add content reconstruction and line-stats utilities to `diff-viewer.tsx`
  - Export `extractDiffContent(file: FileData)` returning `{ original, modified }`
  - Export `computeLineStats(file: FileData)` returning `{ added, removed }`
  - Both are pure functions derived from parsed hunk data
  - _Requirements: 6.4_

- [ ] 1.1 Write property test for content reconstruction round-trip
  - **Property 5: Content reconstruction round-trip**
  - **Validates: Requirements 6.4**
  - Use fast-check to generate valid unified diffs, reconstruct content, verify applying the diff to original yields modified
  - _Feature: diff-review-panel, Property 5_

- [ ] 2. Create `DiffReviewPanel` component (`src/components/codex/diff-review-panel.tsx`)
  - [ ] 2.1 Implement `ReviewToolbar` sub-component
    - File count label, Unified/Split tabs, Accept All / Reject All buttons (only when fileCount > 1), Close button
    - _Requirements: 2.1, 2.4, 5.1_

  - [ ] 2.2 Write property test: bulk buttons appear for 2+ files only
    - **Property 6: Accept All / Reject All buttons appear for 2+ files**
    - **Validates: Requirements 5.1**
    - _Feature: diff-review-panel, Property 6_

  - [ ] 2.3 Implement `FileReviewRow` sub-component
    - File path, kind badge, line stats (+N / -N), Open in Editor button
    - Accept / Reject / Undo buttons with disabled states
    - Expandable diff area using `DiffViewer`
    - Inline error display when `writeFile` fails
    - _Requirements: 2.2, 2.5, 4.1, 4.4, 4.5, 4.6, 6.3_

  - [ ] 2.4 Write property test: panel renders all file metadata
    - **Property 1: Panel renders all file metadata**
    - **Validates: Requirements 2.1, 2.2**
    - _Feature: diff-review-panel, Property 1_

  - [ ] 2.5 Write property test: accept/reject disables the corresponding button
    - **Property 3: Accept/Reject disables the corresponding button**
    - **Validates: Requirements 4.4, 4.5**
    - _Feature: diff-review-panel, Property 3_

  - [ ] 2.6 Implement `DiffReviewPanel` root component
    - Owns `ReviewState` (decision, originalContent, newContent, error per file)
    - Initialises state by calling `extractDiffContent` for each file on mount
    - Wires `onAccept` / `onReject` / `onUndo` to `window.api.writeFile`
    - Passes `viewType` down to all `FileReviewRow` instances
    - _Requirements: 4.2, 4.3, 6.1, 6.2, 7.3, 7.4_

  - [ ] 2.7 Write property test: bulk action marks all eligible files
    - **Property 4: Bulk action marks all eligible files**
    - **Validates: Requirements 5.2, 5.3**
    - _Feature: diff-review-panel, Property 4_

- [ ] 3. Checkpoint — ensure all tests pass, ask the user if questions arise.

- [ ] 4. Enhance `DiffViewer` coloured line rendering
  - Verify `diff-line-insert` and `diff-line-delete` CSS classes are applied by `react-diff-view` (they already are via global.css)
  - Add `renderToken` prop if word-level highlights need strengthening
  - Ensure line numbers are rendered on both sides in unified and split modes
  - _Requirements: 3.1, 3.2, 3.5_

  - [ ] 4.1 Write property test: diff lines have correct CSS classes
    - **Property 2: Diff lines have correct CSS classes**
    - **Validates: Requirements 3.1, 3.2**
    - _Feature: diff-review-panel, Property 2_

- [ ] 5. Update `FileChangeCard` to use `DiffReviewPanel`
  - Replace the existing "View Diff" toggle with a "Review" / "Close Review" button
  - When open, render `DiffReviewPanel` below the file list
  - Pass `onAcceptChanges` and `onRejectChanges` through to the panel
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ] 5.1 Write unit tests for FileChangeCard review button
    - "Review" button is always visible
    - Clicking it opens the panel and changes label to "Close Review"
    - Clicking "Close Review" closes the panel
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ] 5.2 Write unit tests for accept/reject filesystem calls
    - Clicking Accept calls `window.api.writeFile` with new content
    - Clicking Reject calls `window.api.writeFile` with original content
    - Clicking Undo after Accept calls `window.api.writeFile` with original content
    - `writeFile` error shows inline error message
    - _Requirements: 4.2, 4.3, 6.1, 6.2, 6.3, 7.3_

- [ ] 6. Final checkpoint — ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- `window.api.writeFile` is already exposed via the Electron preload bridge
- `extractDiffContent` already exists in `diff-viewer.tsx` — it just needs to be exported and tested
- The existing `diff-themed` CSS in `global.css` already provides green/red line colours via `diff-line-insert` / `diff-line-delete` classes
- fast-check is already a dev dependency (used in `diff-viewer.test.tsx`)
