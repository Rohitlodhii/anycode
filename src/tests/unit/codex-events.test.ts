/**
 * Unit tests for the Codex Event Dispatcher
 * Feature: codex-session-manager
 * Requirements: 5.4, 14.1
 */
import { beforeEach, describe, expect, it } from "vitest";
import { routeEvent, routeRequest } from "@/lib/codex-events";
import {
  type Session,
  useSessionStore,
} from "@/stores/session-store";
import type { CodexEventPayload, CodexRequestPayload } from "@/types/codex-bridge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useSessionStore.setState({ sessions: {}, activeSessionId: null });
}

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
    ...partial,
  };
  useSessionStore.setState((state) => ({
    sessions: { ...state.sessions, [session.id]: session },
  }));
  return session;
}

function makeEvent(
  agentId: string,
  method: string,
  params: Record<string, unknown> = {}
): CodexEventPayload {
  return { agentId, method, params };
}

// ---------------------------------------------------------------------------
// turn/started
// ---------------------------------------------------------------------------

describe("turn/started", () => {
  beforeEach(resetStore);

  it("sets status to streaming", () => {
    seedSession({ id: "s1", projectPath: "/p", status: "connected" });
    routeEvent(makeEvent("s1", "turn/started", { turnId: "t1" }));
    expect(useSessionStore.getState().sessions["s1"]?.status).toBe("streaming");
  });

  it("sets currentTurnId", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    routeEvent(makeEvent("s1", "turn/started", { turnId: "turn-abc" }));
    expect(useSessionStore.getState().sessions["s1"]?.currentTurnId).toBe("turn-abc");
  });

  it("does not change activeSessionId", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    seedSession({ id: "s2", projectPath: "/p" });
    useSessionStore.setState({ activeSessionId: "s2" });
    routeEvent(makeEvent("s1", "turn/started", { turnId: "t1" }));
    expect(useSessionStore.getState().activeSessionId).toBe("s2");
  });
});

// ---------------------------------------------------------------------------
// turn/completed
// ---------------------------------------------------------------------------

describe("turn/completed", () => {
  beforeEach(resetStore);

  it("sets status back to connected on success", () => {
    seedSession({ id: "s1", projectPath: "/p", status: "streaming" });
    routeEvent(makeEvent("s1", "turn/completed", { status: "success" }));
    expect(useSessionStore.getState().sessions["s1"]?.status).toBe("connected");
  });

  it("clears currentTurnId", () => {
    seedSession({ id: "s1", projectPath: "/p", currentTurnId: "t1" });
    routeEvent(makeEvent("s1", "turn/completed", { status: "success" }));
    expect(useSessionStore.getState().sessions["s1"]?.currentTurnId).toBeNull();
  });

  it("routes to setSessionError with codexErrorInfo type on failure", () => {
    seedSession({ id: "s1", projectPath: "/p", status: "streaming" });
    routeEvent(
      makeEvent("s1", "turn/completed", {
        status: "failed",
        codexErrorInfo: { type: "UsageLimitExceeded" },
      })
    );
    const session = useSessionStore.getState().sessions["s1"];
    expect(session?.status).toBe("error");
    expect(session?.errorMessage).toContain("UsageLimitExceeded");
  });

  it("routes ContextWindowExceeded error correctly", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    routeEvent(
      makeEvent("s1", "turn/completed", {
        status: "failed",
        codexErrorInfo: { type: "ContextWindowExceeded" },
      })
    );
    expect(useSessionStore.getState().sessions["s1"]?.errorMessage).toContain(
      "ContextWindowExceeded"
    );
  });

  it("routes Unauthorized error correctly", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    routeEvent(
      makeEvent("s1", "turn/completed", {
        status: "failed",
        codexErrorInfo: { type: "Unauthorized" },
      })
    );
    expect(useSessionStore.getState().sessions["s1"]?.errorMessage).toContain("Unauthorized");
  });

  it("does not change activeSessionId", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    seedSession({ id: "s2", projectPath: "/p" });
    useSessionStore.setState({ activeSessionId: "s2" });
    routeEvent(makeEvent("s1", "turn/completed", { status: "success" }));
    expect(useSessionStore.getState().activeSessionId).toBe("s2");
  });
});

// ---------------------------------------------------------------------------
// item/started and item/completed
// ---------------------------------------------------------------------------

describe("item/started", () => {
  beforeEach(resetStore);

  it("upserts a commandExecution item with inProgress status", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    routeEvent(
      makeEvent("s1", "item/started", {
        id: "item-1",
        type: "commandExecution",
        command: "ls",
        cwd: "/home",
        output: "",
      })
    );
    const item = useSessionStore.getState().sessions["s1"]?.items["item-1"];
    expect(item?.type).toBe("commandExecution");
    expect(item?.type === "commandExecution" ? item.status : null).toBe("inProgress");
  });

  it("upserts a fileChange item", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    routeEvent(
      makeEvent("s1", "item/started", {
        id: "fc-1",
        type: "fileChange",
        changes: [{ path: "foo.ts", kind: "modified" }],
      })
    );
    const item = useSessionStore.getState().sessions["s1"]?.items["fc-1"];
    expect(item?.type).toBe("fileChange");
  });

  it("upserts a reasoning item with isStreaming=true", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    routeEvent(
      makeEvent("s1", "item/started", {
        id: "r-1",
        type: "reasoning",
        summaryText: "",
        elapsedMs: 0,
      })
    );
    const item = useSessionStore.getState().sessions["s1"]?.items["r-1"];
    expect(item?.type).toBe("reasoning");
    expect(item?.type === "reasoning" ? item.isStreaming : null).toBe(true);
  });

  it("upserts a contextCompaction item", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    routeEvent(makeEvent("s1", "item/started", { id: "cc-1", type: "contextCompaction" }));
    const item = useSessionStore.getState().sessions["s1"]?.items["cc-1"];
    expect(item?.type).toBe("contextCompaction");
  });
});

describe("item/completed", () => {
  beforeEach(resetStore);

  it("marks reasoning item as not streaming on completion", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    // First start it
    routeEvent(
      makeEvent("s1", "item/started", {
        id: "r-1",
        type: "reasoning",
        summaryText: "thinking...",
        elapsedMs: 0,
      })
    );
    // Then complete it
    routeEvent(
      makeEvent("s1", "item/completed", {
        id: "r-1",
        type: "reasoning",
        summaryText: "done",
        elapsedMs: 1500,
      })
    );
    const item = useSessionStore.getState().sessions["s1"]?.items["r-1"];
    expect(item?.type === "reasoning" ? item.isStreaming : null).toBe(false);
  });

  it("updates commandExecution to completed status", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    routeEvent(
      makeEvent("s1", "item/completed", {
        id: "cmd-1",
        type: "commandExecution",
        command: "npm test",
        cwd: "/app",
        status: "completed",
        output: "ok",
        exitCode: 0,
        durationMs: 200,
      })
    );
    const item = useSessionStore.getState().sessions["s1"]?.items["cmd-1"];
    expect(item?.type === "commandExecution" ? item.exitCode : null).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Delta events
// ---------------------------------------------------------------------------

describe("item/agentMessage/delta", () => {
  beforeEach(resetStore);

  it("appends delta to the correct message", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    useSessionStore.getState().appendMessage("s1", {
      id: "msg-1",
      role: "assistant",
      content: "Hello",
      createdAt: Date.now(),
    });
    routeEvent(
      makeEvent("s1", "item/agentMessage/delta", { messageId: "msg-1", delta: " world" })
    );
    const msg = useSessionStore.getState().sessions["s1"]?.messages.find(
      (m) => m.id === "msg-1"
    );
    expect(msg?.content).toBe("Hello world");
  });
});

describe("item/commandExecution/outputDelta", () => {
  beforeEach(resetStore);

  it("appends output delta to the command item", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    useSessionStore.getState().upsertItem("s1", {
      id: "cmd-1",
      type: "commandExecution",
      command: "ls",
      cwd: "/",
      status: "inProgress",
      output: "",
    });
    routeEvent(
      makeEvent("s1", "item/commandExecution/outputDelta", {
        itemId: "cmd-1",
        delta: "file.txt\n",
      })
    );
    const item = useSessionStore.getState().sessions["s1"]?.items["cmd-1"];
    expect(item?.type === "commandExecution" ? item.output : null).toBe("file.txt\n");
  });
});

describe("item/reasoning/summaryTextDelta", () => {
  beforeEach(resetStore);

  it("appends reasoning delta to the reasoning item", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    useSessionStore.getState().upsertItem("s1", {
      id: "r-1",
      type: "reasoning",
      summaryText: "I think",
      elapsedMs: 0,
      isStreaming: true,
    });
    routeEvent(
      makeEvent("s1", "item/reasoning/summaryTextDelta", {
        itemId: "r-1",
        delta: " therefore I am",
      })
    );
    const item = useSessionStore.getState().sessions["s1"]?.items["r-1"];
    expect(item?.type === "reasoning" ? item.summaryText : null).toBe(
      "I think therefore I am"
    );
  });
});

// ---------------------------------------------------------------------------
// turn/plan/updated
// ---------------------------------------------------------------------------

describe("turn/plan/updated", () => {
  beforeEach(resetStore);

  it("updates plan steps in the store", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    const steps = [
      { step: "Step 1", status: "completed" as const },
      { step: "Step 2", status: "inProgress" as const },
    ];
    routeEvent(
      makeEvent("s1", "turn/plan/updated", { itemId: "plan-1", steps })
    );
    const item = useSessionStore.getState().sessions["s1"]?.items["plan-1"];
    expect(item?.type).toBe("plan");
    expect(item?.type === "plan" ? item.steps : null).toEqual(steps);
  });
});

// ---------------------------------------------------------------------------
// account/updated
// ---------------------------------------------------------------------------

describe("account/updated", () => {
  beforeEach(resetStore);

  it("sets authState to apiKey", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    routeEvent(makeEvent("s1", "account/updated", { authMode: "apiKey" }));
    expect(useSessionStore.getState().sessions["s1"]?.authState).toEqual({ type: "apiKey" });
  });

  it("sets authState to chatgpt with email and planType", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    routeEvent(
      makeEvent("s1", "account/updated", {
        authMode: "chatgpt",
        email: "user@example.com",
        planType: "pro",
      })
    );
    expect(useSessionStore.getState().sessions["s1"]?.authState).toEqual({
      type: "chatgpt",
      email: "user@example.com",
      planType: "pro",
    });
  });

  it("does not change activeSessionId", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    seedSession({ id: "s2", projectPath: "/p" });
    useSessionStore.setState({ activeSessionId: "s2" });
    routeEvent(makeEvent("s1", "account/updated", { authMode: "apiKey" }));
    expect(useSessionStore.getState().activeSessionId).toBe("s2");
  });
});

// ---------------------------------------------------------------------------
// account/rateLimits/updated
// ---------------------------------------------------------------------------

describe("account/rateLimits/updated", () => {
  beforeEach(resetStore);

  it("updates rate limits in the store", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    const rateLimits = [
      {
        limitId: "rl-1",
        limitName: "Requests per minute",
        usedPercent: 75,
        windowDurationMins: 1,
        resetsAt: Date.now() + 60000,
      },
    ];
    routeEvent(makeEvent("s1", "account/rateLimits/updated", { rateLimits }));
    expect(useSessionStore.getState().sessions["s1"]?.rateLimits).toEqual(rateLimits);
  });
});

// ---------------------------------------------------------------------------
// error event
// ---------------------------------------------------------------------------

describe("error event", () => {
  beforeEach(resetStore);

  it("sets session to error state with the message", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    routeEvent(makeEvent("s1", "error", { message: "Connection lost" }));
    const session = useSessionStore.getState().sessions["s1"];
    expect(session?.status).toBe("error");
    expect(session?.errorMessage).toBe("Connection lost");
  });
});

// ---------------------------------------------------------------------------
// Background session — activeSessionId must not change
// ---------------------------------------------------------------------------

describe("Background session events do not change activeSessionId", () => {
  beforeEach(resetStore);

  it("events for a non-active session do not change activeSessionId", () => {
    seedSession({ id: "active", projectPath: "/p" });
    seedSession({ id: "background", projectPath: "/p" });
    useSessionStore.setState({ activeSessionId: "active" });

    const events: CodexEventPayload[] = [
      makeEvent("background", "turn/started", { turnId: "t1" }),
      makeEvent("background", "turn/completed", { status: "success" }),
      makeEvent("background", "account/updated", { authMode: "apiKey" }),
      makeEvent("background", "error", { message: "oops" }),
    ];

    for (const event of events) {
      routeEvent(event);
      expect(useSessionStore.getState().activeSessionId).toBe("active");
    }
  });
});

// ---------------------------------------------------------------------------
// routeRequest — sets pendingRequest
// ---------------------------------------------------------------------------

describe("routeRequest", () => {
  beforeEach(resetStore);

  it("sets pendingRequest on the correct session", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    const request: CodexRequestPayload = {
      agentId: "s1",
      details: ["detail"],
      message: "Approve?",
      method: "item/commandExecution/requestApproval",
      requestId: "req-1",
      title: "Approve",
    };
    routeRequest(request);
    expect(useSessionStore.getState().sessions["s1"]?.pendingRequest).toEqual(request);
  });

  it("does not change activeSessionId", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    seedSession({ id: "s2", projectPath: "/p" });
    useSessionStore.setState({ activeSessionId: "s2" });
    const request: CodexRequestPayload = {
      agentId: "s1",
      details: [],
      message: "Approve?",
      method: "item/commandExecution/requestApproval",
      requestId: "req-2",
      title: "Approve",
    };
    routeRequest(request);
    expect(useSessionStore.getState().activeSessionId).toBe("s2");
  });
});

// ---------------------------------------------------------------------------
// item/reasoning/summaryPartAdded — no-op
// ---------------------------------------------------------------------------

describe("item/reasoning/summaryPartAdded", () => {
  beforeEach(resetStore);

  it("is a no-op and does not throw", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    expect(() =>
      routeEvent(makeEvent("s1", "item/reasoning/summaryPartAdded", { itemId: "r-1" }))
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Unknown events — silently ignored
// ---------------------------------------------------------------------------

describe("Unknown events", () => {
  beforeEach(resetStore);

  it("silently ignores unknown event methods", () => {
    seedSession({ id: "s1", projectPath: "/p" });
    expect(() =>
      routeEvent(makeEvent("s1", "some/unknown/event", { foo: "bar" }))
    ).not.toThrow();
    // Session state unchanged
    expect(useSessionStore.getState().sessions["s1"]?.status).toBe("connected");
  });
});
