import { useEffect, useRef } from 'react';

export interface Shortcut {
  /** e.g. "n", "/", "mod+k" (mod = Ctrl or Cmd) */
  combo: string;
  handler: (e: KeyboardEvent) => void;
  /** also fire while typing in inputs (default false, except mod combos) */
  allowInInputs?: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function matches(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const wantMod = parts.includes('mod');
  const hasMod = e.metaKey || e.ctrlKey;
  if (wantMod !== hasMod) return false;
  if (!wantMod && (e.altKey || e.metaKey || e.ctrlKey)) return false;
  return e.key.toLowerCase() === key;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      for (const s of ref.current) {
        if (!matches(e, s.combo)) continue;
        const isMod = s.combo.includes('mod');
        if (isTypingTarget(e.target) && !(s.allowInInputs ?? isMod)) continue;
        // don't hijack keys while a dialog is open (except mod combos)
        if (!isMod && document.querySelector('[role="dialog"][aria-modal="true"]')) continue;
        e.preventDefault();
        s.handler(e);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
