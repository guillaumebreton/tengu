import type { ComponentChildren, Ref } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { AuthFlow, Provider } from "./client";
import type { LiveTool, TranscriptItem } from "./live";
import { Markdown } from "./markdown";

export type AgentSummary = {
  id: number;
  title: string;
  preview: string;
};

export type ModelOption = {
  id: string;
  label: string;
};

export type Message = {
  role: "user" | "assistant";
  text: string;
  error?: boolean;
};

export function ConnectionStatus({ state }: { state: "connected" | "disconnected" }) {
  return <span class="connection-state" data-state={state}><i />{state}</span>;
}

export function Sidebar({
  agents,
  activeAgentId,
  open,
  onClose,
  onCreate,
  onSelect,
  onSettings,
  connection,
}: {
  agents: AgentSummary[];
  activeAgentId?: number;
  open: boolean;
  onClose: () => void;
  onCreate: () => void;
  onSelect: (id: number) => void;
  onSettings: () => void;
  connection: "connected" | "disconnected";
}) {
  return (
    <>
      <button class="scrim" aria-label="Close agents" data-open={open} onClick={onClose} />
      <aside class="sidebar" data-open={open}>
        <header class="brand">
          <strong>tengu</strong>
          <button class="new-chat" aria-label="New agent" onClick={onCreate}>new</button>
        </header>
        <nav aria-label="Agents">
          <p class="section-label">agents</p>
          <div class="conversation-list">
            {agents.map((agent) => (
              <button class="conversation" data-active={agent.id === activeAgentId} onClick={() => { onSelect(agent.id); onClose(); }} key={agent.id}>
                <span class="conversation-marker" aria-hidden="true">›</span>
                <span class="conversation-copy">
                  <strong>{agent.title}</strong>
                  <small>{agent.preview}</small>
                </span>
              </button>
            ))}
          </div>
        </nav>
        <footer class="sidebar-footer">
          <ConnectionStatus state={connection} />
          <button onClick={onSettings}>settings</button>
        </footer>
      </aside>
    </>
  );
}

export function SessionHeader({
  title,
  onOpenAgents,
  onRename,
  running,
  queued,
  onStop,
}: {
  title: string;
  onOpenAgents: () => void;
  onRename: (name: string) => void;
  running: boolean;
  queued: number;
  onStop: () => void;
}) {
  return (
    <header class="chat-header">
      <button class="menu-button" aria-label="Open agents" onClick={onOpenAgents}>☰</button>
      <button class="agent-title" aria-label="Rename agent" onClick={() => {
        const name = window.prompt("Agent name", title);
        if (name?.trim()) onRename(name);
      }}>{title}</button>
      {queued > 0 && <span class="queue-count">{queued} queued</span>}
      {running && <button class="stop-button" onClick={onStop}>stop</button>}
    </header>
  );
}

export function Settings({
  providers,
  flow,
  onClose,
  onLogin,
  onLogout,
  onAnswer,
}: {
  providers: Provider[];
  flow: AuthFlow | null;
  onClose: () => void;
  onLogin: (providerId: string, type: "oauth" | "api_key") => void;
  onLogout: (providerId: string) => void;
  onAnswer: (flowId: string, promptId: string, value?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  const shown = providers
    .filter((provider) => `${provider.name} ${provider.id}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name));
  const answer = (promptId: string, answerValue?: string) => {
    if (!flow) return;
    onAnswer(flow.id, promptId, answerValue);
    setValue("");
  };
  return <section class="settings" aria-label="Settings">
    <header><h1>settings</h1><button aria-label="Close settings" onClick={onClose}>close</button></header>
    {flow ? <div class="auth-flow">
      <h2>{providers.find((provider) => provider.id === flow.providerId)?.name ?? flow.providerId}</h2>
      {flow.events.map((event, index) => event.type === "auth_url"
        ? <p key={index}><a href={event.url} target="_blank" rel="noopener">open sign-in page</a><small>{event.instructions}</small></p>
        : event.type === "device_code"
          ? <p key={index}>Enter <strong>{event.userCode}</strong> at <a href={event.verificationUri} target="_blank" rel="noopener">{event.verificationUri}</a></p>
          : <p key={index}>{event.message}</p>)}
      {flow.prompt?.type === "select" ? <div class="auth-options">
        <p>{flow.prompt.message}</p>
        {flow.prompt.options.map((option) => <button onClick={() => answer(flow.prompt!.id, option.id)} key={option.id}>{option.label}<small>{option.description}</small></button>)}
      </div> : flow.prompt && <form onSubmit={(event) => { event.preventDefault(); answer(flow.prompt!.id, value); }}>
        <label>{flow.prompt.message}<input type={flow.prompt.type === "secret" ? "password" : "text"} value={value} placeholder={flow.prompt.placeholder} onInput={(event) => setValue(event.currentTarget.value)} /></label>
        <button type="submit">continue</button>
      </form>}
      {!flow.prompt && !flow.done && <p class="muted">waiting for provider…</p>}
      {flow.done?.ok && <p class="success">signed in</p>}
      {flow.done && !flow.done.ok && <p class="request-error" role="alert">{flow.done.error}</p>}
    </div> : <>
      <p class="settings-copy">Provider credentials are stored in Tengu's isolated Pi configuration.</p>
      <input class="settings-search" aria-label="Search providers" placeholder="search providers" value={query} onInput={(event) => setQuery(event.currentTarget.value)} />
      <div class="provider-list">{shown.map((provider) => <article class="provider" key={provider.id}>
        <div><strong>{provider.name}</strong><small>{provider.configured ? `configured${provider.label ? ` · ${provider.label}` : ""}` : "not configured"} · {provider.models} models</small></div>
        <div class="provider-actions">
          {provider.oauth && <button onClick={() => onLogin(provider.id, "oauth")}>{provider.oauth}</button>}
          {provider.apiKey && <button onClick={() => onLogin(provider.id, "api_key")}>API key</button>}
          {provider.configured && provider.source === "stored" && <button onClick={() => onLogout(provider.id)}>sign out</button>}
        </div>
      </article>)}</div>
    </>}
  </section>;
}

export function EmptyState({ onCreate, onSettings, configured, error }: { onCreate: () => void; onSettings: () => void; configured: boolean; error?: string }) {
  return (
    <section class="empty-state">
      <p>No agents yet.</p>
      {error && <p class="request-error" role="alert">{error}</p>}
      {configured ? <button onClick={onCreate}>Create agent</button> : <button onClick={onSettings}>Configure provider</button>}
    </section>
  );
}

export function Transcript({
  items,
  partial = "",
  running = false,
}: {
  items: TranscriptItem[];
  partial?: string;
  running?: boolean;
}) {
  const endRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [items, partial, running]);

  return (
    <section class="transcript" aria-live="polite">
      {items.map((item) => item.type === "message"
        ? <MessageRow message={item.message} key={item.id} />
        : <MessageFrame role="assistant" key={item.tool.id}>
            <ToolCall name={item.tool.name} command={item.tool.command} output={item.tool.output} state={item.tool.state} />
          </MessageFrame>)}
      {partial && <MessageRow message={{ role: "assistant", text: partial }} />}
      {running && <span class="agent-working" role="status" aria-label="Agent is working"><i /><i /><i /></span>}
      <span ref={endRef} />
    </section>
  );
}

export function MessageRow({ message }: { message: Message }) {
  return (
    <MessageFrame role={message.role}>
      {message.role === "assistant" && !message.error
        ? <Markdown text={message.text} />
        : <p class={message.error ? "message-error" : undefined}>{message.text}</p>}
    </MessageFrame>
  );
}

function MessageFrame({
  role,
  children,
}: {
  role: Message["role"];
  children: ComponentChildren;
}) {
  return <article class={`message ${role}`}>{children}</article>;
}

export function ToolCall({
  name,
  command,
  output,
  state,
}: {
  name: string;
  command: string;
  output: string;
  state: "running" | "done";
}) {
  return (
    <div class="tool-call" data-state={state}>
      <div class="tool-command">
        <span>{name === "bash" ? "$" : name}</span>
        {command && <code>{command}</code>}
        {state === "running" && <i aria-label="running" />}
      </div>
      {output
        ? <pre class="tool-output">{output}</pre>
        : state === "done" && <p class="tool-empty">no output</p>}
    </div>
  );
}

export function Composer({
  value,
  onInput,
  onSubmit,
  steer = false,
  error,
  inputRef,
  models,
  model,
  onModelChange,
}: {
  value: string;
  onInput: (value: string) => void;
  onSubmit: (event: Event) => void;
  steer?: boolean;
  error?: string;
  inputRef?: Ref<HTMLTextAreaElement>;
  models: ModelOption[];
  model: string;
  onModelChange: (model: string) => void;
}) {
  return (
    <div class="composer-wrap">
      {error && <p class="request-error" role="alert">{error}</p>}
      <form class="composer" onSubmit={onSubmit}>
        <textarea
          ref={inputRef}
          rows={2}
          aria-label="Message Tengu"
          placeholder="Type a message..."
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck={false}
          value={value}
          onInput={(event) => onInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div class="composer-actions">
          <label class="model-picker">
            <span>model</span>
            <select aria-label="Model" value={model} onChange={(event) => onModelChange(event.currentTarget.value)}>
              {models.length === 0 && <option value="">configure provider</option>}
              {models.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.label}</option>)}
            </select>
          </label>
          <span class="composer-hint">enter to send · shift+enter for newline</span>
          <button type="submit" aria-label={steer ? "Steer agent" : "Send message"} disabled={!value.trim()}>
            {steer ? "steer ↵" : "send ↵"}
          </button>
        </div>
      </form>
    </div>
  );
}
