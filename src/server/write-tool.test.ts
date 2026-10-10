import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { createTenguWriteTool } from "./write-tool.js";

const directories: string[] = [];

afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe("Tengu write tool", () => {
  it("returns an accurate unified patch when replacing a file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tengu-write-"));
    directories.push(directory);
    await writeFile(join(directory, "a.ts"), "old\n");
    const tool = createTenguWriteTool();

    const result = await tool.execute(
      { path: "a.ts", content: "new\n" },
      { env: new NodeExecutionEnv({ cwd: directory }), agent: async () => ({ cwd: directory }) } as never,
      {} as never,
    );

    expect((result.details as { patch: string }).patch).toContain("-old\n+new");
    expect(await readFile(join(directory, "a.ts"), "utf8")).toBe("new\n");
  });

  it("returns an added-file patch when creating a file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tengu-write-"));
    directories.push(directory);
    const tool = createTenguWriteTool();

    const result = await tool.execute(
      { path: "new.ts", content: "created\n" },
      { env: new NodeExecutionEnv({ cwd: directory }), agent: async () => ({ cwd: directory }) } as never,
      {} as never,
    );

    expect((result.details as { patch: string }).patch).toContain("+created");
  });
});
