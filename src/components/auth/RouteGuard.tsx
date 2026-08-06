"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { permissionForPath } from "@/lib/auth/roles";

/** Client route gate — redirects to / when role lacks page permission. */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, authenticated, user, hasPermission } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!authenticated || !user) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
      return;
    }
    const perm = permissionForPath(pathname);
    if (perm && !hasPermission(perm)) {
      router.replace("/");
    }
  }, [loading, authenticated, user, pathname, hasPermission, router]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">
        Checking access…
      </div>
    );
  }

  if (!authenticated || !user) {
    return null;
  }

  const perm = permissionForPath(pathname);
  if (perm && !hasPermission(perm)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-ink-muted">
        <p className="font-medium text-ink">Access denied</p>
        <p>Your role ({user.roleLabel}) cannot open this page.</p>
      </div>
    );
  }

  return <>{children}</>;
}
