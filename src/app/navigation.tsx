/**
 * Router adapter. The ONLY place feature views touch the router.
 * To move to React Router: re-implement AppLink/useAppNavigate/usePathname with
 * react-router's <Link>, useNavigate and useLocation.
 */
import { useRouter, useRouterState } from "@tanstack/react-router";
import { forwardRef, useCallback, type AnchorHTMLAttributes, type MouseEvent } from "react";

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { href, onClick, ...rest },
  ref,
) {
  const router = useRouter();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target) return;
    e.preventDefault();
    void router.navigate({ href });
  };
  return <a ref={ref} href={href} onClick={handle} {...rest} />;
});

export function useAppNavigate() {
  const router = useRouter();
  return useCallback(
    (href: string, opts?: { replace?: boolean }) => router.navigate({ href, replace: opts?.replace ?? false }),
    [router],
  );
}

export function usePathname() {
  return useRouterState({ select: (s) => s.location.pathname });
}
