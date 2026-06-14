"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  KeyRoundIcon,
  LogOutIcon,
  UserCircleIcon,
  ChevronUpIcon,
  UserIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ArrowLeftIcon,
  GlobeIcon,
  CheckIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, type ComponentType, type ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/core/auth/auth-api";
import { useSession } from "@/core/auth/hooks";
import { enUS, zhCN, ja, ko, type Locale } from "@/core/i18n";
import { useI18n } from "@/core/i18n/hooks";
import { isPlatformAdminRole } from "@/core/permissions/roles";
import { clearTenantId } from "@/core/tenants";
import { cn } from "@/lib/utils";

import { ChangePasswordDialog } from "./change-password-dialog";

type BackofficeNavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

type BackofficeShellLayoutProps = {
  moduleTitle: string;
  moduleDescription: string;
  moduleIcon: ComponentType<{ className?: string }>;
  navItems: BackofficeNavItem[];
  bottomItems?: BackofficeNavItem[];
  sidebarExtra?: ReactNode;
  topSlot?: ReactNode;
  children: ReactNode;
};

export function BackofficeShellLayout({
  moduleTitle,
  moduleDescription,
  moduleIcon: ModuleIcon,
  navItems,
  bottomItems: _bottomItems = [],
  sidebarExtra,
  topSlot,
  children,
}: BackofficeShellLayoutProps) {
  const { t, locale, changeLocale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const languageOptions: { value: Locale; label: string }[] = [
    { value: "en-US", label: enUS.locale.localName },
    { value: "zh-CN", label: zhCN.locale.localName },
    { value: "ja", label: ja.locale.localName },
    { value: "ko", label: ko.locale.localName },
  ];

  useEffect(() => {
    const handleOpenDialog = () => setChangePasswordOpen(true);
    window.addEventListener('openChangePasswordDialog', handleOpenDialog);
    return () => window.removeEventListener('openChangePasswordDialog', handleOpenDialog);
  }, []);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await logout();
      clearTenantId();
      await queryClient.cancelQueries();
      queryClient.clear();
      router.replace("/sign-in");
      router.refresh();
      window.location.assign("/sign-in");
    } catch (error) {
      console.error("退出失败:", error);
    } finally {
      setIsSigningOut(false);
    }
  };

  const userName = session?.user?.name ?? "Administrator";
  const userEmail = session?.user?.email ?? "";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r bg-sidebar transition-all duration-300",
          sidebarCollapsed ? "w-[60px]" : "w-[240px]"
        )}
      >
        <div className="border-b px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-sidebar-foreground">
            <ModuleIcon className="size-4 text-primary" />
            {!sidebarCollapsed && <span>{moduleTitle}</span>}
          </div>
          {!sidebarCollapsed && (
            <>
              <p className="mt-1 text-xs text-sidebar-foreground/70">{moduleDescription}</p>
              {sidebarExtra ? <div className="mt-3">{sidebarExtra}</div> : null}
            </>
          )}
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-9 items-center rounded-md text-sm transition-colors",
                  sidebarCollapsed ? "justify-center px-2" : "gap-2 px-3",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className="size-4" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2">
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="group flex h-11 w-full items-center gap-3 rounded-lg px-2 transition-all hover:bg-sidebar-accent">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-100 transition-transform group-hover:scale-105">
                        <UserIcon className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium text-sidebar-foreground truncate leading-tight">
                          {userName}
                        </p>
                        <p className="text-[11px] text-sidebar-foreground/50 truncate">
                          {t.admin.backoffice.admin}
                        </p>
                      </div>
                      <ChevronUpIcon className="size-4 text-sidebar-foreground/40 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    side="top"
                    align="start"
                    className="w-[200px] bg-sidebar border-sidebar-border shadow-lg"
                    sideOffset={6}
                  >
                    <div className="rounded-md bg-zinc-100 dark:bg-zinc-800 p-3 mb-1">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 dark:bg-zinc-700 text-zinc-100">
                          <UserCircleIcon className="size-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-sidebar-foreground truncate">{userName}</p>
                          <p className="text-xs text-sidebar-foreground/60 truncate">{userEmail || "admin"}</p>
                        </div>
                      </div>
                    </div>

                    <DropdownMenuSeparator className="bg-sidebar-border" />

                    {!isPlatformAdminRole(session?.user?.role) && (
                      <DropdownMenuItem asChild>
                        <Link
                          href="/workspace/overview"
                          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm cursor-pointer text-sidebar-foreground/80 hover:text-sidebar-foreground focus:bg-sidebar-accent"
                        >
                          <ArrowLeftIcon className="size-4 text-zinc-500" />
                          <span>{t.admin.backoffice.backToWorkspace}</span>
                        </Link>
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuItem
                      onClick={() => setChangePasswordOpen(true)}
                      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm cursor-pointer text-sidebar-foreground/80 hover:text-sidebar-foreground focus:bg-sidebar-accent"
                    >
                      <KeyRoundIcon className="size-4 text-zinc-500" />
                      <span>{t.admin.backoffice.changePassword}</span>
                    </DropdownMenuItem>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm cursor-pointer text-sidebar-foreground/80 hover:text-sidebar-foreground focus:bg-sidebar-accent">
                        <GlobeIcon className="size-4 text-zinc-500 shrink-0" />
                        <span className="truncate">{t.navMenu.language}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="min-w-[140px]">
                        {languageOptions.map((item) => (
                          <DropdownMenuItem
                            key={item.value}
                            onClick={() => changeLocale(item.value)}
                            className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm cursor-pointer"
                          >
                            <span className="flex-1">{item.label}</span>
                            {locale === item.value && (
                              <CheckIcon className="size-4 text-primary" />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator className="bg-sidebar-border" />

                    <DropdownMenuItem
                      onClick={handleSignOut}
                      disabled={isSigningOut}
                      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 focus:bg-zinc-100 dark:focus:bg-zinc-800"
                    >
                      <LogOutIcon className="size-4" />
                      <span>{isSigningOut ? t.admin.backoffice.signingOut : t.admin.backoffice.signOut}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {sidebarCollapsed ? (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="flex h-11 w-full shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent hover:text-sidebar-foreground"
                title={t.admin.backoffice.expandSidebar}
              >
                <PanelLeftOpenIcon className="size-5" />
              </button>
            ) : (
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent hover:text-sidebar-foreground"
                title={t.admin.backoffice.collapseSidebar}
              >
                <PanelLeftCloseIcon className="size-5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {topSlot ? <div className="border-b bg-background">{topSlot}</div> : null}
        <div className="w-full px-6 py-6">{children}</div>
      </main>

      <ChangePasswordDialog
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
      />
    </div>
  );
}
