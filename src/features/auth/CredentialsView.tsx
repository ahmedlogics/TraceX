import { useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, Ban, CheckCircle2, Clock, HelpCircle, KeyRound, Lock } from "lucide-react";
import { toast } from "sonner";
import { AppLink, useAppNavigate } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/wt/Logo";
import { Field } from "@/components/wt/forms";
import { LoadingState } from "@/components/wt/states";
import { errorMessage, useWtQuery } from "@/lib/data/hooks";
import { useClient } from "@/lib/data/provider";
import { validatePasswordStrength } from "@/domain/crypto-auth";

function CardWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-md space-y-6">
        <div className="text-center">
          <AppLink
            href={paths.login}
            className="inline-block rounded-xl border bg-card px-5 py-2.5 shadow-sm"
            aria-label="Back to staff sign-in"
          >
            <Logo height={32} />
          </AppLink>
        </div>
        <section className="rounded-xl border bg-card p-6 shadow-sm">{children}</section>
        <div className="text-center text-xs text-muted-foreground">
          <p className="mb-1 font-medium">Sample test tokens:</p>
          <div className="flex justify-center gap-3">
            <AppLink
              className="text-primary underline hover:text-primary/80"
              href={paths.credentials("demo-valid-token")}
            >
              valid token
            </AppLink>
            {" · "}
            <AppLink
              className="text-primary underline hover:text-primary/80"
              href={paths.credentials("demo-expired-token")}
            >
              expired token
            </AppLink>
            {" · "}
            <AppLink
              className="text-primary underline hover:text-primary/80"
              href={paths.credentials("demo-used-token")}
            >
              used token
            </AppLink>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CredentialsView({ token }: { token: string }) {
  const client = useClient();
  const navigate = useAppNavigate();
  const q = useWtQuery(["token-details", token], (c) => c.getCredentialTokenDetails(token));

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  if (q.isPending) {
    return (
      <CardWrapper>
        <LoadingState label="Verifying credential link…" />
      </CardWrapper>
    );
  }

  const tokenState = q.data?.status ?? "unknown";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);

    const check = validatePasswordStrength(pw);
    if (!check.valid) {
      setErr(check.reason ?? "Password must be at least 10 characters long.");
      return;
    }

    if (pw !== pw2) {
      setErr("The two passwords do not match. Please verify both fields.");
      return;
    }

    setSubmitting(true);
    try {
      await client.consumeCredentialToken(token, pw);
      setCompleted(true);
      toast.success("Password set successfully!");
    } catch (e) {
      const msg = errorMessage(e);
      setErr(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Success state (Password configured)
  if (completed) {
    return (
      <CardWrapper>
        <div className="text-center space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="size-6" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Credentials configured</h1>
          <p className="text-sm text-muted-foreground">
            Your password has been saved. This setup link has now been marked as used.
          </p>
          <div className="pt-2">
            <Button asChild className="w-full">
              <AppLink href={paths.login}>Proceed to staff sign-in</AppLink>
            </Button>
          </div>
        </div>
      </CardWrapper>
    );
  }

  // 2. Expired state
  if (tokenState === "expired") {
    return (
      <CardWrapper>
        <div className="text-center space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning">
            <Clock className="size-6" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Link has expired</h1>
          <p className="text-sm text-muted-foreground">
            This credential setup or reset link has expired for security reasons.
          </p>
          <p className="text-xs text-muted-foreground">
            Please contact your system administrator to generate a fresh activation link.
          </p>
          <div className="pt-2">
            <Button variant="outline" asChild className="w-full">
              <AppLink href={paths.login}>Back to staff sign-in</AppLink>
            </Button>
          </div>
        </div>
      </CardWrapper>
    );
  }

  // 3. Already Used state
  if (tokenState === "used") {
    return (
      <CardWrapper>
        <div className="text-center space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Ban className="size-6" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Link already used</h1>
          <p className="text-sm text-muted-foreground">
            This setup or password reset link has already been consumed. Links can only be used
            once.
          </p>
          <div className="pt-2">
            <Button variant="outline" asChild className="w-full">
              <AppLink href={paths.login}>Go to staff sign-in</AppLink>
            </Button>
          </div>
        </div>
      </CardWrapper>
    );
  }

  // 4. Unknown / Revoked state
  if (tokenState !== "valid") {
    return (
      <CardWrapper>
        <div className="text-center space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-soft text-destructive">
            <HelpCircle className="size-6" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Invalid credential link</h1>
          <p className="text-sm text-muted-foreground">
            We could not verify this setup token. It may have been revoked or typed incorrectly.
          </p>
          <div className="pt-2">
            <Button variant="outline" asChild className="w-full">
              <AppLink href={paths.login}>Return to sign-in</AppLink>
            </Button>
          </div>
        </div>
      </CardWrapper>
    );
  }

  // 5. Valid state -> Form
  return (
    <CardWrapper>
      <div className="space-y-1 mb-5">
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-primary" aria-hidden />
          <h1 className="text-lg font-semibold tracking-tight">Set up your password</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {q.data?.username ? (
            <>
              Setting credentials for <span className="wt-id font-semibold">{q.data.username}</span>
              .
            </>
          ) : (
            "Create a secure password for your factory staff account."
          )}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4" autoComplete="off">
        <Field label="New password" htmlFor="cred-pw" hint="At least 10 characters long.">
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input
              id="cred-pw"
              type="password"
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                if (err) setErr(null);
              }}
              placeholder="••••••••••••"
              className="pl-9"
              autoComplete="new-password"
              disabled={submitting}
            />
          </div>
        </Field>

        <Field label="Confirm new password" htmlFor="cred-pw2">
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input
              id="cred-pw2"
              type="password"
              value={pw2}
              onChange={(e) => {
                setPw2(e.target.value);
                if (err) setErr(null);
              }}
              placeholder="••••••••••••"
              className="pl-9"
              autoComplete="new-password"
              disabled={submitting}
            />
          </div>
        </Field>

        {err && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md border border-destructive/30 bg-danger-soft px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            <span>{err}</span>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Saving password…" : "Save password and activate"}
        </Button>
      </form>
    </CardWrapper>
  );
}
