import { useMemo, useState } from "preact/hooks";

const conversations = [
  { title: "Fix the flaky login test", preview: "I found the race in the redirect handler.", time: "now", active: true },
  { title: "Review dependency updates", preview: "All checks pass. The PR is ready.", time: "18m" },
  { title: "Simplify the Nix module", preview: "Removed two unnecessary options.", time: "2h" },
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

function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg class="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M6 9.5 11.5 4l2.1 6.2M26 9.5 20.5 4l-2.1 6.2" />
      <path d="M8.5 10.5c2.8-3.2 12.2-3.2 15 0 2.4 2.8 1.7 10.1-1 13.3-2.5 3-10.5 3-13 0-2.7-3.2-3.4-10.5-1-13.3Z" />
      <path d="m12.5 18 3.5 2 3.5-2M11.5 14.5h.1M20.4 14.5h.1" />
    </svg>
  );
}

export function App() {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const date = useMemo(
    () => new Intl.DateTimeFormat("en", { month: "long", day: "numeric" }).format(new Date()),
    [],
  );

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
          <div class="brand-lockup">
            <Mark />
            <span>Tengu</span>
          </div>
          <button class="icon-button new-chat" aria-label="New conversation">
            <span aria-hidden="true">＋</span>
          </button>
        </header>

        <nav aria-label="Conversations">
          <p class="section-label">Today</p>
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
          <span>Connected</span>
          <span class="model">Sonnet 4.6</span>
        </footer>
      </aside>

      <main class="chat">
        <header class="chat-header">
          <button class="icon-button menu-button" aria-label="Open conversations" onClick={() => setSidebarOpen(true)}>
            <span aria-hidden="true">☰</span>
          </button>
          <div>
            <p class="eyebrow">{date}</p>
            <h1>Fix the flaky login test</h1>
          </div>
          <div class="run-state"><span /> Working</div>
        </header>

        <section class="transcript" aria-live="polite">
          <div class="day-marker"><span>Today</span></div>
          {messages.map((message, index) => (
            <article class={`message ${message.role}`} key={`${message.role}-${index}`}>
              <div class="avatar">{message.role === "assistant" ? <Mark size={22} /> : "G"}</div>
              <div class="message-body">
                <p class="speaker">{message.role === "assistant" ? "Tengu" : "You"}</p>
                <p>{message.text}</p>
              </div>
            </article>
          ))}

          <article class="message assistant">
            <div class="avatar"><Mark size={22} /></div>
            <div class="message-body">
              <p class="speaker">Tengu</p>
              <div class="tool-card">
                <div class="tool-head">
                  <span class="terminal-glyph">›_</span>
                  <strong>bash</strong>
                  <span class="running"><i /> running</span>
                </div>
                <code>npm test -- login.test.ts</code>
                <p class="tool-output">17 passed · retrying focused test…</p>
              </div>
            </div>
          </article>
        </section>

        <div class="composer-wrap">
          <form class="composer" onSubmit={send}>
            <textarea
              rows={1}
              aria-label="Message Tengu"
              placeholder="Message Tengu…"
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
              <span>↵ send · ⇧↵ newline</span>
              <button type="submit" aria-label="Send message" disabled={!draft.trim()}>
                <span aria-hidden="true">↑</span>
              </button>
            </div>
          </form>
          <p class="footnote">Tengu can make changes in the shared workspace.</p>
        </div>
      </main>
    </div>
  );
}
