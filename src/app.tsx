import { useEffect, useReducer, useState } from "preact/hooks";
import { connectToAgent, createAgent, listAgents, listModels, setAgentModel, stopAgent, submitInput, type Agent, type Model } from "./client";
import { Composer, EmptyState, SessionHeader, Sidebar, Transcript } from "./components";
import { initialLiveState, reduceAgentEvent } from "./live";

export function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<number>();
  const [live, dispatch] = useReducer(reduceAgentEvent, initialLiveState);
  const [draft, setDraft] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connection, setConnection] = useState<"connected" | "disconnected">("disconnected");
  const [error, setError] = useState("");

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
        agents={agents.map((agent) => ({ ...agent, id: String(agent.id), time: "" }))}
        activeAgentId={String(selectedId ?? "")}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCreate={() => void addAgent()}
        onSelect={(id) => setSelectedId(Number(id))}
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
          onOpenAgents={() => setSidebarOpen(true)}
          running={live.running}
          queued={live.queued}
          onStop={() => { if (selectedId !== undefined) void stopAgent(selectedId); }}
        />
        <Transcript messages={live.messages} partial={live.partial} tools={live.tools} showExampleTool={false} />
        <Composer value={draft} onInput={setDraft} onSubmit={send} steer={live.running} error={error} />
        </>}
      </main>
    </div>
  );
}
