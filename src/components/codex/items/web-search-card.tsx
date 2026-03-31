import { Search } from "lucide-react";
import type { WebSearchItem } from "@/stores/session-store";
import { cn } from "@/utils/tailwind";

type WebSearchCardProps = {
  item: WebSearchItem;
};

const ACTION_STYLES: Record<string, string> = {
  search: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  fetch: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

export function WebSearchCard({ item }: WebSearchCardProps) {
  const actionType = item.action?.type ?? "search";
  const actionStyle =
    ACTION_STYLES[actionType.toLowerCase()] ??
    "bg-muted/40 text-muted-foreground border-border/50";

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <Search className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-foreground/80 flex-1 truncate">{item.query}</span>
        <span
          className={cn(
            "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide shrink-0",
            actionStyle
          )}
        >
          {actionType}
        </span>
      </div>
    </div>
  );
}
