import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolCall, Transcript } from "./components";

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

    expect([...container.querySelectorAll(".message")].map((node) => node.textContent)).toEqual(["Run ls", "$lssrc", "Done"]);
  });
});

describe("ToolCall", () => {
  it("shows successful commands that produced no output", () => {
    render(<ToolCall name="bash" command="ls" output="" state="done" />);

    expect(screen.getByText("ls")).toBeInTheDocument();
    expect(screen.getByText("no output")).toBeInTheDocument();
  });
});
