import { Terminal, CheckCircle2, XCircle, Loader2, Ban } from "lucide-react";
import type { CommandItem } from "@/stores/session-store";
import { cn } from "@/utils/tailwind";

type CommandCardProps = {
  item: CommandItem;
};

export function CommandCard({ item }: CommandCardProps) {
  const durationLabel =
    item.durationMs !== undefined
      ? item.durationMs < 1000
        ? `${item.durationMs}ms`
        : `${(item.durationMs / 1000).toFixed(1)}s`
      : null;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden font-mono text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/30">
        <Terminal className="size-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 truncate text-foreground font-medium">{item.command}</span>
        <StatusIcon status={item.status} />
        {durationLabel && (
          <span className="text-muted-foreground/70 tabular-nums">{durationLabel}</span>
        )}
      </div>

      {/* CWD */}
      <div className="px-3 py-1 text-muted-foreground/60 text-[10px] border-b border-border/30">
        {item.cwd}
      </div>

      {/* Output */}
      {item.output && (
        <pre
          className={cn(
            "px-3 py-2 text-[11px] leading-5 text-foreground/80 whitespace-pre-wrap break-all max-h-48 overflow-y-auto",
            item.status === "inProgress" &&
              "after:content-['▋'] after:animate-pulse after:ml-0.5 after:text-muted-foreground"
          )}
        >
          {item.output}
        </pre>
      )}

      {/* Exit code */}
      {item.exitCode !== undefined && (
        <div className="px-3 py-1.5 border-t border-border/30 text-[10px] text-muted-foreground">
          Exit code: <span className={item.exitCode === 0 ? "text-green-500" : "text-red-400"}>{item.exitCode}</span>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: CommandItem["status"] }) {
  if (status === "inProgress") {
    return <Loader2 className="size-3.5 text-blue-400 animate-spin shrink-0" />;
  }
  if (status === "completed") {
    return <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />;
  }
  if (status === "failed") {
    return <XCircle className="size-3.5 text-red-400 shrink-0" />;
  }
  return <Ban className="size-3.5 text-muted-foreground shrink-0" />;
}
