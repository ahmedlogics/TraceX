import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { useAuthenticate, useCurrentUser, useSignOut } from "@/app/auth";
import { AppLink, useAppNavigate } from "@/app/navigation";
import { paths } from "@/app/paths";
import { Button } from "@/components/ui/button";
import { TraceXMark } from "@/components/wt/Logo";
import { errorMessage } from "@/lib/data/hooks";

export function LoginView({ redirectTo }: { redirectTo?: string | undefined }) {
  const me = useCurrentUser();
  const authenticate = useAuthenticate();
  const signOut = useSignOut();
  const navigate = useAppNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
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

      let destination = target;
      if (!redirectTo || redirectTo === paths.home) {
        if (cleanUsername.toLowerCase() === "qc.incoming") {
          destination = paths.home;
        } else if (cleanUsername.toLowerCase() === "qc.demo") {
          destination = paths.quality;
        } else if (cleanUsername.toLowerCase() === "dispatch.demo") {
          destination = paths.workstation;
        } else if (cleanUsername.toLowerCase() === "warehouse.demo") {
          destination = paths.workstation;
        } else if (cleanUsername.toLowerCase() === "packing.demo") {
          destination = paths.workstation;
        } else if (cleanUsername.toLowerCase() === "rawstore.demo") {
          destination = paths.workstation;
        } else if (cleanUsername.toLowerCase() === "finishing.demo") {
          destination = paths.workstation;
        }
      }

      await navigate(destination, { replace: true });
    } catch (err) {
      const msg = errorMessage(err);
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center p-4 sm:p-6"
      style={{
        backgroundColor: "#F2ECE2",
        backgroundImage: `
          radial-gradient(#dfd4c5 0.75px, transparent 0.75px),
          radial-gradient(#dfd4c5 0.75px, #F2ECE2 0.75px)
        `,
        backgroundSize: "24px 24px",
        backgroundPosition: "0 0, 12px 12px",
      }}
    >
      {/* Ambient warm lighting overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-radial from-amber-50/40 via-transparent to-[#4a382a]/5"
      />

      <div className="relative z-10 w-full max-w-[460px]">
        {/* Active Session Notification (if already signed in) */}
        {me.data && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[#D9CEBF] bg-[#FAF6F0]/90 p-3.5 text-xs text-[#5C4535] backdrop-blur-sm shadow-sm">
            <div className="flex items-center gap-2 truncate">
              <CheckCircle2 className="size-4 shrink-0 text-[#8C6D53]" aria-hidden />
              <span className="truncate">
                Signed in as <strong className="font-semibold">{me.data.username}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                asChild
                className="h-7 text-xs bg-[#8C6D53] hover:bg-[#785C44] text-[#FAF6F0]"
              >
                <AppLink href={target}>Workspace</AppLink>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void signOut()}
                className="h-7 text-xs border-[#D9CEBF] text-[#5C4535] hover:bg-[#EAE1D3]"
              >
                Sign out
              </Button>
            </div>
          </div>
        )}

        {/* Primary TraceX Card */}
        <section className="rounded-[28px] border border-[#E4D9CB] bg-[#FAF6F0] p-8 sm:p-11 shadow-[0_22px_55px_-12px_rgba(70,45,25,0.08)]">
          {/* Brand Logo & Header */}
          <div className="text-center">
            <AppLink
              href={paths.home}
              className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-90"
              aria-label="TraceX home"
            >
              <TraceXMark className="h-9 w-auto text-[#8C6D53]" />
              <span className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#4A382A]">
                TraceX
              </span>
            </AppLink>
            <h1 className="mt-4 font-serif text-3xl sm:text-[32px] font-normal tracking-normal text-[#38281D]">
              Welcome back
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#8A7969]">
              Sign in to continue to TraceX
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={onFormSubmit} className="mt-7 space-y-4" autoComplete="off">
            {/* Username Input */}
            <div className="space-y-1.5">
              <div className="flex h-12 w-full items-center gap-3 rounded-xl border border-[#D8CCBD] bg-[#EFE7DC] px-3.5 transition-all focus-within:border-[#8C6D53] focus-within:bg-[#FAF6F0] focus-within:ring-2 focus-within:ring-[#8C6D53]/15">
                <User className="size-4 shrink-0 text-[#8C7A6B]" aria-hidden />
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Enter your username"
                  className="w-full bg-transparent text-sm text-[#38281D] placeholder:text-[#A49484] focus:outline-none"
                  autoComplete="username"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <div className="flex h-12 w-full items-center gap-3 rounded-xl border border-[#D8CCBD] bg-[#EFE7DC] px-3.5 transition-all focus-within:border-[#8C6D53] focus-within:bg-[#FAF6F0] focus-within:ring-2 focus-within:ring-[#8C6D53]/15">
                <Lock className="size-4 shrink-0 text-[#8C7A6B]" aria-hidden />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="••••••••"
                  className="w-full bg-transparent text-sm text-[#38281D] placeholder:text-[#A49484] focus:outline-none"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[#8C7A6B] transition-colors hover:text-[#5C4535] cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password Row */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <label
                htmlFor="remember-me"
                className="flex items-center gap-2 text-[#7A695B] select-none cursor-pointer"
              >
                <input
                  type="checkbox"
                  id="remember-me"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="size-4 rounded border-[#C8BCAC] text-[#8C6D53] accent-[#8C6D53] focus:ring-[#8C6D53]"
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                onClick={() => toast.info("Contact factory manager or admin to reset staff password.")}
                className="text-[#5C4535] underline underline-offset-2 hover:text-[#38281D] transition-colors cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Sign In Button */}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 rounded-xl bg-[#8C6D53] hover:bg-[#785C44] active:bg-[#684E38] text-[#FAF6F0] font-medium text-base shadow-sm transition-all cursor-pointer mt-2"
            >
              {isSubmitting ? "Signing in…" : "Sign In"}
            </Button>

            {/* Single Demo Account Autofill Button (No Signup option) */}
            <div className="pt-3 text-center">
              <button
                type="button"
                onClick={() => {
                  setUsername("admin.demo");
                  setPassword("weartrail123!");
                  if (errorMsg) setErrorMsg(null);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-[#D8CCBD] bg-[#EFE7DC] px-4 py-1.5 text-xs text-[#6B5747] transition-all hover:bg-[#E5DACD] hover:border-[#8C6D53] hover:text-[#38281D] cursor-pointer shadow-xs"
              >
                <span className="size-1.5 rounded-full bg-[#8C6D53]" />
                <span>Demo Account:</span>
                <code className="font-mono font-medium text-[#4A382A]">admin.demo</code>
                <span className="text-[#A49484]">·</span>
                <span className="font-medium underline underline-offset-2">Auto-fill</span>
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
