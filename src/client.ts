import type { AgentEvent, SnapshotEvent } from "@earendil-works/pi-durable";
import type { Message } from "./components";

export type Model = { provider: string; id: string; name: string };

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

export async function stopAgent(agentId: number): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/stop`, { method: "POST" });
  if (!response.ok) throw new Error("Could not stop agent");
}

export async function submitInput(agentId: number, content: string, steer = false): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/${steer ? "steer" : "input"}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, requestId: crypto.randomUUID() }),
  });
  if (!response.ok) throw new Error("Could not submit input");
}

function text(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } =>
      typeof part === "object" && part !== null && "type" in part && part.type === "text" && "text" in part)
    .map((part) => part.text)
    .join("");
}

export function messagesFromSnapshot(snapshot: SnapshotEvent): Message[] {
  return [...snapshot.entries].sort((a, b) => a.id - b.id).flatMap((entry) =>
    (entry.model ?? []).flatMap((message) => {
      if (message.role !== "user" && message.role !== "assistant") return [];
      const content = text(message.content);
      const error = message.role === "assistant" && message.stopReason === "error" ? message.errorMessage : undefined;
      return content || error
        ? [{ role: message.role, text: content || error || "Agent request failed", ...(error ? { error: true } : {}) }]
        : [];
    }));
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
