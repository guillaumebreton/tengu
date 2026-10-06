import { describe, expect, it, vi } from "vitest";
import { connectToAgent } from "./client";

describe("connectToAgent", () => {
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
});
