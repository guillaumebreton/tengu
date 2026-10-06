import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai/models";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import {
  createRegistry,
  defineExtension,
  Harness,
  section,
  watchEvents,
  type AgentEventStream,
  type Conversation,
  type ConversationId,
  type SettledSubmissionRecord,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";

const context = BACKGROUND_CONTEXT;

export type AgentSummary = { id: ConversationId; title: string; preview: string };
export type ModelSummary = { provider: string; id: string; name: string };

export type Runtime = {
  listModels(): Promise<readonly ModelSummary[]>;
  getModel(id: ConversationId): Promise<{ provider: string; id: string }>;
  setModel(id: ConversationId, provider: string, modelId: string): Promise<void>;
  listConversations(): Promise<readonly AgentSummary[]>;
  createConversation(): Promise<Conversation>;
  conversation(id: ConversationId): Promise<Conversation>;
  submit(id: ConversationId, content: string): Promise<SettledSubmissionRecord>;
  watch(id: ConversationId): Promise<AgentEventStream>;
  close(): Promise<void>;
};

export async function openRuntime({
  database,
  workspace,
  models,
  defaultModel,
  modelProviders,
}: {
  database: string;
  workspace: string;
  models: Models;
  defaultModel: { provider: string; modelId: string };
  modelProviders?: readonly string[];
}): Promise<Runtime> {
  await Promise.all([mkdir(dirname(database), { recursive: true }), mkdir(workspace, { recursive: true })]);

  const registry = createRegistry();
  const Tengu = defineExtension({
    name: "tengu",
    sections: [section("preamble", () => "You are a concise coding agent. Work directly in the shared workspace.", { tag: false })],
  });
  registry.install(CodingTools);
  registry.install(Tengu);

  const storage = await openNodeSqliteStorage(database);
  const harness = await Harness.open(
    storage,
    {
      models,
      registry,
      env: () => new NodeExecutionEnv({ cwd: workspace }),
    },
    context,
  );
  harness.resume();

  const getConversation = async (id: ConversationId) => {
    const conversation = await harness.conversation(id, context);
    if (!conversation) throw new Error(`Unknown conversation: ${id}`);
    return conversation;
  };

  return {
    async listModels() {
      return (await models.getAvailable())
        .filter((model) => modelProviders === undefined || modelProviders.includes(model.provider))
        .map((model) => ({
        provider: model.provider,
        id: model.id,
          name: model.name,
        }));
    },
    async getModel(id) {
      const agent = await (await getConversation(id)).agent(context);
      if (!agent.model) throw new Error(`Conversation has no model: ${id}`);
      return { provider: agent.model.provider, id: agent.model.modelId };
    },
    async setModel(id, providerId, modelId) {
      if (!models.getModel(providerId, modelId)) throw new Error(`Unknown model: ${providerId}/${modelId}`);
      await (await getConversation(id)).configure({ model: { provider: providerId, modelId } }, context);
    },
    async listConversations() {
      const records = (await storage.scanConversations({}, 100, undefined, context)).items
        .filter((conversation) => conversation.owner === undefined);
      return Promise.all(records.map(async ({ id }) => {
        const conversation = await getConversation(id);
        const entries = (await conversation.entries({}, 20, undefined, context)).items;
        const messages = entries
          .flatMap((entry) => entry.model ?? [])
          .filter((message) => message.role === "user" || message.role === "assistant");
        const text = (message: (typeof messages)[number] | undefined) => {
          if (!message) return "";
          return typeof message.content === "string"
            ? message.content
            : message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
        };
        const firstUser = [...messages].reverse().find((message) => message.role === "user");
        return { id, title: text(firstUser) || "New agent", preview: text(messages[0]) };
      }));
    },
    createConversation: () =>
      harness.createConversation(
        {
          ownership: { kind: "ownerless" },
          agent: {
            model: defaultModel,
            cwd: workspace,
            extensions: [CodingTools, Tengu],
          },
        },
        context,
      ),
    conversation: getConversation,
    async submit(id, content) {
      return (await (await getConversation(id)).submit({ type: "input", content }, context)).wait(context);
    },
    watch: (id) => watchEvents(harness, id, context),
    close: () => harness.close(context),
  };
}
