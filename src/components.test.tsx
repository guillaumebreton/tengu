import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { ToolCall, Transcript } from "./components";

afterEach(cleanup);

describe("Transcript", () => {
  it("shows activity at the transcript insertion point while running", () => {
    render(<Transcript items={[]} running showExampleTool={false} />);

    expect(screen.getByLabelText("Agent is working")).toBeInTheDocument();
  });

  it("renders tool calls between surrounding messages", () => {
    const { container } = render(<Transcript
      items={[
        { type: "message", message: { role: "user", text: "Run ls" } },
        { type: "tool", tool: { id: "call-1", name: "bash", command: "ls", output: "src", state: "done" } },
        { type: "message", message: { role: "assistant", text: "Done" } },
      ]}
      showExampleTool={false}
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
