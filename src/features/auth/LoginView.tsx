import { useState, type FormEvent } from "react";
import { Info, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser, useSignIn, useSignOut } from "@/app/auth";
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
  const signOut = useSignOut();
  const navigate = useAppNavigate();
  const client = useClient();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formNote, setFormNote] = useState<string | null>(null);

  const target =
    redirectTo && redirectTo.startsWith("/staff") && !redirectTo.startsWith(paths.login)
      ? redirectTo
      : paths.home;

  const onForm = (e: FormEvent) => {
    e.preventDefault();
    // Demo: nothing is sent or stored. Clear the password immediately.
    setPassword("");
    setFormNote(
      "Password sign-in is not connected in this demo, and nothing you typed was stored. Choose a demo account below.",
    );
  };

  const pick = async (id: string) => {
    try {
      await signIn(id);
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
        <div className="space-y-2 text-center">
          <div className="mx-auto inline-block rounded-lg bg-card px-5 py-3">
            <Logo height={40} />
          </div>
          <p className="text-muted-foreground">{TAGLINE}</p>
        </div>

        {me.data && (
          <div className="flex flex-col items-center justify-between gap-3 rounded-lg border bg-card p-4 sm:flex-row">
            <p className="text-sm">
              Signed in as <span className="wt-id">{me.data.username}</span>
            </p>
            <div className="flex gap-2">
              <Button size="sm" asChild>
                <AppLink href={target}>Continue</AppLink>
              </Button>
              <Button size="sm" variant="outline" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          </div>
        )}

        <section className="rounded-lg border bg-card p-6">
          <h1 className="text-xl font-semibold">Staff sign-in</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            For factory staff. Shoppers never need an account.
          </p>
          <form
            onSubmit={onForm}
            className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            autoComplete="off"
          >
            <Field label="Username" htmlFor="login-username">
              <Input
                id="login-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="name.surname"
                autoComplete="off"
              />
            </Field>
            <Field label="Password" htmlFor="login-password">
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
              />
            </Field>
            <Button type="submit">Sign in</Button>
          </form>
          {formNote && (
            <p
              role="status"
              className="mt-3 flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-accent-foreground"
            >
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {formNote}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Have a setup or reset link? Sample states:{" "}
            <AppLink
              className="text-primary underline"
              href={paths.credentials("demo-valid-token")}
            >
              valid
            </AppLink>
            ,{" "}
            <AppLink
              className="text-primary underline"
              href={paths.credentials("demo-expired-token")}
            >
              expired
            </AppLink>
            ,{" "}
            <AppLink className="text-primary underline" href={paths.credentials("demo-used-token")}>
              used
            </AppLink>
            .
          </p>
        </section>

        <section className="rounded-lg border-2 border-dashed border-primary/40 bg-card p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Demo accounts</h2>
              <p className="text-sm text-muted-foreground">
                Demonstration only — no password. Pick an identity to enter the staff workspace with
                its role and department.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <RotateCcw /> Reset demo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset the demo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All demo changes (inspections, rework, packing, shipments, audit entries) return
                    to the seeded starting state.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void reset()}>Reset demo</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {accounts.isPending ? (
            <LoadingState />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {(accounts.data ?? []).map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => void pick(u.id)}
                    disabled={u.status !== "active"}
                    className="flex w-full items-start gap-3 rounded-md border bg-background p-3 text-left transition-colors hover:border-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="wt-id mt-0.5 rounded bg-primary px-1.5 text-primary-foreground">
                      {u.role}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="wt-id block font-medium">{u.username}</span>
                      <span className="block text-xs text-muted-foreground">
                        {roleLabels[u.role]} · {departmentLabels[u.department]}
                      </span>
                      <span className="block text-xs text-muted-foreground">{u.scope}</span>
                    </span>
                    {u.status !== "active" && <StatusBadge status={u.status} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-center text-sm text-muted-foreground">
          Public product pages (no login):{" "}
          <AppLink className="text-primary underline" href={paths.publicJourney("shirt-001-demo")}>
            shirt-001-demo
          </AppLink>{" "}
          ·{" "}
          <AppLink className="text-primary underline" href={paths.publicJourney("shirt-002-demo")}>
            shirt-002-demo
          </AppLink>
        </p>
      </div>
    </div>
  );
}
