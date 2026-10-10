// @vitest-environment node
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { describe, expect, it, vi } from "vitest";
import { ProviderSettings } from "./providers";

function providerRuntime(login: (interaction: any) => Promise<any>) {
  const faux = fauxProvider();
  let configured = false;
  const provider = {
    ...faux.provider,
    auth: {
      apiKey: { name: "Faux key", login, resolve: async () => undefined },
      oauth: { name: "Faux subscription", loginLabel: "Sign in", login, refresh: async (credential: any) => credential, toAuth: async () => ({ apiKey: "" }) },
    },
  };
  return {
    getProviders: () => [provider],
    getProvider: (id: string) => id === "faux" ? provider : undefined,
    getModels: () => provider.getModels(),
    getProviderAuthStatus: () => ({ configured }),
    login: async (_provider: string, _type: string, interaction: any) => {
      const credential = await login(interaction);
      configured = true;
      return credential;
    },
    logout: async () => { configured = false; },
    refresh: async () => ({ aborted: false, errors: new Map() }),
  } as any;
}

describe("ProviderSettings", () => {
  it("lists provider authentication capabilities and status", () => {
    const runtime = providerRuntime(async () => ({ type: "api_key", key: "key" }));

    expect(new ProviderSettings(runtime).list()).toEqual([
      expect.objectContaining({ id: "faux", name: "faux", configured: false, apiKey: true, oauth: "Sign in", models: 1 }),
    ]);
  });

  it("runs prompts and records successful login completion", async () => {
    const runtime = providerRuntime(async (interaction) => ({
      type: "api_key",
      key: await interaction.prompt({ type: "secret", message: "Key" }),
    }));
    const settings = new ProviderSettings(runtime);
    const id = settings.startLogin("faux", "api_key");
    await vi.waitFor(() => expect(settings.flow(id).prompt).toMatchObject({ type: "secret", message: "Key" }));
    settings.answer(id, settings.flow(id).prompt!.id, "secret");
    await vi.waitFor(() => expect(settings.flow(id).done).toEqual({ ok: true }));
    expect(settings.list()[0].configured).toBe(true);
  });
});
