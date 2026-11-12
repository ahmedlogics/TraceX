import { useWtQuery } from "@/lib/data/hooks";
import type { StaffUser } from "@/domain/types";

export function useDirectory() {
  const q = useWtQuery(["directory"], (c) => c.listDirectory());
  const map = new Map<string, StaffUser>((q.data ?? []).map((u) => [u.id, u]));
  return { users: q.data ?? [], byId: (id?: string) => (id ? map.get(id) : undefined) };
}

export function UserName({ id }: { id?: string | undefined }) {
  const { byId } = useDirectory();
  const u = byId(id);
  if (!id) return <span className="text-muted-foreground">Unassigned</span>;
  return <span className="wt-id">{u?.username ?? id}</span>;
}
