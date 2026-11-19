import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Info, Lock, RotateCcw, User } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthenticate, useCurrentUser, useSignIn, useSignOut } from "@/app/auth";
import { AppLink, useAppNavigate } from "@/app/navigation";
import { paths } from "@/app/paths";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo, TAGLINE } from "@/components/wt/Logo";
import { Field } from "@/components/wt/forms";
import { StatusBadge } from "@/components/wt/StatusBadge";
import { LoadingState } from "@/components/wt/states";
import { departmentLabels, roleLabels } from "@/domain/labels";
import { useClient } from "@/lib/data/provider";
import { errorMessage, useWtQuery } from "@/lib/data/hooks";

export function LoginView({ redirectTo }: { redirectTo?: string | undefined }) {
  const accounts = useWtQuery(["demo-accounts"], (c) => c.listDemoAccounts());
  const me = useCurrentUser();
  const signIn = useSignIn();
  const authenticate = useAuthenticate();
  const signOut = useSignOut();
  const navigate = useAppNavigate();
  const client = useClient();
  const qc = useQueryClient();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const target =
    redirectTo && redirectTo.startsWith("/staff") && !redirectTo.startsWith(paths.login)
      ? redirectTo
      : paths.home;

  const onFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setErrorMsg("Please enter your staff username.");
      return;
    }
    if (!password) {
      setErrorMsg("Please enter your password.");
      return;
    }

    setIsSubmitting(true);
    try {
      await authenticate(cleanUsername, password);
      toast.success(`Welcome back, ${cleanUsername}!`);
      await navigate(target, { replace: true });
    } catch (err) {
      const msg = errorMessage(err);
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const pickDemoAccount = async (id: string, name: string) => {
    try {
      await signIn(id);
      toast.success(`Switched to demo account: ${name}`);
      await navigate(target, { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const reset = async () => {
    await client.resetDemo();
    qc.clear();
    toast.success("Demo data reset to the starting state.");
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2 text-center">
          <div className="mx-auto inline-block rounded-xl border bg-card px-6 py-4 shadow-sm">
            <Logo height={42} />
          </div>
          <p className="text-sm font-medium text-muted-foreground">{TAGLINE}</p>
        </header>

        {me.data && (
          <div className="flex flex-col items-center justify-between gap-3 rounded-lg border border-primary/20 bg-accent/30 p-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" aria-hidden />
              <p className="text-sm">
                Currently signed in as{" "}
                <span className="wt-id font-semibold">{me.data.username}</span> (
                {roleLabels[me.data.role]})
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" asChild>
                <AppLink href={target}>Enter workspace</AppLink>
              </Button>
              <Button size="sm" variant="outline" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          </div>
        )}

        {/* Real Staff Authentication Form */}
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-5 space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Staff authentication</h1>
            <p className="text-sm text-muted-foreground">
              Sign in with your verified factory credentials. Shoppers never need a login.
            </p>
          </div>

          <form onSubmit={onFormSubmit} className="space-y-4" autoComplete="off">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Username" htmlFor="login-username" hint="e.g. admin.demo, quality.demo">
                <div className="relative">
                  <User
                    className="absolute left-3 top-2.5 size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="login-username"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="name.surname"
                    className="pl-9"
                    autoComplete="username"
                    disabled={isSubmitting}
                  />
                </div>
              </Field>

              <Field label="Password" htmlFor="login-password" hint="At least 10 characters">
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-2.5 size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="••••••••••••"
                    className="pl-9"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                  />
                </div>
              </Field>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/30 bg-danger-soft px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                Default prototype password for demo accounts:{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 wt-id font-bold">
                  weartrail123!
                </code>
              </p>
              <Button type="submit" disabled={isSubmitting} className="min-w-28">
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </div>
          </form>

          <div className="mt-5 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Credential setup or password recovery links:{" "}
              <AppLink
                className="text-primary underline font-medium hover:text-primary/80"
                href={paths.credentials("demo-valid-token")}
              >
                Valid link
              </AppLink>
              {" · "}
              <AppLink
                className="text-primary underline font-medium hover:text-primary/80"
                href={paths.credentials("demo-expired-token")}
              >
                Expired link
              </AppLink>
              {" · "}
              <AppLink
                className="text-primary underline font-medium hover:text-primary/80"
                href={paths.credentials("demo-used-token")}
              >
                Used link
              </AppLink>
            </p>
          </div>
        </section>

        {/* Development & Demo Account Picker (Explicitly Scoped) */}
        <section className="rounded-xl border-2 border-dashed border-primary/30 bg-card p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">Development demo accounts</h2>
                <span className="rounded bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                  Quick Switch
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                One-click switch for development testing across different operational scopes and
                roles.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <RotateCcw className="size-3.5" /> Reset demo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset demo state?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All prototype modifications (inspections, cutting assignments, rework cases,
                    shipments, and audit logs) will be restored to the initial seed state.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void reset()}>Reset state</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {accounts.isPending ? (
            <LoadingState label="Loading demo accounts…" />
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {(accounts.data ?? []).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => void pickDemoAccount(u.id, u.username)}
                  disabled={u.status !== "active"}
                  className="flex w-full items-start gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="wt-id mt-0.5 shrink-0 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground font-semibold">
                    {u.role}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="wt-id font-semibold text-foreground truncate">
                        {u.username}
                      </span>
                      {u.status !== "active" && <StatusBadge status={u.status} />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {roleLabels[u.role]} · {departmentLabels[u.department]}
                    </p>
                    <p className="text-[11px] text-muted-foreground/80 truncate">{u.scope}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <footer className="text-center text-xs text-muted-foreground">
          Public garment journeys (anonymous access):{" "}
          <AppLink
            className="text-primary underline hover:text-primary/80"
            href={paths.publicJourney("shirt-001-demo")}
          >
            shirt-001-demo
          </AppLink>{" "}
          ·{" "}
          <AppLink
            className="text-primary underline hover:text-primary/80"
            href={paths.publicJourney("shirt-002-demo")}
          >
            shirt-002-demo
          </AppLink>
        </footer>
      </div>
    </div>
  );
}
