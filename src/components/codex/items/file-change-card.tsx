import { useState, useCallback } from "react";
import { FilePen, Loader2, CheckCircle2, XCircle, Ban } from "lucide-react";
import type { FileChangeItem } from "@/stores/session-store";
import { cn } from "@/utils/tailwind";
import { Button } from "@/components/ui/button";
import { DiffViewer } from "@/components/codex/diff-viewer";

type FileChangeCardProps = {
  item: FileChangeItem;
  onAcceptChanges?: (paths: string[]) => void;
  onRejectChanges?: (paths: string[]) => void;
};

const KIND_STYLES: Record<string, string> = {
  create: "bg-green-500/15 text-green-400 border-green-500/30",
  delete: "bg-red-500/15 text-red-400 border-red-500/30",
  update: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  rename: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
};

export function FileChangeCard({ item, onAcceptChanges, onRejectChanges }: FileChangeCardProps) {
  const [showDiff, setShowDiff] = useState(false);
  const changes = Array.isArray(item.changes)
    ? item.changes.filter(
        (change): change is NonNullable<FileChangeItem["changes"]>[number] =>
          Boolean(change && typeof change.path === "string")
      )
    : [];

  const handleOpenFile = async (path: string, line?: number) => {
    if (typeof window !== "undefined" && (window as any).editor?.openFile) {
      await (window as any).editor.openFile({ path, line });
    }
  };

  // Default reject: revert file to previous state via editor API
  const handleReject = useCallback(async (paths: string[]) => {
    if (onRejectChanges) {
      onRejectChanges(paths);
      return;
    }
    // Fallback: attempt to revert via editor API if available
    for (const path of paths) {
      if (typeof window !== "undefined" && (window as any).editor?.revertFile) {
        await (window as any).editor.revertFile({ path });
      }
    }
  }, [onRejectChanges]);

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
        <FilePen className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground flex-1">File Changes</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-2 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => setShowDiff((prev) => !prev)}
        >
          {showDiff ? "Hide Diff" : "View Diff"}
        </Button>
        <StatusIcon status={item.status} />
      </div>

      {!showDiff ? (
        <ul className="px-3 py-2 space-y-1.5">
          {changes.map((change, index) => (
            <li key={`${change.path}-${index}`} className="flex items-center gap-2">
              <KindBadge kind={change.kind} />
              <span className="text-xs text-foreground/80 font-mono truncate flex-1">
                {change.path}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-3 py-2">
          <DiffViewer
            changes={changes}
            onOpenFile={handleOpenFile}
            onAccept={onAcceptChanges}
            onReject={handleReject}
          />
        </div>
      )}
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
