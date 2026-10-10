import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

export async function loadPi(agentDirectory: string) {
  await mkdir(agentDirectory, { recursive: true });
  const devicePath = join(agentDirectory, "device-id");
  const deviceId = await readFile(devicePath, "utf8").then((value) => value.trim()).catch(async () => {
    const value = randomUUID();
    await writeFile(devicePath, `${value}\n`, { mode: 0o600 });
    return value;
  });
  const models = await ModelRuntime.create({
    authPath: join(agentDirectory, "auth.json"),
    modelsPath: join(agentDirectory, "models.json"),
    modelsStorePath: join(agentDirectory, "models-cache.json"),
    allowModelNetwork: true,
    refreshOnCreate: true,
  });
  const available = await models.getAvailable();
  const preferred = available.find((model) => model.provider === "openai-codex" && model.id === "gpt-5.6-terra")
    ?? available.find((model) => model.provider === "openai-codex")
    ?? available[0];
  return {
    models,
    providerModels: { models, deviceId },
    storedProviderIds: async () => (await models.listCredentials()).map((credential) => credential.providerId),
    ...(preferred ? { defaultModel: { provider: preferred.provider, modelId: preferred.id } } : {}),
  };
}
