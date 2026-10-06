// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { afterEach, describe, expect, it } from "vitest";
import { openRuntime } from "./runtime";
import { fauxModels } from "./test-runtime";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("runtime", () => {
  it("persists a coding conversation in the shared workspace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tengu-runtime-"));
    directories.push(directory);
    const database = join(directory, "tengu.sqlite");
    const workspace = join(directory, "workspace");

    const firstProvider = fauxProvider();
    firstProvider.setResponses([
      fauxAssistantMessage(fauxToolCall("write", { path: "proof.txt", content: "durable\n" }), { stopReason: "toolUse" }),
      fauxAssistantMessage("Done."),
    ]);

    const first = await openRuntime({ database, workspace, ...fauxModels(firstProvider) });
    const conversation = await first.createConversation();
    const settled = await first.submit(conversation.id, "Create proof.txt");

    expect(settled.status).toBe("done");
    expect(await readFile(join(workspace, "proof.txt"), "utf8")).toBe("durable\n");
    await first.close();

    const secondProvider = fauxProvider();
    const second = await openRuntime({ database, workspace, ...fauxModels(secondProvider) });
    const reopened = await second.conversation(conversation.id);

    expect(reopened.id).toBe(conversation.id);
    expect((await reopened.entries({}, 20, undefined, BACKGROUND_CONTEXT)).items.length).toBeGreaterThan(0);
    await second.close();
  });
});
