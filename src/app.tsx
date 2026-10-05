import type { AgentEvent } from "@earendil-works/pi-durable";
import { useEffect, useState } from "preact/hooks";
import { connectToAgent, createAgent, listAgents, messagesFromSnapshot, submitInput, type Agent } from "./client";
import { Composer, SessionHeader, Sidebar, Transcript, type Message, type ModelOption } from "./components";

const models: ModelOption[] = [
  { id: "anthropic/claude-sonnet-4-6", label: "claude-sonnet-4-6" },
  { id: "openai/gpt-5.4", label: "gpt-5.4" },
  { id: "google/gemini-3.1-pro", label: "gemini-3.1-pro" },
];

export function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<number>();
  const [messages, setMessages] = useState<Message[]>([]);
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
    setMessages([]);
    return connectToAgent(selectedId, (event: AgentEvent) => {
      if (event.type === "snapshot") setMessages(messagesFromSnapshot(event));
      if (event.type === "message_end") {
        const snapshot = { type: "snapshot", entries: [event.entry], tools: [], compactions: [], inbox: [], agent: {}, usage: { models: {}, tools: {} } } as never;
        setMessages((current) => [...current, ...messagesFromSnapshot(snapshot)]);
      }
    });
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
        />
        <Transcript messages={messages} showExampleTool={false} />
        <Composer value={draft} onInput={setDraft} onSubmit={send} />
      </main>
    </div>
  );
}
