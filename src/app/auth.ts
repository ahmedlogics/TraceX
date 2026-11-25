/** Mock auth adapter: sign-in / sign-out wiring (no real credentials). */
import { useQueryClient } from "@tanstack/react-query";
import { clearDataMode, useClient } from "@/lib/data/provider";
import { useWtQuery } from "@/lib/data/hooks";
import { paths } from "./paths";
import { useAppNavigate } from "./navigation";
import { clearSession, setSessionUserId, setSessionUsername, useSessionUserId } from "./session";

export function useCurrentUser() {
  const id = useSessionUserId();
  return useWtQuery(["me", id], (c) => (id ? c.getUser(id) : Promise.resolve(null)));
}

export function useSignIn() {
  const client = useClient();
  const qc = useQueryClient();
  return async (userId: string) => {
    await client.recordSignIn(userId);
    qc.clear();
    setSessionUserId(userId);
    setSessionUsername(userId);
  };
}

export function useAuthenticate() {
  const client = useClient();
  const qc = useQueryClient();
  return async (username: string, password: string) => {
    const user = await client.authenticate(username, password);
    qc.clear();
    setSessionUserId(user.id);
    setSessionUsername(user.username);
    return user;
  };
}

export function useSignOut() {
  const client = useClient();
  const qc = useQueryClient();
  const navigate = useAppNavigate();
  return async () => {
    clearDataMode();
    await client.recordSignOut();
    await qc.cancelQueries();
    qc.clear();
    clearSession();
    if (typeof window !== "undefined") {
      window.location.href = paths.login;
    } else {
      await navigate(paths.login, { replace: true });
    }
  };
}
