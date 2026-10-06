import type { AgentEvent, EntryRecord } from "@earendil-works/pi-durable";
import type { Message } from "./components";

export type LiveTool = {
  id: string;
  name: string;
  command: string;
  output: string;
  state: "running" | "done";
};

export type TranscriptItem =
  | { id: string; type: "message"; message: Message }
  | { id: string; type: "tool"; tool: LiveTool };

export type LiveState = {
  model: string;
  items: TranscriptItem[];
  partial: string;
  running: boolean;
  queued: number;
};

export const initialLiveState: LiveState = {
  model: "",
  items: [],
  partial: "",
  running: false,
  queued: 0,
};

export type LiveAction = AgentEvent
  | { type: "optimistic_input"; requestId: string; content: string }
  | { type: "optimistic_revert"; requestId: string; running: boolean };

export function optimisticInput(state: LiveState, requestId: string, content: string): LiveState {
  return {
    ...state,
    running: true,
    items: upsertItems(state.items, [{
      id: `request-${requestId}`,
      type: "message",
      message: { role: "user", text: content },
    }]),
  };
}

export function reduceAgentEvent(state: LiveState, event: LiveAction): LiveState {
  switch (event.type) {
    case "optimistic_input":
      return optimisticInput(state, event.requestId, event.content);
    case "optimistic_revert":
      return { ...state, running: event.running, items: state.items.filter((item) => item.id !== `request-${event.requestId}`) };
    case "snapshot":
      return {
        model: event.agent.model ? `${event.agent.model.provider}/${event.agent.model.modelId}` : "",
        items: itemsFromEntries(event.entries, event.tools.map((tool) => ({
          id: tool.callId,
          name: tool.name,
          command: "",
          output: tool.output ?? "",
          state: tool.status === "done" ? "done" : "running",
        }))),
        partial: event.generation?.message ? messageText(event.generation.message.content) : "",
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
    case "message_end":
      return { ...state, items: reconcileEntry(state.items, event.entry), partial: "" };
    case "tool_execution_start":
      return {
        ...state,
        items: upsertItems(state.items, [{ id: `tool-${event.toolCallId}`, type: "tool", tool: {
          id: event.toolCallId,
          name: event.toolName,
          command: event.toolName === "bash" && typeof event.args.command === "string" ? event.args.command : JSON.stringify(event.args),
          output: "",
          state: "running",
        }}]),
      };
    case "tool_execution_update":
      return {
        ...state,
        items: updateTool(state.items, event.toolCallId, (tool) => ({ ...tool, output: updateOutput(tool.output, event.output) })),
      };
    case "tool_execution_end": {
      const output = event.entry ? toolResultText(event.entry) : undefined;
      return {
        ...state,
        items: updateTool(state.items, event.toolCallId, (tool) => ({
          ...tool,
          ...(output === undefined ? {} : { output }),
          state: "done",
        })),
      };
    }
    default:
      return state;
  }
}

function itemsFromEntries(entries: readonly EntryRecord[], live: LiveTool[]): TranscriptItem[] {
  const messages = new Map<number, TranscriptItem[]>();
  for (const entry of entries) {
    const parsed = itemsFromEntry(entry);
    if (parsed.length > 0) messages.set(entry.id, parsed);
  }
  const toolsByEntry = new Map<number, LiveTool[]>();
  const toolEntries = toolsFromEntries(entries, live);
  for (const { entryId, tool } of toolEntries) {
    const list = toolsByEntry.get(entryId) ?? [];
    list.push(tool);
    toolsByEntry.set(entryId, list);
  }
  const ids = [...new Set([...messages.keys(), ...toolsByEntry.keys()])].sort((a, b) => a - b);
  return ids.flatMap((id) => [
    ...(messages.get(id) ?? []),
    ...(toolsByEntry.get(id) ?? []).map((tool) => ({ id: `tool-${tool.id}`, type: "tool" as const, tool })),
  ]);
}

function toolsFromEntries(entries: readonly EntryRecord[], live: LiveTool[]): { entryId: number; tool: LiveTool }[] {
  const tools = new Map<string, { entryId: number; tool: LiveTool }>();
  for (const entry of [...entries].sort((a, b) => entryId(a) - entryId(b))) {
    for (const message of entry.model ?? []) {
      if (message.role === "assistant") {
        for (const part of message.content) {
          if (part.type !== "toolCall") continue;
          const args = isRecord(part.arguments) ? part.arguments : {};
          tools.set(part.id, { entryId: entryId(entry), tool: {
            id: part.id,
            name: part.name,
            command: part.name === "bash" && typeof args.command === "string" ? args.command : JSON.stringify(args),
            output: "",
            state: "done",
          }});
        }
      } else if (message.role === "toolResult") {
        const found = tools.get(message.toolCallId);
        if (found) tools.set(message.toolCallId, {
          entryId: entryId(entry),
          tool: { ...found.tool, output: messageText(message.content), state: "done" },
        });
      }
    }
  }
  for (const tool of live) {
    const durable = tools.get(tool.id);
    tools.set(tool.id, {
      entryId: durable?.entryId ?? Number.MAX_SAFE_INTEGER,
      tool: {
        ...tool,
        command: tool.command || durable?.tool.command || "",
        output: tool.output || durable?.tool.output || "",
      },
    });
  }
  return [...tools.values()];
}

function itemsFromEntry(entry: EntryRecord): TranscriptItem[] {
  return (entry.model ?? []).flatMap((message, index) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const content = typeof message.content === "string" ? message.content : messageText(message.content);
    const error = message.role === "assistant" && message.stopReason === "error" ? message.errorMessage : undefined;
    if (!content && !error) return [];
    return [{
      id: `message-${entry.id}-${index}`,
      type: "message" as const,
      message: {
        role: message.role,
        text: content || error || "Agent request failed",
        ...(error ? { error: true } : {}),
      },
    }];
  });
}

function reconcileEntry(current: TranscriptItem[], entry: EntryRecord): TranscriptItem[] {
  const incoming = itemsFromEntry(entry);
  if (!incoming.some((item) => item.type === "message" && item.message.role === "user")) {
    return upsertItems(current, incoming);
  }
  const optimistic = current.findIndex((item) => item.id.startsWith("request-") && item.type === "message");
  const withoutOptimistic = optimistic < 0 ? current : current.filter((_, index) => index !== optimistic);
  return upsertItems(withoutOptimistic, incoming);
}

function upsertItems(current: TranscriptItem[], incoming: TranscriptItem[]): TranscriptItem[] {
  const ids = new Set(incoming.map((item) => item.id));
  return [...current.filter((item) => !ids.has(item.id)), ...incoming];
}

function updateTool(items: TranscriptItem[], id: string, update: (tool: LiveTool) => LiveTool): TranscriptItem[] {
  return items.map((item) => item.type === "tool" && item.tool.id === id
    ? { ...item, tool: update(item.tool) }
    : item);
}

function entryId(entry: EntryRecord): number {
  return entry.id;
}

function toolResultText(entry: EntryRecord): string | undefined {
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
