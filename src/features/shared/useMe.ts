import { useCurrentUser } from "@/app/auth";
import type { StaffUser } from "@/domain/types";

const fallbackUser: StaffUser = {
  id: "guest",
  username: "guest",
  displayName: "Staff",
  role: "O",
  department: "general",
  status: "active",
  createdAt: new Date().toISOString(),
};

/** Current staff user inside the workspace (the guard guarantees a session). */
export function useMe(): StaffUser {
  const q = useCurrentUser();
  return q.data ?? fallbackUser;
}
