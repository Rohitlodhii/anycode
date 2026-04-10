import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CodexAgentSession, CodexModelOption, CodexRequestPayload } from "@/types/codex-bridge";

// ---------------------------------------------------------------------------
// Settings types
// ---------------------------------------------------------------------------

export type CollaborationModeKind = "plan" | "default";
export type ApprovalPolicyKind = "untrusted" | "never";
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

// ---------------------------------------------------------------------------
// Item types
// ---------------------------------------------------------------------------

export type PlanStep = {
  step: string;
  status: "pending" | "inProgress" | "completed";
};

export type CommandItem = {
  id: string;
  type: "commandExecution";
  command: string;
  cwd: string;
  status: "inProgress" | "completed" | "failed" | "declined";
  output: string;
  exitCode?: number;
  durationMs?: number;
};

export type FileChangeItem = {
  id: string;
  type: "fileChange";
  changes: Array<{ path: string; kind: string; diff?: string }>;
  status: "inProgress" | "completed" | "failed" | "declined";
};

export type McpToolCallItem = {
  id: string;
  type: "mcpToolCall";
  server: string;
  tool: string;
  status: string;
  arguments?: unknown;
  result?: unknown;
  error?: string;
};

export type WebSearchItem = {
  id: string;
  type: "webSearch";
  query: string;
  action?: { type: string };
};

export type ReasoningItem = {
  id: string;
  type: "reasoning";
  summaryText: string;
  elapsedMs: number;
  isStreaming: boolean;
};

export type PlanItem = {
  id: string;
  type: "plan";
  steps: PlanStep[];
  explanation?: string;
};

export type ContextCompactionItem = {
  id: string;
  type: "contextCompaction";
};

export type FuzzyFileSearchItem = {
  id: string;
  type: "fuzzyFileSearch";
  sessionId: string;
  query: string;
  status: "inProgress" | "completed";
  files: Array<{
    fileName: string;
    path: string;
    root: string;
    score: number;
    indices?: number[] | null;
  }>;
};

export type TurnDiffItem = {
  id: string;
  type: "turnDiff";
  threadId: string;
  turnId: string;
  diff: string;
};

export type TurnItem =
  | CommandItem
  | FileChangeItem
  | McpToolCallItem
  | WebSearchItem
  | ReasoningItem
  | PlanItem
  | ContextCompactionItem
  | FuzzyFileSearchItem
  | TurnDiffItem;

export type TimelineEntry =
  | { kind: "message"; id: string; createdAt: number }
  | { kind: "item"; id: string; createdAt: number };

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  /** Only for assistant messages (best-effort from Codex). */
  phase?: "commentary" | "final_answer" | null;
  /** Skill names invoked in this message (e.g. ["my-skill"]) */
  skillNames?: string[];
};

// ---------------------------------------------------------------------------
// Rate limit & auth
// ---------------------------------------------------------------------------

export type RateLimit = {
  limitId: string;
  limitName: string | null;
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number;
};

export type AuthState =
  | { type: "apiKey" }
  | { type: "chatgpt"; email: string; planType: string }
  | { type: "chatgptAuthTokens" }
  | null;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export type SessionStatus = "connecting" | "connected" | "streaming" | "error" | "idle";

export type Session = {
  id: string;
  projectPath: string;
  name: string;
  status: SessionStatus;
  errorMessage?: string;
  messages: ChatMessage[];
  /** Interleaved display order of messages and items (first-seen order). */
  timeline: TimelineEntry[];
  /** First-seen timestamps for items, for stable ordering without mutating items. */
  itemCreatedAt: Record<string, number>;
  /** Keyed by item.id */
  items: Record<string, TurnItem>;
  currentTurnId: string | null;
  threadId: string | null;
  models: CodexModelOption[];
  defaultModel: string | null;
  selectedModel: string | null;
  pendingRequest: CodexRequestPayload | null;
  rateLimits: RateLimit[];
  authState: AuthState;
  createdAt: number;
  isArchived: boolean;
  collaborationMode: CollaborationModeKind;
  approvalPolicy: ApprovalPolicyKind;
  reasoningEffort: ReasoningEffort;
};

// Persisted subset — messages and items are in-memory only
export type SessionMeta = {
  id: string;
  name: string;
  projectPath: string;
  threadId: string | null;
  createdAt: number;
  isArchived: boolean;
  collaborationMode: CollaborationModeKind;
  approvalPolicy: ApprovalPolicyKind;
  reasoningEffort: ReasoningEffort;
};

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------

export type SessionStoreState = {
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  hasHydrated: boolean;

  // Session lifecycle
  createSession: (projectPath: string) => string;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, name: string) => void;
  setActiveSession: (sessionId: string) => void;
  setSessionReady: (sessionId: string, data: CodexAgentSession) => void;
  setSessionError: (sessionId: string, message: string) => void;
  setSessionArchived: (sessionId: string, archived: boolean) => void;
  archiveSessionsForProject: (projectPath: string) => void;
  setSessionConnecting: (sessionId: string) => void;
  setHasHydrated: (hydrated: boolean) => void;

  // Messages
  appendMessage: (sessionId: string, message: ChatMessage) => void;
  appendDelta: (sessionId: string, messageId: string, delta: string) => void;
  setStreaming: (sessionId: string, streaming: boolean) => void;
  setCurrentTurnId: (sessionId: string, turnId: string | null) => void;

  // Items
  upsertItem: (sessionId: string, item: TurnItem) => void;
  appendCommandOutput: (sessionId: string, itemId: string, delta: string) => void;
  appendReasoningDelta: (sessionId: string, itemId: string, delta: string) => void;
  updatePlanSteps: (sessionId: string, itemId: string, steps: PlanStep[], explanation?: string) => void;

  // Approvals
  setPendingRequest: (sessionId: string, request: CodexRequestPayload | null) => void;

  // Rate limits & auth
  setRateLimits: (sessionId: string, limits: RateLimit[]) => void;
  setAuthState: (sessionId: string, auth: AuthState) => void;

  // Session settings
  setCollaborationMode: (sessionId: string, mode: CollaborationModeKind) => void;
  setApprovalPolicy: (sessionId: string, policy: ApprovalPolicyKind) => void;
  setReasoningEffort: (sessionId: string, effort: ReasoningEffort) => void;

  // Selectors
  getSessionsForProject: (projectPath: string) => Session[];
  hasStreamingSession: (projectPath: string) => boolean;
};

// ---------------------------------------------------------------------------
// Utility: reasoning effort filter
// ---------------------------------------------------------------------------

/**
 * Returns the subset of ALL_REASONING_EFFORTS that are supported by the given model.
 * An effort is included iff it appears in model.supportedReasoningEfforts[].reasoningEffort.
 */
export const ALL_REASONING_EFFORTS: ReasoningEffort[] = ["none", "low", "medium", "high", "xhigh"];

export type ModelWithReasoningSupport = {
  supportedReasoningEfforts: Array<{ reasoningEffort: ReasoningEffort }>;
  defaultReasoningEffort: ReasoningEffort;
};

export function filterReasoningEfforts(
  model: ModelWithReasoningSupport
): ReasoningEffort[] {
  const supported = new Set(model.supportedReasoningEfforts.map((e) => e.reasoningEffort));
  return ALL_REASONING_EFFORTS.filter((e) => supported.has(e));
}

/**
 * Given a model and the current reasoning effort, returns the effort that
 * should be used after a model change:
 * - If the current effort is supported by the new model, keep it.
 * - Otherwise, reset to the model's defaultReasoningEffort.
 */
export function applyModelChangeEffort(
  model: ModelWithReasoningSupport,
  currentEffort: ReasoningEffort
): ReasoningEffort {
  const supported = new Set(model.supportedReasoningEfforts.map((e) => e.reasoningEffort));
  return supported.has(currentEffort) ? currentEffort : model.defaultReasoningEffort;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSessionCounter(projectPath: string): number {
  const key = `codex:session:counter:${projectPath}`;
  return Number.parseInt(localStorage.getItem(key) ?? "0", 10);
}

function incrementSessionCounter(projectPath: string): number {
  const key = `codex:session:counter:${projectPath}`;
  const next = getSessionCounter(projectPath) + 1;
  localStorage.setItem(key, String(next));
  return next;
}

function makeEmptySession(id: string, projectPath: string, name: string): Session {
  return {
    id,
    projectPath,
    name,
    status: "connecting",
    messages: [],
    timeline: [],
    itemCreatedAt: {},
    items: {},
    currentTurnId: null,
    threadId: null,
    models: [],
    defaultModel: null,
    selectedModel: null,
    pendingRequest: null,
    rateLimits: [],
    authState: null,
    createdAt: Date.now(),
    isArchived: false,
    collaborationMode: "default",
    approvalPolicy: "untrusted",
    reasoningEffort: "medium",
  };
}

// ---------------------------------------------------------------------------
// Persisted state shape (only metadata, no messages/items)
// ---------------------------------------------------------------------------

type PersistedState = {
  sessions: Record<string, SessionMeta>;
  activeSessionId: string | null;
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSessionStore = create<SessionStoreState>()(
  persist(
    (set, get) => ({
      sessions: {},
      activeSessionId: null,
      hasHydrated: false,

      // --- Session lifecycle ---

      createSession: (projectPath) => {
        const index = incrementSessionCounter(projectPath);
        const id = `${projectPath}:${index}`;
        const name = `Session ${index}`;
        const session = makeEmptySession(id, projectPath, name);
        set((state) => ({
          sessions: { ...state.sessions, [id]: session },
          activeSessionId: state.activeSessionId ?? id,
        }));
        return id;
      },

      deleteSession: (sessionId) => {
        set((state) => {
          const rest = Object.fromEntries(
            Object.entries(state.sessions).filter(([k]) => k !== sessionId)
          );
          const nextActive =
            state.activeSessionId === sessionId
              ? (Object.keys(rest)[0] ?? null)
              : state.activeSessionId;
          return { sessions: rest, activeSessionId: nextActive };
        });
      },

      renameSession: (sessionId, name) => {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: state.sessions[sessionId]
              ? { ...state.sessions[sessionId], name }
              : state.sessions[sessionId],
          },
        }));
      },

      setActiveSession: (sessionId) => {
        set({ activeSessionId: sessionId });
      },

      setSessionReady: (sessionId, data) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                status: "connected",
                threadId: data.threadId,
                models: data.models,
                defaultModel: data.defaultModel,
                selectedModel: session.selectedModel ?? data.defaultModel,
                errorMessage: undefined,
              },
            },
          };
        });
      },

      setSessionError: (sessionId, message) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                status: "error",
                errorMessage: message,
              },
            },
          };
        });
      },

      setSessionArchived: (sessionId, archived) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, isArchived: archived },
            },
          };
        });
      },

      archiveSessionsForProject: (projectPath) => {
        set((state) => {
          const updates: Record<string, Session> = {};
          let changed = false;
          for (const [id, session] of Object.entries(state.sessions)) {
            if (session.projectPath === projectPath && !session.isArchived) {
              updates[id] = { ...session, isArchived: true };
              changed = true;
            }
          }
          if (!changed) return state;
          return {
            sessions: {
              ...state.sessions,
              ...updates,
            },
            activeSessionId:
              state.activeSessionId && updates[state.activeSessionId]
                ? null
                : state.activeSessionId,
          };
        });
      },

      setSessionConnecting: (sessionId) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                status: "connecting",
                errorMessage: undefined,
              },
            },
          };
        });
      },

      setHasHydrated: (hydrated) => {
        set({ hasHydrated: hydrated });
      },

      // --- Messages ---

      appendMessage: (sessionId, message) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const timeline = session.timeline ?? [];
          const nextTimeline = timeline.some(
            (e) => e.kind === "message" && e.id === message.id
          )
            ? timeline
            : [...timeline, { kind: "message", id: message.id, createdAt: message.createdAt }];
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                messages: [...session.messages, message],
                timeline: nextTimeline,
              },
            },
          };
        });
      },

      appendDelta: (sessionId, messageId, delta) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                messages: session.messages.map((msg) =>
                  msg.id === messageId
                    ? { ...msg, content: msg.content + delta }
                    : msg
                ),
              },
            },
          };
        });
      },

      setStreaming: (sessionId, streaming) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                status: streaming ? "streaming" : "connected",
              },
            },
          };
        });
      },

      setCurrentTurnId: (sessionId, turnId) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, currentTurnId: turnId },
            },
          };
        });
      },

      // --- Items ---

      upsertItem: (sessionId, item) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const timeline = session.timeline ?? [];
          const createdAt = session.itemCreatedAt?.[item.id] ?? Date.now();
          const nextTimeline = timeline.some(
            (e) => e.kind === "item" && e.id === item.id
          )
            ? timeline
            : [...timeline, { kind: "item", id: item.id, createdAt }];
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                items: { ...session.items, [item.id]: item },
                itemCreatedAt: {
                  ...(session.itemCreatedAt ?? {}),
                  [item.id]: createdAt,
                },
                timeline: nextTimeline,
              },
            },
          };
        });
      },

      appendCommandOutput: (sessionId, itemId, delta) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const existing = session.items[itemId];
          if (!existing || existing.type !== "commandExecution") return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                items: {
                  ...session.items,
                  [itemId]: { ...existing, output: existing.output + delta },
                },
              },
            },
          };
        });
      },

      appendReasoningDelta: (sessionId, itemId, delta) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const existing = session.items[itemId];
          if (!existing || existing.type !== "reasoning") return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                items: {
                  ...session.items,
                  [itemId]: {
                    ...existing,
                    summaryText: existing.summaryText + delta,
                  },
                },
              },
            },
          };
        });
      },

      updatePlanSteps: (sessionId, itemId, steps, explanation) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const existing = session.items[itemId];
          const updated: PlanItem = {
            id: itemId,
            type: "plan",
            steps,
            explanation: explanation ?? (existing?.type === "plan" ? existing.explanation : undefined),
          };
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                items: { ...session.items, [itemId]: updated },
              },
            },
          };
        });
      },

      // --- Approvals ---

      setPendingRequest: (sessionId, request) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, pendingRequest: request },
            },
          };
        });
      },

      // --- Rate limits & auth ---

      setRateLimits: (sessionId, limits) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, rateLimits: limits },
            },
          };
        });
      },

      setAuthState: (sessionId, auth) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, authState: auth },
            },
          };
        });
      },

      // --- Session settings ---

      setCollaborationMode: (sessionId, mode) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, collaborationMode: mode },
            },
          };
        });
      },

      setApprovalPolicy: (sessionId, policy) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, approvalPolicy: policy },
            },
          };
        });
      },

      setReasoningEffort: (sessionId, effort) => {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, reasoningEffort: effort },
            },
          };
        });
      },

      // --- Selectors ---

      getSessionsForProject: (projectPath) => {
        return Object.values(get().sessions).filter(
          (s) => s.projectPath === projectPath
        );
      },

      hasStreamingSession: (projectPath) => {
        return Object.values(get().sessions).some(
          (s) => s.projectPath === projectPath && s.status === "streaming"
        );
      },
    }),
    {
      name: "codex:sessions",
      // Only persist metadata fields, not messages or items
      partialize: (state): PersistedState => ({
        activeSessionId: state.activeSessionId,
        sessions: Object.fromEntries(
          Object.entries(state.sessions).map(([id, session]) => [
            id,
            {
              id: session.id,
              name: session.name,
              projectPath: session.projectPath,
              threadId: session.threadId,
              createdAt: session.createdAt,
              isArchived: session.isArchived,
              collaborationMode: session.collaborationMode,
              approvalPolicy: session.approvalPolicy,
              reasoningEffort: session.reasoningEffort,
            } satisfies SessionMeta,
          ])
        ),
      }),
      // Rehydrate: restore metadata, reset runtime fields to defaults
      merge: (persisted, current) => {
        const p = persisted as PersistedState;
        const rehydrated: Record<string, Session> = {};
        for (const [id, meta] of Object.entries(p.sessions ?? {})) {
          rehydrated[id] = {
            ...makeEmptySession(id, meta.projectPath, meta.name),
            threadId: meta.threadId,
            createdAt: meta.createdAt,
            isArchived: meta.isArchived,
            collaborationMode: meta.collaborationMode ?? "default",
            approvalPolicy: meta.approvalPolicy ?? "untrusted",
            reasoningEffort: meta.reasoningEffort ?? "medium",
            status: "idle",
          };
        }
        return {
          ...current,
          sessions: rehydrated,
          activeSessionId: p.activeSessionId ?? null,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
