/**
 * Shared mock state with optional localStorage persistence (browser only).
 * Only synthetic, non-sensitive fixtures are stored. Never store credentials here.
 */
import type { DemoState } from "@/domain/types";
import { DEMO_STATE_VERSION, createSeed } from "./fixtures";

const STORAGE_KEY = "weartrail.demo-state";

let state: DemoState | null = null;
const listeners = new Set<() => void>();

function load(): DemoState {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoState;
        if (parsed.version === DEMO_STATE_VERSION) return parsed;
      }
    } catch {
      /* fall through to seed */
    }
  }
  return createSeed();
}

function save(next: DemoState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage full or unavailable: keep in memory */
  }
}

export function getState(): DemoState {
  if (!state) state = load();
  return state;
}

/** Apply a mutation to a copy of the state; commits only if it does not throw. */
export function mutate<T>(fn: (draft: DemoState) => T): T {
  const draft = structuredClone(getState());
  const result = fn(draft);
  state = draft;
  save(draft);
  listeners.forEach((l) => l());
  return result;
}

export function resetDemoState() {
  state = createSeed();
  save(state);
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper: replace state without persistence. */
export function __setStateForTests(next: DemoState | null) {
  state = next;
}
