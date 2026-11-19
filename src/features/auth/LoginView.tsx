import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { useAuthenticate, useCurrentUser, useSignOut } from "@/app/auth";
import { AppLink, useAppNavigate } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/wt/Logo";
import { Field } from "@/components/wt/forms";
import { roleLabels } from "@/domain/labels";
import { errorMessage } from "@/lib/data/hooks";

export function LoginView({ redirectTo }: { redirectTo?: string | undefined }) {
  const me = useCurrentUser();
  const authenticate = useAuthenticate();
  const signOut = useSignOut();
  const navigate = useAppNavigate();

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

  return (
    <div className="flex min-h-screen flex-col justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center">
          <AppLink href={paths.home} className="inline-block" aria-label="WearTrail home">
            <Logo height={36} />
          </AppLink>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">Staff Sign In</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter your credentials to access the verified staff workspace.
          </p>
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

            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground mt-3">
              <div className="flex items-center justify-between">
                <span>Default staff account:</span>
                <button
                  type="button"
                  onClick={() => {
                    setUsername("admin.demo");
                    setPassword("weartrail123!");
                  }}
                  className="font-medium text-primary hover:underline cursor-pointer"
                >
                  Fill credentials
                </button>
              </div>
              <div className="mt-1 font-mono text-[11px] text-foreground/80">
                admin.demo · weartrail123!
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
