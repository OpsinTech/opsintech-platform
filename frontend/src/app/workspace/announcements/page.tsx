"use client";

import { useState } from "react";

import { useAnnouncementList, useDismissAnnouncement, useMarkAnnouncementRead } from "@/core/announcements";
import { useI18n } from "@/core/i18n/hooks";

export default function WorkspaceAnnouncementsPage() {
  const { t } = useI18n();
  const { announcements, isLoading, error } = useAnnouncementList({ includeHistory: true, limit: 100 });
  const markReadMutation = useMarkAnnouncementRead();
  const dismissMutation = useDismissAnnouncement();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="w-full px-6 py-6">
      <h1 className="text-2xl font-semibold">{t.announcementsBanner.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.announcementsBanner.description}</p>

      <div className="mt-4 rounded-lg border bg-background">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">{t.announcementsBanner.loading}</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{t.announcementsBanner.loadFailed}: {error.message}</div>
        ) : announcements.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">{t.announcementsBanner.noAnnouncements}</div>
        ) : (
          <div className="divide-y">
            {announcements.map((item) => (
              <div key={item.id} className="p-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium">{item.title}</h2>
                  {!item.read_state?.is_read && (
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{t.announcementsBanner.unread}</span>
                  )}
                  {item.read_state?.is_dismissed && (
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{t.announcementsBanner.ignored}</span>
                  )}
                  {!item.read_state?.is_read && (
                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 text-xs"
                      onClick={() => markReadMutation.mutate(item.id)}
                    >
                      {t.announcementsBanner.markRead}
                    </button>
                  )}
                  {!item.read_state?.is_dismissed && (
                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 text-xs"
                      onClick={() => dismissMutation.mutate(item.id)}
                    >
                      {t.announcementsBanner.ignore}
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded border px-2 py-0.5 text-xs"
                    onClick={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
                  >
                    {expandedId === item.id ? t.announcementsBanner.collapseDetails : t.announcementsBanner.expandDetails}
                  </button>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {item.type} | {item.severity} | {t.announcementsBanner.effective} {new Date(item.publish_at).toLocaleString()} | {t.announcementsBanner.expired} {new Date(item.expire_at).toLocaleString()}
                </div>
                {expandedId === item.id && <div className="mt-2 whitespace-pre-wrap text-sm">{item.content}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
