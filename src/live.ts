import type { AgentEvent } from "@earendil-works/pi-durable";
import { messagesFromSnapshot } from "./client";
import type { Message } from "./components";

export type LiveTool = {
  id: string;
  name: string;
  command: string;
  output: string;
  state: "running" | "done";
};

export type LiveState = {
  model: string;
  messages: Message[];
  partial: string;
  tools: LiveTool[];
  running: boolean;
  queued: number;
};

export const initialLiveState: LiveState = {
  model: "",
  messages: [],
  partial: "",
  tools: [],
  running: false,
  queued: 0,
};

export function reduceAgentEvent(state: LiveState, event: AgentEvent): LiveState {
  switch (event.type) {
    case "snapshot":
      return {
        model: event.agent.model ? `${event.agent.model.provider}/${event.agent.model.modelId}` : "",
        messages: messagesFromSnapshot(event),
        partial: event.generation?.message ? messageText(event.generation.message.content) : "",
        tools: toolsFromEntries(event.entries, event.tools.map((tool) => ({
          id: tool.callId,
          name: tool.name,
          command: "",
          output: tool.output ?? "",
          state: tool.status === "done" ? "done" : "running",
        }))),
        running: event.run !== undefined,
        queued: event.inbox.length,
      };
    case "agent_changed":
      return { ...state, model: event.agent.model ? `${event.agent.model.provider}/${event.agent.model.modelId}` : "" };
    case "inbox_update":
      return { ...state, queued: event.items.length };
    case "run_start":
      return { ...state, running: true };
    case "run_end":
      return { ...state, running: false, partial: "" };
    case "message_start":
      return event.message.role === "assistant" ? { ...state, partial: messageText(event.message.content) } : state;
    case "message_update":
      return {
        ...state,
        partial: event.changes.reduce((text, change) => {
          if (change.type === "text_delta") return text + change.delta;
          if (change.type === "text_start" || change.type === "block") return change.block.type === "text" ? text + change.block.text : text;
          if (change.type === "message") return messageText(change.message.content);
          return text;
        }, state.partial),
      };
    case "message_end": {
      const messages = messagesFromSnapshot({
        type: "snapshot", entries: [event.entry], tools: [], compactions: [], inbox: [], agent: {}, usage: { models: {}, tools: {} },
      });
      return { ...state, messages: [...state.messages, ...messages], partial: "" };
    }
    case "tool_execution_start":
      return {
        ...state,
        tools: [...state.tools, {
          id: event.toolCallId,
          name: event.toolName,
          command: event.toolName === "bash" && typeof event.args.command === "string" ? event.args.command : JSON.stringify(event.args),
          output: "",
          state: "running",
        }],
      };
    case "tool_execution_update":
      return {
        ...state,
        tools: state.tools.map((tool) => tool.id === event.toolCallId
          ? { ...tool, output: updateOutput(tool.output, event.output) }
          : tool),
      };
    case "tool_execution_end": {
      const output = event.entry ? toolResultText(event.entry) : undefined;
      return {
        ...state,
        tools: state.tools.map((tool) => tool.id === event.toolCallId
          ? { ...tool, ...(output === undefined ? {} : { output }), state: "done" }
          : tool),
      };
    }
    default:
      return state;
  }
}

function toolsFromEntries(entries: readonly { id?: unknown; model?: readonly unknown[] }[], live: LiveTool[]): LiveTool[] {
  const tools = new Map<string, LiveTool>();
  for (const entry of [...entries].sort((a, b) => entryId(a) - entryId(b))) {
    for (const message of entry.model ?? []) {
      if (!isRecord(message)) continue;
      if (message.role === "assistant" && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (!isRecord(part) || part.type !== "toolCall" || typeof part.id !== "string" || typeof part.name !== "string") continue;
          const args = isRecord(part.arguments) ? part.arguments : {};
          tools.set(part.id, {
            id: part.id,
            name: part.name,
            command: part.name === "bash" && typeof args.command === "string" ? args.command : JSON.stringify(args),
            output: "",
            state: "done",
          });
        }
      }
      if (message.role === "toolResult" && typeof message.toolCallId === "string") {
        const tool = tools.get(message.toolCallId);
        if (tool) tools.set(message.toolCallId, { ...tool, output: messageText(message.content), state: "done" });
      }
    }
  }
  for (const tool of live) {
    const durable = tools.get(tool.id);
    tools.set(tool.id, {
      ...tool,
      command: tool.command || durable?.command || "",
      output: tool.output || durable?.output || "",
    });
  }
  return [...tools.values()];
}

function entryId(entry: { id?: unknown }): number {
  return typeof entry.id === "number" ? entry.id : 0;
}

function toolResultText(entry: { model?: readonly unknown[] }): string | undefined {
  const result = entry.model?.find((message) => isRecord(message) && message.role === "toolResult");
  return isRecord(result) ? messageText(result.content) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function messageText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function updateOutput(current: string, update: { trimStart?: number; append?: string } | { set: string } | undefined): string {
  if (!update) return current;
  if ("set" in update) return update.set;
  return current.slice(update.trimStart ?? 0) + (update.append ?? "");
}
