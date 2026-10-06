import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop chat layout", () => {
  it("contains the transcript and composer within the viewport grid", () => {
    const css = readFileSync("src/styles.css", "utf8");

    const rule = css.match(/\.chat\s*\{([^}]*)\}/s)?.[1] ?? "";
    expect(rule).toContain("height: 100%");
    expect(rule).toContain("min-height: 0");
    expect(rule).toContain("overflow: hidden");
  });
});
