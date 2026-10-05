import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";

const close = vi.fn();

class TestEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor() {
    queueMicrotask(() => this.onmessage?.(new MessageEvent("message", {
      data: JSON.stringify({
        type: "snapshot",
        entries: [{ id: 1, conversationId: 1, kind: "pi.user", model: [{ role: "user", content: "Fix the flaky login test" }] }],
        tools: [], compactions: [], inbox: [], agent: { model: { provider: "openai", modelId: "gpt-5.4" } }, usage: { models: {}, tools: {} },
      }),
    })));
  }

  close = close;
}

afterEach(() => vi.restoreAllMocks());

describe("App", () => {
  it("shows a selected agent and submits a prompt", async () => {
    vi.stubGlobal("EventSource", TestEventSource);
    vi.stubGlobal("crypto", { randomUUID: () => "request-1" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, title: "Fix the flaky login test", preview: "" }])))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ provider: "openai", id: "gpt-5.4", name: "gpt-5.4" }])))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "placed" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Fix the flaky login test" })).toBeInTheDocument();
    expect(await screen.findByText("Fix the flaky login test", { selector: ".message > p:last-child" })).toBeInTheDocument();
    expect(screen.getByText("agents")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("openai/gpt-5.4");

    fireEvent.change(screen.getByRole("combobox", { name: "Model" }), { target: { value: "openai/gpt-5.4" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/agents/1/model", expect.objectContaining({ method: "PUT" })));

    const composer = screen.getByRole("textbox", { name: "Message Tengu" });
    fireEvent.input(composer, { target: { value: "Run the focused test again" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/agents/1/input", expect.objectContaining({ method: "POST" })));
    expect(composer).toHaveValue("");
  });
});
