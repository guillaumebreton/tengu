import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { App } from "./app";

describe("App", () => {
  it("shows the selected conversation and accepts a prompt", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Fix the flaky login test" })).toBeInTheDocument();

    const composer = screen.getByRole("textbox", { name: "Message Tengu" });
    fireEvent.input(composer, { target: { value: "Run the focused test again" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("Run the focused test again")).toBeInTheDocument();
    expect(composer).toHaveValue("");
  });
});
