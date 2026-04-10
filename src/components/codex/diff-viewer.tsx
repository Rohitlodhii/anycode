import { useState, useCallback } from "react";
import { Diff, Hunk, parseDiff } from "react-diff-view";
import type { FileData, HunkData } from "react-diff-view";
import { FilePlus, FileX, FileEdit, File, ExternalLink, Check, X, Code2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FileChangeItem } from "@/stores/session-store";
import "react-diff-view/style/index.css";

type ViewType = "unified" | "split" | "monaco";

interface DiffViewerProps {
  changes?: FileChangeItem["changes"] | null;
  onOpenFile: (path: string, line?: number) => void;
  onAccept?: (changePaths: string[]) => void;
  onReject?: (changePaths: string[]) => void;
}

export function DiffViewer({ changes, onOpenFile, onAccept, onReject }: DiffViewerProps) {
  const [viewType, setViewType] = useState<ViewType>("unified");
  const [acceptedFiles, setAcceptedFiles] = useState<Set<string>>(new Set());
  const [rejectedFiles, setRejectedFiles] = useState<Set<string>>(new Set());

  const safeChanges = Array.isArray(changes)
    ? changes.filter(
        (change): change is NonNullable<FileChangeItem["changes"]>[number] =>
          Boolean(change && typeof change.path === "string")
      )
    : [];

  const handleAcceptFile = useCallback((path: string) => {
    setAcceptedFiles((prev) => new Set([...prev, path]));
    setRejectedFiles((prev) => { const s = new Set(prev); s.delete(path); return s; });
    onAccept?.([path]);
  }, [onAccept]);

  const handleRejectFile = useCallback((path: string) => {
    setRejectedFiles((prev) => new Set([...prev, path]));
    setAcceptedFiles((prev) => { const s = new Set(prev); s.delete(path); return s; });
    onReject?.([path]);
  }, [onReject]);

  const handleAcceptAll = useCallback(() => {
    const paths = safeChanges.map((c) => c.path);
    setAcceptedFiles(new Set(paths));
    setRejectedFiles(new Set());
    onAccept?.(paths);
  }, [safeChanges, onAccept]);

  const handleRejectAll = useCallback(() => {
    const paths = safeChanges.map((c) => c.path);
    setRejectedFiles(new Set(paths));
    setAcceptedFiles(new Set());
    onReject?.(paths);
  }, [safeChanges, onReject]);

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">
          {safeChanges.length} file{safeChanges.length !== 1 ? "s" : ""} changed
        </span>
        <div className="flex items-center gap-2">
          {(onAccept || onReject) && safeChanges.length > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] gap-1 border-green-500/40 text-green-400 hover:bg-green-500/10 hover:text-green-300"
                onClick={handleAcceptAll}
              >
                <Check className="size-3" />
                Accept all
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] gap-1 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                onClick={handleRejectAll}
              >
                <X className="size-3" />
                Reject all
              </Button>
            </div>
          )}
          <Tabs value={viewType} onValueChange={(v) => setViewType(v as ViewType)}>
            <TabsList className="h-7">
              <TabsTrigger value="unified" className="text-xs px-2 h-5">Unified</TabsTrigger>
              <TabsTrigger value="split" className="text-xs px-2 h-5">Split</TabsTrigger>
              <TabsTrigger value="monaco" className="text-xs px-2 h-5 gap-1">
                <Code2 className="size-3" />
                Editor
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* File list */}
      <Accordion type="multiple" className="w-full space-y-1">
        {safeChanges.map((change, idx) => {
          const parsedFiles = parseUnifiedDiff(change.diff);
          const file: FileData | undefined = parsedFiles[0];
          const isAccepted = acceptedFiles.has(change.path);
          const isRejected = rejectedFiles.has(change.path);

          return (
            <AccordionItem
              key={`${change.path}-${idx}`}
              value={`file-${idx}`}
              className={cn(
                "rounded-lg border overflow-hidden",
                isAccepted && "border-green-500/40 bg-green-500/5",
                isRejected && "border-red-500/40 bg-red-500/5 opacity-60",
                !isAccepted && !isRejected && "border-border/50 bg-muted/10"
              )}
            >
              <AccordionTrigger className="hover:no-underline py-2 px-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileChangeIcon kind={change.kind} />
                  <span className="font-mono text-xs truncate flex-1 text-left">
                    {change.path}
                  </span>
                  {isAccepted && <span className="text-[10px] text-green-400 font-medium shrink-0">Accepted</span>}
                  {isRejected && <span className="text-[10px] text-red-400 font-medium shrink-0">Rejected</span>}
                  <Badge variant={getChangeBadgeVariant(change.kind)} className="shrink-0">
                    {change.kind}
                  </Badge>
                </div>
              </AccordionTrigger>

              <AccordionContent>
                <div className="space-y-2 px-3 pb-3">
                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      onClick={() => onOpenFile(change.path, getFirstChangedLine(file))}
                    >
                      <ExternalLink className="size-3" />
                      Open in Editor
                    </Button>
                    {(onAccept || onReject) && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs gap-1 border-green-500/40 text-green-400 hover:bg-green-500/10 hover:text-green-300"
                          onClick={() => handleAcceptFile(change.path)}
                          disabled={isAccepted}
                        >
                          <Check className="size-3" />
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs gap-1 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          onClick={() => handleRejectFile(change.path)}
                          disabled={isRejected}
                        >
                          <X className="size-3" />
                          Reject
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Diff content */}
                  {file ? (
                    viewType === "monaco" ? (
                      <MonacoDiffView file={file} diff={change.diff} />
                    ) : (
                      <div className="rounded border border-border/40 overflow-x-auto text-xs diff-themed">
                        <Diff
                          viewType={viewType === "split" ? "split" : "unified"}
                          diffType={file.type}
                          hunks={file.hunks}
                        >
                          {(hunks: HunkData[]) =>
                            hunks.map((hunk) => (
                              <Hunk key={hunk.content} hunk={hunk} />
                            ))
                          }
                        </Diff>
                      </div>
                    )
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No diff available
                    </p>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

// --- Monaco Diff View ---

import MonacoEditor, { DiffEditor } from "@monaco-editor/react";

function MonacoDiffView({ file, diff }: { file: FileData; diff?: string }) {
  // Extract original and modified content from hunks
  const { original, modified } = extractDiffContent(file, diff);

  return (
    <div className="rounded border border-border/40 overflow-hidden" style={{ height: 320 }}>
      <DiffEditor
        original={original}
        modified={modified}
        language={detectLanguage(file)}
        theme="vs-dark"
        options={{
          readOnly: true,
          renderSideBySide: false,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineNumbers: "on",
          folding: false,
          renderOverviewRuler: false,
          overviewRulerLanes: 0,
          scrollbar: { vertical: "auto", horizontal: "auto" },
          diffWordWrap: "off",
        }}
      />
    </div>
  );
}

// --- Helpers ---

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function parseUnifiedDiff(rawDiff: string | undefined): FileData[] {
  if (!rawDiff || !rawDiff.trim()) return [];
  try {
    return parseDiff(rawDiff);
  } catch {
    return [];
  }
}

function getFirstChangedLine(file: FileData | undefined): number | undefined {
  if (!file || !file.hunks.length) return undefined;
  return file.hunks[0].newStart;
}

function getChangeBadgeVariant(
  kind: string
): "success" | "destructive" | "warning" | "default" {
  const normalized = kind.toLowerCase();
  if (normalized === "create" || normalized === "add") return "success";
  if (normalized === "delete") return "destructive";
  if (normalized === "update" || normalized === "modify") return "warning";
  return "default";
}

function FileChangeIcon({ kind }: { kind: string }) {
  const normalized = kind.toLowerCase();
  if (normalized === "create" || normalized === "add") {
    return <FilePlus className="size-3.5 text-green-500 shrink-0" />;
  }
  if (normalized === "delete") {
    return <FileX className="size-3.5 text-red-500 shrink-0" />;
  }
  if (normalized === "update" || normalized === "modify") {
    return <FileEdit className="size-3.5 text-yellow-500 shrink-0" />;
  }
  return <File className="size-3.5 text-muted-foreground shrink-0" />;
}

function detectLanguage(file: FileData): string {
  // Try to get path from oldPath or newPath
  const path = (file as FileData & { newPath?: string; oldPath?: string }).newPath
    ?? (file as FileData & { newPath?: string; oldPath?: string }).oldPath
    ?? "";
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", java: "java", cs: "csharp",
    cpp: "cpp", c: "c", h: "c", css: "css", scss: "scss",
    html: "html", json: "json", yaml: "yaml", yml: "yaml",
    md: "markdown", sh: "shell", bash: "shell",
  };
  return map[ext] ?? "plaintext";
}

function extractDiffContent(file: FileData, _rawDiff?: string): { original: string; modified: string } {
  // Reconstruct original and modified from hunks
  const originalLines: string[] = [];
  const modifiedLines: string[] = [];

  for (const hunk of file.hunks) {
    for (const change of hunk.changes) {
      if (change.type === "normal") {
        originalLines.push(change.content.replace(/^\s/, ""));
        modifiedLines.push(change.content.replace(/^\s/, ""));
      } else if (change.type === "delete") {
        originalLines.push(change.content.replace(/^-/, ""));
      } else if (change.type === "insert") {
        modifiedLines.push(change.content.replace(/^\+/, ""));
      }
    }
  }

  return {
    original: originalLines.join("\n"),
    modified: modifiedLines.join("\n"),
  };
}
