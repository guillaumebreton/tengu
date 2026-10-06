// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpServer } from "./http";
import { openRuntime } from "./runtime";
import { fauxModels } from "./test-runtime";

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
      ...fauxModels(faux),
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
    expect(await listedResponse.json()).toEqual([{ id: created.id, title: "New agent", preview: "" }]);

    const inputResponse = await fetch(`${base}/api/agents/${created.id}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Say ready", requestId: "request-1" }),
    });
    expect(inputResponse.status).toBe(202);
    expect(await inputResponse.json()).toMatchObject({ status: "placed" });
  });

  it("steers a busy agent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tengu-steer-"));
    const faux = fauxProvider();
    faux.setResponses([fauxAssistantMessage("Steered.")]);
    const runtime = await openRuntime({
      database: join(directory, "tengu.sqlite"),
      workspace: join(directory, "workspace"),
      ...fauxModels(faux),
    });
    const conversation = await runtime.createConversation();
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

    const response = await fetch(`${base}/api/agents/${conversation.id}/steer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Change direction", requestId: "steer-1" }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ requestId: "steer-1" });
  });

  it("stops an agent run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tengu-stop-"));
    const faux = fauxProvider();
    const runtime = await openRuntime({
      database: join(directory, "tengu.sqlite"),
      workspace: join(directory, "workspace"),
      ...fauxModels(faux),
    });
    const conversation = await runtime.createConversation();
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

    const response = await fetch(`${base}/api/agents/${conversation.id}/stop`, { method: "POST" });

    expect(response.status).toBe(204);
  });

  it("lists models and changes an agent model", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tengu-models-"));
    const faux = fauxProvider();
    const runtime = await openRuntime({
      database: join(directory, "tengu.sqlite"),
      workspace: join(directory, "workspace"),
      ...fauxModels(faux),
    });
    const conversation = await runtime.createConversation();
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

    expect(await (await fetch(`${base}/api/models`)).json()).toEqual([
      { provider: "faux", id: "faux-1", name: "Faux Model" },
    ]);
    const response = await fetch(`${base}/api/agents/${conversation.id}/model`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "faux", id: "faux-1" }),
    });
    expect(response.status).toBe(204);
    expect(await runtime.getModel(conversation.id)).toEqual({ provider: "faux", id: "faux-1" });
  });

  it("streams a snapshot and committed agent events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tengu-events-"));
    const faux = fauxProvider();
    faux.setResponses([fauxAssistantMessage("Streamed.")]);
    const runtime = await openRuntime({
      database: join(directory, "tengu.sqlite"),
      workspace: join(directory, "workspace"),
      ...fauxModels(faux),
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

    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/agents/${conversation.id}/events`, {
      signal: controller.signal,
    });
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = decoder.decode((await reader.read()).value);
    expect(received).toContain('"type":"snapshot"');

    await fetch(`http://127.0.0.1:${address.port}/api/agents/${conversation.id}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Stream this", requestId: "stream-1" }),
    });
    while (!received.includes('"type":"message_end"')) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += decoder.decode(chunk.value);
    }
    expect(received).toContain('"type":"message_end"');
    controller.abort();

    const reconnected = await fetch(`http://127.0.0.1:${address.port}/api/agents/${conversation.id}/events`);
    const reconnectReader = reconnected.body!.getReader();
    const reconnectSnapshot = decoder.decode((await reconnectReader.read()).value);
    expect(reconnectSnapshot).toContain('"type":"snapshot"');
    expect(reconnectSnapshot).toContain("Streamed.");
    await reconnectReader.cancel();
  });

  it("serves static assets and falls back to the application shell", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tengu-static-"));
    const publicDirectory = join(directory, "public");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(publicDirectory));
    await writeFile(join(publicDirectory, "index.html"), "<main>Tengu</main>");
    await writeFile(join(publicDirectory, "app.js"), "console.log('tengu')");
    const faux = fauxProvider();
    const runtime = await openRuntime({
      database: join(directory, "tengu.sqlite"),
      workspace: join(directory, "workspace"),
      ...fauxModels(faux),
    });
    const server = createHttpServer(runtime, publicDirectory);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Server did not bind");
    const base = `http://127.0.0.1:${address.port}`;
    cleanups.push(async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await runtime.close();
      await rm(directory, { recursive: true, force: true });
    });

    expect(await (await fetch(`${base}/app.js`)).text()).toBe("console.log('tengu')");
    expect(await (await fetch(`${base}/agents/1`)).text()).toBe("<main>Tengu</main>");
  });

  it("rejects invalid JSON input", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tengu-http-"));
    const faux = fauxProvider();
    const runtime = await openRuntime({
      database: join(directory, "tengu.sqlite"),
      workspace: join(directory, "workspace"),
      ...fauxModels(faux),
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
