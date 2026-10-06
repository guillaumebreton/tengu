import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

export async function loadPi(agentDirectory: string) {
  const models = await ModelRuntime.create({
    authPath: join(agentDirectory, "auth.json"),
    modelsPath: join(agentDirectory, "models.json"),
    modelsStorePath: join(agentDirectory, "models-cache.json"),
    allowModelNetwork: true,
    refreshOnCreate: true,
  });
  const available = await models.getAvailable();
  if (available.length === 0) {
    throw new Error(`No authenticated Pi models found in ${agentDirectory}`);
  }
  const providers = [...new Set((await models.listCredentials()).map((credential) => credential.providerId))];
  const configured = available.filter((model) => providers.includes(model.provider));
  if (configured.length === 0) {
    throw new Error(`Pi credentials in ${agentDirectory} do not provide any models`);
  }
  const preferred = configured.find((model) => model.provider === "openai-codex" && model.id === "gpt-5.6-terra")
    ?? configured.find((model) => model.provider === "openai-codex")
    ?? configured[0];
  return {
    models,
    modelProviders: providers,
    defaultModel: { provider: preferred.provider, modelId: preferred.id },
  };
}
