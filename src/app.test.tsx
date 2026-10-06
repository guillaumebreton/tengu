import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";

const close = vi.fn();

class TestEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor() {
    queueMicrotask(() => {
      this.onopen?.();
      this.onmessage?.(new MessageEvent("message", {
      data: JSON.stringify({
        type: "snapshot",
        run: { inputs: [1] },
        entries: [{ id: 1, conversationId: 1, kind: "pi.user", model: [{ role: "user", content: "Fix the flaky login test" }] }],
        tools: [], compactions: [], inbox: [], agent: { model: { provider: "openai", modelId: "gpt-5.4" } }, usage: { models: {}, tools: {} },
      }),
      }));
    });
  }

  close = close;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("offers to create the first agent", async () => {
    vi.stubGlobal("EventSource", TestEventSource);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([])))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ provider: "openai-codex", id: "gpt-5.6-terra", name: "GPT-5.6 Terra" }]))));

    render(<App />);

    expect(await screen.findByText("No agents yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create agent" })).toBeInTheDocument();
  });

  it("supports global keyboard actions", async () => {
    vi.stubGlobal("EventSource", TestEventSource);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 2, title: "Second agent", preview: "" },
        { id: 1, title: "First agent", preview: "" },
      ])))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ provider: "openai", id: "gpt-5.4", name: "gpt-5.4" }])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 3 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Second agent" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "c" });
    expect(screen.getByRole("textbox", { name: "Message Tengu" })).toHaveFocus();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("complementary")).toHaveAttribute("data-open", "true");

    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(await screen.findByRole("heading", { name: "First agent" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("complementary")).toHaveAttribute("data-open", "false");

    fireEvent.keyDown(window, { key: "n" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/agents", { method: "POST" }));
    expect(await screen.findByRole("heading", { name: "New agent" })).toBeInTheDocument();
  });

  it("shows a selected agent and submits a prompt", async () => {
    vi.stubGlobal("EventSource", TestEventSource);
    vi.stubGlobal("crypto", { randomUUID: () => "request-1" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, title: "Fix the flaky login test", preview: "" }])))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ provider: "openai", id: "gpt-5.4", name: "gpt-5.4" }])))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "placed" }), { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Fix the flaky login test" })).toBeInTheDocument();
    const userMessage = await screen.findByText("Fix the flaky login test", { selector: ".message > p:last-child" });
    expect(userMessage.closest(".message")).toHaveClass("user");
    expect(screen.queryByText("you", { selector: ".speaker" })).not.toBeInTheDocument();
    expect(screen.queryByText("tengu", { selector: ".speaker" })).not.toBeInTheDocument();
    expect(screen.getByText("agents")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("openai/gpt-5.4");

    fireEvent.change(screen.getByRole("combobox", { name: "Model" }), { target: { value: "openai/gpt-5.4" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/agents/1/model", expect.objectContaining({ method: "PUT" })));

    const composer = screen.getByRole("textbox", { name: "Message Tengu" });
    fireEvent.input(composer, { target: { value: "Run the focused test again" } });
    fireEvent.click(screen.getByRole("button", { name: "Steer agent" }));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/agents/1/steer", expect.objectContaining({ method: "POST" })));
    expect(composer).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "stop" }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/agents/1/stop", { method: "POST" }));
  });
});
