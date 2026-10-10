import { describe, expect, it } from "vitest";
import { initialLiveState, optimisticInput, reduceAgentEvent } from "./live";

describe("reduceAgentEvent", () => {
  it("shows submitted input immediately and reconciles its durable entry", () => {
    const optimistic = optimisticInput(initialLiveState, "request-1", "Run tests");
    expect(optimistic.running).toBe(true);
    expect(optimistic.items).toEqual([{
      id: "request-request-1",
      type: "message",
      message: { role: "user", text: "Run tests" },
    }]);

    const durable = reduceAgentEvent(optimistic, {
      type: "message_end",
      entry: { id: 1, conversationId: 1, kind: "pi.user", model: [{ role: "user", content: "Run tests" }] },
    } as never);

    expect(durable.items).toEqual([{
      id: "message-1-0",
      type: "message",
      message: { role: "user", text: "Run tests" },
    }]);
  });

  it("restores messages and tool calls in durable entry order", () => {
    const state = reduceAgentEvent(initialLiveState, {
      type: "snapshot",
      entries: [
        {
          id: 1,
          conversationId: 1,
          kind: "pi.user",
          model: [{ role: "user", content: "Run ls" }],
        },
        {
          id: 2,
          conversationId: 1,
          kind: "pi.assistant",
          model: [{ role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "bash", arguments: { command: "ls" } }] }],
        },
        {
          id: 3,
          conversationId: 1,
          kind: "pi.tool-result",
          model: [{ role: "toolResult", toolCallId: "call-1", toolName: "bash", content: [{ type: "text", text: "src\npackage.json\n" }] }],
        },
        {
          id: 4,
          conversationId: 1,
          kind: "pi.assistant",
          model: [{ role: "assistant", content: [{ type: "text", text: "Done" }] }],
        },
      ],
      tools: [], compactions: [], inbox: [], agent: {}, usage: { models: {}, tools: {} },
    } as never);

    expect(state.items).toEqual([
      { id: "message-1-0", type: "message", message: { role: "user", text: "Run ls" } },
      { id: "tool-call-1", type: "tool", tool: { id: "call-1", name: "bash", command: "ls", output: "src\npackage.json\n", state: "done" } },
      { id: "message-4-0", type: "message", message: { role: "assistant", text: "Done" } },
    ]);
  });

  it("restores provider failures as assistant errors", () => {
    const state = reduceAgentEvent(initialLiveState, {
      type: "snapshot",
      entries: [{
        id: 1,
        conversationId: 1,
        kind: "pi.assistant",
        model: [{ role: "assistant", content: [], stopReason: "error", errorMessage: "Invalid API key" }],
      }],
      tools: [], compactions: [], inbox: [], agent: {}, usage: { models: {}, tools: {} },
    } as never);

    expect(state.items).toEqual([{
      id: "message-1-0",
      type: "message",
      message: { role: "assistant", text: "Invalid API key", error: true },
    }]);
  });

  it("restores unified patches from edit tool results", () => {
    const state = reduceAgentEvent(initialLiveState, {
      type: "snapshot",
      agent: {},
      entries: [
        { id: 1, conversationId: 1, kind: "pi.assistant", model: [{ role: "assistant", content: [{ type: "toolCall", id: "edit-1", name: "edit", arguments: { path: "a.ts", edits: [] } }] }] },
        { id: 2, conversationId: 1, kind: "pi.tool-result", model: [{ role: "toolResult", toolCallId: "edit-1", toolName: "edit", content: [{ type: "text", text: "Successfully replaced" }], details: { patch: "--- a.ts\n+++ a.ts\n@@ -1 +1 @@\n-old\n+new" } }] },
      ],
      tools: [], compactions: [], inbox: [], usage: { models: {}, tools: {} },
    } as never);

    expect(state.items.find((item) => item.type === "tool")?.tool.diff).toContain("-old\n+new");
  });

  it("takes final output from a fast tool completion", () => {
    let state = reduceAgentEvent(initialLiveState, {
      type: "tool_execution_start", toolCallId: "call-1", toolName: "bash", args: { command: "ls" },
    } as never);

    state = reduceAgentEvent(state, {
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "bash",
      entry: {
        id: 2,
        conversationId: 1,
        kind: "pi.tool-result",
        model: [{ role: "toolResult", toolCallId: "call-1", toolName: "bash", content: [{ type: "text", text: "src\n" }] }],
      },
    } as never);

    expect(state.items[0]).toEqual({ id: "tool-call-1", type: "tool", tool: { id: "call-1", name: "bash", command: "ls", output: "src\n", state: "done" } });
  });

  it("streams assistant text and tool output through a run", () => {
    let state = reduceAgentEvent(initialLiveState, {
      type: "snapshot",
      entries: [], tools: [], compactions: [], inbox: [], agent: {}, usage: { models: {}, tools: {} },
    } as never);
    state = reduceAgentEvent(state, { type: "run_start", inputs: [1] } as never);
    state = reduceAgentEvent(state, {
      type: "inbox_update",
      items: [{ id: 4, mode: "followUp" }, { id: 5, mode: "steer" }],
    } as never);
    state = reduceAgentEvent(state, {
      type: "message_start",
      message: { role: "assistant", content: [] },
    } as never);
    state = reduceAgentEvent(state, {
      type: "message_update",
      usage: {},
      changes: [{ type: "text_delta", contentIndex: 0, delta: "Working" }],
    } as never);
    state = reduceAgentEvent(state, {
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "bash",
      args: { command: "npm test" },
    } as never);
    state = reduceAgentEvent(state, {
      type: "tool_execution_update",
      toolCallId: "call-1",
      toolName: "bash",
      output: { append: "2 passed" },
    } as never);

    expect(state.running).toBe(true);
    expect(state.queued).toBe(2);
    expect(state.partial).toBe("Working");
    expect(state.items).toContainEqual({ id: "tool-call-1", type: "tool", tool: { id: "call-1", name: "bash", command: "npm test", output: "2 passed", state: "running" } });

    state = reduceAgentEvent(state, { type: "tool_execution_end", toolCallId: "call-1", toolName: "bash" } as never);
    state = reduceAgentEvent(state, { type: "run_end", inputs: [1] } as never);

    expect(state.running).toBe(false);
    expect(state.items.find((item) => item.type === "tool")?.tool.state).toBe("done");
  });
});
