import { useState } from "preact/hooks";
import {
  Composer,
  SessionHeader,
  Sidebar,
  Transcript,
  type AgentSummary,
  type Message,
  type ModelOption,
} from "./components";

const agents: AgentSummary[] = [
  { id: "login", title: "Fix the flaky login test", preview: "I found the race in the redirect handler.", time: "now" },
  { id: "deps", title: "Review dependency updates", preview: "All checks pass. The PR is ready.", time: "18m" },
  { id: "nix", title: "Simplify the Nix module", preview: "Removed two unnecessary options.", time: "2h" },
];

const models: ModelOption[] = [
  { id: "anthropic/claude-sonnet-4-6", label: "claude-sonnet-4-6" },
  { id: "openai/gpt-5.4", label: "gpt-5.4" },
  { id: "google/gemini-3.1-pro", label: "gemini-3.1-pro" },
];

const initialMessages: Message[] = [
  {
    role: "user",
    text: "Take a look at the flaky login test. Create a worktree, find the cause, and open a PR when the fix is clean.",
  },
  {
    role: "assistant",
    text: "I’ll isolate the work first, then reproduce the failure before changing anything.",
  },
];

export function App() {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState(models[0].id);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const send = (event: Event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((current) => [...current, { role: "user", text }]);
    setDraft("");
  };

  return (
    <div class="shell">
      <Sidebar
        agents={agents}
        activeAgentId="login"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main class="chat">
        <SessionHeader
          title="Fix the flaky login test"
          models={models}
          model={model}
          onModelChange={setModel}
          onOpenAgents={() => setSidebarOpen(true)}
        />
        <Transcript messages={messages} />
        <Composer value={draft} onInput={setDraft} onSubmit={send} />
      </main>
    </div>
  );
}
