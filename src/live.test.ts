import { describe, expect, it } from "vitest";
import { initialLiveState, reduceAgentEvent } from "./live";

describe("reduceAgentEvent", () => {
  it("streams assistant text and tool output through a run", () => {
    let state = reduceAgentEvent(initialLiveState, {
      type: "snapshot",
      entries: [], tools: [], compactions: [], inbox: [], agent: {}, usage: { models: {}, tools: {} },
    } as never);
    state = reduceAgentEvent(state, { type: "run_start", inputs: [1] } as never);
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
    expect(state.partial).toBe("Working");
    expect(state.tools).toEqual([{ id: "call-1", name: "bash", command: "npm test", output: "2 passed", state: "running" }]);

    state = reduceAgentEvent(state, { type: "tool_execution_end", toolCallId: "call-1", toolName: "bash" } as never);
    state = reduceAgentEvent(state, { type: "run_end", inputs: [1] } as never);

    expect(state.running).toBe(false);
    expect(state.tools[0].state).toBe("done");
  });
});
