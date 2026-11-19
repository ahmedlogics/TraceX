import { useState } from "react";
import { Check, Key, Lock, LogOut, ShieldCheck, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useSignOut } from "@/app/auth";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormDialog } from "@/components/wt/forms";
import { KeyValue, PageHeader, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { departmentLabels, roleLabels } from "@/domain/labels";
import { deriveStaffGrants } from "@/domain/actor";
import { validatePasswordStrength } from "@/domain/crypto-auth";
import { errorMessage } from "@/lib/data/hooks";
import { useClient } from "@/lib/data/provider";
import { useMe } from "@/features/shared/useMe";

export function AccountView() {
  const me = useMe();
  const signOut = useSignOut();
  const client = useClient();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);

  const grants = deriveStaffGrants(me.role, me.department);

  const handleChangePassword = async () => {
    setDialogError(null);
    if (!currentPassword) {
      setDialogError("Please enter your current password.");
      return false;
    }
    const check = validatePasswordStrength(newPassword);
    if (!check.valid) {
      setDialogError(check.reason ?? "New password must be at least 10 characters.");
      return false;
    }
    if (newPassword !== confirmPassword) {
      setDialogError("New passwords do not match.");
      return false;
    }

    try {
      await client.changePassword(currentPassword, newPassword);
      toast.success("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      return true;
    } catch (err) {
      const msg = errorMessage(err);
      setDialogError(msg);
      toast.error(msg);
      return false;
    }
  };

  const handleSignOutOtherSessions = async () => {
    try {
      await client.signOutOtherSessions();
      toast.success("All other active sessions have been revoked.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My account"
        description="View your active staff identity, authorization scope, and session security controls."
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Account" }]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile Card */}
        <Section title="Profile information">
          <KeyValue
            items={[
              { label: "Display Name", value: me.displayName },
              {
                label: "Username",
                value: <span className="wt-id font-semibold">{me.username}</span>,
              },
              { label: "Email (internal)", value: me.email },
              { label: "Account Status", value: <StatusBadge status={me.status} /> },
            ]}
          />
        </Section>

        {/* Role & Department */}
        <Section
          title="Role and department"
          description="Read-only authorization attributes. Managed by system administrators."
        >
          <KeyValue
            items={[
              { label: "Staff Role", value: `${me.role} · ${roleLabels[me.role]}` },
              { label: "Primary Department", value: departmentLabels[me.department] },
              { label: "Operational Scope", value: me.scope },
            ]}
          />
        </Section>

        {/* Authoritative Capability Grants */}
        <Section
          title="Authoritative capability grants"
          description="Fine-grained permissions derived from your verified role and department."
          className="lg:col-span-2"
        >
          {grants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No specific operational grants assigned.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {grants.map((grant) => (
                <span
                  key={grant}
                  className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-950/50 px-3 py-1 text-xs font-mono text-purple-200"
                >
                  <ShieldCheck className="size-3.5 text-purple-400" aria-hidden />
                  {grant}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* Security & Session Controls */}
        <Section title="Security and session management" className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            <FormDialog
              trigger="Change password"
              triggerVariant="outline"
              title="Change account password"
              description="Enter your existing password and choose a secure replacement with at least 10 characters."
              submitLabel="Save new password"
              onSubmit={handleChangePassword}
            >
              <div className="space-y-4">
                <Field label="Current password" htmlFor="acc-cur">
                  <Input
                    id="acc-cur"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      if (dialogError) setDialogError(null);
                    }}
                    autoComplete="current-password"
                  />
                </Field>

                <Field label="New password" htmlFor="acc-new" hint="Minimum 10 characters.">
                  <Input
                    id="acc-new"
                    type="password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (dialogError) setDialogError(null);
                    }}
                    autoComplete="new-password"
                  />
                </Field>

                <Field label="Confirm new password" htmlFor="acc-confirm">
                  <Input
                    id="acc-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (dialogError) setDialogError(null);
                    }}
                    autoComplete="new-password"
                  />
                </Field>

                {dialogError && (
                  <p className="text-xs font-medium text-destructive">{dialogError}</p>
                )}
              </div>
            </FormDialog>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSignOutOtherSessions()}
              className="gap-1.5"
            >
              <Lock className="size-3.5" /> Sign out other sessions
            </Button>

            <Button
              size="sm"
              variant="destructive"
              onClick={() => void signOut()}
              className="gap-1.5 ml-auto"
            >
              <LogOut className="size-3.5" /> Sign out
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
