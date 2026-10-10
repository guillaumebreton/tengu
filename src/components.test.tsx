import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer, MessageRow, ToolCall, Transcript } from "./components";

afterEach(cleanup);

describe("Transcript", () => {
  it("scrolls to new transcript content", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { rerender } = render(<Transcript items={[]} />);

    rerender(<Transcript items={[{ id: "message-1", type: "message", message: { role: "assistant", text: "Done" } }]} />);

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("shows activity at the transcript insertion point while running", () => {
    render(<Transcript items={[]} running />);

    expect(screen.getByLabelText("Agent is working")).toBeInTheDocument();
  });

  it("renders tool calls between surrounding messages", () => {
    const { container } = render(<Transcript
      items={[
        { id: "message-test", type: "message", message: { role: "user", text: "Run ls" } },
        { id: "tool-call-1", type: "tool", tool: { id: "call-1", name: "bash", command: "ls", output: "src", state: "done" } },
        { id: "message-test", type: "message", message: { role: "assistant", text: "Done" } },
      ]}
    />);

    expect([...container.querySelectorAll(".message")].map((node) => node.textContent?.trim())).toEqual(["Run ls", "$lssrc", "Done"]);
  });
});

describe("MessageRow", () => {
  it("renders assistant Markdown", () => {
    render(<MessageRow message={{ role: "assistant", text: "## Result\n\n- one\n- two\n\n`code`" }} />);

    expect(screen.getByRole("heading", { name: "Result" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("code").tagName).toBe("CODE");
  });

  it("keeps user messages as plain text", () => {
    render(<MessageRow message={{ role: "user", text: "**not bold**" }} />);

    expect(screen.getByText("**not bold**")).toBeInTheDocument();
    expect(screen.queryByText("not bold", { selector: "strong" })).not.toBeInTheDocument();
  });

  it("removes unsafe HTML and links from assistant messages", () => {
    const { container } = render(<MessageRow message={{ role: "assistant", text: '<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n[good](https://example.com)' }} />);

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "bad" })).not.toBeInTheDocument();
    expect(screen.getByText("bad")).not.toHaveAttribute("href");
    expect(screen.getByRole("link", { name: "good" })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByRole("link", { name: "good" })).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("Composer", () => {
  it("places model selection beside the send action", () => {
    render(<Composer value="" onInput={() => {}} onSubmit={() => {}} models={[{ id: "openai/gpt", label: "openai · GPT" }]} model="openai/gpt" onModelChange={() => {}} />);

    expect(screen.getByRole("combobox", { name: "Model" }).closest(".composer-actions")).toBeInTheDocument();
  });

  it("disables browser writing suggestions", () => {
    render(<Composer value="" onInput={() => {}} onSubmit={() => {}} models={[]} model="" onModelChange={() => {}} />);

    const input = screen.getByRole("textbox", { name: "Message Tengu" });
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("autocapitalize", "off");
  });
});

describe("ToolCall", () => {
  it("shows successful commands that produced no output", () => {
    render(<ToolCall name="bash" command="ls" output="" state="done" />);

    expect(screen.getByText("ls")).toBeInTheDocument();
    expect(screen.getByText("no output")).toBeInTheDocument();
  });
});
