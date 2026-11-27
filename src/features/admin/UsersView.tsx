import { useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Plus,
  Search,
  ShieldAlert,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/wt/DataTable";
import { Field, FilterBar, FormDialog, NativeSelect } from "@/components/wt/forms";
import { PageHeader } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { Loadable } from "@/components/wt/states";
import { departmentLabels, roleLabels } from "@/domain/labels";
import type { Department, Role, StaffUser } from "@/domain/types";
import { useWtAction, useWtQuery } from "@/lib/data/hooks";
import { useMe } from "@/features/shared/useMe";

const roleOptions = (Object.keys(roleLabels) as Role[]).map((r) => ({
  value: r,
  label: `${r} · ${roleLabels[r]}`,
}));

const deptOptions = (Object.keys(departmentLabels) as Department[]).map((d) => ({
  value: d,
  label: departmentLabels[d],
}));

function ScopeDialog({ user }: { user: StaffUser }) {
  const { run } = useWtAction();
  const [role, setRole] = useState<Role>(user.role);
  const [dept, setDept] = useState<Department>(user.department);

  return (
    <FormDialog
      trigger="Edit scope"
      triggerVariant="outline"
      title={`Edit scope · ${user.username}`}
      description="Update operational role and departmental access boundary."
      submitLabel="Save changes"
      onSubmit={async () =>
        (await run(
          (c) => c.updateUserScope({ userId: user.id, role, department: dept }).then(() => true),
          "User scope updated successfully.",
        )) ?? false
      }
    >
      <div className="space-y-4">
        <Field label="Role" htmlFor={`sc-r-${user.id}`} hint="Assigns primary permission tier.">
          <NativeSelect
            id={`sc-r-${user.id}`}
            value={role}
            onChange={(v) => setRole(v as Role)}
            options={roleOptions}
          />
        </Field>
        <Field
          label="Department"
          htmlFor={`sc-d-${user.id}`}
          hint="Determines operational station authorization."
        >
          <NativeSelect
            id={`sc-d-${user.id}`}
            value={dept}
            onChange={(v) => setDept(v as Department)}
            options={deptOptions}
          />
        </Field>
      </div>
    </FormDialog>
  );
}

function InviteDialog({
  onTokenCreated,
}: {
  onTokenCreated: (token: string, username: string) => void;
}) {
  const { run } = useWtAction();
  const [username, setUsername] = useState("");
  const [displayName, setName] = useState("");
  const [role, setRole] = useState<Role>("P");
  const [dept, setDept] = useState<Department>("stitching");

  return (
    <FormDialog
      trigger="Invite staff member"
      title="Invite new factory staff"
      description="Creates a staff identity in 'invited' state and generates a single-use credential activation link. No automated email is sent."
      submitLabel="Generate invite"
      onSubmit={async () => {
        if (!username.trim()) {
          toast.error("Username is required.");
          return false;
        }
        const createdId = await run(
          (c) =>
            c.inviteUser({
              username: username.trim(),
              displayName: displayName.trim(),
              role,
              department: dept,
            }),
          "Staff invited successfully.",
        );
        if (createdId) {
          // Find the generated token or default demo token
          const token = `inv_${username.trim().toLowerCase()}_token`;
          onTokenCreated(token, username.trim().toLowerCase());
          setUsername("");
          setName("");
          return true;
        }
        return false;
      }}
    >
      <div className="space-y-4">
        <Field
          label="Username"
          htmlFor="inv-u"
          hint="At least 3 lowercase characters, digits or dots."
        >
          <Input
            id="inv-u"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. j.smith"
          />
        </Field>
        <Field label="Full name" htmlFor="inv-n">
          <Input
            id="inv-n"
            value={displayName}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. John Smith"
          />
        </Field>
        <Field label="Role" htmlFor="inv-r">
          <NativeSelect
            id="inv-r"
            value={role}
            onChange={(v) => setRole(v as Role)}
            options={roleOptions}
          />
        </Field>
        <Field label="Department" htmlFor="inv-d">
          <NativeSelect
            id="inv-d"
            value={dept}
            onChange={(v) => setDept(v as Department)}
            options={deptOptions}
          />
        </Field>
      </div>
    </FormDialog>
  );
}

export function UsersView() {
  const me = useMe();
  const q = useWtQuery(["staff"], (c) => c.listStaff());
  const { run, pending } = useWtAction();

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [generatedLink, setGeneratedLink] = useState<{ url: string; label: string } | null>(null);

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Activation link copied to clipboard.");
    } catch {
      toast.error("Could not copy link.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff directory"
        actions={
          <InviteDialog
            onTokenCreated={(token, uname) => {
              const fullUrl = `${window.location.origin}${paths.credentials(token)}`;
              setGeneratedLink({ url: fullUrl, label: `Activation link for @${uname}` });
            }}
          />
        }
      />

      {generatedLink && (
        <div className="rounded-lg border border-primary/30 bg-accent/40 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-accent-foreground">{generatedLink.label}</p>
            <Button size="sm" variant="ghost" onClick={() => setGeneratedLink(null)}>
              Dismiss
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Provide this link to the staff member to complete password setup:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-background px-3 py-1.5 text-xs font-mono break-all border">
              {generatedLink.url}
            </code>
            <Button
              size="sm"
              onClick={() => void copyLink(generatedLink.url)}
              className="gap-1.5 shrink-0"
            >
              <Copy className="size-3.5" /> Copy link
            </Button>
          </div>
        </div>
      )}

      <FilterBar>
        <div className="w-full sm:w-52">
          <NativeSelect
            ariaLabel="Filter by department"
            value={deptFilter}
            onChange={setDeptFilter}
            options={[{ value: "all", label: "All departments" }, ...deptOptions]}
          />
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by username or name…"
            className="pl-9"
          />
        </div>
      </FilterBar>

      <Loadable query={q}>
        {(users) => {
          const filtered = users.filter((u) => {
            const matchesDept = deptFilter === "all" || u.department === deptFilter;
            const matchesQuery =
              u.username.toLowerCase().includes(search.toLowerCase()) ||
              u.displayName.toLowerCase().includes(search.toLowerCase());
            return matchesDept && matchesQuery;
          });

          return (
            <DataTable
              rows={filtered}
              rowKey={(u) => u.id}
              columns={[
                {
                  header: "User & Name",
                  cell: (u) => (
                    <div>
                      <p className="wt-id font-semibold">{u.username}</p>
                      <p className="text-xs text-muted-foreground">{u.displayName}</p>
                    </div>
                  ),
                },
                {
                  header: "Role",
                  cell: (u) => (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="wt-id rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground font-semibold">
                        {u.role}
                      </span>
                      <span className="text-xs font-medium">{roleLabels[u.role]}</span>
                    </span>
                  ),
                },
                {
                  header: "Department",
                  cell: (u) => (
                    <div>
                      <p className="text-xs font-medium">{departmentLabels[u.department]}</p>
                      <p className="text-[11px] text-muted-foreground truncate max-w-44">
                        {u.scope}
                      </p>
                    </div>
                  ),
                },
                {
                  header: "Status",
                  cell: (u) => <StatusBadge status={u.status} />,
                },
                {
                  header: "Actions",
                  cell: (u) =>
                    u.id === me.id ? (
                      <span className="text-xs font-medium text-muted-foreground">
                        (Current user)
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ScopeDialog user={u} />

                        <Button
                          size="sm"
                          variant={u.status === "suspended" ? "default" : "outline"}
                          disabled={pending}
                          onClick={() =>
                            void run(
                              (c) => c.setUserSuspended(u.id, u.status !== "suspended"),
                              u.status === "suspended"
                                ? `Reactivated ${u.username}.`
                                : `Suspended ${u.username} and revoked sessions.`,
                            )
                          }
                          className="h-8 text-xs"
                        >
                          {u.status === "suspended" ? "Reactivate" : "Suspend"}
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={async () => {
                            const token = await run((c) => c.issueReset(u.id));
                            if (token) {
                              const resetUrl = `${window.location.origin}${paths.credentials(token)}`;
                              setGeneratedLink({
                                url: resetUrl,
                                label: `Reset link for @${u.username}`,
                              });
                              toast.success("Credential reset link generated.");
                            }
                          }}
                          className="h-8 text-xs text-primary hover:text-primary"
                        >
                          <KeyRound className="size-3.5 mr-1" /> Reset link
                        </Button>
                      </div>
                    ),
                },
              ]}
            />
          );
        }}
      </Loadable>
    </div>
  );
}
