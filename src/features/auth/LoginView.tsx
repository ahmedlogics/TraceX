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
    <div className="relative min-h-screen bg-[#0B0713] text-[#F3F0F8] px-4 py-12 overflow-hidden selection:bg-purple-500/30 selection:text-purple-100">
      {/* Luminous ambient background orb */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-40 left-1/2 -translate-x-1/2 h-[550px] w-[850px] rounded-full bg-purple-600/15 blur-[130px] animate-ambient-pulse"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -bottom-32 right-[-5%] h-[450px] w-[450px] rounded-full bg-fuchsia-700/10 blur-[130px]"
      />

      <div className="relative z-10 mx-auto max-w-3xl space-y-8">
        <header className="space-y-3 text-center">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-purple-500/20 bg-[#160E24]/90 px-6 py-3.5 shadow-2xl backdrop-blur-xl">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15 border border-purple-400/30 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.35)]">
              <svg width="20" height="12" viewBox="0 0 24 14" fill="none" className="text-white">
                <path
                  d="M1 7C3.5 2 6 2 8.5 7C11 12 13.5 12 16 7C18.5 2 21 2 23 7"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="text-2xl font-bold tracking-tight text-white">WearTrail</span>
          </div>
          <p className="text-xs font-mono font-medium tracking-wider text-purple-300 uppercase">
            {TAGLINE}
          </p>
        </header>

        {me.data && (
          <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-purple-500/30 bg-[#1A112C]/90 p-4 sm:flex-row shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 text-emerald-400" aria-hidden />
              <p className="text-sm text-purple-100">
                Currently signed in as{" "}
                <span className="wt-id font-semibold text-white">{me.data.username}</span> (
                {roleLabels[me.data.role]})
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                asChild
                className="bg-purple-100 text-purple-950 hover:bg-white rounded-full px-4"
              >
                <AppLink href={target}>Enter workspace</AppLink>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void signOut()}
                className="border-purple-500/30 text-purple-200 hover:bg-purple-900/40 rounded-full"
              >
                Sign out
              </Button>
            </div>
          </div>
        )}

        {/* Real Staff Authentication Form */}
        <section className="rounded-3xl border border-purple-500/20 bg-[#160E24]/90 p-7 sm:p-9 shadow-[0_24px_50px_-12px_rgba(8,3,15,0.85)] backdrop-blur-2xl">
          <div className="mb-6 space-y-1">
            <p className="text-[10px] font-mono font-semibold tracking-[0.2em] text-purple-400 uppercase">
              Security Access
            </p>
            <h1 className="font-editorial text-2xl sm:text-3xl text-white font-normal tracking-tight">
              Staff authentication
            </h1>
            <p className="text-sm text-purple-200/70">
              Sign in with your verified factory credentials. Shoppers never need a login.
            </p>
          </div>

          <form onSubmit={onFormSubmit} className="space-y-5" autoComplete="off">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Username" htmlFor="login-username" hint="e.g. admin.demo, quality.demo">
                <div className="relative">
                  <User className="absolute left-3 top-2.5 size-4 text-purple-400/80" aria-hidden />
                  <Input
                    id="login-username"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="name.surname"
                    className="pl-9 bg-[#110A1B] border-purple-800/40 text-white placeholder:text-purple-400/40 focus-visible:ring-purple-400"
                    autoComplete="username"
                    disabled={isSubmitting}
                  />
                </div>
              </Field>

              <Field label="Password" htmlFor="login-password" hint="At least 10 characters">
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 size-4 text-purple-400/80" aria-hidden />
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="••••••••••••"
                    className="pl-9 bg-[#110A1B] border-purple-800/40 text-white placeholder:text-purple-400/40 focus-visible:ring-purple-400"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                  />
                </div>
              </Field>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 px-3.5 py-2.5 text-sm text-rose-300"
              >
                <AlertCircle className="size-4 shrink-0 text-rose-400" aria-hidden />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-xs text-purple-300/70">
                Default prototype password for demo accounts:{" "}
                <code className="rounded bg-purple-950/70 border border-purple-700/40 px-2 py-0.5 wt-id font-bold text-purple-200">
                  weartrail123!
                </code>
              </p>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="min-w-28 rounded-full bg-[#F3E8FF] hover:bg-white text-[#1E0E38] font-medium shadow-[0_4px_20px_rgba(216,180,254,0.35)] transition-all cursor-pointer"
              >
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </div>
          </form>

          <div className="mt-6 border-t border-purple-900/40 pt-4">
            <p className="text-xs text-purple-300/70">
              Credential setup or password recovery links:{" "}
              <AppLink
                className="text-purple-300 underline font-medium hover:text-white"
                href={paths.credentials("demo-valid-token")}
              >
                Valid link
              </AppLink>
              {" · "}
              <AppLink
                className="text-purple-300 underline font-medium hover:text-white"
                href={paths.credentials("demo-expired-token")}
              >
                Expired link
              </AppLink>
              {" · "}
              <AppLink
                className="text-purple-300 underline font-medium hover:text-white"
                href={paths.credentials("demo-used-token")}
              >
                Used link
              </AppLink>
            </p>
          </div>
        </section>

        {/* Development & Demo Account Picker (Explicitly Scoped) */}
        <section className="rounded-3xl border border-dashed border-purple-500/30 bg-[#140D20]/90 p-6 sm:p-8 backdrop-blur-xl">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">Development demo accounts</h2>
                <span className="rounded-full bg-purple-900/60 border border-purple-600/40 px-2.5 py-0.5 text-[10px] font-mono font-medium text-purple-200">
                  Quick Switch
                </span>
              </div>
              <p className="text-xs text-purple-300/70 mt-0.5">
                One-click switch for development testing across different operational scopes and
                roles.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-purple-500/30 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50 hover:text-white rounded-full"
                >
                  <RotateCcw className="size-3.5" /> Reset demo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-[#160E24] border-purple-500/30 text-purple-100">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Reset demo state?</AlertDialogTitle>
                  <AlertDialogDescription className="text-purple-200/70">
                    All prototype modifications (inspections, cutting assignments, rework cases,
                    shipments, and audit logs) will be restored to the initial seed state.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-purple-500/30 text-purple-200 hover:bg-purple-900/40">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void reset()}
                    className="bg-purple-600 hover:bg-purple-500 text-white"
                  >
                    Reset state
                  </AlertDialogAction>
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
                  className="flex w-full items-start gap-3 rounded-2xl border border-purple-900/40 bg-[#110A1B] p-3.5 text-left transition-all duration-200 hover:border-purple-400/50 hover:bg-purple-950/50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  <span className="wt-id mt-0.5 shrink-0 rounded-md bg-purple-900/60 border border-purple-600/40 px-2 py-0.5 text-xs text-purple-200 font-bold font-mono">
                    {u.role}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="wt-id font-semibold text-white truncate">{u.username}</span>
                      {u.status !== "active" && <StatusBadge status={u.status} />}
                    </div>
                    <p className="text-xs text-purple-300/80">
                      {roleLabels[u.role]} · {departmentLabels[u.department]}
                    </p>
                    <p className="text-[11px] text-purple-400/60 truncate">{u.scope}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <footer className="text-center text-xs text-purple-400/60">
          Public garment journeys (anonymous access):{" "}
          <AppLink
            className="text-purple-300 underline hover:text-white"
            href={paths.publicJourney("shirt-001-demo")}
          >
            shirt-001-demo
          </AppLink>{" "}
          ·{" "}
          <AppLink
            className="text-purple-300 underline hover:text-white"
            href={paths.publicJourney("shirt-002-demo")}
          >
            shirt-002-demo
          </AppLink>
        </footer>
      </div>
    </div>
  );
}
