import { useState } from "preact/hooks";

const conversations = [
  { title: "Fix the flaky login test", preview: "I found the race in the redirect handler.", time: "now", active: true },
  { title: "Review dependency updates", preview: "All checks pass. The PR is ready.", time: "18m" },
  { title: "Simplify the Nix module", preview: "Removed two unnecessary options.", time: "2h" },
];

const models = [
  { id: "anthropic/claude-sonnet-4-6", label: "claude-sonnet-4-6" },
  { id: "openai/gpt-5.4", label: "gpt-5.4" },
  { id: "google/gemini-3.1-pro", label: "gemini-3.1-pro" },
];

const initialMessages = [
  {
    role: "user" as const,
    text: "Take a look at the flaky login test. Create a worktree, find the cause, and open a PR when the fix is clean.",
  },
  {
    role: "assistant" as const,
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
      <button class="scrim" aria-label="Close conversations" data-open={sidebarOpen} onClick={() => setSidebarOpen(false)} />
      <aside class="sidebar" data-open={sidebarOpen}>
        <header class="brand">
          <strong>tengu</strong>
          <button class="new-chat" aria-label="New conversation">+</button>
        </header>

        <nav aria-label="Conversations">
          <p class="section-label">conversations</p>
          <div class="conversation-list">
            {conversations.map((conversation) => (
              <button class="conversation" data-active={conversation.active} onClick={() => setSidebarOpen(false)}>
                <span class="conversation-copy">
                  <strong>{conversation.title}</strong>
                  <small>{conversation.preview}</small>
                </span>
                <time>{conversation.time}</time>
              </button>
            ))}
          </div>
        </nav>

        <footer class="sidebar-footer">
          <span class="status-dot" />
          connected
        </footer>
      </aside>

      <main class="chat">
        <header class="chat-header">
          <button class="menu-button" aria-label="Open conversations" onClick={() => setSidebarOpen(true)}>☰</button>
          <h1>Fix the flaky login test</h1>
          <label class="model-picker">
            <span>model</span>
            <select aria-label="Model" value={model} onChange={(event) => setModel(event.currentTarget.value)}>
              {models.map((candidate) => <option value={candidate.id}>{candidate.label}</option>)}
            </select>
          </label>
          <span class="run-state"><i /> working</span>
        </header>

        <section class="transcript" aria-live="polite">
          {messages.map((message, index) => (
            <article class={`message ${message.role}`} key={`${message.role}-${index}`}>
              <p class="speaker">{message.role === "assistant" ? "tengu" : "you"}</p>
              <p>{message.text}</p>
            </article>
          ))}

          <article class="message assistant">
            <p class="speaker">tengu</p>
            <div class="tool-card">
              <div class="tool-head">
                <strong>$ bash</strong>
                <span class="running"><i /> running</span>
              </div>
              <code>npm test -- login.test.ts</code>
              <p>17 passed · retrying focused test…</p>
            </div>
          </article>
        </section>

        <div class="composer-wrap">
          <form class="composer" onSubmit={send}>
            <textarea
              rows={2}
              aria-label="Message Tengu"
              placeholder="Message Tengu..."
              value={draft}
              onInput={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div class="composer-actions">
              <span>enter to send · shift+enter for newline</span>
              <button type="submit" aria-label="Send message" disabled={!draft.trim()}>send</button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
