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
  messages: Message[];
  partial: string;
  tools: LiveTool[];
  running: boolean;
};

export const initialLiveState: LiveState = {
  messages: [],
  partial: "",
  tools: [],
  running: false,
};

export function reduceAgentEvent(state: LiveState, event: AgentEvent): LiveState {
  switch (event.type) {
    case "snapshot":
      return {
        messages: messagesFromSnapshot(event),
        partial: event.generation?.message ? messageText(event.generation.message.content) : "",
        tools: event.tools.map((tool) => ({
          id: tool.callId,
          name: tool.name,
          command: "",
          output: tool.output ?? "",
          state: tool.status === "done" ? "done" : "running",
        })),
        running: event.run !== undefined,
      };
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
    case "tool_execution_end":
      return { ...state, tools: state.tools.map((tool) => tool.id === event.toolCallId ? { ...tool, state: "done" } : tool) };
    default:
      return state;
  }
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
