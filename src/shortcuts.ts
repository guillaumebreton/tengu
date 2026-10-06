import { useEffect } from "preact/hooks";

export type Shortcuts = Readonly<Record<string, () => void>>;

export function useGlobalShortcuts(shortcuts: Shortcuts): void {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const key = normalizedKey(event);
      const action = shortcuts[key];
      if (!action || (isTyping(event.target) && !event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [shortcuts]);
}

function normalizedKey(event: KeyboardEvent): string {
  const key = event.key.toLowerCase();
  return event.metaKey || event.ctrlKey ? `mod+${key}` : key;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.matches("input, textarea, select") || target.isContentEditable
  );
}
