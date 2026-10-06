import { describe, expect, it, vi } from "vitest";
import { connectToAgent, messagesFromSnapshot } from "./client";

describe("messagesFromSnapshot", () => {
  it("keeps committed user and assistant text in transcript order", () => {
    const messages = messagesFromSnapshot({
      type: "snapshot",
      entries: [
        { id: 2, conversationId: 1, kind: "pi.assistant", model: [{ role: "assistant", content: [{ type: "text", text: "Done" }] }] },
        { id: 1, conversationId: 1, kind: "pi.user", model: [{ role: "user", content: "Fix it" }] },
      ],
      tools: [],
      compactions: [],
      inbox: [],
      agent: {},
      usage: { models: {}, tools: {} },
    } as never);

    expect(messages).toEqual([
      { role: "user", text: "Fix it" },
      { role: "assistant", text: "Done" },
    ]);
  });

  it("reports event stream connection changes", () => {
    class Source {
      static instance: Source;
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor() { Source.instance = this; }
      close() {}
    }
    vi.stubGlobal("EventSource", Source);
    const connection = vi.fn();
    const close = connectToAgent(1, vi.fn(), connection);

    Source.instance.onopen?.();
    Source.instance.onerror?.();

    expect(connection.mock.calls).toEqual([["connected"], ["disconnected"]]);
    close();
    vi.unstubAllGlobals();
  });

  it("renders provider failures as assistant errors", () => {
    const messages = messagesFromSnapshot({
      type: "snapshot",
      entries: [{
        id: 1,
        conversationId: 1,
        kind: "pi.assistant",
        model: [{ role: "assistant", content: [], stopReason: "error", errorMessage: "Invalid API key" }],
      }],
      tools: [], compactions: [], inbox: [], agent: {}, usage: { models: {}, tools: {} },
    } as never);

    expect(messages).toEqual([{ role: "assistant", text: "Invalid API key", error: true }]);
  });
});
