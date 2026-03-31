import { FilePen, Loader2, CheckCircle2, XCircle, Ban } from "lucide-react";
import type { FileChangeItem } from "@/stores/session-store";
import { cn } from "@/utils/tailwind";

type FileChangeCardProps = {
  item: FileChangeItem;
};

const KIND_STYLES: Record<string, string> = {
  create: "bg-green-500/15 text-green-400 border-green-500/30",
  delete: "bg-red-500/15 text-red-400 border-red-500/30",
  update: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  rename: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
};

export function FileChangeCard({ item }: FileChangeCardProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
        <FilePen className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground flex-1">File Changes</span>
        <StatusIcon status={item.status} />
      </div>

      <ul className="px-3 py-2 space-y-1.5">
        {item.changes.map((change, index) => (
          <li key={`${change.path}-${index}`} className="flex items-center gap-2">
            <KindBadge kind={change.kind} />
            <span className="text-xs text-foreground/80 font-mono truncate flex-1">
              {change.path}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const normalizedKind = normalizeKind(kind);
  const style = KIND_STYLES[normalizedKind] ?? "bg-muted/40 text-muted-foreground border-border/50";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide shrink-0",
        style
      )}
    >
      {getKindLabel(kind)}
    </span>
  );
}

function normalizeKind(kind: string) {
  return typeof kind === "string" ? kind.toLowerCase() : "update";
}

function getKindLabel(kind: string) {
  if (typeof kind !== "string") {
    return "UPDATE";
  }

  return kind.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
}

function StatusIcon({ status }: { status: FileChangeItem["status"] }) {
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
