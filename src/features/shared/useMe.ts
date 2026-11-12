import { useCurrentUser } from "@/app/auth";
import type { StaffUser } from "@/domain/types";

/** Current staff user inside the workspace (the guard guarantees a session). */
export function useMe(): StaffUser {
  const q = useCurrentUser();
  if (!q.data) throw new Error("useMe() used outside the staff workspace");
  return q.data;
}
