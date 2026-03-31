import { Sparkles, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/utils/tailwind";

export type Skill = {
  name: string;
  description: string;
  shortDescription?: string;
};

type SkillsPickerProps = {
  /** All available skills for the current project */
  skills: Skill[];
  /** The current query after the `$` trigger (e.g. "fo" when user typed "$fo") */
  query: string;
  /** Called when the user selects a skill */
  onSelect: (skill: Skill) => void;
  /** Called when the picker should be dismissed without selection */
  onDismiss: () => void;
  /** Anchor element to position the popover above */
  anchorRef: React.RefObject<HTMLElement | null>;
};

/**
 * Floating popover that appears above the input bar when the user types `$`.
 * Filters skills by the query string and lets the user pick one.
 */
export function SkillsPicker({
  skills,
  query,
  onSelect,
  onDismiss,
  anchorRef,
}: SkillsPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ bottom: number; left: number; width: number } | null>(null);

  // Position the popover above the anchor element
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    setPosition({
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left,
      width: rect.width,
    });
  }, [anchorRef]);

  // Dismiss on outside click
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onDismiss]);

  // Dismiss on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onDismiss();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  const filtered = query
    ? skills.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.description.toLowerCase().includes(query.toLowerCase())
      )
    : skills;

  if (!position) return null;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 overflow-hidden rounded-xl border border-border/70 bg-popover shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)] backdrop-blur"
      style={{
        bottom: position.bottom,
        left: position.left,
        width: Math.min(position.width, 420),
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Zap className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-[0.14em]">
          Skills
        </span>
        {query && (
          <span className="ml-auto font-mono text-xs text-muted-foreground/70">
            ${query}
          </span>
        )}
      </div>

      <Command shouldFilter={false}>
        <CommandList>
          {filtered.length === 0 ? (
            <CommandEmpty>No skills match &ldquo;{query}&rdquo;</CommandEmpty>
          ) : (
            <CommandGroup>
              {filtered.map((skill) => (
                <CommandItem
                  key={skill.name}
                  value={skill.name}
                  onSelect={() => onSelect(skill)}
                  className="flex flex-col items-start gap-0.5 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium text-foreground">${skill.name}</span>
                  </div>
                  {(skill.shortDescription ?? skill.description) && (
                    <span className="ml-5.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {skill.shortDescription ?? skill.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill invocation badge — shown inside a user message bubble
// ---------------------------------------------------------------------------

type SkillBadgeProps = {
  skillName: string;
  className?: string;
};

export function SkillBadge({ skillName, className }: SkillBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
        className
      )}
    >
      <Sparkles className="size-3" />
      {skillName}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Hook: useSkillsPicker
// Manages the trigger logic for the `$` prefix in a textarea/input
// ---------------------------------------------------------------------------

export type UseSkillsPickerReturn = {
  /** Whether the picker is currently open */
  isOpen: boolean;
  /** The query string after `$` */
  query: string;
  /** Call this on every input change to detect the `$` trigger */
  onInputChange: (value: string) => void;
  /** Call this when a skill is selected; returns the updated input value */
  selectSkill: (skill: Skill, currentValue: string) => string;
  /** Close the picker */
  dismiss: () => void;
};

/**
 * Detects when the user types `$` in an input and manages picker open/close state.
 * The trigger is active when the cursor is immediately after a `$` (optionally followed by word chars).
 */
export function useSkillsPicker(): UseSkillsPickerReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  function onInputChange(value: string) {
    // Find the last `$` in the value and check if it's a trigger
    const dollarIdx = value.lastIndexOf("$");
    if (dollarIdx === -1) {
      setIsOpen(false);
      setQuery("");
      return;
    }

    // Text after the last `$`
    const afterDollar = value.slice(dollarIdx + 1);

    // Only trigger if the text after `$` is word characters (or empty)
    if (/^\w*$/.test(afterDollar)) {
      setIsOpen(true);
      setQuery(afterDollar);
    } else {
      setIsOpen(false);
      setQuery("");
    }
  }

  function selectSkill(skill: Skill, currentValue: string): string {
    // Replace the `$query` at the end of the input with `$skill-name `
    const dollarIdx = currentValue.lastIndexOf("$");
    if (dollarIdx === -1) return currentValue + `$${skill.name} `;
    const before = currentValue.slice(0, dollarIdx);
    return `${before}$${skill.name} `;
  }

  function dismiss() {
    setIsOpen(false);
    setQuery("");
  }

  return { isOpen, query, onInputChange, selectSkill, dismiss };
}
