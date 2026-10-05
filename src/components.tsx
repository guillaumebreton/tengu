import type { ComponentChildren } from "preact";
import type { LiveTool } from "./live";

export type AgentSummary = {
  id: string;
  title: string;
  preview: string;
  time: string;
};

export type ModelOption = {
  id: string;
  label: string;
};

export type Message = {
  role: "user" | "assistant";
  text: string;
};

export function Status({ state, children }: { state: "connected" | "working" | "idle"; children: ComponentChildren }) {
  return <span class={state === "connected" ? "connection-state" : "run-state"} data-state={state}><i />{children}</span>;
}

export function Sidebar({
  agents,
  activeAgentId,
  open,
  onClose,
  onCreate,
  onSelect,
}: {
  agents: AgentSummary[];
  activeAgentId: string;
  open: boolean;
  onClose: () => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
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
                <time>{agent.time}</time>
              </button>
            ))}
          </div>
        </nav>
        <footer class="sidebar-footer"><Status state="connected">connected</Status></footer>
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
}: {
  title: string;
  models: ModelOption[];
  model: string;
  onModelChange: (model: string) => void;
  onOpenAgents: () => void;
  running: boolean;
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
      <Status state={running ? "working" : "idle"}>{running ? "working" : "idle"}</Status>
    </header>
  );
}

export function Transcript({
  messages,
  partial = "",
  tools = [],
  showExampleTool = true,
}: {
  messages: Message[];
  partial?: string;
  tools?: LiveTool[];
  showExampleTool?: boolean;
}) {
  return (
    <section class="transcript" aria-live="polite">
      {messages.map((message, index) => (
        <MessageRow message={message} key={`${message.role}-${index}`} />
      ))}
      {partial && <MessageRow message={{ role: "assistant", text: partial }} />}
      {tools.map((tool) => (
        <MessageFrame speaker="tengu" role="assistant" key={tool.id}>
          <ToolCall name={tool.name} command={tool.command} output={tool.output} state={tool.state} />
        </MessageFrame>
      ))}
      {showExampleTool && (
        <MessageFrame speaker="tengu" role="assistant">
          <ToolCall
            name="bash"
            command="npm test -- login.test.ts"
            output="17 passed · retrying focused test…"
            state="running"
          />
        </MessageFrame>
      )}
    </section>
  );
}

export function MessageRow({ message }: { message: Message }) {
  return (
    <MessageFrame speaker={message.role === "assistant" ? "tengu" : "you"} role={message.role}>
      <p>{message.text}</p>
    </MessageFrame>
  );
}

function MessageFrame({
  speaker,
  role,
  children,
}: {
  speaker: string;
  role: Message["role"];
  children: ComponentChildren;
}) {
  return (
    <article class={`message ${role}`}>
      <p class="speaker">{speaker}</p>
      {children}
    </article>
  );
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
    <div class="tool-call">
      <div class="tool-head">
        <strong>{name}</strong>
        <span class={state}><i /> {state}</span>
      </div>
      {command && <code class="tool-command"><span>$</span> {command}</code>}
      {output && <pre class="tool-output"><span>{state === "done" ? "✓" : "·"}</span> {output}</pre>}
    </div>
  );
}

export function Composer({
  value,
  onInput,
  onSubmit,
}: {
  value: string;
  onInput: (value: string) => void;
  onSubmit: (event: Event) => void;
}) {
  return (
    <div class="composer-wrap">
      <form class="composer" onSubmit={onSubmit}>
        <textarea
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
          <button type="submit" aria-label="Send message" disabled={!value.trim()}>send ↵</button>
        </div>
      </form>
    </div>
  );
}
