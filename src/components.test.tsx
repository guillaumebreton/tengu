import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { ToolCall } from "./components";

afterEach(cleanup);

describe("ToolCall", () => {
  it("shows successful commands that produced no output", () => {
    render(<ToolCall name="bash" command="ls" output="" state="done" />);

    expect(screen.getByText("ls")).toBeInTheDocument();
    expect(screen.getByText("no output")).toBeInTheDocument();
  });
});
