import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels, type Provider } from "@earendil-works/pi-ai/models";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import {
  createRegistry,
  defineExtension,
  Harness,
  section,
  type Conversation,
  type ConversationId,
  type SettledSubmissionRecord,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";

const context = BACKGROUND_CONTEXT;

export type Runtime = {
  listConversations(): Promise<readonly ConversationId[]>;
  createConversation(): Promise<Conversation>;
  conversation(id: ConversationId): Promise<Conversation>;
  submit(id: ConversationId, content: string): Promise<SettledSubmissionRecord>;
  close(): Promise<void>;
};

export async function openRuntime({
  database,
  workspace,
  provider,
}: {
  database: string;
  workspace: string;
  provider: Provider;
}): Promise<Runtime> {
  await Promise.all([mkdir(dirname(database), { recursive: true }), mkdir(workspace, { recursive: true })]);

  const models = createModels();
  models.setProvider(provider);

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
    async listConversations() {
      return (await storage.scanConversations({}, 100, undefined, context)).items
        .filter((conversation) => conversation.owner === undefined)
        .map((conversation) => conversation.id);
    },
    createConversation: () =>
      harness.createConversation(
        {
          ownership: { kind: "ownerless" },
          agent: {
            model: { provider: provider.id, modelId: provider.getModels()[0].id },
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
    close: () => harness.close(context),
  };
}
