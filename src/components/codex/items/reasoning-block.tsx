import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReasoningItem } from "@/stores/session-store";
import { cn } from "@/utils/tailwind";

type ReasoningBlockProps = {
  item: ReasoningItem;
};

export function ReasoningBlock({ item }: ReasoningBlockProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [displayMs, setDisplayMs] = useState(item.elapsedMs);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now() - item.elapsedMs);

  // Auto-collapse when streaming stops
  useEffect(() => {
    if (!item.isStreaming) {
      setIsExpanded(false);
      setDisplayMs(item.elapsedMs);
    }
  }, [item.isStreaming, item.elapsedMs]);

  // Tick elapsed time while streaming
  useEffect(() => {
    if (item.isStreaming) {
      startTimeRef.current = Date.now() - item.elapsedMs;
      intervalRef.current = setInterval(() => {
        setDisplayMs(Date.now() - startTimeRef.current);
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [item.isStreaming, item.elapsedMs]);

  const elapsedSeconds = (displayMs / 1000).toFixed(1);

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
      >
        <Brain className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground flex-1">
          {item.isStreaming ? "Thinking…" : "Thought"}
        </span>
        <span className="text-xs text-muted-foreground/70 tabular-nums">
          {elapsedSeconds}s
        </span>
        {isExpanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border/40 px-3 py-2">
          <p
            className={cn(
              "text-xs leading-5 text-muted-foreground whitespace-pre-wrap",
              item.isStreaming && "after:content-['▋'] after:animate-pulse after:ml-0.5"
            )}
          >
            {item.summaryText || (item.isStreaming ? "" : "No reasoning summary available.")}
          </p>
        </div>
      )}
    </div>
  );
}
