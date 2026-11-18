import { useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, Clock, Ban, HelpCircle } from "lucide-react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/wt/Logo";
import { Field } from "@/components/wt/forms";
import { LoadingState } from "@/components/wt/states";
import { useWtQuery } from "@/lib/data/hooks";

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-md space-y-6">
        <div className="text-center">
          <AppLink
            href={paths.login}
            className="inline-block rounded-lg bg-card px-4 py-2"
            aria-label="Back to staff sign-in"
          >
            <Logo height={30} />
          </AppLink>
        </div>
        <section className="rounded-lg border bg-card p-6">{children}</section>
        <p className="text-center text-xs text-muted-foreground">
          Sample tokens:{" "}
          <AppLink className="underline" href={paths.credentials("demo-valid-token")}>
            valid
          </AppLink>{" "}
          ·{" "}
          <AppLink className="underline" href={paths.credentials("demo-expired-token")}>
            expired
          </AppLink>{" "}
          ·{" "}
          <AppLink className="underline" href={paths.credentials("demo-used-token")}>
            used
          </AppLink>
        </p>
      </div>
    </div>
  );
}

export function CredentialsView({ token }: { token: string }) {
  const q = useWtQuery(["token", token], (c) => c.checkCredentialToken(token));
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (q.isPending)
    return (
      <Card>
        <LoadingState label="Checking link…" />
      </Card>
    );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 10) return setErr("Use at least 10 characters.");
    if (pw !== pw2) return setErr("The two passwords do not match.");
    // Demo: nothing is sent or stored.
    setPw("");
    setPw2("");
    setErr(null);
    setDone(true);
  };

  if (q.data === "valid" && done)
    return (
      <Card>
        <CheckCircle2 className="mb-2 size-6 text-success" aria-hidden />
        <h1 className="text-lg font-semibold">Password set (demo)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing was stored. In the real app this link would now be marked as used.
        </p>
        <Button asChild className="mt-4">
          <AppLink href={paths.login}>Go to staff sign-in</AppLink>
        </Button>
      </Card>
    );

  if (q.data === "valid")
    return (
      <Card>
        <h1 className="text-lg font-semibold">Set up your password</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          This setup/reset link is valid. Demo only — your entry is not saved.
        </p>
        <form onSubmit={submit} className="space-y-4" autoComplete="off">
          <Field label="New password" htmlFor="cred-pw" hint="At least 10 characters.">
            <Input
              id="cred-pw"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password" htmlFor="cred-pw2">
            <Input
              id="cred-pw2"
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          {err && (
            <p role="alert" className="text-sm text-destructive">
              {err}
            </p>
          )}
          <Button type="submit" className="w-full">
            Save password
          </Button>
        </form>
      </Card>
    );

  const states = {
    expired: {
      icon: Clock,
      title: "This link has expired",
      body: "Setup and reset links expire after a short time. Ask your administrator to send a new one.",
    },
    used: {
      icon: Ban,
      title: "This link has already been used",
      body: "Each link works once. If you did not use it, contact your administrator.",
    },
    unknown: {
      icon: HelpCircle,
      title: "We don't recognize this link",
      body: "Check that you copied the whole link, or ask your administrator for a new one.",
    },
  } as const;
  const s = states[q.data === "expired" || q.data === "used" ? q.data : "unknown"];
  return (
    <Card>
      <s.icon className="mb-2 size-6 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">{s.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
      <Button asChild variant="outline" className="mt-4">
        <AppLink href={paths.login}>Back to staff sign-in</AppLink>
      </Button>
    </Card>
  );
}
