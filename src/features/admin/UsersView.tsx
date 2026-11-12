import { useState } from "react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FormDialog, NativeSelect } from "@/components/wt/forms";
import { PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { departmentLabels, roleLabels } from "@/domain/labels";
import type { Department, Role, StaffUser } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

const roleOptions = (Object.keys(roleLabels) as Role[]).map((r) => ({ value: r, label: `${r} · ${roleLabels[r]}` }));
const deptOptions = (Object.keys(departmentLabels) as Department[]).map((d) => ({ value: d, label: departmentLabels[d] }));

function ScopeDialog({ user }: { user: StaffUser }) {
  const { run } = useWtAction();
  const [role, setRole] = useState<Role>(user.role);
  const [dept, setDept] = useState<Department>(user.department);
  return (
    <FormDialog trigger="Edit scope" triggerVariant="outline" title={`Edit scope · ${user.username}`} submitLabel="Save scope"
      onSubmit={async () => (await run((c) => c.updateUserScope({ userId: user.id, role, department: dept }).then(() => true), "Scope updated.")) ?? false}>
      <Field label="Role" htmlFor={`sc-r-${user.id}`}><NativeSelect id={`sc-r-${user.id}`} value={role} onChange={(v) => setRole(v as Role)} options={roleOptions} /></Field>
      <Field label="Department" htmlFor={`sc-d-${user.id}`}><NativeSelect id={`sc-d-${user.id}`} value={dept} onChange={(v) => setDept(v as Department)} options={deptOptions} /></Field>
    </FormDialog>
  );
}

function InviteDialog() {
  const { run } = useWtAction();
  const [username, setUsername] = useState("trainee.demo2");
  const [displayName, setName] = useState("Taylor Trainee");
  const [role, setRole] = useState<Role>("P");
  const [dept, setDept] = useState<Department>("stitching");
  return (
    <FormDialog trigger="Invite staff" title="Invite staff (mock)" description="No email is sent. The account appears as invited." submitLabel="Send invite"
      onSubmit={async () => !!(await run((c) => c.inviteUser({ username, displayName, role, department: dept }), "Invitation recorded (mock)."))}>
      <Field label="Username" htmlFor="inv-u"><Input id="inv-u" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
      <Field label="Display name" htmlFor="inv-n"><Input id="inv-n" value={displayName} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Role" htmlFor="inv-r"><NativeSelect id="inv-r" value={role} onChange={(v) => setRole(v as Role)} options={roleOptions} /></Field>
      <Field label="Department" htmlFor="inv-d"><NativeSelect id="inv-d" value={dept} onChange={(v) => setDept(v as Department)} options={deptOptions} /></Field>
    </FormDialog>
  );
}

export function UsersView() {
  const me = useMe();
  const q = useWtQuery(["staff"], (c) => c.listStaff());
  const { run, pending } = useWtAction();
  return (
    <>
      <PageHeader title="Staff directory" crumbs={[{ label: "Staff", href: paths.home }, { label: "Administration" }, { label: "Staff directory" }]} actions={<InviteDialog />} />
      <Loadable query={q}>
        {(users) => (
          <DataTable
            rows={users}
            rowKey={(u) => u.id}
            columns={[
              { header: "User", cell: (u) => <div><p className="wt-id font-medium">{u.username}</p><p className="text-xs text-muted-foreground">{u.displayName}</p></div> },
              { header: "Role", cell: (u) => `${u.role} · ${roleLabels[u.role]}` },
              { header: "Department", cell: (u) => departmentLabels[u.department] },
              { header: "Status", cell: (u) => <StatusBadge status={u.status} /> },
              {
                header: "Actions",
                cell: (u) =>
                  u.id === me.id ? (
                    <span className="text-xs text-muted-foreground">You</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <ScopeDialog user={u} />
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => void run((c) => c.setUserSuspended(u.id, u.status !== "suspended"), u.status === "suspended" ? "Reactivated." : "Suspended.")}>
                        {u.status === "suspended" ? "Reactivate" : "Suspend"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={async () => {
                          const token = await run((c) => c.issueReset(u.id));
                          if (token) toast.success(<span>Reset link issued (mock). <AppLink className="underline" href={paths.credentials(token)}>Open sample link</AppLink></span>);
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                  ),
              },
            ]}
          />
        )}
      </Loadable>
    </>
  );
}
