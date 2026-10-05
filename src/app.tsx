import { useEffect, useReducer, useState } from "preact/hooks";
import { connectToAgent, createAgent, listAgents, submitInput, type Agent } from "./client";
import { Composer, SessionHeader, Sidebar, Transcript, type ModelOption } from "./components";
import { initialLiveState, reduceAgentEvent } from "./live";

const models: ModelOption[] = [
  { id: "anthropic/claude-sonnet-4-6", label: "claude-sonnet-4-6" },
  { id: "openai/gpt-5.4", label: "gpt-5.4" },
  { id: "google/gemini-3.1-pro", label: "gemini-3.1-pro" },
];

export function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<number>();
  const [live, dispatch] = useReducer(reduceAgentEvent, initialLiveState);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState(models[0].id);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    void listAgents().then((loaded) => {
      setAgents(loaded);
      setSelectedId(loaded[0]?.id);
    });
  }, []);

  useEffect(() => {
    if (selectedId === undefined) return;
    return connectToAgent(selectedId, dispatch);
  }, [selectedId]);

  const selected = agents.find((agent) => agent.id === selectedId);

  const addAgent = async () => {
    const agent = await createAgent();
    setAgents((current) => [agent, ...current]);
    setSelectedId(agent.id);
  };

  const send = async (event: Event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || selectedId === undefined) return;
    setDraft("");
    await submitInput(selectedId, content);
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
      />
      <main class="chat">
        <SessionHeader
          title={selected?.title ?? "New agent"}
          models={models}
          model={model}
          onModelChange={setModel}
          onOpenAgents={() => setSidebarOpen(true)}
          running={live.running}
        />
        <Transcript messages={live.messages} partial={live.partial} tools={live.tools} showExampleTool={false} />
        <Composer value={draft} onInput={setDraft} onSubmit={send} />
      </main>
    </div>
  );
}
