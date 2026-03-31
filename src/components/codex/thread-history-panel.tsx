import {
  AlertCircle,
  Archive,
  ChevronRight,
  Clock,
  GitFork,
  History,
  Loader2,
  MessageSquare,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/utils/tailwind";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ThreadEntry = {
  id: string;
  name: string | null;
  preview: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
};

type ThreadHistoryPanelProps = {
  sessionId: string;
  projectPath: string;
  onThreadResumed?: (newSessionId: string) => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseThreadList(raw: unknown): { threads: ThreadEntry[]; nextCursor: string | null } {
  if (!raw || typeof raw !== "object") return { threads: [], nextCursor: null };
  const response = raw as { data?: unknown[]; nextCursor?: string | null };
  if (!Array.isArray(response.data)) return { threads: [], nextCursor: null };

  const threads = response.data.map((item: unknown) => {
    const t = item as {
      id?: string;
      name?: string | null;
      preview?: string;
      createdAt?: number;
      updatedAt?: number;
      cwd?: string;
    };
    return {
      id: t.id ?? "",
      name: t.name ?? null,
      preview: t.preview ?? "",
      createdAt: t.createdAt ?? 0,
      updatedAt: t.updatedAt ?? 0,
      cwd: t.cwd ?? "",
    };
  });

  return { threads, nextCursor: response.nextCursor ?? null };
}

function formatRelativeTime(unixSeconds: number): string {
  const now = Date.now() / 1000;
  const diff = now - unixSeconds;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

  return new Date(unixSeconds * 1000).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Thread row
// ---------------------------------------------------------------------------

type ThreadRowProps = {
  thread: ThreadEntry;
  sessionId: string;
  projectPath: string;
  onResumed: (newSessionId: string) => void;
  onRefresh: () => void;
};

function ThreadRow({ thread, sessionId, projectPath, onResumed, onRefresh }: ThreadRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isForking, setIsForking] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const createSession = useSessionStore((s) => s.createSession);
  const setSessionReady = useSessionStore((s) => s.setSessionReady);
  const setSessionError = useSessionStore((s) => s.setSessionError);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const setSessionArchived = useSessionStore((s) => s.setSessionArchived);

  const displayName = thread.name ?? (thread.preview.slice(0, 40) || "Untitled thread");

  async function handleResume() {
    setIsResuming(true);
    try {
      // Resume on the current session — call thread/resume with the stored threadId
      const result = await window.codex.rpcCall(sessionId, "thread/resume", {
        threadId: thread.id,
      });
      const response = result as { thread?: { id?: string } };
      const resumedThreadId = response?.thread?.id ?? thread.id;

      // Update the current session's threadId in the store
      const sessions = useSessionStore.getState().sessions;
      const session = sessions[sessionId];
      if (session) {
        // setSessionReady updates threadId among other fields
        setSessionReady(sessionId, {
          agentId: sessionId,
          cwd: session.projectPath,
          threadId: resumedThreadId,
          models: session.models,
          defaultModel: session.defaultModel,
        });
      }

      onResumed(sessionId);
    } catch (err) {
      setSessionError(sessionId, err instanceof Error ? err.message : "Failed to resume thread");
    } finally {
      setIsResuming(false);
    }
  }

  async function handleFork() {
    setIsForking(true);
    try {
      const result = await window.codex.rpcCall(sessionId, "thread/fork", {
        threadId: thread.id,
      });
      const response = result as { thread?: { id?: string } };
      const forkedThreadId = response?.thread?.id;

      if (forkedThreadId) {
        // Create a new session entry for the forked thread
        const newSessionId = createSession(projectPath);
        const sessions = useSessionStore.getState().sessions;
        const session = sessions[sessionId];
        setSessionReady(newSessionId, {
          agentId: newSessionId,
          cwd: projectPath,
          threadId: forkedThreadId,
          models: session?.models ?? [],
          defaultModel: session?.defaultModel ?? null,
        });
        setActiveSession(newSessionId);
        onResumed(newSessionId);
      }
    } catch (err) {
      console.error("Fork failed", err);
    } finally {
      setIsForking(false);
    }
  }

  async function handleArchive() {
    setIsArchiving(true);
    try {
      await window.codex.rpcCall(sessionId, "thread/archive", {
        threadId: thread.id,
      });
      // Mark the session as archived if it uses this thread
      const sessions = useSessionStore.getState().sessions;
      for (const [sid, s] of Object.entries(sessions)) {
        if (s.threadId === thread.id) {
          setSessionArchived(sid, true);
        }
      }
      onRefresh();
    } catch (err) {
      console.error("Archive failed", err);
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
      <button
        type="button"
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <MessageSquare className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground truncate">{displayName}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="size-3" />
                {formatRelativeTime(thread.createdAt)}
              </span>
              <ChevronRight
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  expanded && "rotate-90"
                )}
              />
            </div>
          </div>
          {thread.preview && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{thread.preview}</p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-3 py-2.5 space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Created</span>
            <span className="text-foreground font-medium">
              {new Date(thread.createdAt * 1000).toLocaleString()}
            </span>
            <span>Updated</span>
            <span className="text-foreground font-medium">
              {formatRelativeTime(thread.updatedAt)}
            </span>
            <span>Directory</span>
            <span className="text-foreground font-medium truncate" title={thread.cwd}>
              {thread.cwd}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              className="h-7 flex-1 gap-1.5 text-xs"
              onClick={() => void handleResume()}
              disabled={isResuming || isForking || isArchiving}
              type="button"
            >
              {isResuming ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Play className="size-3" />
              )}
              Resume
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 gap-1.5 text-xs"
              onClick={() => void handleFork()}
              disabled={isResuming || isForking || isArchiving}
              type="button"
            >
              {isForking ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <GitFork className="size-3" />
              )}
              Fork
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={() => void handleArchive()}
              disabled={isResuming || isForking || isArchiving}
              type="button"
              title="Archive thread"
            >
              {isArchiving ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Archive className="size-3" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ThreadHistoryPanel({
  sessionId,
  projectPath,
  onThreadResumed,
}: ThreadHistoryPanelProps) {
  const [threads, setThreads] = useState<ThreadEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchThreads = useCallback(
    async (cursor?: string) => {
      const isInitial = !cursor;
      if (isInitial) {
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const params: Record<string, unknown> = {
          cwd: projectPath,
          limit: 20,
        };
        if (cursor) params.cursor = cursor;

        const result = await window.codex.rpcCall(sessionId, "thread/list", params);
        const { threads: newThreads, nextCursor: newCursor } = parseThreadList(result);

        if (isInitial) {
          setThreads(newThreads);
        } else {
          setThreads((prev) => [...prev, ...newThreads]);
        }
        setNextCursor(newCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load threads");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [sessionId, projectPath]
  );

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  function handleThreadResumed(newSessionId: string) {
    onThreadResumed?.(newSessionId);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Thread History</span>
          {threads.length > 0 && (
            <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {threads.length}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs text-muted-foreground"
          onClick={() => void fetchThreads()}
          disabled={isLoading}
          type="button"
          title="Refresh thread list"
        >
          <RefreshCw className={cn("size-3", isLoading && "animate-spin")} />
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-muted/10 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading threads…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-3 text-sm text-red-400">
          <XCircle className="size-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Failed to load threads</div>
            <div className="mt-0.5 text-xs text-red-400/70">{error}</div>
          </div>
        </div>
      ) : threads.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/50 bg-muted/10 px-4 py-6 text-center">
          <AlertCircle className="size-5 text-muted-foreground/50" />
          <div className="text-sm text-muted-foreground">No threads found</div>
          <div className="text-xs text-muted-foreground/60">
            Start a conversation to create your first thread.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              sessionId={sessionId}
              projectPath={projectPath}
              onResumed={handleThreadResumed}
              onRefresh={() => void fetchThreads()}
            />
          ))}

          {/* Load more */}
          {nextCursor && (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs gap-1.5"
              onClick={() => void fetchThreads(nextCursor)}
              disabled={isLoadingMore}
              type="button"
            >
              {isLoadingMore ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
