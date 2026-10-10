import { randomUUID } from "node:crypto";
import type { AuthEvent, AuthPrompt, AuthType } from "@earendil-works/pi-ai";
import type { Models } from "@earendil-works/pi-ai/models";

type ProviderModels = Pick<Models, "getProviders" | "getProvider" | "getModels" | "login" | "logout" | "refresh"> & {
  getProviderAuthStatus(providerId: string): { configured: boolean; source?: string; label?: string };
};

export type ProviderSummary = {
  id: string;
  name: string;
  configured: boolean;
  source: string | null;
  label: string | null;
  apiKey: boolean;
  oauth: string | null;
  models: number;
};

type ShownPrompt = Omit<AuthPrompt, "signal"> & { id: string };
export type AuthFlowState = {
  id: string;
  providerId: string;
  events: AuthEvent[];
  prompt: ShownPrompt | null;
  done: { ok: boolean; error?: string } | null;
};

type AuthFlow = AuthFlowState & {
  abort: AbortController;
  pending?: { id: string; resolve: (value: string) => void; reject: (error: Error) => void };
};

export class ProviderSettings {
  readonly #models: ProviderModels;
  readonly #flows = new Map<string, AuthFlow>();
  readonly #deviceId: string;

  constructor(models: ProviderModels, deviceId: string = randomUUID()) {
    this.#models = models;
    this.#deviceId = deviceId;
  }

  list(): ProviderSummary[] {
    return this.#models.getProviders().map((provider) => {
      const status = this.#models.getProviderAuthStatus(provider.id);
      return {
        id: provider.id,
        name: provider.name,
        configured: status.configured,
        source: status.source ?? null,
        label: status.label ?? null,
        apiKey: provider.auth.apiKey?.login !== undefined,
        oauth: provider.auth.oauth?.loginLabel ?? provider.auth.oauth?.name ?? null,
        models: this.#models.getModels(provider.id).length,
      };
    });
  }

  startLogin(providerId: string, type: AuthType): string {
    const provider = this.#models.getProvider(providerId);
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);
    if (type === "oauth" ? !provider.auth.oauth : !provider.auth.apiKey?.login) {
      throw new Error(`${provider.name} does not support ${type === "oauth" ? "OAuth" : "API key"} login`);
    }

    const flow: AuthFlow = {
      id: randomUUID(),
      providerId,
      events: [],
      prompt: null,
      done: null,
      abort: new AbortController(),
    };
    this.#flows.set(flow.id, flow);

    const interaction = {
      signal: flow.abort.signal,
      notify: (event: AuthEvent) => {
        flow.events.push(event);
        if (flow.events.length > 20) flow.events.shift();
      },
      prompt: (prompt: AuthPrompt) => new Promise<string>((resolve, reject) => {
        const id = randomUUID();
        const { signal, ...shown } = prompt;
        flow.prompt = { id, ...shown } as ShownPrompt;
        flow.pending = { id, resolve, reject };
        signal?.addEventListener("abort", () => {
          if (flow.pending?.id !== id) return;
          flow.pending = undefined;
          flow.prompt = null;
          reject(new Error("cancelled"));
        }, { once: true });
      }),
    };

    void this.#models.login(providerId, type, interaction, { getDeviceId: () => this.#deviceId })
      .then(async () => {
        await this.#models.refresh({ providers: [providerId], allowNetwork: true, force: true });
        flow.done = { ok: true };
      }, (error: unknown) => {
        flow.done = { ok: false, error: error instanceof Error ? error.message : String(error) };
      })
      .finally(() => {
        flow.pending = undefined;
        flow.prompt = null;
        setTimeout(() => this.#flows.delete(flow.id), 60_000).unref();
      });

    return flow.id;
  }

  flow(id: string): AuthFlowState {
    const flow = this.#flows.get(id);
    if (!flow) throw new Error("Unknown authentication flow");
    return { id: flow.id, providerId: flow.providerId, events: [...flow.events], prompt: flow.prompt, done: flow.done };
  }

  answer(flowId: string, promptId: string, value?: string): void {
    const flow = this.#flows.get(flowId);
    if (!flow) throw new Error("Unknown authentication flow");
    if (!flow.pending || flow.pending.id !== promptId) throw new Error("Unknown authentication prompt");
    const pending = flow.pending;
    flow.pending = undefined;
    flow.prompt = null;
    if (value === undefined) {
      pending.reject(new Error("cancelled"));
      flow.abort.abort();
    } else {
      pending.resolve(value);
    }
  }

  cancel(flowId: string): void {
    const flow = this.#flows.get(flowId);
    if (!flow) return;
    flow.pending?.reject(new Error("cancelled"));
    flow.pending = undefined;
    flow.prompt = null;
    flow.abort.abort();
    this.#flows.delete(flowId);
  }

  async logout(providerId: string): Promise<void> {
    await this.#models.logout(providerId);
  }

  close(): void {
    for (const flow of this.#flows.values()) flow.abort.abort();
  }
}
