import type { Provider } from "@earendil-works/pi-ai/models";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";

export function configuredProvider(environment: NodeJS.ProcessEnv = process.env): Provider {
  const name = environment.TENGU_PROVIDER ?? "openai";
  if (name === "openrouter") {
    if (!environment.OPENROUTER_API_KEY && environment.OPENAI_API_KEY) {
      environment.OPENROUTER_API_KEY = environment.OPENAI_API_KEY;
    }
    return openrouterProvider();
  }
  if (name === "openai") return openaiProvider();
  throw new Error(`Unsupported provider: ${name}`);
}
