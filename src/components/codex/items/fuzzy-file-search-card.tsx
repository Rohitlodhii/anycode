import { Search, CheckCircle2, Loader2 } from "lucide-react";
import type { FuzzyFileSearchItem } from "@/stores/session-store";
import { cn } from "@/utils/tailwind";

export function FuzzyFileSearchCard({ item }: { item: FuzzyFileSearchItem }) {
  const isDone = item.status === "completed";
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/30">
        <Search className="size-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 truncate text-xs font-medium text-foreground">
          File search
        </span>
        {isDone ? (
          <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />
        ) : (
          <Loader2 className="size-3.5 text-blue-400 animate-spin shrink-0" />
        )}
      </div>

      <div className="px-3 py-2 text-xs">
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Query
        </div>
        <div className="mt-1 font-mono text-[11px] text-foreground/80">
          {item.query || "—"}
        </div>
      </div>

      {item.files.length > 0 ? (
        <div className="border-t border-border/40 px-2 py-2">
          <div className="max-h-48 overflow-y-auto">
            {item.files.slice(0, 50).map((file) => (
              <div
                key={`${file.root}:${file.path}`}
                className={cn(
                  "flex items-start gap-2 rounded-md px-2 py-1 text-[11px] text-muted-foreground",
                  "hover:bg-muted/30"
                )}
              >
                <span className="font-medium text-foreground/85 truncate">
                  {file.fileName || file.path.split(/[\\/]/).pop() || file.path}
                </span>
                <span className="ml-auto shrink-0 tabular-nums text-muted-foreground/70">
                  {file.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

