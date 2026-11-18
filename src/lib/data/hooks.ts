import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSessionUserId } from "@/app/session";
import type { WearTrailClient } from "./client";
import { useClient } from "./provider";

/** Read through the client. Keys are namespaced per actor so role switches never share cache. */
export function useWtQuery<T>(key: readonly unknown[], fn: (c: WearTrailClient) => Promise<T>) {
  const client = useClient();
  const actor = useSessionUserId();
  return useQuery({ queryKey: ["wt", actor, ...key], queryFn: () => fn(client), retry: false });
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export function errorCode(e: unknown): string | undefined {
  return e && typeof e === "object" && "code" in e
    ? String((e as { code: unknown }).code)
    : undefined;
}

/** Run a mutation, refresh every WearTrail query, and toast the outcome. Resolves undefined on failure. */
export function useWtAction() {
  const client = useClient();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (fn: (c: WearTrailClient) => Promise<unknown>) => fn(client),
    onSettled: () => qc.invalidateQueries({ queryKey: ["wt"] }),
  });
  async function run<T>(
    fn: (c: WearTrailClient) => Promise<T>,
    success?: string | ((r: T) => string),
  ): Promise<T | undefined> {
    try {
      const r = (await m.mutateAsync(fn)) as T;
      if (success) toast.success(typeof success === "function" ? success(r) : success);
      return r;
    } catch (e) {
      toast.error(errorMessage(e));
      return undefined;
    }
  }
  return { run, pending: m.isPending };
}
