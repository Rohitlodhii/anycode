import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/tailwind";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FileSuggestion = {
  /** File name only, e.g. "app.tsx" */
  name: string;
  /** Path relative to project root, e.g. "src/app.tsx" */
  relativePath: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_SUGGESTIONS = 10;

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------

/**
 * Returns the active @query token from the input, or null if none.
 *
 * Matches `@` preceded by start-of-string or whitespace, followed by
 * non-whitespace characters at end of string.
 *
 * Examples:
 *   "fix the bug in @src/ap"  → "src/ap"
 *   "@app"                    → "app"
 *   "@src/app.tsx fix this"   → null  (space after token)
 *   "hello @"                 → ""    (empty query)
 *   "no mention here"         → null
 */
export function extractAtQuery(inputValue: string): string | null {
  const match = inputValue.match(/(?:^|(?<=\s))@(\S*)$/);
  if (match === null) return null;
  return match[1] ?? "";
}

/**
 * Fuzzy-filter and rank files against query.
 * - Case-insensitive substring match on name or relativePath
 * - Files whose name starts with the query are ranked first
 * - Returns at most MAX_SUGGESTIONS results
 */
export function fuzzyFilterFiles(
  query: string,
  files: FileSuggestion[]
): FileSuggestion[] {
  const lower = query.toLowerCase();

  const nameStarts: FileSuggestion[] = [];
  const others: FileSuggestion[] = [];

  for (const file of files) {
    const nameLower = file.name.toLowerCase();
    const pathLower = file.relativePath.toLowerCase();

    if (nameLower.includes(lower) || pathLower.includes(lower)) {
      if (nameLower.startsWith(lower)) {
        nameStarts.push(file);
      } else {
        others.push(file);
      }
    }
  }

  return [...nameStarts, ...others].slice(0, MAX_SUGGESTIONS);
}

/**
 * Replace the @query token in inputValue with @relativePath + space.
 * Preserves all text before and after the @query token.
 */
export function insertFilePath(
  inputValue: string,
  query: string,
  relativePath: string
): string {
  // Build a regex that matches the active @query token at end of string
  // Escape special regex chars in query
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`((?:^|(?<=\\s)))@${escapedQuery}$`);
  return inputValue.replace(pattern, `$1@${relativePath} `);
}

// ---------------------------------------------------------------------------
// Hook: useAtFileMention
// ---------------------------------------------------------------------------

export type UseAtFileMentionReturn = {
  isOpen: boolean;
  suggestions: FileSuggestion[];
  selectedIndex: number;
  fileIndexEmpty: boolean;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSelect: (suggestion: FileSuggestion) => void;
  dismiss: () => void;
};

/**
 * Manages @-file mention autocomplete state for the chat input.
 *
 * - Loads the file index from `window.api.listFiles(projectPath)` on mount
 *   and whenever `projectPath` changes.
 * - Detects the active `@query` token in `inputValue`.
 * - Computes fuzzy-filtered suggestions.
 * - Manages keyboard navigation with wrap-around.
 * - On selection: calls `insertFilePath` and passes result to `onValueChange`.
 * - On Escape: dismisses the picker (keeps `@` in input).
 */
export function useAtFileMention(
  inputValue: string,
  projectPath: string,
  onValueChange: (newValue: string) => void
): UseAtFileMentionReturn {
  const [fileIndex, setFileIndex] = useState<FileSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const lastDismissedInput = useRef<string>("");

  // Load file index when projectPath changes
  useEffect(() => {
    if (!projectPath) {
      setFileIndex([]);
      return;
    }
    let cancelled = false;
    window.api
      .listFiles(projectPath)
      .then((paths) => {
        if (cancelled) return;
        const suggestions: FileSuggestion[] = paths.map((relativePath) => {
          const parts = relativePath.split("/");
          const name = parts[parts.length - 1] ?? relativePath;
          return { name, relativePath };
        });
        setFileIndex(suggestions);
      })
      .catch(() => {
        if (!cancelled) setFileIndex([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  // Derive active query
  const query = useMemo(() => extractAtQuery(inputValue), [inputValue]);
  const isActive = query !== null;

  // Compute suggestions
  const suggestions = useMemo<FileSuggestion[]>(() => {
    if (!isActive) return [];
    return fuzzyFilterFiles(query, fileIndex);
  }, [isActive, query, fileIndex]);

  // Re-open if input changes after a dismiss
  const isOpen =
    isActive &&
    !(dismissed && lastDismissedInput.current === inputValue);

  // Reset selectedIndex when suggestions or query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions.length, query]);

  // Reset dismissed flag when input changes
  useEffect(() => {
    if (inputValue !== lastDismissedInput.current) {
      setDismissed(false);
    }
  }, [inputValue]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    lastDismissedInput.current = inputValue;
    setSelectedIndex(0);
  }, [inputValue]);

  const onSelect = useCallback(
    (suggestion: FileSuggestion) => {
      if (query === null) return;
      const newValue = insertFilePath(inputValue, query, suggestion.relativePath);
      onValueChange(newValue);
      setDismissed(false);
      setSelectedIndex(0);
    },
    [inputValue, query, onValueChange]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (suggestions.length > 0) {
          setSelectedIndex((i) => (i + 1) % suggestions.length);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (suggestions.length > 0) {
          setSelectedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        }
      } else if (e.key === "Enter") {
        if (suggestions.length > 0) {
          e.preventDefault();
          const suggestion = suggestions[selectedIndex];
          if (suggestion) onSelect(suggestion);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    },
    [isOpen, suggestions, selectedIndex, onSelect, dismiss]
  );

  return {
    isOpen,
    suggestions,
    selectedIndex,
    fileIndexEmpty: fileIndex.length === 0,
    onKeyDown,
    onSelect,
    dismiss,
  };
}

// ---------------------------------------------------------------------------
// AtFileMentionCard component
// ---------------------------------------------------------------------------

type AtFileMentionCardProps = {
  suggestions: FileSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: FileSuggestion) => void;
  /** Ref to the input wrapper — card is positioned above this element */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Whether the file index is empty (no files in project) */
  fileIndexEmpty?: boolean;
};

/**
 * Absolutely-positioned card that appears above the input bar.
 * Styled identically to SlashCommandCard.
 */
export function AtFileMentionCard({
  suggestions,
  selectedIndex,
  onSelect,
  anchorRef: _anchorRef,
  fileIndexEmpty = false,
}: AtFileMentionCardProps) {
  return (
    <div
      className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-50 overflow-hidden rounded-xl border border-border/70 bg-popover shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)] backdrop-blur"
      role="listbox"
      aria-label="File suggestions"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Files
        </span>
      </div>

      {fileIndexEmpty ? (
        <div className="px-3 py-3 text-sm text-muted-foreground">
          No files found
        </div>
      ) : suggestions.length === 0 ? (
        <div className="px-3 py-3 text-sm text-muted-foreground">
          No matches
        </div>
      ) : (
        <div className="max-h-60 overflow-y-auto py-1">
          {suggestions.map((suggestion, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={suggestion.relativePath}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                  isSelected
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent/50"
                )}
                onPointerDown={(e) => {
                  // Use pointerdown to fire before the input loses focus
                  e.preventDefault();
                  onSelect(suggestion);
                }}
              >
                <span className="font-medium">{suggestion.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {suggestion.relativePath}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
