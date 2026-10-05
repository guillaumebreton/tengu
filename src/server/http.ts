import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ConversationId } from "@earendil-works/pi-durable";
import type { Runtime } from "./runtime";

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

function parseAgentRoute(pathname: string, action: "input" | "events"): ConversationId | undefined {
  const match = pathname.match(new RegExp(`^/api/agents/(\\d+)/${action}$`));
  if (!match) return undefined;
  return Number(match[1]) as ConversationId;
}

function writeEvent(response: ServerResponse, event: unknown) {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function createHttpServer(runtime: Runtime) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "GET" && url.pathname === "/api/agents") {
        const ids = await runtime.listConversations();
        json(response, 200, ids.map((id) => ({ id })));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/agents") {
        const conversation = await runtime.createConversation();
        json(response, 201, { id: conversation.id });
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

      const conversationId = parseAgentRoute(url.pathname, "input");
      if (request.method === "POST" && conversationId !== undefined) {
        const body = await readJson(request) as { content?: unknown; requestId?: unknown };
        if (typeof body.content !== "string" || !body.content.trim() || typeof body.requestId !== "string" || !body.requestId) {
          json(response, 400, { error: "content and requestId are required" });
          return;
        }
        const conversation = await runtime.conversation(conversationId);
        const submission = await conversation.submit(
          { type: "input", content: body.content.trim(), requestId: body.requestId },
          BACKGROUND_CONTEXT,
        );
        json(response, 202, await submission.status(BACKGROUND_CONTEXT));
        return;
      }

      json(response, 404, { error: "not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      const status = error instanceof SyntaxError || message === "Request body is too large" ? 400 : 500;
      json(response, status, { error: message });
    }
  });
}
