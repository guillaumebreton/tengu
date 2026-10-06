import { createModels } from "@earendil-works/pi-ai/models";
import type { FauxProviderHandle } from "@earendil-works/pi-ai/providers/faux";

export function fauxModels(faux: FauxProviderHandle) {
  const models = createModels();
  models.setProvider(faux.provider);
  return { models, defaultModel: { provider: "faux", modelId: "faux-1" } };
}
