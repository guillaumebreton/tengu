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

function parseAgentInput(pathname: string): ConversationId | undefined {
  const match = pathname.match(/^\/api\/agents\/(\d+)\/input$/);
  if (!match) return undefined;
  return Number(match[1]) as ConversationId;
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

      const conversationId = parseAgentInput(url.pathname);
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
