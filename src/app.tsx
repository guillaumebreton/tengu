import { useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import { connectToAgent, createAgent, listAgents, listModels, setAgentModel, stopAgent, submitInput, type Agent, type Model } from "./client";
import { Composer, EmptyState, SessionHeader, Sidebar, Transcript } from "./components";
import { initialLiveState, reduceAgentEvent } from "./live";
import { useGlobalShortcuts } from "./shortcuts";

export function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<number>();
  const [live, dispatch] = useReducer(reduceAgentEvent, initialLiveState);
  const [draft, setDraft] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connection, setConnection] = useState<"connected" | "disconnected">("disconnected");
  const [error, setError] = useState("");
  const [highlightedId, setHighlightedId] = useState<number>();
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void Promise.all([listAgents(), listModels()]).then(([loadedAgents, loadedModels]) => {
      setAgents(loadedAgents);
      setModels(loadedModels);
      setSelectedId(loadedAgents[0]?.id);
    });
  }, []);

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
      setError(cause instanceof Error ? cause.message : "Could not create agent");
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

  const send = async (event: Event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || selectedId === undefined) return;
    setDraft("");
    try {
      await submitInput(selectedId, content, live.running);
      setError("");
    } catch (cause) {
      setDraft(content);
      setError(cause instanceof Error ? cause.message : "Could not submit input");
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
        onSelect={(id) => {
          setSelectedId(id);
          setHighlightedId(undefined);
        }}
        connection={connection}
      />
      <main class="chat">
        {selectedId === undefined ? (
          <EmptyState onCreate={() => void addAgent()} />
        ) : <>
        <SessionHeader
          title={selected?.title ?? "New agent"}
          models={models.map((model) => ({ id: `${model.provider}/${model.id}`, label: model.name }))}
          model={live.model}
          onModelChange={(id) => {
            const next = models.find((model) => `${model.provider}/${model.id}` === id);
            if (selectedId !== undefined && next) void setAgentModel(selectedId, next);
          }}
          onOpenAgents={() => {
            setHighlightedId(selectedId);
            setSidebarOpen(true);
          }}
          running={live.running}
          queued={live.queued}
          onStop={() => { if (selectedId !== undefined) void stopAgent(selectedId); }}
        />
        <Transcript items={live.items} partial={live.partial} running={live.running} />
        <Composer value={draft} onInput={setDraft} onSubmit={send} steer={live.running} error={error} inputRef={composerRef} />
        </>}
      </main>
    </div>
  );
}
