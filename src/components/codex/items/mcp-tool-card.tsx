import { Wrench } from "lucide-react";
import type { McpToolCallItem } from "@/stores/session-store";
import { cn } from "@/utils/tailwind";

type McpToolCardProps = {
  item: McpToolCallItem;
};

const STATUS_STYLES: Record<string, string> = {
  inProgress: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  completed: "bg-green-500/15 text-green-400 border-green-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function McpToolCard({ item }: McpToolCardProps) {
  const statusStyle =
    STATUS_STYLES[item.status] ?? "bg-muted/40 text-muted-foreground border-border/50";

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <Wrench className="size-3.5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground/70 shrink-0">{item.server}</span>
            <span className="text-muted-foreground/40 text-xs">/</span>
            <span className="text-xs font-medium text-foreground font-mono">{item.tool}</span>
          </div>
        </div>
        <StatusBadge status={item.status} style={statusStyle} />
      </div>

      {item.error && (
        <div className="px-3 pb-2 text-xs text-red-400 font-mono">{item.error}</div>
      )}
    </div>
  );
}

function StatusBadge({ status, style }: { status: string; style: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide shrink-0",
        style
      )}
    >
      {status}
    </span>
  );
}
