import type { ServerNotification, ServerRequest, v2 } from "@/codex-schema";
import type { CodexAgentSession, CodexModelOption } from "@/types/codex-bridge";
import { logger } from "@/utils/logger";
import {
  CodexAgent,
  type CodexAgentSnapshot,
  type CodexServerRequestResult,
} from "./CodexAgent";

type EnsureAgentOptions = {
  approvalPolicy?: v2.AskForApproval;
  codexBin?: string;
  cwd: string;
  model?: string | null;
  sandbox?: v2.SandboxMode;
};

export class AgentManager {
  private readonly agents = new Map<string, CodexAgent>();
  private readonly models = new Map<string, CodexModelOption[]>();

  onEvent?: (agentId: string, event: ServerNotification) => void;
  onRequest?: (
    agentId: string,
    request: ServerRequest
  ) => Promise<CodexServerRequestResult>;

  async ensure(agentId: string, options: EnsureAgentOptions): Promise<CodexAgentSession> {
    logger.debug("[Codex][Manager] ensure:start", { agentId });
    const existing = this.agents.get(agentId);
    if (existing) {
      const snapshot = existing.getSnapshot();
      if (snapshot.cwd === options.cwd) {
        return {
          agentId,
          cwd: snapshot.cwd,
          defaultModel: getDefaultModel(this.models.get(agentId) ?? []),
          models: this.models.get(agentId) ?? [],
          threadId: snapshot.threadId,
        };
      }

      logger.debug("[Codex][Manager] ensure:recreate", { agentId });
      this.kill(agentId);
    }

    const agent = new CodexAgent(agentId, options.codexBin);
    agent.on("event", (event) => {
      this.onEvent?.(agentId, event);
    });
    agent.on("error", (error) => {
      this.onEvent?.(agentId, {
        method: "error",
        params: {
          message: error.message,
        },
      } as unknown as ServerNotification);
    });
    agent.onRequest = (request) =>
      this.onRequest
        ? this.onRequest(agentId, request)
        : Promise.resolve(getFallbackResult(request));

    const thread = await agent.start(options);
    const models = mapModels(await agent.listModels());
    logger.debug("[Codex][Manager] ensure:ready", {
      agentId,
      modelCount: models.length,
      threadId: thread.thread.id,
    });

    this.agents.set(agentId, agent);
    this.models.set(agentId, models);

    return {
      agentId,
      cwd: thread.cwd,
      defaultModel: getDefaultModel(models),
      models,
      threadId: thread.thread.id,
    };
  }

  getSnapshot(agentId: string): CodexAgentSnapshot | null {
    return this.agents.get(agentId)?.getSnapshot() ?? null;
  }

  kill(agentId: string) {
    logger.debug("[Codex][Manager] kill", { agentId });
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    agent.destroy();
    this.agents.delete(agentId);
    this.models.delete(agentId);
  }

  killAll() {
    for (const agentId of this.agents.keys()) {
      this.kill(agentId);
    }
  }

  list() {
    return Array.from(this.agents.keys());
  }

  async send(agentId: string, text: string, options?: { model?: string | null; collaborationMode?: string | null; approvalPolicy?: string | null; effort?: string | null; attachments?: string[] }) {
    logger.debug("[Codex][Manager] send", { agentId });
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`No Codex agent found for ${agentId}`);
    }

    const resolvedModel = resolveModel(this.models.get(agentId) ?? [], options?.model);
    if (!resolvedModel) {
      throw new Error(`No model available for ${agentId}`);
    }

    return agent.send(text, {
      ...options,
      model: resolvedModel,
    });
  }
}

function getDefaultModel(models: CodexModelOption[]) {
  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null;
}

function resolveModel(
  models: CodexModelOption[],
  requestedModel?: string | null
) {
  if (requestedModel) {
    const exactId = models.find((model) => model.id === requestedModel);
    if (exactId) {
      return exactId.id;
    }

    const exactLabel = models.find((model) => model.label === requestedModel);
    if (exactLabel) {
      return exactLabel.id;
    }
  }

  return getDefaultModel(models);
}

function getFallbackResult(request: ServerRequest): CodexServerRequestResult {
  switch (request.method) {
    case "item/commandExecution/requestApproval":
      return { decision: "decline" };
    case "item/fileChange/requestApproval":
      return { decision: "decline" };
    case "item/permissions/requestApproval":
      return {
        permissions: {},
        scope: "turn",
      };
    case "item/tool/requestUserInput":
      return { answers: {} };
    case "mcpServer/elicitation/request":
      return { _meta: null, action: "decline", content: null };
    case "applyPatchApproval":
      return { decision: "denied" };
    case "execCommandApproval":
      return { decision: "denied" };
    default:
      throw new Error(`Unsupported server request: ${request.method}`);
  }
}

function mapModels(models: v2.Model[]): CodexModelOption[] {
  return models.map((model) => ({
    description: model.description,
    id: model.id,
    isDefault: model.isDefault,
    label: model.displayName || model.model,
  }));
}
