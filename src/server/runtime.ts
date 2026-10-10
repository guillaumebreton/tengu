import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai/models";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import {
  createRegistry,
  defineDoc,
  defineExtension,
  Harness,
  section,
  watchEvents,
  type AgentEventStream,
  type Conversation,
  type ConversationId,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createBashTool, createEditTool, createReadTool } from "@earendil-works/pi-durable/tools";
import { ProviderSettings, type AuthFlowState, type ProviderSummary } from "./providers.js";
import { createTenguWriteTool } from "./write-tool.js";

const context = BACKGROUND_CONTEXT;

export type AgentSummary = { id: ConversationId; title: string; preview: string };
export type ModelSummary = { provider: string; id: string; name: string };
export type SkillSummary = { name: string; description: string };

const AgentNames = defineDoc<{ items: Record<string, string> }>({
  kind: "tengu.agent-names",
  version: 1,
  scope: "session",
  initial: () => ({ items: {} }),
});

export type Runtime = {
  listModels(): Promise<readonly ModelSummary[]>;
  listSkills(): readonly SkillSummary[];
  expandSkill(name: string, request: string): Promise<string>;
  listProviders(): readonly ProviderSummary[];
  startProviderLogin(providerId: string, type: "api_key" | "oauth"): string;
  authFlow(id: string): AuthFlowState;
  answerAuth(flowId: string, promptId: string, value?: string): void;
  cancelAuth(flowId: string): void;
  logoutProvider(providerId: string): Promise<void>;
  setModel(id: ConversationId, provider: string, modelId: string): Promise<void>;
  listConversations(): Promise<readonly AgentSummary[]>;
  renameConversation(id: ConversationId, name: string): Promise<void>;
  createConversation(): Promise<Conversation>;
  conversation(id: ConversationId): Promise<Conversation>;
  watch(id: ConversationId): Promise<AgentEventStream>;
  close(): Promise<void>;
};

export async function openRuntime({
  database,
  workspace,
  models,
  defaultModel,
  providerModels,
  storedProviderIds,
  skills = [],
}: {
  database: string;
  workspace: string;
  models: Models;
  providerModels?: { models: ModelRuntime; deviceId: string };
  storedProviderIds?: () => Promise<readonly string[]>;
  defaultModel?: { provider: string; modelId: string };
  skills?: readonly { name: string; description: string; filePath: string; baseDir?: string }[];
}): Promise<Runtime> {
  await Promise.all([mkdir(dirname(database), { recursive: true }), mkdir(workspace, { recursive: true })]);

  const providers = providerModels ? new ProviderSettings(providerModels.models, providerModels.deviceId) : undefined;
  const registry = createRegistry();
  const CodingTools = defineExtension({
    name: "tengu-coding-tools",
    tools: [createReadTool(), createTenguWriteTool(), createEditTool(), createBashTool()],
  });
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
    listSkills: () => skills.map(({ name, description }) => ({ name, description })),
    async expandSkill(name, request) {
      const skill = skills.find((candidate) => candidate.name === name);
      if (!skill) throw new Error(`Unknown skill: ${name}`);
      const { readFile } = await import("node:fs/promises");
      const content = await readFile(skill.filePath, "utf8");
      const instructions = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
      const block = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir ?? dirname(skill.filePath)}.\n\n${instructions}\n</skill>`;
      return request ? `${block}\n\n${request}` : block;
    },
    async listModels() {
      const providers = storedProviderIds ? await storedProviderIds() : undefined;
      return (await models.getAvailable())
        .filter((model) => providers === undefined || providers.includes(model.provider))
        .map((model) => ({
        provider: model.provider,
        id: model.id,
          name: model.name,
        }));
    },
    listProviders: () => providers?.list() ?? [],
    startProviderLogin: (providerId, type) => {
      if (!providers) throw new Error("Provider configuration is unavailable");
      return providers.startLogin(providerId, type);
    },
    authFlow: (id) => {
      if (!providers) throw new Error("Provider configuration is unavailable");
      return providers.flow(id);
    },
    answerAuth: (flowId, promptId, value) => providers?.answer(flowId, promptId, value),
    cancelAuth: (flowId) => providers?.cancel(flowId),
    logoutProvider: async (providerId) => {
      if (!providers) throw new Error("Provider configuration is unavailable");
      await providers.logout(providerId);
    },
    async setModel(id, providerId, modelId) {
      if (!models.getModel(providerId, modelId)) throw new Error(`Unknown model: ${providerId}/${modelId}`);
      await (await getConversation(id)).configure({ model: { provider: providerId, modelId } }, context);
    },
    async listConversations() {
      const names = await harness.snapshot(AgentNames, context) ?? { items: {} };
      const records = (await storage.scanConversations({}, 100, undefined, context)).items
        .filter((conversation) => conversation.owner === undefined)
        .sort((a, b) => b.id - a.id);
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
        return { id, title: names.items[String(id)] || text(firstUser) || "New agent", preview: text(messages[0]) };
      }));
    },
    async renameConversation(id, name) {
      await getConversation(id);
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Agent name is required");
      await harness.commit(async (tx) => {
        (await tx.doc(AgentNames)).items[String(id)] = trimmed.slice(0, 80);
      }, context);
    },
    createConversation: async () => {
      const available = await models.getAvailable();
      const providers = storedProviderIds ? await storedProviderIds() : undefined;
      const selected = defaultModel && (providers === undefined || providers.includes(defaultModel.provider))
        ? defaultModel
        : available.find((model) => providers === undefined || providers.includes(model.provider));
      if (!selected) throw new Error("Configure a model provider before creating an agent");
      return harness.createConversation(
        {
          ownership: { kind: "ownerless" },
          agent: {
            model: "modelId" in selected ? selected : { provider: selected.provider, modelId: selected.id },
            cwd: workspace,
            extensions: [CodingTools, Tengu],
          },
        },
        context,
      );
    },
    conversation: getConversation,
    watch: (id) => watchEvents(harness, id, context),
    close: async () => {
      providers?.close();
      await harness.close(context);
    },
  };
}
