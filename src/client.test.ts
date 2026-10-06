import { describe, expect, it } from "vitest";
import { messagesFromSnapshot } from "./client";

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
