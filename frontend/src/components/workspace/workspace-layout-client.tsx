"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { toast, Toaster } from "sonner";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ChatTabsProvider } from "@/components/workspace/chats/chat-tabs-context";
import { CommandPalette } from "@/components/workspace/command-palette";
import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import { getLocalSettings, useLocalSettings } from "@/core/settings";
import { bootstrapTenantContext, useTenantList } from "@/core/tenants";
import { isRateLimitLikeError } from "@/core/threads/hooks";
import { useI18n } from "@/core/i18n/hooks";

export function WorkspaceLayoutClient({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { data: tenants } = useTenantList();

  useEffect(() => {
    void bootstrapTenantContext();
  }, []);

  useEffect(() => {
    let lastToastAt = 0;
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isRateLimitLikeError(event.reason)) {
        return;
      }
      event.preventDefault();
      const now = Date.now();
      if (now - lastToastAt > 3000) {
        toast.error(t.threadErrors.rateLimited);
        lastToastAt = now;
      }
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    const originalConsoleError = console.error;

    const shouldSuppressRateLimitConsoleNoise = (value: unknown) => {
      if (isRateLimitLikeError(value)) {
        return true;
      }
      if (value instanceof Error) {
        const msg = value.message.toLowerCase();
        const stack = (value.stack ?? "").toLowerCase();
        return (
          msg.includes("an internal error occurred") &&
          stack.includes("streammanager.enqueue")
        );
      }
      return false;
    };

    console.error = (...args: unknown[]) => {
      if (args.some((arg) => shouldSuppressRateLimitConsoleNoise(arg))) {
        return;
      }
      originalConsoleError(...args);
    };

    return () => {
      console.error = originalConsoleError;
    };
  }, []);

  useEffect(() => {
    if (!tenants || tenants.length <= 1) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const guided = window.sessionStorage.getItem("workspace-switch-guided");
    if (guided === "1") {
      return;
    }

    window.sessionStorage.setItem("workspace-switch-guided", "1");
    const next = encodeURIComponent(pathname || "/workspace");
    router.replace(`/select-workspace?next=${next}`);
  }, [pathname, router, tenants]);

  const [settings, setSettings] = useLocalSettings();
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    setOpen(!getLocalSettings().layout.sidebar_collapsed);
  }, []);
  useEffect(() => {
    setOpen(!settings.layout.sidebar_collapsed);
  }, [settings.layout.sidebar_collapsed]);
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      setSettings("layout", { sidebar_collapsed: !isOpen });
    },
    [setSettings],
  );

  return (
    <>
      <SidebarProvider
        className="h-screen"
        open={open}
        onOpenChange={handleOpenChange}
      >
        <WorkspaceSidebar />
          <SidebarInset className="min-w-0">
            <ChatTabsProvider>{children}</ChatTabsProvider>
          </SidebarInset>
      </SidebarProvider>
      <CommandPalette />
      <Toaster position="top-center" />
    </>
  );
}
