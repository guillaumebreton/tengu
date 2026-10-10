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
  it("lists only models backed by stored credentials", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tengu-model-filter-"));
    directories.push(directory);
    const faux = fauxProvider();
    const configured = fauxModels(faux);
    const runtime = await openRuntime({
      database: join(directory, "tengu.sqlite"),
      workspace: join(directory, "workspace"),
      ...configured,
      storedProviderIds: async () => [],
    });

    expect(await runtime.listModels()).toEqual([]);
    await expect(runtime.createConversation()).rejects.toThrow("Configure a model provider");
    await runtime.close();
  });

  it("persists a custom agent name", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tengu-agent-name-"));
    directories.push(directory);
    const database = join(directory, "tengu.sqlite");
    const workspace = join(directory, "workspace");
    const first = await openRuntime({ database, workspace, ...fauxModels(fauxProvider()) });
    const conversation = await first.createConversation();
    await first.renameConversation(conversation.id, "Release agent");
    expect((await first.listConversations())[0].title).toBe("Release agent");
    await first.close();

    const second = await openRuntime({ database, workspace, ...fauxModels(fauxProvider()) });
    expect((await second.listConversations())[0].title).toBe("Release agent");
    await second.close();
  });

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
    await first.createConversation();
    const settled = await (await conversation.submit(
      { type: "input", content: "Create proof.txt" },
      BACKGROUND_CONTEXT,
    )).wait(BACKGROUND_CONTEXT);

    expect(settled.status).toBe("done");
    expect(await readFile(join(workspace, "proof.txt"), "utf8")).toBe("durable\n");
    await first.close();

    const secondProvider = fauxProvider();
    const second = await openRuntime({ database, workspace, ...fauxModels(secondProvider) });
    const reopened = await second.conversation(conversation.id);
    const conversations = await second.listConversations();

    expect(conversations.map(({ id }) => id)).toEqual([...conversations.map(({ id }) => id)].sort((a, b) => b - a));
    expect(reopened.id).toBe(conversation.id);
    expect((await reopened.entries({}, 20, undefined, BACKGROUND_CONTEXT)).items.length).toBeGreaterThan(0);
    await second.close();
  });
});
