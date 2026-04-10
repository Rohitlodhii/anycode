import {
  Cpu,
  Layers,
  MessageSquare,
  Server,
  ShieldCheck,
  ShieldOff,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/tailwind";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlashCommandContext = {
  sessionId: string;
  setCollaborationMode: (sessionId: string, mode: "plan" | "default") => void;
  setApprovalPolicy: (sessionId: string, policy: "untrusted" | "never") => void;
  openModelPicker: () => void;
  openEffortPicker: () => void;
  openMcpPanel: () => void;
};

export type SlashCommand = {
  name: string;
  description: string;
  icon: LucideIcon;
  action: () => void;
};

export type UseSlashCommandsReturn = {
  isOpen: boolean;
  filtered: SlashCommand[];
  selectedIndex: number;
  onKeyDown: (e: React.KeyboardEvent) => void;
  dismiss: () => void;
};

// ---------------------------------------------------------------------------
// Hook: useSlashCommands
// ---------------------------------------------------------------------------

/**
 * Manages slash command suggestion state for the chat input bar.
 *
 * - Opens when inputValue starts with "/"
 * - Filters ALL_COMMANDS by name or description (case-insensitive)
 * - Tracks selectedIndex for keyboard navigation
 */
export function useSlashCommands(
  inputValue: string,
  context: SlashCommandContext
): UseSlashCommandsReturn {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  // Track the last input that triggered a dismiss so re-opening works on new input
  const lastDismissedInput = useRef<string>("");

  const allCommands = useMemo<SlashCommand[]>(
    () => buildCommandRegistry(context),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      context.sessionId,
      context.setCollaborationMode,
      context.setApprovalPolicy,
      context.openModelPicker,
      context.openEffortPicker,
      context.openMcpPanel,
    ]
  );

  // Derive open state and filtered list from inputValue
  const isSlashInput = inputValue.startsWith("/");
  const query = isSlashInput ? inputValue.slice(1) : "";

  const filtered = useMemo<SlashCommand[]>(() => {
    if (!isSlashInput) return [];
    if (!query) return allCommands;
    const lower = query.toLowerCase();
    return allCommands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(lower) ||
        cmd.description.toLowerCase().includes(lower)
    );
  }, [isSlashInput, query, allCommands]);

  // Re-open if input changes after a dismiss (user typed more)
  const isOpen =
    isSlashInput &&
    filtered.length > 0 &&
    !(dismissed && lastDismissedInput.current === inputValue);

  // Reset selectedIndex when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length, inputValue]);

  // Reset dismissed flag when input changes to something new
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

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[selectedIndex];
        if (cmd) cmd.action();
      } else if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    },
    [isOpen, filtered, selectedIndex, dismiss]
  );

  return { isOpen, filtered, selectedIndex, onKeyDown, dismiss };
}

// ---------------------------------------------------------------------------
// Pure filter function (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Pure function: given an input string and a list of commands, returns the
 * filtered subset that should be shown in the suggestion card.
 *
 * - Returns [] when input does not start with "/"
 * - Returns all commands when input is exactly "/"
 * - Otherwise filters by name or description containing the suffix (case-insensitive)
 */
export function filterSlashCommands(
  inputValue: string,
  commands: Pick<SlashCommand, "name" | "description">[]
): Pick<SlashCommand, "name" | "description">[] {
  if (!inputValue.startsWith("/")) return [];
  const query = inputValue.slice(1);
  if (!query) return commands;
  const lower = query.toLowerCase();
  return commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(lower) ||
      cmd.description.toLowerCase().includes(lower)
  );
}

// ---------------------------------------------------------------------------
// Command registry builder
// ---------------------------------------------------------------------------

function buildCommandRegistry(ctx: SlashCommandContext): SlashCommand[] {
  return [
    {
      name: "model",
      description: "Switch response model for this thread",
      icon: Cpu,
      action: () => ctx.openModelPicker(),
    },
    {
      name: "plan",
      description: "Switch this thread into plan mode",
      icon: Layers,
      action: () => ctx.setCollaborationMode(ctx.sessionId, "plan"),
    },
    {
      name: "default",
      description: "Switch this thread back to normal chat mode",
      icon: MessageSquare,
      action: () => ctx.setCollaborationMode(ctx.sessionId, "default"),
    },
    {
      name: "mcp",
      description: "Open the MCP server status panel",
      icon: Server,
      action: () => ctx.openMcpPanel(),
    },
    {
      name: "effort",
      description: "Open the reasoning effort picker",
      icon: Zap,
      action: () => ctx.openEffortPicker(),
    },
    {
      name: "supervised",
      description: "Set access level to supervised (approve before executing)",
      icon: ShieldCheck,
      action: () => ctx.setApprovalPolicy(ctx.sessionId, "untrusted"),
    },
    {
      name: "full-access",
      description: "Set access level to full access (execute without prompting)",
      icon: ShieldOff,
      action: () => ctx.setApprovalPolicy(ctx.sessionId, "never"),
    },
  ];
}

// ---------------------------------------------------------------------------
// SlashCommandCard component
// ---------------------------------------------------------------------------

type SlashCommandCardProps = {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  /** Ref to the input wrapper — card is positioned above this element */
  anchorRef: React.RefObject<HTMLElement | null>;
};

/**
 * Absolutely-positioned card that appears above the input bar.
 * Uses `position: absolute; bottom: calc(100% + 8px)` relative to the
 * `anchorRef` container (which must have `position: relative`).
 */
export function SlashCommandCard({
  commands,
  selectedIndex,
  onSelect,
  anchorRef: _anchorRef,
}: SlashCommandCardProps) {
  return (
    <div
      className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-50 overflow-hidden rounded-xl border border-border/70 bg-popover shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)] backdrop-blur"
      role="listbox"
      aria-label="Slash commands"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Commands
        </span>
      </div>
      <div className="py-1">
        {commands.map((cmd, index) => {
          const Icon = cmd.icon;
          const isSelected = index === selectedIndex;
          return (
            <button
              key={cmd.name}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                isSelected
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-accent/50"
              )}
              onPointerDown={(e) => {
                // Use pointerdown to fire before the input loses focus
                e.preventDefault();
                onSelect(cmd);
              }}
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold">/{cmd.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {cmd.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
