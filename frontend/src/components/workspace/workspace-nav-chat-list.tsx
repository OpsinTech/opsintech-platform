"use client";

import {
  BellIcon,
  LayoutDashboardIcon,
  PlayCircleIcon,
  Settings2Icon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  BotIcon,
  FolderIcon,
  TerminalSquare,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useActiveAnnouncements } from "@/core/announcements";
import { useSession } from "@/core/auth/hooks";
import { useI18n } from "@/core/i18n/hooks";
import { canAccessAdminPage } from "@/core/permissions/roles";
import { useCurrentTenant } from "@/core/tenants";
import { hasRouteAccess } from "@/core/tenants/route-type-requirements";
import { cn } from "@/lib/utils";

export function WorkspaceNavChatList() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { t, locale } = useI18n();
  const isAdmin = canAccessAdminPage(session?.user?.role);
  const { data: currentTenant } = useCurrentTenant();
  const { announcements } = useActiveAnnouncements({ limit: 20 });

  const unreadAnnouncements = announcements.filter((item) => !item.read_state?.is_read);
  const unreadCount = unreadAnnouncements.length;

  const tenantType = currentTenant?.tenant_type ?? "ops";

  const filesLabel =
    locale === "zh-CN"
      ? "文件中心"
      : locale === "ja"
      ? "ファイルセンター"
      : locale === "ko"
      ? "파일 센터"
      : "File Center";

  const allLinks = [
    {
      name: t.sidebarNav.overview,
      href: "/workspace/overview",
      icon: LayoutDashboardIcon,
      active: pathname.startsWith("/workspace/overview"),
    },
    {
      name: t.sidebarNav.smartWorkbench,
      href: "/workspace/chats/new",
      icon: PlayCircleIcon,
      active: pathname.startsWith("/workspace/chats"),
    },
    {
      name: t.sidebarNav.incidents,
      href: "/workspace/incidents",
      icon: ShieldAlertIcon,
      active: pathname.startsWith("/workspace/incidents"),
    },
    {
      name: t.sidebarNav.skillsPlaza,
      href: "/workspace/skills",
      icon: BotIcon,
      active: pathname.startsWith("/workspace/skills"),
    },
    {
      name: "智能终端",
      href: "/workspace/terminal",
      icon: TerminalSquare,
      active: pathname.startsWith("/workspace/terminal"),
    },
    {
      name: filesLabel,
      href: "/workspace/files",
      icon: FolderIcon,
      active: pathname.startsWith("/workspace/files"),
    },
    {
      name: t.sidebarNav.announcements,
      href: "/workspace/announcements",
      icon: BellIcon,
      active: pathname.startsWith("/workspace/announcements"),
    },
    ...(isAdmin
      ? [
        {
          name: t.sidebarNav.auditGovernance,
          href: "/admin",
          icon: ShieldCheckIcon,
          active: pathname.startsWith("/admin"),
        },
        {
          name: t.sidebarNav.systemSettings,
          href: "/admin/security",
          icon: Settings2Icon,
          active: pathname.startsWith("/admin/security"),
        },
      ]
      : []),
  ];

  // Filter menu items by workspace type
  const links = allLinks.filter((link) => hasRouteAccess(link.href, tenantType));

  return (
    <nav className="flex w-full flex-col gap-1 px-2 py-2">
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2 overflow-hidden",
              link.active
                ? "bg-background text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10 font-medium scale-[1.02]"
                : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5",
            )}
            title={link.name}
          >
            {link.active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-primary rounded-r-full" />
            )}
            <Icon
              className={cn(
                "size-[18px] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                link.active && "text-primary scale-110"
              )}
              strokeWidth={link.active ? 2.5 : 2}
            />
            <span className="truncate group-data-[collapsible=icon]:hidden">{link.name}</span>
            {link.href === "/workspace/announcements" && unreadCount > 0 && (
              <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary group-data-[collapsible=icon]:hidden animate-in fade-in zoom-in">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}