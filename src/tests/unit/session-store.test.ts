/**
 * Property-based tests for SessionStore
 * Feature: codex-session-manager
 */
import * as fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ALL_REASONING_EFFORTS,
  applyModelChangeEffort,
  type ChatMessage,
  filterReasoningEfforts,
  type PlanStep,
  type Session,
  type TurnItem,
  useSessionStore,
} from "@/stores/session-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset the store to a clean slate before each test */
function resetStore() {
  useSessionStore.setState({ sessions: {}, activeSessionId: null });
}

/** Seed a session directly into the store without going through createSession */
function seedSession(partial: Partial<Session> & { id: string; projectPath: string }): Session {
  const session: Session = {
    name: "Test Session",
    status: "connected",
    messages: [],
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
    ...partial,
  };
  useSessionStore.setState((state) => ({
    sessions: { ...state.sessions, [session.id]: session },
  }));
  return session;
}

function makeMessage(overrides?: Partial<ChatMessage>): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content: "hello",
    createdAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

// Exclude strings that collide with Object.prototype property names to avoid
// prototype-pollution false positives in store lookups.
const PROTO_KEYS = new Set(Object.getOwnPropertyNames(Object.prototype));
const arbSessionId = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => !PROTO_KEYS.has(s));
const arbProjectPath = fc.string({ minLength: 1, maxLength: 60 });
const arbName = fc.string({ minLength: 1, maxLength: 50 });
const arbDelta = fc.string({ minLength: 0, maxLength: 100 });
const arbRole = fc.constantFrom("user", "assistant", "system") as fc.Arbitrary<
  "user" | "assistant" | "system"
>;
const arbStatus = fc.constantFrom(
  "connecting",
  "connected",
  "streaming",
  "error",
  "idle"
) as fc.Arbitrary<Session["status"]>;

const arbMessage = fc.record({
  id: fc.uuid(),
  role: arbRole,
  content: fc.string({ minLength: 0, maxLength: 200 }),
  createdAt: fc.integer({ min: 0 }),
});

// ---------------------------------------------------------------------------
// Property 1: Session isolation — messages never cross sessions
// Feature: codex-session-manager, Property 1: Session isolation
// ---------------------------------------------------------------------------

describe("Property 1: Session isolation", () => {
  beforeEach(resetStore);

  it("appending a message to session A does not change session B", () => {
    fc.assert(
      fc.property(
        arbSessionId,
        arbSessionId,
        arbMessage,
        (idA, idB, message) => {
          fc.pre(idA !== idB);
          resetStore();

          seedSession({ id: idA, projectPath: "/proj" });
          seedSession({ id: idB, projectPath: "/proj" });

          const before = useSessionStore.getState().sessions[idB]?.messages.length ?? 0;
          useSessionStore.getState().appendMessage(idA, message);
          const after = useSessionStore.getState().sessions[idB]?.messages.length ?? 0;

          expect(after).toBe(before);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Streaming flag consistency
// Feature: codex-session-manager, Property 2: Streaming flag consistency
// ---------------------------------------------------------------------------

describe("Property 2: Streaming flag consistency", () => {
  beforeEach(resetStore);

  it("status is streaming after setStreaming(true) and connected after setStreaming(false)", () => {
    fc.assert(
      fc.property(arbSessionId, (id) => {
        resetStore();
        seedSession({ id, projectPath: "/proj", status: "connected" });
        const store = useSessionStore.getState();

        store.setStreaming(id, true);
        expect(useSessionStore.getState().sessions[id]?.status).toBe("streaming");

        store.setStreaming(id, false);
        expect(useSessionStore.getState().sessions[id]?.status).toBe("connected");
      }),
      { numRuns: 100 }
    );
  });

  it("setStreaming(false) after setStreaming(true) always yields non-streaming", () => {
    fc.assert(
      fc.property(arbSessionId, fc.boolean(), (id, startStreaming) => {
        resetStore();
        seedSession({ id, projectPath: "/proj", status: "connected" });
        const store = useSessionStore.getState();

        if (startStreaming) store.setStreaming(id, true);
        store.setStreaming(id, false);

        expect(useSessionStore.getState().sessions[id]?.status).not.toBe("streaming");
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: hasStreamingSession aggregate correctness
// Feature: codex-session-manager, Property 3: hasStreamingSession aggregate
// ---------------------------------------------------------------------------

describe("Property 3: hasStreamingSession aggregate", () => {
  beforeEach(resetStore);

  it("returns true iff at least one session for the project is streaming", () => {
    fc.assert(
      fc.property(
        fc.array(arbStatus, { minLength: 1, maxLength: 6 }),
        (statuses) => {
          resetStore();
          const projectPath = "/test-project";

          statuses.forEach((status, i) => {
            seedSession({ id: `sess-${i}`, projectPath, status });
          });

          const expected = statuses.some((s) => s === "streaming");
          const actual = useSessionStore.getState().hasStreamingSession(projectPath);
          expect(actual).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("returns false for a project with no sessions", () => {
    fc.assert(
      fc.property(arbProjectPath, (projectPath) => {
        resetStore();
        expect(useSessionStore.getState().hasStreamingSession(projectPath)).toBe(false);
      }),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Session creation uniqueness
// Feature: codex-session-manager, Property 4: Session creation uniqueness
// ---------------------------------------------------------------------------

describe("Property 4: Session creation uniqueness", () => {
  beforeEach(resetStore);

  it("all created session IDs are distinct for the same project path", () => {
    fc.assert(
      fc.property(
        arbProjectPath,
        fc.integer({ min: 1, max: 10 }),
        (projectPath, count) => {
          resetStore();
          // Reset counter for this project
          localStorage.removeItem(`codex:session:counter:${projectPath}`);

          const ids: string[] = [];
          for (let i = 0; i < count; i++) {
            ids.push(useSessionStore.getState().createSession(projectPath));
          }

          const unique = new Set(ids);
          expect(unique.size).toBe(ids.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Delete removes session completely
// Feature: codex-session-manager, Property 5: Delete removes session completely
// ---------------------------------------------------------------------------

describe("Property 5: deleteSession removes completely", () => {
  beforeEach(resetStore);

  it("deleted session is absent from sessions and getSessionsForProject", () => {
    fc.assert(
      fc.property(arbSessionId, arbProjectPath, (id, projectPath) => {
        resetStore();
        seedSession({ id, projectPath });

        useSessionStore.getState().deleteSession(id);

        const state = useSessionStore.getState();
        expect(state.sessions[id]).toBeUndefined();
        expect(state.getSessionsForProject(projectPath).find((s) => s.id === id)).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Rename is reflected immediately
// Feature: codex-session-manager, Property 6: Rename is reflected immediately
// ---------------------------------------------------------------------------

describe("Property 6: renameSession is synchronous", () => {
  beforeEach(resetStore);

  it("sessions[id].name equals the new name immediately after renameSession", () => {
    fc.assert(
      fc.property(arbSessionId, arbName, (id, newName) => {
        resetStore();
        seedSession({ id, projectPath: "/proj", name: "Old Name" });

        useSessionStore.getState().renameSession(id, newName);

        expect(useSessionStore.getState().sessions[id]?.name).toBe(newName);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Delta append is order-preserving
// Feature: codex-session-manager, Property 7: Delta append is order-preserving
// ---------------------------------------------------------------------------

describe("Property 7: Delta append is order-preserving", () => {
  beforeEach(resetStore);

  it("appendDelta: final message content equals concatenation of all deltas in order", () => {
    fc.assert(
      fc.property(
        arbSessionId,
        fc.array(arbDelta, { minLength: 1, maxLength: 20 }),
        (sessionId, deltas) => {
          resetStore();
          seedSession({ id: sessionId, projectPath: "/proj" });

          const msgId = crypto.randomUUID();
          useSessionStore.getState().appendMessage(sessionId, {
            id: msgId,
            role: "assistant",
            content: "",
            createdAt: Date.now(),
          });

          for (const delta of deltas) {
            useSessionStore.getState().appendDelta(sessionId, msgId, delta);
          }

          const finalContent = useSessionStore
            .getState()
            .sessions[sessionId]?.messages.find((m) => m.id === msgId)?.content;

          expect(finalContent).toBe(deltas.join(""));
        }
      ),
      { numRuns: 100 }
    );
  });

  it("appendReasoningDelta: final summaryText equals concatenation of all deltas in order", () => {
    fc.assert(
      fc.property(
        arbSessionId,
        fc.array(arbDelta, { minLength: 1, maxLength: 20 }),
        (sessionId, deltas) => {
          resetStore();
          seedSession({ id: sessionId, projectPath: "/proj" });

          const itemId = crypto.randomUUID();
          useSessionStore.getState().upsertItem(sessionId, {
            id: itemId,
            type: "reasoning",
            summaryText: "",
            elapsedMs: 0,
            isStreaming: true,
          });

          for (const delta of deltas) {
            useSessionStore.getState().appendReasoningDelta(sessionId, itemId, delta);
          }

          const item = useSessionStore.getState().sessions[sessionId]?.items[itemId];
          expect(item?.type === "reasoning" ? item.summaryText : null).toBe(deltas.join(""));
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Active session switch does not mutate messages
// Feature: codex-session-manager, Property 8: setActiveSession does not mutate messages
// ---------------------------------------------------------------------------

describe("Property 8: setActiveSession does not mutate messages", () => {
  beforeEach(resetStore);

  it("messages and items of all sessions are unchanged after setActiveSession", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ id: arbSessionId, msgs: fc.array(arbMessage, { maxLength: 5 }) }),
          { minLength: 2, maxLength: 5 }
        ),
        arbSessionId,
        (sessionDefs, targetId) => {
          resetStore();

          // Deduplicate IDs
          const unique = [...new Map(sessionDefs.map((s) => [s.id, s])).values()];
          fc.pre(unique.length >= 2);

          for (const def of unique) {
            seedSession({ id: def.id, projectPath: "/proj" });
            for (const msg of def.msgs) {
              useSessionStore.getState().appendMessage(def.id, msg);
            }
          }

          // Snapshot messages before
          const before = Object.fromEntries(
            unique.map((d) => [
              d.id,
              [...(useSessionStore.getState().sessions[d.id]?.messages ?? [])],
            ])
          );

          // Switch active session (may or may not exist)
          useSessionStore.getState().setActiveSession(targetId);

          // Verify messages unchanged
          for (const def of unique) {
            const after = useSessionStore.getState().sessions[def.id]?.messages ?? [];
            expect(after).toEqual(before[def.id]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Plan step status mapping is consistent
// Feature: codex-session-manager, Property 9: Plan step status mapping
// ---------------------------------------------------------------------------

describe("Property 9: Plan step status mapping is consistent", () => {
  beforeEach(resetStore);

  it("store reflects only the most recently received step statuses", () => {
    fc.assert(
      fc.property(
        arbSessionId,
        fc.array(
          fc.array(
            fc.record({
              step: fc.string({ minLength: 1, maxLength: 30 }),
              status: fc.constantFrom("pending", "inProgress", "completed") as fc.Arbitrary<PlanStep["status"]>,
            }),
            { minLength: 1, maxLength: 5 }
          ),
          { minLength: 1, maxLength: 5 }
        ),
        (sessionId, updates) => {
          resetStore();
          seedSession({ id: sessionId, projectPath: "/proj" });

          const itemId = "plan-1";
          for (const steps of updates) {
            useSessionStore.getState().updatePlanSteps(sessionId, itemId, steps);
          }

          const lastUpdate = updates[updates.length - 1];
          const stored = useSessionStore.getState().sessions[sessionId]?.items[itemId];
          expect(stored?.type).toBe("plan");
          if (stored?.type === "plan") {
            expect(stored.steps).toEqual(lastUpdate);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10: Item upsert is idempotent on ID
// Feature: codex-session-manager, Property 10: Item upsert is idempotent on ID
// ---------------------------------------------------------------------------

describe("Property 10: Item upsert is idempotent on ID", () => {
  beforeEach(resetStore);

  it("calling upsertItem twice with same ID stores only the second version", () => {
    fc.assert(
      fc.property(
        arbSessionId,
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (sessionId, itemId, query1, query2) => {
          resetStore();
          seedSession({ id: sessionId, projectPath: "/proj" });

          const item1: TurnItem = { id: itemId, type: "webSearch", query: query1 };
          const item2: TurnItem = { id: itemId, type: "webSearch", query: query2 };

          useSessionStore.getState().upsertItem(sessionId, item1);
          useSessionStore.getState().upsertItem(sessionId, item2);

          const stored = useSessionStore.getState().sessions[sessionId]?.items[itemId];
          expect(stored).toEqual(item2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: Error classification preserves codexErrorInfo type
// Feature: codex-session-manager, Property 11: Error classification preserves codexErrorInfo type
// ---------------------------------------------------------------------------

describe("Property 11: Error classification preserves codexErrorInfo type", () => {
  beforeEach(resetStore);

  it("setSessionError stores the error message containing the error type", () => {
    fc.assert(
      fc.property(
        arbSessionId,
        fc.constantFrom(
          "UsageLimitExceeded",
          "ContextWindowExceeded",
          "Unauthorized",
          "HttpConnectionFailed",
          "BadRequest",
          "InternalServerError",
          "Other"
        ),
        (sessionId, errorType) => {
          resetStore();
          seedSession({ id: sessionId, projectPath: "/proj" });

          const errorMessage = `Turn failed: ${errorType}`;
          useSessionStore.getState().setSessionError(sessionId, errorMessage);

          const session = useSessionStore.getState().sessions[sessionId];
          expect(session?.status).toBe("error");
          expect(session?.errorMessage).toContain(errorType);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: Session settings round-trip
// Feature: codex-session-manager, Property 12: Session settings round-trip
// ---------------------------------------------------------------------------

describe("Property 12: Session settings round-trip", () => {
  beforeEach(resetStore);

  const arbCollaborationMode = fc.constantFrom("plan", "default") as fc.Arbitrary<
    import("@/stores/session-store").CollaborationModeKind
  >;
  const arbApprovalPolicy = fc.constantFrom("untrusted", "never") as fc.Arbitrary<
    import("@/stores/session-store").ApprovalPolicyKind
  >;
  const arbReasoningEffort = fc.constantFrom(
    "none",
    "low",
    "medium",
    "high",
    "xhigh"
  ) as fc.Arbitrary<import("@/stores/session-store").ReasoningEffort>;

  it("setCollaborationMode is immediately reflected in the store", () => {
    fc.assert(
      fc.property(arbSessionId, arbCollaborationMode, (id, mode) => {
        resetStore();
        seedSession({ id, projectPath: "/proj" });

        useSessionStore.getState().setCollaborationMode(id, mode);

        expect(useSessionStore.getState().sessions[id]?.collaborationMode).toBe(mode);
      }),
      { numRuns: 100 }
    );
  });

  it("setApprovalPolicy is immediately reflected in the store", () => {
    fc.assert(
      fc.property(arbSessionId, arbApprovalPolicy, (id, policy) => {
        resetStore();
        seedSession({ id, projectPath: "/proj" });

        useSessionStore.getState().setApprovalPolicy(id, policy);

        expect(useSessionStore.getState().sessions[id]?.approvalPolicy).toBe(policy);
      }),
      { numRuns: 100 }
    );
  });

  it("setReasoningEffort is immediately reflected in the store", () => {
    fc.assert(
      fc.property(arbSessionId, arbReasoningEffort, (id, effort) => {
        resetStore();
        seedSession({ id, projectPath: "/proj" });

        useSessionStore.getState().setReasoningEffort(id, effort);

        expect(useSessionStore.getState().sessions[id]?.reasoningEffort).toBe(effort);
      }),
      { numRuns: 100 }
    );
  });

  it("all three settings can be set independently without interfering with each other", () => {
    fc.assert(
      fc.property(
        arbSessionId,
        arbCollaborationMode,
        arbApprovalPolicy,
        arbReasoningEffort,
        (id, mode, policy, effort) => {
          resetStore();
          seedSession({ id, projectPath: "/proj" });

          useSessionStore.getState().setCollaborationMode(id, mode);
          useSessionStore.getState().setApprovalPolicy(id, policy);
          useSessionStore.getState().setReasoningEffort(id, effort);

          const session = useSessionStore.getState().sessions[id];
          expect(session?.collaborationMode).toBe(mode);
          expect(session?.approvalPolicy).toBe(policy);
          expect(session?.reasoningEffort).toBe(effort);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Reasoning effort filter respects model support
// Feature: codex-session-manager, Property 13: Reasoning effort filter respects model support
// ---------------------------------------------------------------------------

describe("Property 13: Reasoning effort filter respects model support", () => {
  it("includes an effort iff it appears in model.supportedReasoningEfforts", () => {
    fc.assert(
      fc.property(
        // Generate a random subset of all efforts as the model's supported list
        fc.subarray(ALL_REASONING_EFFORTS, { minLength: 0, maxLength: ALL_REASONING_EFFORTS.length }),
        (supportedEfforts) => {
          const model = {
            supportedReasoningEfforts: supportedEfforts.map((e) => ({ reasoningEffort: e, description: "" })),
            defaultReasoningEffort: supportedEfforts[0] ?? ("medium" as import("@/stores/session-store").ReasoningEffort),
          };

          const filtered = filterReasoningEfforts(model);
          const supportedSet = new Set(supportedEfforts);

          // Every effort in filtered must be in the supported set
          for (const effort of filtered) {
            expect(supportedSet.has(effort)).toBe(true);
          }

          // Every effort in the supported set must appear in filtered
          for (const effort of supportedEfforts) {
            expect(filtered).toContain(effort);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 14: Reasoning effort resets to model default when unsupported
// Feature: codex-session-manager, Property 14: Reasoning effort resets to model default when unsupported
// ---------------------------------------------------------------------------

describe("Property 14: Reasoning effort resets to model default when unsupported", () => {
  it("applyModelChangeEffort returns model.defaultReasoningEffort when current effort is unsupported", () => {
    fc.assert(
      fc.property(
        // Generate a random non-empty subset of efforts as supported
        fc.subarray(ALL_REASONING_EFFORTS, { minLength: 1, maxLength: ALL_REASONING_EFFORTS.length }),
        // Pick a default effort from the supported list
        fc.integer({ min: 0, max: ALL_REASONING_EFFORTS.length - 1 }),
        (supportedEfforts, defaultIdx) => {
          const defaultReasoningEffort = supportedEfforts[defaultIdx % supportedEfforts.length];
          const model = {
            supportedReasoningEfforts: supportedEfforts.map((e) => ({ reasoningEffort: e, description: "" })),
            defaultReasoningEffort,
          };

          const supportedSet = new Set(supportedEfforts);
          const unsupportedEfforts = ALL_REASONING_EFFORTS.filter((e) => !supportedSet.has(e));

          // Only run the assertion when there are unsupported efforts to test
          fc.pre(unsupportedEfforts.length > 0);

          for (const unsupportedEffort of unsupportedEfforts) {
            const result = applyModelChangeEffort(model, unsupportedEffort);
            expect(result).toBe(defaultReasoningEffort);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("applyModelChangeEffort keeps the current effort when it is supported by the new model", () => {
    fc.assert(
      fc.property(
        fc.subarray(ALL_REASONING_EFFORTS, { minLength: 1, maxLength: ALL_REASONING_EFFORTS.length }),
        fc.integer({ min: 0, max: ALL_REASONING_EFFORTS.length - 1 }),
        (supportedEfforts, defaultIdx) => {
          const defaultReasoningEffort = supportedEfforts[defaultIdx % supportedEfforts.length];
          const model = {
            supportedReasoningEfforts: supportedEfforts.map((e) => ({ reasoningEffort: e, description: "" })),
            defaultReasoningEffort,
          };

          for (const supportedEffort of supportedEfforts) {
            const result = applyModelChangeEffort(model, supportedEffort);
            expect(result).toBe(supportedEffort);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
