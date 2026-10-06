// @vitest-environment node
import { describe, expect, it } from "vitest";
import { configuredProvider } from "./provider";

describe("configuredProvider", () => {
  it("uses OpenRouter explicitly and accepts the existing key variable", () => {
    const environment: NodeJS.ProcessEnv = { TENGU_PROVIDER: "openrouter", OPENAI_API_KEY: "key" };
    const provider = configuredProvider(environment);

    expect(provider.id).toBe("openrouter");
    expect(environment.OPENROUTER_API_KEY).toBe("key");
  });
});
