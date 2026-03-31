export type CodexModelOption = {
  id: string;
  description: string;
  isDefault: boolean;
  label: string;
};

export type CodexAgentSession = {
  agentId: string;
  cwd: string;
  defaultModel: string | null;
  models: CodexModelOption[];
  threadId: string;
};

export type CodexEventPayload = {
  agentId: string;
  method: string;
  params: unknown;
};

export type CodexRequestQuestion = {
  id: string;
  header: string;
  isOther: boolean;
  isSecret: boolean;
  options: string[];
  question: string;
};

export type CodexRequestPayload = {
  agentId: string;
  details: string[];
  message: string;
  method: string;
  questions?: CodexRequestQuestion[];
  requestId: string;
  title: string;
};

export type CodexRequestResponse = {
  action: "approve" | "approveSession" | "cancel" | "deny" | "submit";
  agentId: string;
  answers?: Record<string, string[]>;
  requestId: string;
};

export type CodexSessionCreatePayload = {
  sessionId: string;
  cwd: string;
};

export type CodexRpcCallPayload = {
  agentId: string;
  method: string;
  params: unknown;
};

export type CodexTurnInterruptPayload = {
  agentId: string;
  threadId: string;
  turnId: string;
};

export type CodexTurnSteerPayload = {
  agentId: string;
  threadId: string;
  input: unknown[];
  expectedTurnId: string;
};

export type CodexSessionReadyPayload = {
  sessionId: string;
  session: CodexAgentSession;
};
