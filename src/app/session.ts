/**
 * Mock staff session adapter (UI simulation only).
 * Stores just the demo user id in localStorage — never passwords or tokens.
 * Replace with the Express session/cookie flow later.
 */
import { useSyncExternalStore } from "react";

const KEY = "weartrail.staff-session";
const listeners = new Set<() => void>();

export function getSessionUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setSessionUserId(userId: string | null) {
  if (typeof window === "undefined") return;
  if (userId) window.localStorage.setItem(KEY, userId);
  else window.localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSessionUserId() {
  return useSyncExternalStore(subscribe, getSessionUserId, () => null);
}
