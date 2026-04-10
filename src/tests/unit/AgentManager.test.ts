import { describe, expect, it, vi } from "vitest";
import { AgentManager } from "@/main/codex/AgentManager";
import type { CodexModelOption } from "@/types/codex-bridge";

describe("AgentManager.send", () => {
  function makeManagerWithAgent(models: CodexModelOption[]) {
    const manager = new AgentManager() as AgentManager & {
      agents: Map<string, { send: ReturnType<typeof vi.fn> }>;
      models: Map<string, CodexModelOption[]>;
    };
    const send = vi.fn().mockResolvedValue(undefined);
    manager.agents.set("agent-1", { send });
    manager.models.set("agent-1", models);
    return { manager, send };
  }

  it("falls back to the default model when no model is provided", async () => {
    const { manager, send } = makeManagerWithAgent([
      { id: "gpt-5", label: "GPT-5", description: "", isDefault: true },
      { id: "gpt-5-mini", label: "GPT-5 Mini", description: "", isDefault: false },
    ]);

    await manager.send("agent-1", "hello");

    expect(send).toHaveBeenCalledWith("hello", expect.objectContaining({ model: "gpt-5" }));
  });

  it("maps a model label back to the corresponding model id", async () => {
    const { manager, send } = makeManagerWithAgent([
      { id: "gpt-5", label: "GPT-5", description: "", isDefault: true },
      { id: "gpt-5-mini", label: "GPT-5 Mini", description: "", isDefault: false },
    ]);

    await manager.send("agent-1", "hello", { model: "GPT-5 Mini" });

    expect(send).toHaveBeenCalledWith("hello", expect.objectContaining({ model: "gpt-5-mini" }));
  });

  it("falls back to the default model when the requested model is stale", async () => {
    const { manager, send } = makeManagerWithAgent([
      { id: "gpt-5", label: "GPT-5", description: "", isDefault: true },
      { id: "gpt-5-mini", label: "GPT-5 Mini", description: "", isDefault: false },
    ]);

    await manager.send("agent-1", "hello", { model: "missing-model" });

    expect(send).toHaveBeenCalledWith("hello", expect.objectContaining({ model: "gpt-5" }));
  });

  it("throws a clear error when the agent has no available models", async () => {
    const { manager } = makeManagerWithAgent([]);

    await expect(manager.send("agent-1", "hello")).rejects.toThrow(
      "No model available for agent-1"
    );
  });
});
