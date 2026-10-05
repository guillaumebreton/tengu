// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpServer } from "./http";
import { openRuntime } from "./runtime";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("HTTP API", () => {
  it("creates, lists, and submits input to an agent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tengu-http-"));
    const faux = fauxProvider();
    faux.setResponses([fauxAssistantMessage("Ready.")]);
    const runtime = await openRuntime({
      database: join(directory, "tengu.sqlite"),
      workspace: join(directory, "workspace"),
      provider: faux.provider,
    });
    const server = createHttpServer(runtime);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Server did not bind");
    const base = `http://127.0.0.1:${address.port}`;
    cleanups.push(async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await runtime.close();
      await rm(directory, { recursive: true, force: true });
    });

    const createdResponse = await fetch(`${base}/api/agents`, { method: "POST" });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { id: number };

    const listedResponse = await fetch(`${base}/api/agents`);
    expect(await listedResponse.json()).toEqual([{ id: created.id }]);

    const inputResponse = await fetch(`${base}/api/agents/${created.id}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Say ready", requestId: "request-1" }),
    });
    expect(inputResponse.status).toBe(202);
    expect(await inputResponse.json()).toMatchObject({ status: "placed" });
  });

  it("rejects invalid JSON input", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tengu-http-"));
    const faux = fauxProvider();
    const runtime = await openRuntime({
      database: join(directory, "tengu.sqlite"),
      workspace: join(directory, "workspace"),
      provider: faux.provider,
    });
    const conversation = await runtime.createConversation();
    const server = createHttpServer(runtime);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Server did not bind");
    cleanups.push(async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await runtime.close();
      await rm(directory, { recursive: true, force: true });
    });

    const response = await fetch(`http://127.0.0.1:${address.port}/api/agents/${conversation.id}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "content and requestId are required" });
  });
});
