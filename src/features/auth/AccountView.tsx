import { useState } from "react";
import { toast } from "sonner";
import { useSignOut } from "@/app/auth";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormDialog } from "@/components/wt/forms";
import { KeyValue, PageHeader, Section } from "@/components/wt/layout";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { departmentLabels, roleLabels } from "@/domain/labels";
import { useMe } from "@/features/shared/useMe";

export function AccountView() {
  const me = useMe();
  const signOut = useSignOut();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  return (
    <>
      <PageHeader
        title="My account"
        crumbs={[{ label: "Staff", href: paths.home }, { label: "Account" }]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Profile">
          <KeyValue
            items={[
              { label: "Name", value: me.displayName },
              { label: "Username", value: <span className="wt-id">{me.username}</span> },
              { label: "Email (synthetic)", value: me.email },
              { label: "Status", value: <StatusBadge status={me.status} /> },
            ]}
          />
        </Section>
        <Section
          title="Role and department"
          description="Read-only. Ask an administrator to change your scope."
        >
          <KeyValue
            items={[
              { label: "Role", value: `${me.role} · ${roleLabels[me.role]}` },
              { label: "Department", value: departmentLabels[me.department] },
              { label: "Scope", value: me.scope },
            ]}
          />
        </Section>
        <Section title="Account controls" className="lg:col-span-2">
          <div className="flex flex-wrap gap-2">
            <FormDialog
              trigger="Change password"
              triggerVariant="outline"
              title="Change password (demo)"
              description="Demo only — nothing is sent or stored."
              submitLabel="Update password"
              onSubmit={() => {
                setCurrent("");
                setNext("");
                toast.info("Demo: password not changed or stored.");
                return true;
              }}
            >
              <Field label="Current password" htmlFor="acc-cur">
                <Input
                  id="acc-cur"
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label="New password" htmlFor="acc-new">
                <Input
                  id="acc-new"
                  type="password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  autoComplete="off"
                />
              </Field>
            </FormDialog>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.info("Demo: other sessions would be signed out.")}
            >
              Sign out other devices
            </Button>
            <Button size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </Section>
      </div>
    </>
  );
}
