import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, RotateCcw, User } from "lucide-react";
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
import { Logo } from "@/components/wt/Logo";
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
  const [showPassword, setShowPassword] = useState(false);
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
      const user = await authenticate(cleanUsername, password);
      toast.success(`Signed in as ${user.displayName || user.username}`);
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
      toast.success(`Switched to: ${name}`);
      await navigate(target, { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const reset = async () => {
    await client.resetDemo();
    qc.clear();
    toast.success("Demo environment reset to starting state.");
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center">
          <AppLink href={paths.home} className="inline-block" aria-label="WearTrail home">
            <Logo height={36} />
          </AppLink>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">Staff Sign In</h1>
        </div>

        {/* Active Session Notification (if already signed in) */}
        {me.data && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-accent/40 p-3.5 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />
              <span>
                Signed in as <strong className="font-semibold">{me.data.username}</strong> (
                {roleLabels[me.data.role]})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="default" asChild className="h-7 text-xs">
                <AppLink href={target}>Workspace</AppLink>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void signOut()}
                className="h-7 text-xs"
              >
                Sign out
              </Button>
            </div>
          </div>
        )}

        {/* Primary Staff Sign In Card */}
        <section className="rounded-xl border bg-card p-7 shadow-sm">
          <form onSubmit={onFormSubmit} className="space-y-4" autoComplete="off">
            <Field label="Username" htmlFor="login-username">
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
                  placeholder="e.g. admin.demo"
                  className="pl-9"
                  autoComplete="username"
                  disabled={isSubmitting}
                />
              </div>
            </Field>

            <Field label="Password" htmlFor="login-password">
              <div className="relative">
                <Lock
                  className="absolute left-3 top-2.5 size-4 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="••••••••••••"
                  className="pl-9 pr-10"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/30 bg-danger-soft px-3.5 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                <span>{errorMsg}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 font-medium"
              size="default"
            >
              {isSubmitting ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </section>

        {/* Isolated Developer Testing Utilities (available only for local testing, collapsed by default) */}
        {import.meta.env.DEV && (
          <details className="group rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground/80 hover:text-foreground flex items-center justify-between select-none">
              <span>Developer Test Environment</span>
              <span className="text-[11px] font-mono text-muted-foreground group-open:hidden">
                (Click to expand quick switch)
              </span>
            </summary>

            <div className="mt-4 space-y-4 pt-3 border-t">
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground">
                  Quick-switch staff profiles for local testing:
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                      <RotateCcw className="size-3" /> Reset demo
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset simulated data?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Restores in-memory state (lots, orders, rework cases, shipments,
                        credentials) to baseline seeds.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void reset()}>Reset</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {accounts.isPending ? (
                <LoadingState label="Loading accounts…" />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(accounts.data ?? []).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => void pickDemoAccount(u.id, u.username)}
                      disabled={u.status !== "active"}
                      className="flex items-start gap-2.5 rounded-lg border bg-card p-2.5 text-left transition-colors hover:border-primary hover:bg-accent/40 disabled:opacity-50 cursor-pointer"
                    >
                      <span className="wt-id mt-0.5 rounded bg-muted px-1.5 py-0.5 font-bold text-foreground">
                        {u.role}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="wt-id font-semibold text-foreground truncate">
                            {u.username}
                          </span>
                          {u.status !== "active" && <StatusBadge status={u.status} />}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {roleLabels[u.role]} · {departmentLabels[u.department]}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t text-[11px] text-muted-foreground space-y-1">
                <p>
                  Default prototype password for demo accounts:{" "}
                  <code className="font-mono font-semibold text-foreground">weartrail123!</code>
                </p>
                <p>
                  Test activation/reset tokens:{" "}
                  <AppLink
                    className="underline hover:text-foreground"
                    href={paths.credentials("demo-valid-token")}
                  >
                    valid
                  </AppLink>
                  {" · "}
                  <AppLink
                    className="underline hover:text-foreground"
                    href={paths.credentials("demo-expired-token")}
                  >
                    expired
                  </AppLink>
                  {" · "}
                  <AppLink
                    className="underline hover:text-foreground"
                    href={paths.credentials("demo-used-token")}
                  >
                    used
                  </AppLink>
                </p>
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
