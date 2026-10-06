import type { ComponentChildren, Ref } from "preact";
import type { LiveTool, TranscriptItem } from "./live";

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
  connection,
}: {
  agents: AgentSummary[];
  activeAgentId?: number;
  open: boolean;
  onClose: () => void;
  onCreate: () => void;
  onSelect: (id: number) => void;
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
        <footer class="sidebar-footer"><ConnectionStatus state={connection} /></footer>
      </aside>
    </>
  );
}

export function SessionHeader({
  title,
  models,
  model,
  onModelChange,
  onOpenAgents,
  running,
  queued,
  onStop,
}: {
  title: string;
  models: ModelOption[];
  model: string;
  onModelChange: (model: string) => void;
  onOpenAgents: () => void;
  running: boolean;
  queued: number;
  onStop: () => void;
}) {
  return (
    <header class="chat-header">
      <button class="menu-button" aria-label="Open agents" onClick={onOpenAgents}>☰</button>
      <h1>{title}</h1>
      <label class="model-picker">
        <span>model</span>
        <select aria-label="Model" value={model} onChange={(event) => onModelChange(event.currentTarget.value)}>
          {models.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.label}</option>)}
        </select>
      </label>
      {queued > 0 && <span class="queue-count">{queued} queued</span>}
      {running && <button class="stop-button" onClick={onStop}>stop</button>}
    </header>
  );
}

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section class="empty-state">
      <p>No agents yet.</p>
      <button onClick={onCreate}>Create agent</button>
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
  return (
    <section class="transcript" aria-live="polite">
      {items.map((item) => item.type === "message"
        ? <MessageRow message={item.message} key={item.id} />
        : <MessageFrame role="assistant" key={item.tool.id}>
            <ToolCall name={item.tool.name} command={item.tool.command} output={item.tool.output} state={item.tool.state} />
          </MessageFrame>)}
      {partial && <MessageRow message={{ role: "assistant", text: partial }} />}
      {running && <span class="agent-working" role="status" aria-label="Agent is working"><i /><i /><i /></span>}
    </section>
  );
}

export function MessageRow({ message }: { message: Message }) {
  return (
    <MessageFrame role={message.role}>
      <p class={message.error ? "message-error" : undefined}>{message.text}</p>
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
}: {
  value: string;
  onInput: (value: string) => void;
  onSubmit: (event: Event) => void;
  steer?: boolean;
  error?: string;
  inputRef?: Ref<HTMLTextAreaElement>;
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
          <span>enter to send · shift+enter for newline</span>
          <button type="submit" aria-label={steer ? "Steer agent" : "Send message"} disabled={!value.trim()}>
            {steer ? "steer ↵" : "send ↵"}
          </button>
        </div>
      </form>
    </div>
  );
}
