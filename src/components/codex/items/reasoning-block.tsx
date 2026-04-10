import { Brain } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReasoningItem } from "@/stores/session-store";
import { cn } from "@/utils/tailwind";

type ReasoningBlockProps = {
  item: ReasoningItem;
};

export function ReasoningBlock({ item }: ReasoningBlockProps) {
  const [displayMs, setDisplayMs] = useState(item.elapsedMs);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now() - item.elapsedMs);

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
      setDisplayMs(item.elapsedMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [item.isStreaming, item.elapsedMs]);

  const elapsedSeconds = (displayMs / 1000).toFixed(1);
  const summary = item.summaryText?.trim();

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-2.5 py-1.5 text-[11px] text-muted-foreground">
      <Brain className="size-3 text-muted-foreground/80 shrink-0" />
      <span className="font-medium">{item.isStreaming ? "Thinking..." : "Thought"}</span>
      <span className="tabular-nums text-muted-foreground/70">{elapsedSeconds}s</span>
      {summary ? (
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-muted-foreground/70",
            item.isStreaming && "after:content-['...'] after:ml-0.5 after:animate-pulse"
          )}
          title={summary}
        >
          {summary}
        </span>
      ) : null}
    </div>
  );
}
