import { useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import { answerAuth, cancelAuth, connectToAgent, createAgent, getAuthFlow, listAgents, listModels, listProviders, logoutProvider, setAgentModel, startProviderLogin, stopAgent, submitInput, type Agent, type AuthFlow, type Model, type Provider } from "./client";
import { Composer, EmptyState, SessionHeader, Settings, Sidebar, Transcript } from "./components";
import { initialLiveState, reduceAgentEvent } from "./live";
import { useGlobalShortcuts } from "./shortcuts";

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<number>();
  const [live, dispatch] = useReducer(reduceAgentEvent, initialLiveState);
  const [draft, setDraft] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [authFlow, setAuthFlow] = useState<AuthFlow | null>(null);
  const [connection, setConnection] = useState<"connected" | "disconnected">("disconnected");
  const [error, setError] = useState("");
  const [highlightedId, setHighlightedId] = useState<number>();
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void Promise.all([listAgents(), listModels()])
      .then(([loadedAgents, loadedModels]) => {
        setAgents(loadedAgents);
        setModels(loadedModels);
        setSelectedId(loadedAgents[0]?.id);
      })
      .catch(() => setError("Could not load Tengu"));
  }, []);

  useEffect(() => {
    if (!authFlow || authFlow.done) return;
    const timer = setInterval(() => void getAuthFlow(authFlow.id).then((next) => {
      setAuthFlow(next);
      if (next.done?.ok) void Promise.all([listProviders(), listModels()]).then(([nextProviders, nextModels]) => {
        setProviders(nextProviders);
        setModels(nextModels);
        setAuthFlow(null);
      });
    }).catch(() => setError("Could not continue sign in")), 500);
    return () => clearInterval(timer);
  }, [authFlow?.id, authFlow?.done]);

  useEffect(() => {
    if (selectedId === undefined) return;
    setConnection("disconnected");
    return connectToAgent(selectedId, dispatch, setConnection);
  }, [selectedId]);

  const selected = agents.find((agent) => agent.id === selectedId);

  const addAgent = async () => {
    try {
      const agent = await createAgent();
      setAgents((current) => [agent, ...current]);
      setSelectedId(agent.id);
      setError("");
    } catch (cause) {
      setError(errorMessage(cause, "Could not create agent"));
    }
  };

  const moveHighlight = (offset: number) => {
    if (!sidebarOpen || agents.length === 0) return;
    const current = agents.findIndex((agent) => agent.id === (highlightedId ?? selectedId));
    const next = current < 0 ? 0 : (current + offset + agents.length) % agents.length;
    setHighlightedId(agents[next].id);
  };

  useGlobalShortcuts(useMemo(() => ({
    n: () => void addAgent(),
    "mod+k": () => {
      setHighlightedId(selectedId);
      setSidebarOpen(true);
    },
    j: () => moveHighlight(1),
    k: () => moveHighlight(-1),
    enter: () => {
      if (!sidebarOpen || highlightedId === undefined) return;
      setSelectedId(highlightedId);
      setSidebarOpen(false);
    },
    c: () => composerRef.current?.focus(),
    escape: () => setSidebarOpen(false),
  }), [agents, highlightedId, selectedId, sidebarOpen]));

  const changeModel = async (id: string) => {
    const next = models.find((model) => `${model.provider}/${model.id}` === id);
    if (selectedId === undefined || !next) return;
    try {
      await setAgentModel(selectedId, next);
      setError("");
    } catch (cause) {
      setError(errorMessage(cause, "Could not change model"));
    }
  };

  const stop = async () => {
    if (selectedId === undefined) return;
    try {
      await stopAgent(selectedId);
      setError("");
    } catch (cause) {
      setError(errorMessage(cause, "Could not stop agent"));
    }
  };

  const send = async (event: Event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || selectedId === undefined) return;
    const requestId = crypto.randomUUID();
    const wasRunning = live.running;
    setDraft("");
    dispatch({ type: "optimistic_input", requestId, content });
    try {
      await submitInput(selectedId, content, requestId, wasRunning);
      setError("");
    } catch (cause) {
      dispatch({ type: "optimistic_revert", requestId, running: wasRunning });
      setDraft(content);
      setError(errorMessage(cause, "Could not submit input"));
    }
  };

  return (
    <div class="shell">
      <Sidebar
        agents={agents}
        activeAgentId={highlightedId ?? selectedId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCreate={() => void addAgent()}
        onSettings={() => {
          setSettingsOpen(true);
          setSidebarOpen(false);
          void listProviders().then(setProviders).catch(() => setError("Could not load providers"));
        }}
        onSelect={(id) => {
          setSelectedId(id);
          setHighlightedId(undefined);
        }}
        connection={connection}
      />
      <main class="chat">
        {settingsOpen ? <Settings
          providers={providers}
          flow={authFlow}
          onClose={() => {
            if (authFlow && !authFlow.done) void cancelAuth(authFlow.id);
            setAuthFlow(null);
            setSettingsOpen(false);
          }}
          onLogin={(providerId, type) => void startProviderLogin(providerId, type)
            .then((id) => getAuthFlow(id))
            .then(setAuthFlow)
            .catch((cause) => setError(errorMessage(cause, "Could not start sign in")))}
          onLogout={(providerId) => void logoutProvider(providerId)
            .then(() => Promise.all([listProviders(), listModels()]))
            .then(([nextProviders, nextModels]) => { setProviders(nextProviders); setModels(nextModels); })
            .catch((cause) => setError(errorMessage(cause, "Could not sign out")))}
          onAnswer={(flowId, promptId, value) => void answerAuth(flowId, promptId, value)
            .then(() => getAuthFlow(flowId))
            .then(setAuthFlow)
            .catch((cause) => setError(errorMessage(cause, "Could not continue sign in")))}
        /> : selectedId === undefined ? (
          <EmptyState
            onCreate={() => void addAgent()}
            onSettings={() => {
              setSettingsOpen(true);
              void listProviders().then(setProviders).catch(() => setError("Could not load providers"));
            }}
            configured={models.length > 0}
            error={error}
          />
        ) : <>
        <SessionHeader
          title={selected?.title ?? "New agent"}
          onOpenAgents={() => {
            setHighlightedId(selectedId);
            setSidebarOpen(true);
          }}
          running={live.running}
          queued={live.queued}
          onStop={() => void stop()}
        />
        <Transcript items={live.items} partial={live.partial} running={live.running} />
        <Composer
          value={draft}
          onInput={setDraft}
          onSubmit={send}
          steer={live.running}
          error={error}
          inputRef={composerRef}
          models={models.map((model) => ({ id: `${model.provider}/${model.id}`, label: `${model.provider} · ${model.name}` }))}
          model={live.model}
          onModelChange={(id) => void changeModel(id)}
        />
        </>}
      </main>
    </div>
  );
}
