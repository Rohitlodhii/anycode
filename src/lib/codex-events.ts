/**
 * Codex Event Dispatcher
 *
 * Subscribes once at app startup to `window.codex.onEvent` and
 * `window.codex.onRequest`, then routes each incoming message to the
 * appropriate SessionStore action.
 */

import {
  type AuthState,
  type CommandItem,
  type ContextCompactionItem,
  type FileChangeItem,
  type McpToolCallItem,
  type PlanItem,
  type PlanStep,
  type ReasoningItem,
  type TurnItem,
  type WebSearchItem,
  useSessionStore,
} from "@/stores/session-store";
import type { CodexEventPayload, CodexRequestPayload } from "@/types/codex-bridge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStore() {
  return useSessionStore.getState();
}

// ---------------------------------------------------------------------------
// Turn event handlers
// ---------------------------------------------------------------------------

function handleTurnStarted(sessionId: string, params: Record<string, unknown>) {
  const store = getStore();
  store.setStreaming(sessionId, true);
  const turnId =
    (params.turnId as string | undefined) ??
    ((params.turn as { id?: string } | undefined)?.id as string | undefined);
  if (turnId) {
    store.setCurrentTurnId(sessionId, turnId);
  }
}

function handleTurnCompleted(sessionId: string, params: Record<string, unknown>) {
  const store = getStore();
  store.setStreaming(sessionId, false);
  store.setCurrentTurnId(sessionId, null);

  const status =
    (params.status as string | undefined) ??
    ((params.turn as { status?: string } | undefined)?.status as string | undefined);

  if (status === "failed") {
    const errorInfo =
      (params.codexErrorInfo as Record<string, unknown> | undefined) ??
      ((params.turn as { error?: Record<string, unknown> | null } | undefined)?.error ??
        undefined);
    const errorType = errorInfo?.type ?? "Unknown";
    const errorMessage = `Turn failed: ${errorType}`;
    store.setSessionError(sessionId, errorMessage);
  }
}

// ---------------------------------------------------------------------------
// Item event handlers
// ---------------------------------------------------------------------------

function handleItemStarted(sessionId: string, params: Record<string, unknown>) {
  const store = getStore();
  const item = buildItemFromParams(params, "inProgress");
  if (item) {
    store.upsertItem(sessionId, item);
  }
}

function handleItemCompleted(sessionId: string, params: Record<string, unknown>) {
  const store = getStore();
  const item = buildItemFromParams(params, "completed");
  if (item) {
    // For reasoning items, mark as no longer streaming on completion
    if (item.type === "reasoning") {
      store.upsertItem(sessionId, { ...item, isStreaming: false });
    } else {
      store.upsertItem(sessionId, item);
    }
  }
}

function buildItemFromParams(
  params: Record<string, unknown>,
  defaultStatus: "inProgress" | "completed"
): TurnItem | null {
  const rawItem = (params.item as Record<string, unknown> | undefined) ?? params;
  const id = rawItem.id as string | undefined;
  if (!id) return null;

  const type = rawItem.type as string | undefined;

  switch (type) {
    case "commandExecution": {
      const item: CommandItem = {
        id,
        type: "commandExecution",
        command: (rawItem.command as string) ?? "",
        cwd: (rawItem.cwd as string) ?? "",
        status: (rawItem.status as CommandItem["status"]) ?? defaultStatus,
        output:
          (rawItem.output as string | undefined) ??
          (rawItem.aggregatedOutput as string | undefined) ??
          "",
        exitCode: (rawItem.exitCode as number | null | undefined) ?? undefined,
        durationMs: (rawItem.durationMs as number | null | undefined) ?? undefined,
      };
      return item;
    }
    case "fileChange": {
      const rawChanges = rawItem.changes as
        | Array<{ path: string; kind: unknown; diff?: string }>
        | undefined;
      const item: FileChangeItem = {
        id,
        type: "fileChange",
        changes:
          rawChanges?.map((change) => ({
            diff: change.diff,
            kind: normalizeFileChangeKind(change.kind),
            path: change.path,
          })) ?? [],
        status: (rawItem.status as FileChangeItem["status"]) ?? defaultStatus,
      };
      return item;
    }
    case "mcpToolCall": {
      const item: McpToolCallItem = {
        id,
        type: "mcpToolCall",
        server: (rawItem.server as string) ?? (rawItem.serverName as string) ?? "",
        tool: (rawItem.tool as string) ?? (rawItem.toolName as string) ?? "",
        status: (rawItem.status as string) ?? defaultStatus,
        arguments: rawItem.arguments,
        result: rawItem.result,
        error:
          (rawItem.error as string | undefined) ??
          ((rawItem.error as { message?: string } | null | undefined)?.message as
            | string
            | undefined),
      };
      return item;
    }
    case "webSearch": {
      const item: WebSearchItem = {
        id,
        type: "webSearch",
        query: (rawItem.query as string) ?? "",
        action: rawItem.action as { type: string } | undefined,
      };
      return item;
    }
    case "reasoning": {
      const item: ReasoningItem = {
        id,
        type: "reasoning",
        summaryText:
          (rawItem.summaryText as string | undefined) ??
          ((rawItem.summary as string[] | undefined)?.join("\n") ?? ""),
        elapsedMs: (rawItem.elapsedMs as number) ?? 0,
        isStreaming: defaultStatus === "inProgress",
      };
      return item;
    }
    case "plan": {
      const rawSteps =
        (rawItem.steps as PlanStep[] | undefined) ??
        ((rawItem.text as string | undefined)
          ?.split("\n")
          .filter(Boolean)
          .map((step) => ({ step, status: defaultStatus === "completed" ? "completed" : "pending" })) ??
          undefined);
      const item: PlanItem = {
        id,
        type: "plan",
        steps: rawSteps ?? [],
        explanation: rawItem.explanation as string | undefined,
      };
      return item;
    }
    case "contextCompaction": {
      const item: ContextCompactionItem = { id, type: "contextCompaction" };
      return item;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Delta handlers
// ---------------------------------------------------------------------------

function handleAgentMessageDelta(sessionId: string, params: Record<string, unknown>) {
  const messageId =
    (params.messageId as string | undefined) ??
    (params.itemId as string | undefined) ??
    (params.id as string | undefined);
  const delta = params.delta as string | undefined;
  if (messageId && delta !== undefined) {
    upsertAssistantMessage(sessionId, messageId, delta, "append");
  }
}

function handleCommandOutputDelta(sessionId: string, params: Record<string, unknown>) {
  const store = getStore();
  const itemId = (params.itemId ?? params.id) as string | undefined;
  const delta = params.delta as string | undefined;
  if (itemId && delta !== undefined) {
    store.appendCommandOutput(sessionId, itemId, delta);
  }
}

function handleReasoningSummaryTextDelta(sessionId: string, params: Record<string, unknown>) {
  const store = getStore();
  const itemId = (params.itemId ?? params.id) as string | undefined;
  const delta = params.delta as string | undefined;
  if (itemId && delta !== undefined) {
    store.appendReasoningDelta(sessionId, itemId, delta);
  }
}

// ---------------------------------------------------------------------------
// Plan handler
// ---------------------------------------------------------------------------

function handlePlanUpdated(sessionId: string, params: Record<string, unknown>) {
  const store = getStore();
  const itemId = (params.itemId ?? params.id ?? "plan") as string;
  const steps = params.steps as PlanStep[] | undefined;
  const explanation = params.explanation as string | undefined;
  if (steps) {
    store.updatePlanSteps(sessionId, itemId, steps, explanation);
  }
}

// ---------------------------------------------------------------------------
// Account / auth handlers
// ---------------------------------------------------------------------------

function handleAccountUpdated(sessionId: string, params: Record<string, unknown>) {
  const store = getStore();
  const auth = buildAuthState(params);
  store.setAuthState(sessionId, auth);
}

function buildAuthState(params: Record<string, unknown>): AuthState {
  const authMode = params.authMode as string | undefined;
  if (authMode === "apiKey" || authMode === "apikey") {
    return { type: "apiKey" };
  }
  if (authMode === "chatgpt") {
    return {
      type: "chatgpt",
      email: (params.email as string) ?? "",
      planType: (params.planType as string) ?? "",
    };
  }
  if (authMode === "chatgptAuthTokens") {
    return { type: "chatgptAuthTokens" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rate limit handler
// ---------------------------------------------------------------------------

function handleRateLimitsUpdated(sessionId: string, params: Record<string, unknown>) {
  const store = getStore();
  const rawLimits =
    params.rateLimits as
      | Array<{
          limitId: string;
          limitName?: string | null;
          usedPercent: number;
          windowDurationMins: number;
          resetsAt: number;
        }>
      | {
          limitId?: string | null;
          limitName?: string | null;
          primary?: { usedPercent?: number; windowMinutes?: number; resetsAt?: number } | null;
        }
      | undefined;

  if (Array.isArray(rawLimits)) {
    store.setRateLimits(
      sessionId,
      rawLimits.map((l) => ({
        limitId: l.limitId,
        limitName: l.limitName ?? null,
        usedPercent: l.usedPercent,
        windowDurationMins: l.windowDurationMins,
        resetsAt: l.resetsAt,
      }))
    );
    return;
  }

  if (rawLimits?.primary) {
    store.setRateLimits(sessionId, [
      {
        limitId: rawLimits.limitId ?? "codex",
        limitName: rawLimits.limitName ?? null,
        usedPercent: rawLimits.primary.usedPercent ?? 0,
        windowDurationMins: rawLimits.primary.windowMinutes ?? 0,
        resetsAt: rawLimits.primary.resetsAt ?? 0,
      },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

function handleError(sessionId: string, params: Record<string, unknown>) {
  const store = getStore();
  const message = (params.message as string) ?? "An unknown error occurred";
  store.setSessionError(sessionId, message);
}

// ---------------------------------------------------------------------------
// Thread status handler
// ---------------------------------------------------------------------------

function handleThreadStatusChanged(sessionId: string, params: Record<string, unknown>) {
  // Update session status label based on thread status if needed.
  // Currently we surface this as a no-op unless the thread is closed/errored.
  const status = params.status as string | undefined;
  if (status === "closed" || status === "error") {
    const store = getStore();
    store.setSessionError(sessionId, `Thread status: ${status}`);
  }
}

// ---------------------------------------------------------------------------
// Main routing table
// ---------------------------------------------------------------------------

export function routeEvent(payload: CodexEventPayload): void {
  const sessionId = payload.agentId;
  const params = (payload.params ?? {}) as Record<string, unknown>;

  switch (payload.method) {
    // Turn lifecycle
    case "turn/started":
      handleTurnStarted(sessionId, params);
      break;
    case "turn/completed":
      handleTurnCompleted(sessionId, params);
      break;

    // Item lifecycle
    case "item/started":
      handleAgentMessageItem(sessionId, params);
      handleItemStarted(sessionId, params);
      break;
    case "item/completed":
      handleAgentMessageItem(sessionId, params);
      handleItemCompleted(sessionId, params);
      break;

    // Deltas
    case "item/agentMessage/delta":
      handleAgentMessageDelta(sessionId, params);
      break;
    case "item/commandExecution/outputDelta":
      handleCommandOutputDelta(sessionId, params);
      break;
    case "item/reasoning/summaryTextDelta":
      handleReasoningSummaryTextDelta(sessionId, params);
      break;
    case "item/reasoning/summaryPartAdded":
      // Boundary marker — no-op
      break;

    // Plan
    case "turn/plan/updated":
      handlePlanUpdated(sessionId, params);
      break;

    // Thread
    case "thread/status/changed":
      handleThreadStatusChanged(sessionId, params);
      break;

    // Account / auth
    case "account/updated":
      handleAccountUpdated(sessionId, params);
      break;

    // Rate limits
    case "account/rateLimits/updated":
      handleRateLimitsUpdated(sessionId, params);
      break;

    // Error
    case "error":
      handleError(sessionId, params);
      break;

    default:
      // Unknown event — silently ignore
      break;
  }
}

function handleAgentMessageItem(sessionId: string, params: Record<string, unknown>) {
  const item = (params.item as { type?: string; id?: string; text?: string } | undefined) ?? params;
  if (item.type !== "agentMessage" || !item.id) {
    return;
  }

  upsertAssistantMessage(sessionId, item.id, item.text ?? "", "replace");
}

function upsertAssistantMessage(
  sessionId: string,
  messageId: string,
  content: string,
  mode: "append" | "replace"
) {
  const store = getStore();
  const session = store.sessions[sessionId];
  if (!session) {
    return;
  }

  const existing = session.messages.find((msg) => msg.id === messageId);
  if (!existing) {
    store.appendMessage(sessionId, {
      id: messageId,
      role: "assistant",
      content,
      createdAt: Date.now(),
    });
    return;
  }

  useSessionStore.setState((state) => {
    const target = state.sessions[sessionId];
    if (!target) {
      return state;
    }

    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...target,
          messages: target.messages.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  content: mode === "append" ? msg.content + content : content,
                }
              : msg
          ),
        },
      },
    };
  });
}

function normalizeFileChangeKind(kind: unknown): string {
  if (typeof kind === "string") {
    return kind;
  }

  if (kind && typeof kind === "object" && "type" in kind) {
    const type = (kind as { type?: unknown }).type;
    if (typeof type === "string") {
      return type;
    }
  }

  return "update";
}

export function routeRequest(payload: CodexRequestPayload): void {
  const sessionId = payload.agentId;
  const store = getStore();
  store.setPendingRequest(sessionId, payload);
}

// ---------------------------------------------------------------------------
// Initializer — call once at app startup
// ---------------------------------------------------------------------------

let initialized = false;

export function initCodexEventDispatcher(): () => void {
  if (initialized) {
    return () => {};
  }
  initialized = true;

  const unsubEvent = window.codex.onEvent(routeEvent);
  const unsubRequest = window.codex.onRequest(routeRequest);

  return () => {
    initialized = false;
    unsubEvent();
    unsubRequest();
  };
}
