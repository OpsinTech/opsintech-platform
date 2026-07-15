"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

import { useCurrentTenant } from "./hooks";
import { hasRouteAccess } from "./route-type-requirements";

/**
 * Redirects to /workspace/overview if the current workspace type does not have
 * access to the current route, according to ROUTE_TYPE_REQUIREMENTS.
 *
 * Usage: Call at the top of a page component:
 *   useWorkspaceTypeGuard();
 */
export function useWorkspaceTypeGuard() {
  const { data: currentTenant, isLoading } = useCurrentTenant();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;

    const tenantType = currentTenant?.tenant_type ?? "ops";

    if (!hasRouteAccess(pathname, tenantType)) {
      router.replace("/workspace/overview");
    }
  }, [currentTenant, isLoading, pathname, router]);
}
