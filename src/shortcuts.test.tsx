import { cleanup, fireEvent, render } from "@testing-library/preact";
import { useGlobalShortcuts } from "./shortcuts";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

function Subject({ shortcuts }: { shortcuts: Record<string, () => void> }) {
  useGlobalShortcuts(shortcuts);
  return <textarea aria-label="Editor" />;
}

describe("useGlobalShortcuts", () => {
  it("maps normalized keys to functions", () => {
    const create = vi.fn();
    const open = vi.fn();
    render(<Subject shortcuts={{ n: create, "mod+k": open }} />);

    fireEvent.keyDown(window, { key: "N" });
    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(create).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledOnce();
  });

  it("ignores unmodified shortcuts while typing", () => {
    const create = vi.fn();
    const { getByRole } = render(<Subject shortcuts={{ n: create }} />);

    fireEvent.keyDown(getByRole("textbox", { name: "Editor" }), { key: "n" });

    expect(create).not.toHaveBeenCalled();
  });
});
