import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ConversationId } from "@earendil-works/pi-durable";
import type { Runtime } from "./runtime.js";

const MAX_BODY_BYTES = 64 * 1024;

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parseAgentRoute(pathname: string, action: "input" | "steer" | "stop" | "events" | "model" | "name"): ConversationId | undefined {
  const match = pathname.match(new RegExp(`^/api/agents/(\\d+)/${action}$`));
  if (!match) return undefined;
  return Number(match[1]) as ConversationId;
}

function writeEvent(response: ServerResponse, event: unknown) {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function serveFile(response: ServerResponse, directory: string, pathname: string): Promise<boolean> {
  const relative = normalize(pathname).replace(/^[/\\]+/, "");
  const file = join(directory, relative || "index.html");
  if (!file.startsWith(`${normalize(directory)}/`)) return false;
  try {
    await access(file);
  } catch {
    return false;
  }
  response.writeHead(200, { "content-type": contentTypes[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
  return true;
}

export function createHttpServer(runtime: Runtime, publicDirectory?: string) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "GET" && url.pathname === "/api/agents") {
        json(response, 200, await runtime.listConversations());
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/agents") {
        const conversation = await runtime.createConversation();
        json(response, 201, { id: conversation.id });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/models") {
        json(response, 200, await runtime.listModels());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/providers") {
        json(response, 200, runtime.listProviders());
        return;
      }

      const providerLogin = url.pathname.match(/^\/api\/providers\/([^/]+)\/login$/);
      if (request.method === "POST" && providerLogin) {
        const body = await readJson(request) as { type?: unknown };
        if (body.type !== "oauth" && body.type !== "api_key") {
          json(response, 400, { error: "type must be oauth or api_key" });
          return;
        }
        json(response, 202, { flowId: runtime.startProviderLogin(decodeURIComponent(providerLogin[1]), body.type) });
        return;
      }

      const providerLogout = url.pathname.match(/^\/api\/providers\/([^/]+)\/logout$/);
      if (request.method === "POST" && providerLogout) {
        await runtime.logoutProvider(decodeURIComponent(providerLogout[1]));
        response.writeHead(204).end();
        return;
      }

      const authFlow = url.pathname.match(/^\/api\/auth\/([^/]+)$/);
      if (request.method === "GET" && authFlow) {
        json(response, 200, runtime.authFlow(authFlow[1]));
        return;
      }
      if (request.method === "DELETE" && authFlow) {
        runtime.cancelAuth(authFlow[1]);
        response.writeHead(204).end();
        return;
      }

      const authPrompt = url.pathname.match(/^\/api\/auth\/([^/]+)\/([^/]+)$/);
      if (request.method === "POST" && authPrompt) {
        const body = await readJson(request) as { value?: unknown; cancel?: unknown };
        runtime.answerAuth(authPrompt[1], authPrompt[2], body.cancel === true ? undefined : String(body.value ?? ""));
        response.writeHead(204).end();
        return;
      }

      const nameConversationId = parseAgentRoute(url.pathname, "name");
      if (request.method === "PUT" && nameConversationId !== undefined) {
        const body = await readJson(request) as { name?: unknown };
        if (typeof body.name !== "string" || !body.name.trim()) {
          json(response, 400, { error: "name is required" });
          return;
        }
        await runtime.renameConversation(nameConversationId, body.name);
        response.writeHead(204).end();
        return;
      }

      const stopConversationId = parseAgentRoute(url.pathname, "stop");
      if (request.method === "POST" && stopConversationId !== undefined) {
        await (await runtime.conversation(stopConversationId)).abort(BACKGROUND_CONTEXT);
        response.writeHead(204).end();
        return;
      }

      const modelConversationId = parseAgentRoute(url.pathname, "model");
      if (request.method === "PUT" && modelConversationId !== undefined) {
        const body = await readJson(request) as { provider?: unknown; id?: unknown };
        if (typeof body.provider !== "string" || typeof body.id !== "string") {
          json(response, 400, { error: "provider and id are required" });
          return;
        }
        await runtime.setModel(modelConversationId, body.provider, body.id);
        response.writeHead(204).end();
        return;
      }

      const eventsConversationId = parseAgentRoute(url.pathname, "events");
      if (request.method === "GET" && eventsConversationId !== undefined) {
        await runtime.conversation(eventsConversationId);
        const stream = await runtime.watch(eventsConversationId);
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        });
        writeEvent(response, stream.snapshot);
        stream.start(async (events) => {
          for (const event of events) writeEvent(response, event);
        });
        const keepalive = setInterval(() => response.write(": keepalive\n\n"), 15_000);
        request.once("close", () => {
          clearInterval(keepalive);
          void stream.stop();
        });
        return;
      }

      const inputConversationId = parseAgentRoute(url.pathname, "input");
      const steerConversationId = parseAgentRoute(url.pathname, "steer");
      const conversationId = inputConversationId ?? steerConversationId;
      if (request.method === "POST" && conversationId !== undefined) {
        const body = await readJson(request) as { content?: unknown; requestId?: unknown };
        if (typeof body.content !== "string" || !body.content.trim() || typeof body.requestId !== "string" || !body.requestId) {
          json(response, 400, { error: "content and requestId are required" });
          return;
        }
        const conversation = await runtime.conversation(conversationId);
        const submission = await conversation.submit(
          {
            type: "input",
            content: body.content.trim(),
            requestId: body.requestId,
            ...(steerConversationId !== undefined ? { whenBusy: "steer" as const } : {}),
          },
          BACKGROUND_CONTEXT,
        );
        json(response, 202, await submission.status(BACKGROUND_CONTEXT));
        return;
      }

      if (request.method === "GET" && publicDirectory) {
        if (await serveFile(response, publicDirectory, url.pathname)) return;
        if (await serveFile(response, publicDirectory, "/index.html")) return;
      }

      json(response, 404, { error: "not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      const status = error instanceof SyntaxError || message === "Request body is too large" ? 400 : 500;
      json(response, status, { error: message });
    }
  });
}
