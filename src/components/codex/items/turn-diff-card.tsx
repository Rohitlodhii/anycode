import { Diff, Copy } from "lucide-react";
import { useState } from "react";
import type { TurnDiffItem } from "@/stores/session-store";

export function TurnDiffCard({ item }: { item: TurnDiffItem }) {
  const [copied, setCopied] = useState(false);

  const hasDiff = Boolean(item.diff?.trim());

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden font-mono text-xs">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/30">
        <Diff className="size-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 truncate text-foreground font-medium">Turn diff</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
          onClick={async () => {
            if (!hasDiff) return;
            await navigator.clipboard.writeText(item.diff);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
          aria-label="Copy diff to clipboard"
          disabled={!hasDiff}
        >
          <Copy className="size-3" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <pre className="px-3 py-2 text-[11px] leading-5 text-foreground/80 whitespace-pre-wrap wrap-break-word max-h-64 overflow-y-auto">
        {hasDiff ? item.diff : "No diff yet."}
      </pre>
    </div>
  );
}

