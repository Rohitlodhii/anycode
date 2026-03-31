import { Layers } from "lucide-react";
import type { ContextCompactionItem } from "@/stores/session-store";

type ContextCompactionBannerProps = {
  item: ContextCompactionItem;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ContextCompactionBanner({ item }: ContextCompactionBannerProps) {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <div className="h-px flex-1 bg-border/40" />
      <div className="flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-3 py-1">
        <Layers className="size-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
          Conversation history compacted
        </span>
      </div>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}
