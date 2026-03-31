import {
  AlertCircle,
  Archive,
  Bot,
  ChevronDown,
  FolderOpen,
  GitFork,
  History,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldAlert,
  Sparkles,
  Square,
  Terminal,
} from "lucide-react";
import { openExternalLink } from "@/actions/shell";
import { AuthStatusBadge } from "@/components/codex/auth-status-badge";
import { RateLimitIndicator, UsageLimitBanner } from "@/components/codex/rate-limit-indicator";
import { useEffect, useMemo, useRef, useState } from "react";
import { ContextCompactionBanner } from "@/components/codex/items/context-compaction-banner";
import { CommandCard } from "@/components/codex/items/command-card";
import { FileChangeCard } from "@/components/codex/items/file-change-card";
import { McpToolCard } from "@/components/codex/items/mcp-tool-card";
import { PlanCard } from "@/components/codex/items/plan-card";
import { ReasoningBlock } from "@/components/codex/items/reasoning-block";
import { WebSearchCard } from "@/components/codex/items/web-search-card";
import { MarkdownRenderer } from "@/components/codex/markdown-renderer";
import { McpStatusPanel } from "@/components/codex/mcp-status-panel";
import { ThreadHistoryPanel } from "@/components/codex/thread-history-panel";
import { SkillBadge, SkillsPicker, useSkillsPicker, type Skill } from "@/components/codex/skills-picker";
import { AI_Prompt } from "@/components/ui/animated-ai-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { CodexRequestResponse } from "@/types/codex-bridge";
import { cn } from "@/utils/tailwind";
import {
  useSessionStore,
  type ChatMessage,
  type TurnItem,
} from "@/stores/session-store";

type CodexChatPanelProps = {
  sessionId: string;
  projectPath: string;
};

export function CodexChatPanel({ sessionId, projectPath }: CodexChatPanelProps) {
  const session = useSessionStore((state) => state.sessions[sessionId]);
  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const createSession = useSessionStore((state) => state.createSession);
  const setPendingRequest = useSessionStore((state) => state.setPendingRequest);
  const setSessionConnecting = useSessionStore((state) => state.setSessionConnecting);
  const setSessionReady = useSessionStore((state) => state.setSessionReady);
  const setSessionError = useSessionStore((state) => state.setSessionError);
  const appendMessage = useSessionStore((state) => state.appendMessage);
  const setAuthState = useSessionStore((state) => state.setAuthState);
  const setRateLimits = useSessionStore((state) => state.setRateLimits);

  const [pendingAnswers, setPendingAnswers] = useState<Record<string, string>>({});
  const [steerInput, setSteerInput] = useState("");
  const [selectedModelLabel, setSelectedModelLabel] = useState("");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [mcpPanelOpen, setMcpPanelOpen] = useState(false);
  const [threadHistoryOpen, setThreadHistoryOpen] = useState(false);
  const skillsPicker = useSkillsPicker();
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sessions for this project
  const projectSessions = useMemo(
    () =>
      Object.values(sessions).filter(
        (s) => s.projectPath === projectPath && !s.isArchived
      ),
    [sessions, projectPath]
  );

  const modelOptions = useMemo(
    () =>
      (session?.models ?? []).map((model) => ({
        description: model.description,
        label: model.label,
      })),
    [session?.models]
  );

  // Sync selected model label when session becomes ready
  useEffect(() => {
    if (session?.models && session.defaultModel) {
      const defaultLabel =
        session.models.find((m) => m.id === session.defaultModel)?.label ??
        session.models[0]?.label ??
        "";
      setSelectedModelLabel((prev) => prev || defaultLabel);
    }
  }, [session?.models, session?.defaultModel]);

  const messages = session?.messages ?? [];
  const items = session?.items ?? {};
  const itemCount = Object.keys(items).length;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, itemCount]);

  // Sync pendingAnswers when pendingRequest changes
  const pendingRequest = session?.pendingRequest ?? null;
  useEffect(() => {
    if (pendingRequest) {
      setPendingAnswers(
        Object.fromEntries(
          (pendingRequest.questions ?? []).map((q) => [q.id, ""])
        )
      );
    }
  }, [pendingRequest]);

  const status = session?.status ?? "idle";
  const isStreaming = status === "streaming";
  const isConnecting = status === "connecting";
  const isError = status === "error";
  const isConnected = status === "connected" || isStreaming;

  // Fetch skills when session becomes connected
  useEffect(() => {
    if (status !== "connected" && status !== "streaming") return;
    let cancelled = false;
    window.codex
      .rpcCall(sessionId, "skills/list", { cwds: [projectPath] })
      .then((res) => {
        if (cancelled) return;
        const response = res as { data?: Array<{ skills?: Array<{ name: string; description: string; shortDescription?: string }> }> };
        const allSkills: Skill[] = [];
        for (const entry of response?.data ?? []) {
          for (const s of entry.skills ?? []) {
            allSkills.push({ name: s.name, description: s.description, shortDescription: s.shortDescription });
          }
        }
        setSkills(allSkills);
      })
      .catch(() => {
        // skills/list is best-effort; ignore errors
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, projectPath, status]);

  // Fetch account/read when session first connects (Requirement 16.1)
  useEffect(() => {
    if (status !== "connected") return;
    let cancelled = false;
    window.codex
      .rpcCall(sessionId, "account/read", {})
      .then((res) => {
        if (cancelled) return;
        setAuthState(sessionId, getAuthStateFromAccountRead(res));
      })
      .catch(() => {
        // account/read is best-effort; ignore errors
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, status]);

  // Fetch account/rateLimits/read when session first connects (Requirement 14.2)
  useEffect(() => {
    if (status !== "connected") return;
    let cancelled = false;
    window.codex
      .rpcCall(sessionId, "account/rateLimits/read", {})
      .then((res) => {
        if (cancelled) return;
        const result = res as { rateLimits?: Array<{
          limitId: string;
          limitName?: string | null;
          usedPercent: number;
          windowDurationMins: number;
          resetsAt: number;
        }> } | null;
        if (result?.rateLimits) {
          setRateLimits(
            sessionId,
            result.rateLimits.map((l) => ({
              limitId: l.limitId,
              limitName: l.limitName ?? null,
              usedPercent: l.usedPercent,
              windowDurationMins: l.windowDurationMins,
              resetsAt: l.resetsAt,
            }))
          );
        }
      })
      .catch(() => {
        // account/rateLimits/read is best-effort; ignore errors
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, status]);

  const threadId = session?.threadId ?? null;
  const currentTurnId = session?.currentTurnId ?? null;

  // --- Actions ---

  async function handleNewSession() {
    const newId = createSession(projectPath);
    setActiveSession(newId);
    try {
      const agentSession = await window.codex.createSession(newId, projectPath);
      setSessionReady(newId, agentSession);
    } catch (err) {
      setSessionError(newId, err instanceof Error ? err.message : "Failed to connect");
    }
  }

  async function handleReconnect() {
    if (!session) return;
    setSessionConnecting(sessionId);
    try {
      const agentSession = await window.codex.ensureAgent(sessionId, projectPath);
      setSessionReady(sessionId, agentSession);
    } catch (err) {
      setSessionError(sessionId, err instanceof Error ? err.message : "Failed to reconnect");
    }
  }

  async function handleSubmit(payload: { message: string; model: string }) {
    if (!session || !isConnected) return;

    // Extract skill invocations from the message (e.g. $skill-name)
    const skillMatches = [...payload.message.matchAll(/\$(\w[\w-]*)/g)];
    const invokedSkillNames = skillMatches.map((m) => m[1]);

    const userMessageId = crypto.randomUUID();
    const selectedModelId =
      session.models.find((m) => m.label === payload.model)?.id ?? null;

    appendMessage(sessionId, {
      id: userMessageId,
      role: "user",
      content: payload.message,
      createdAt: Date.now(),
      skillNames: invokedSkillNames.length > 0 ? invokedSkillNames : undefined,
    });
    // Reset input value
    setInputValue("");
    skillsPicker.dismiss();

    try {
      await window.codex.sendMessage(sessionId, payload.message, selectedModelId);
    } catch (err) {
      setSessionError(
        sessionId,
        err instanceof Error ? err.message : "Failed to send message"
      );
    }
  }

  async function handleStop() {
    if (!currentTurnId || !threadId) return;
    try {
      await window.codex.interruptTurn(sessionId, threadId, currentTurnId);
    } catch (err) {
      console.error("Failed to interrupt turn", err);
    }
  }

  async function handleSteer() {
    if (!steerInput.trim() || !currentTurnId || !threadId) return;
    const text = steerInput.trim();
    setSteerInput("");
    appendMessage(sessionId, {
      id: crypto.randomUUID(),
      role: "user",
      content: `[Steer] ${text}`,
      createdAt: Date.now(),
    });
    try {
      await window.codex.steerTurn(sessionId, threadId, [{ type: "input_text", text }], currentTurnId);
    } catch (err) {
      console.error("Failed to steer turn", err);
    }
  }

  async function respondToRequest(action: CodexRequestResponse["action"]) {
    if (!pendingRequest) return;
    const response: CodexRequestResponse = {
      action,
      agentId: pendingRequest.agentId,
      answers:
        pendingRequest.method === "item/tool/requestUserInput"
          ? Object.fromEntries(
              Object.entries(pendingAnswers).map(([id, value]) => [id, [value]])
            )
          : undefined,
      requestId: pendingRequest.requestId,
    };
    await window.codex.respondToRequest(response);
    setPendingRequest(sessionId, null);
    setPendingAnswers({});
  }

  async function handleFork() {
    if (!threadId) return;
    try {
      await window.codex.rpcCall(sessionId, "thread/fork", { threadId });
    } catch (err) {
      console.error("Fork failed", err);
    }
  }

  async function handleArchive() {
    if (!threadId) return;
    try {
      await window.codex.rpcCall(sessionId, "thread/archive", { threadId });
    } catch (err) {
      console.error("Archive failed", err);
    }
  }

  async function handleRollback() {
    if (!threadId) return;
    try {
      await window.codex.rpcCall(sessionId, "thread/rollback", { threadId, numTurns: 1 });
    } catch (err) {
      console.error("Rollback failed", err);
    }
  }

  async function handleCompact() {
    if (!threadId) return;
    try {
      await window.codex.rpcCall(sessionId, "thread/compact/start", { threadId });
    } catch (err) {
      console.error("Compact failed", err);
    }
  }

  // Status label
  const statusLabel = (() => {
    if (isConnecting) return "Connecting…";
    if (isStreaming) return "Thinking…";
    if (isError) return session?.errorMessage ?? "Error";
    if (status === "connected") return "Connected";
    return "Idle";
  })();

  // Ordered items for display (insertion order via Object.values)
  const orderedItems = Object.values(items);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_45%)]">
      {/* Header */}
      <div className="border-b border-border/70 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-background/80 shadow-sm">
              <Sparkles className="size-4 text-foreground" />
            </div>
            <div>
              {/* Session selector */}
              <SessionSelector
                sessions={projectSessions}
                activeSessionId={activeSessionId}
                onSelect={setActiveSession}
                onNewSession={() => void handleNewSession()}
              />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FolderOpen className="size-3.5" />
                <span className="truncate">{projectPath}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Thread actions */}
            {isConnected && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                    <Layers className="size-3.5" />
                    Thread
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => void handleFork()}>
                    <GitFork className="size-3.5" />
                    Fork thread
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void handleRollback()}>
                    <RotateCcw className="size-3.5" />
                    Rollback 1 turn
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void handleCompact()}>
                    <Layers className="size-3.5" />
                    Compact context
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => void handleArchive()}
                    className="text-muted-foreground"
                  >
                    <Archive className="size-3.5" />
                    Archive thread
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* MCP servers button */}
            {isConnected && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setMcpPanelOpen(true)}
                type="button"
              >
                <Server className="size-3.5" />
                MCP
              </Button>
            )}

            {/* Thread history button */}
            {isConnected && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setThreadHistoryOpen(true)}
                type="button"
              >
                <History className="size-3.5" />
                History
              </Button>
            )}

            {/* Rate limit indicator (Requirement 14.2) */}
            {(session?.rateLimits?.length ?? 0) > 0 && (
              <RateLimitIndicator rateLimits={session?.rateLimits ?? []} />
            )}

            {/* Auth badge (Requirement 16.1) */}
            <AuthStatusBadge
              sessionId={sessionId}
              authState={session?.authState ?? null}
              onSetAuthState={(auth) => setAuthState(sessionId, auth)}
            />
            {/* Status badge */}
            <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              {isConnecting || isStreaming ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isError ? (
                <AlertCircle className="size-3.5 text-red-400" />
              ) : (
                <Terminal className="size-3.5" />
              )}
              <span>{statusLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* MCP Status Dialog */}
      <Dialog open={mcpPanelOpen} onOpenChange={setMcpPanelOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="size-4" />
              MCP Servers
            </DialogTitle>
          </DialogHeader>
          <McpStatusPanel sessionId={sessionId} />
        </DialogContent>
      </Dialog>

      {/* Thread History Dialog */}
      <Dialog open={threadHistoryOpen} onOpenChange={setThreadHistoryOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-4" />
              Thread History
            </DialogTitle>
          </DialogHeader>
          <ThreadHistoryPanel
            sessionId={sessionId}
            projectPath={projectPath}
            onThreadResumed={(newSessionId) => {
              setActiveSession(newSessionId);
              setThreadHistoryOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Body */}
      <div className="min-h-0 flex-1 px-6 py-5">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/70 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.7)] backdrop-blur">
          {/* Message list */}
          <div className="editor-sidebar-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {messages.map((message, index) => (
              <ChatBubble
                key={message.id}
                message={message}
                isLastAssistant={
                  message.role === "assistant" &&
                  index === messages.length - 1 &&
                  isStreaming
                }
              />
            ))}

            {/* Turn items */}
            {orderedItems.map((item) => (
              <TurnItemDisplay key={item.id} item={item} />
            ))}

            {messages.length === 0 && orderedItems.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                Ask Codex to inspect this repo, explain code, or make changes in the
                current project.
              </div>
            )}

            {/* Unauthenticated login prompt (Requirement 16.3) */}
            {isConnected && session?.authState === null && (
              <UnauthenticatedPrompt sessionId={sessionId} onSetAuthState={(auth) => setAuthState(sessionId, auth)} />
            )}

            {/* Usage limit exceeded banner (Requirement 14.1) */}
            {isError && (
              <UsageLimitBanner
                rateLimits={session?.rateLimits ?? []}
                errorMessage={session?.errorMessage}
              />
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Approval panel */}
          {pendingRequest && (
            <div className="border-t border-border/70 bg-muted/20 px-5 py-4">
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-8 items-center justify-center rounded-xl bg-amber-500/12 text-amber-200">
                    <ShieldAlert className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground">
                      {pendingRequest.title}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {pendingRequest.message}
                    </p>
                    {pendingRequest.details.length > 0 && (
                      <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground">
                        {pendingRequest.details.map((detail) => (
                          <div key={detail}>{detail}</div>
                        ))}
                      </div>
                    )}
                    {pendingRequest.questions?.length ? (
                      <div className="mt-4 flex flex-col gap-3">
                        {pendingRequest.questions.map((question) => (
                          <div className="flex flex-col gap-2" key={question.id}>
                            <label
                              className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
                              htmlFor={question.id}
                            >
                              {question.header}
                            </label>
                            <Input
                              id={question.id}
                              onChange={(e) =>
                                setPendingAnswers((cur) => ({
                                  ...cur,
                                  [question.id]: e.target.value,
                                }))
                              }
                              placeholder={question.question}
                              type={question.isSecret ? "password" : "text"}
                              value={pendingAnswers[question.id] ?? ""}
                            />
                            {question.options.length > 0 && (
                              <div className="text-[11px] text-muted-foreground">
                                Options: {question.options.join(", ")}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {pendingRequest.method === "item/tool/requestUserInput" ? (
                        <Button onClick={() => void respondToRequest("submit")} type="button">
                          Submit
                        </Button>
                      ) : (
                        <>
                          <Button onClick={() => void respondToRequest("approve")} type="button">
                            Approve once
                          </Button>
                          <Button
                            onClick={() => void respondToRequest("approveSession")}
                            type="button"
                            variant="outline"
                          >
                            Approve session
                          </Button>
                        </>
                      )}
                      <Button
                        onClick={() =>
                          void respondToRequest(
                            pendingRequest.method === "item/tool/requestUserInput"
                              ? "cancel"
                              : "deny"
                          )
                        }
                        type="button"
                        variant="ghost"
                      >
                        {pendingRequest.method === "item/tool/requestUserInput"
                          ? "Cancel"
                          : "Deny"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Steer input while streaming */}
          {isStreaming && (
            <div className="border-t border-border/70 bg-background/85 px-4 py-3">
              <div className="flex items-center gap-2">
                <Input
                  className="flex-1 h-8 text-sm"
                  placeholder="Steer Codex mid-turn…"
                  value={steerInput}
                  onChange={(e) => setSteerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSteer();
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => void handleSteer()}
                  disabled={!steerInput.trim()}
                  type="button"
                >
                  Steer
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => void handleStop()}
                  type="button"
                >
                  <Square className="size-3" />
                  Stop
                </Button>
              </div>
            </div>
          )}

          {/* Error reconnect */}
          {isError && (
            <div className="border-t border-border/70 bg-red-500/5 px-5 py-3">
              <div className="flex items-center gap-3">
                <AlertCircle className="size-4 text-red-400 shrink-0" />
                <span className="flex-1 text-xs text-red-400 truncate">
                  {session?.errorMessage ?? "Connection error"}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs shrink-0"
                  onClick={() => void handleReconnect()}
                  type="button"
                >
                  <RefreshCw className="size-3" />
                  Reconnect
                </Button>
              </div>
            </div>
          )}

          {/* Input bar */}
          <div className="border-t border-border/70 bg-background/85 px-4 py-4">
            {/* Skills picker popover */}
            {skillsPicker.isOpen && skills.length > 0 && (
              <SkillsPicker
                skills={skills}
                query={skillsPicker.query}
                onSelect={(skill) => {
                  const updated = skillsPicker.selectSkill(skill, inputValue);
                  setInputValue(updated);
                  skillsPicker.dismiss();
                }}
                onDismiss={skillsPicker.dismiss}
                anchorRef={inputWrapperRef}
              />
            )}
            <AI_Prompt
              className="max-w-none py-0"
              disabled={!isConnected || isStreaming}
              isSubmitting={isStreaming}
              models={modelOptions}
              onModelChange={setSelectedModelLabel}
              onSubmit={(payload) => void handleSubmit(payload)}
              onValueChange={(v) => {
                setInputValue(v);
                skillsPicker.onInputChange(v);
              }}
              value={inputValue}
              wrapperRef={inputWrapperRef}
              placeholder={
                isConnecting
                  ? "Connecting to Codex…"
                  : isError
                    ? "Reconnect to start chatting"
                    : "Ask Codex to inspect, edit, or explain this project…"
              }
              selectedModel={selectedModelLabel}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session selector
// ---------------------------------------------------------------------------

type SessionSelectorProps = {
  sessions: Array<{ id: string; name: string; status: string }>;
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNewSession: () => void;
};

function SessionSelector({
  sessions,
  activeSessionId,
  onSelect,
  onNewSession,
}: SessionSelectorProps) {
  const active = sessions.find((s) => s.id === activeSessionId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
        >
          {active?.name ?? "Codex"}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {sessions.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onSelect={() => onSelect(s.id)}
            className={cn(s.id === activeSessionId && "bg-muted")}
          >
            <div className="flex items-center gap-2 w-full">
              <SessionStatusDot status={s.status} />
              <span className="flex-1 truncate text-sm">{s.name}</span>
            </div>
          </DropdownMenuItem>
        ))}
        {sessions.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={onNewSession}>
          <Plus className="size-3.5" />
          New session
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionStatusDot({ status }: { status: string }) {
  const color =
    status === "streaming"
      ? "bg-blue-400 animate-pulse"
      : status === "connected"
        ? "bg-green-500"
        : status === "error"
          ? "bg-red-400"
          : status === "connecting"
            ? "bg-yellow-400 animate-pulse"
            : "bg-muted-foreground/40";
  return <span className={cn("size-2 rounded-full shrink-0", color)} />;
}

// ---------------------------------------------------------------------------
// Chat bubble
// ---------------------------------------------------------------------------

type ChatBubbleProps = {
  message: ChatMessage;
  isLastAssistant?: boolean;
};

function ChatBubble({ message, isLastAssistant }: ChatBubbleProps) {
  return (
    <div
      className={cn(
        "flex",
        message.role === "user" ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-3xl rounded-4xl px-4 py-3 text-sm leading-6 shadow-sm",
          message.role === "user" &&
            "bg-foreground text-background shadow-[0_16px_40px_-24px_rgba(255,255,255,0.55)]",
          message.role === "assistant" &&
            "border border-border/70 bg-background text-foreground",
          message.role === "system" &&
            "border border-border/60 bg-muted/30 text-muted-foreground"
        )}
      >
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {message.role === "assistant" ? (
            <Bot className="size-3.5" />
          ) : message.role === "user" ? null : (
            <Sparkles className="size-3.5" />
          )}
          <span>
            {message.role === "assistant"
              ? "Codex"
              : message.role === "user"
                ? "You"
                : "System"}
          </span>
        </div>

        {message.role === "assistant" ? (
          <div
            className={cn(
              "prose prose-sm prose-invert max-w-none",
              isLastAssistant &&
                !message.content &&
                "after:content-['▋'] after:animate-pulse after:ml-0.5"
            )}
          >
            {message.content ? (
              <MarkdownRenderer content={message.content} />
            ) : isLastAssistant ? null : (
              <span className="text-muted-foreground">…</span>
            )}
            {isLastAssistant && message.content && (
              <span className="animate-pulse ml-0.5">▋</span>
            )}
          </div>
        ) : (
          <div className="whitespace-pre-wrap">
            {message.content}
            {message.skillNames && message.skillNames.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {message.skillNames.map((name) => (
                  <SkillBadge key={name} skillName={name} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Turn item display
// ---------------------------------------------------------------------------

function TurnItemDisplay({ item }: { item: TurnItem }) {
  switch (item.type) {
    case "reasoning":
      return <ReasoningBlock item={item} />;
    case "plan":
      return <PlanCard item={item} />;
    case "commandExecution":
      return <CommandCard item={item} />;
    case "fileChange":
      return <FileChangeCard item={item} />;
    case "mcpToolCall":
      return <McpToolCard item={item} />;
    case "webSearch":
      return <WebSearchCard item={item} />;
    case "contextCompaction":
      return <ContextCompactionBanner item={item} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Unauthenticated prompt (Requirement 16.3)
// ---------------------------------------------------------------------------

type UnauthenticatedPromptProps = {
  sessionId: string;
  onSetAuthState: (auth: import("@/stores/session-store").AuthState) => void;
};

function UnauthenticatedPrompt({ sessionId, onSetAuthState }: UnauthenticatedPromptProps) {
  const [apiKey, setApiKey] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApiKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setError(null);
    setIsLoggingIn(true);
    try {
      await window.codex.rpcCall(sessionId, "config/value/write", {
        key: "apiKey",
        value: apiKey.trim(),
      });
      onSetAuthState({ type: "apiKey" });
      setApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleChatGptLogin() {
    setError(null);
    setIsLoggingIn(true);
    try {
      const result = await window.codex.rpcCall(sessionId, "account/login/start", {
        type: "chatgpt",
      });
      const authUrl = (result as { authUrl?: string })?.authUrl;
      if (authUrl) {
        await openExternalLink(authUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start ChatGPT login");
    } finally {
      setIsLoggingIn(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
      <div className="mb-3 text-sm font-medium text-amber-300">Authentication required</div>
      <p className="mb-4 text-xs text-muted-foreground">
        Provide an OpenAI API key or log in with ChatGPT to start using Codex.
      </p>
      <form onSubmit={(e) => void handleApiKeySubmit(e)} className="mb-3 flex gap-2">
        <Input
          type="password"
          placeholder="sk-… API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="h-8 flex-1 text-sm"
          autoComplete="off"
        />
        <Button
          type="submit"
          size="sm"
          className="h-8 shrink-0"
          disabled={!apiKey.trim() || isLoggingIn}
        >
          Save
        </Button>
      </form>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-full text-xs"
        onClick={() => void handleChatGptLogin()}
        disabled={isLoggingIn}
      >
        Login with ChatGPT
      </Button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function getAuthStateFromAccountRead(raw: unknown): import("@/stores/session-store").AuthState {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const result = raw as {
    account?: { type?: string; email?: string; planType?: string } | null;
  };
  const account = result.account;

  if (!account?.type) {
    return null;
  }

  if (account.type === "apiKey") {
    return { type: "apiKey" };
  }

  if (account.type === "chatgpt") {
    return {
      type: "chatgpt",
      email: account.email ?? "",
      planType: account.planType ?? "",
    };
  }

  if (account.type === "chatgptAuthTokens") {
    return { type: "chatgptAuthTokens" };
  }

  return null;
}
