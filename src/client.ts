import type { AgentEvent } from "@earendil-works/pi-durable";

export type Model = { provider: string; id: string; name: string };
export type Provider = { id: string; name: string; configured: boolean; source: string | null; label: string | null; apiKey: boolean; oauth: string | null; models: number };
export type AuthPrompt = { id: string; type: "text" | "secret" | "manual_code"; message: string; placeholder?: string }
  | { id: string; type: "select"; message: string; options: readonly { id: string; label: string; description?: string }[] };
export type AuthEvent = { type: "auth_url"; url: string; instructions?: string }
  | { type: "device_code"; userCode: string; verificationUri: string }
  | { type: "info" | "progress"; message: string; links?: readonly { url: string; label?: string }[] };
export type AuthFlow = { id: string; providerId: string; events: AuthEvent[]; prompt: AuthPrompt | null; done: { ok: boolean; error?: string } | null };

export type Agent = {
  id: number;
  title: string;
  preview: string;
};

export async function listAgents(): Promise<Agent[]> {
  const response = await fetch("/api/agents");
  if (!response.ok) throw new Error("Could not load agents");
  return response.json();
}

export async function listModels(): Promise<Model[]> {
  const response = await fetch("/api/models");
  if (!response.ok) throw new Error("Could not load models");
  return response.json();
}

export async function listProviders(): Promise<Provider[]> {
  const response = await fetch("/api/providers");
  if (!response.ok) throw new Error("Could not load providers");
  return response.json();
}

export async function startProviderLogin(providerId: string, type: "oauth" | "api_key"): Promise<string> {
  const response = await fetch(`/api/providers/${encodeURIComponent(providerId)}/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type }),
  });
  if (!response.ok) throw new Error("Could not start sign in");
  return (await response.json() as { flowId: string }).flowId;
}

export async function getAuthFlow(id: string): Promise<AuthFlow> {
  const response = await fetch(`/api/auth/${id}`);
  if (!response.ok) throw new Error("Could not continue sign in");
  return response.json();
}

export async function answerAuth(flowId: string, promptId: string, value?: string): Promise<void> {
  const response = await fetch(`/api/auth/${flowId}/${promptId}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value === undefined ? { cancel: true } : { value }),
  });
  if (!response.ok) throw new Error("Could not continue sign in");
}

export async function cancelAuth(flowId: string): Promise<void> {
  await fetch(`/api/auth/${flowId}`, { method: "DELETE" });
}

export async function logoutProvider(providerId: string): Promise<void> {
  const response = await fetch(`/api/providers/${encodeURIComponent(providerId)}/logout`, { method: "POST" });
  if (!response.ok) throw new Error("Could not sign out");
}

export async function setAgentModel(agentId: number, model: Model): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/model`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: model.provider, id: model.id }),
  });
  if (!response.ok) throw new Error("Could not change model");
}

export async function createAgent(): Promise<Agent> {
  const response = await fetch("/api/agents", { method: "POST" });
  if (!response.ok) throw new Error("Could not create agent");
  const { id } = await response.json() as { id: number };
  return { id, title: "New agent", preview: "" };
}

export async function renameAgent(agentId: number, name: string): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/name`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error("Could not rename agent");
}

export async function stopAgent(agentId: number): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/stop`, { method: "POST" });
  if (!response.ok) throw new Error("Could not stop agent");
}

export async function submitInput(agentId: number, content: string, requestId: string, steer = false): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/${steer ? "steer" : "input"}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, requestId }),
  });
  if (!response.ok) throw new Error("Could not submit input");
}

export function connectToAgent(
  agentId: number,
  receive: (event: AgentEvent) => void,
  connection: (state: "connected" | "disconnected") => void,
): () => void {
  const source = new EventSource(`/api/agents/${agentId}/events`);
  source.onopen = () => connection("connected");
  source.onerror = () => connection("disconnected");
  source.onmessage = (message) => receive(JSON.parse(message.data) as AgentEvent);
  return () => source.close();
}
