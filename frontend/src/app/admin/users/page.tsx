"use client";

import { UserCheckIcon, UserXIcon, ShieldIcon, CheckCircle2Icon, XCircleIcon, PlusIcon, KeyRoundIcon, Trash2Icon, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { fetchAuthApi } from "@/core/api/auth-client";
import { useI18n } from "@/core/i18n/hooks";

import { CreateUserDialog } from "./create-user-dialog";
import { DeleteUserDialog } from "./delete-user-dialog";
import { ResetUserPasswordDialog } from "./reset-user-password-dialog";

interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  mustChangePassword?: boolean;
  isBootstrapAdmin?: boolean;
}

export default function AdminUsersPage() {
  const { t } = useI18n();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [keyword, setKeyword] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const url = new URL("/api/admin/users", window.location.origin);
      if (keyword) url.searchParams.set("keyword", keyword);
      const res = await fetchAuthApi(url.pathname + url.search);
      if (!res.ok) {
        throw new Error(t.admin.users.loadError);
      }
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [keyword, t]);

  useEffect(() => {
    const delay = setTimeout(() => {
      void loadUsers();
    }, 300);
    return () => clearTimeout(delay);
  }, [loadUsers]);

  const handleUpdateStatus = async (userId: string, newStatus: "active" | "suspended") => {
    try {
      const res = await fetchAuthApi(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(t.admin.users.statusUpdateError);
      void loadUsers();
    } catch (err) {
      alert(t.admin.users.statusUpdateFail + (err instanceof Error ? err.message : String(err)));
    }
  };

  const openResetPasswordDialog = (user: AdminUser) => {
    setSelectedUser(user);
    setResetPasswordOpen(true);
  };

  const openDeleteDialog = (user: AdminUser) => {
    if (user.isBootstrapAdmin) {
      alert(t.admin.users.bootstrapDeleteForbidden);
      return;
    }
    setSelectedUser(user);
    setDeleteOpen(true);
  };

  return (
    <div className="flex-1 space-y-6">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-2">{t.admin.users.title}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t.admin.users.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input 
              type="text"
              placeholder={t.admin.users.searchPlaceholder}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="h-9 w-64 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <Button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 h-9">
            <PlusIcon className="size-4" />
            {t.admin.users.createUser}
          </Button>
        </div>
      </div>

      <CreateUserDialog 
        open={createOpen} 
        onOpenChange={setCreateOpen} 
        onSuccess={() => { void loadUsers(); }} 
      />

      <ResetUserPasswordDialog
        open={resetPasswordOpen}
        onOpenChange={setResetPasswordOpen}
        user={selectedUser}
        onSuccess={() => { void loadUsers(); }}
      />

      <DeleteUserDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        user={selectedUser}
        onSuccess={() => { void loadUsers(); }}
      />

      {error ? (
        <div className="text-red-500 mb-4">{error}</div>
      ) : loading ? (
        <div className="text-zinc-500">{t.admin.users.loading}</div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="px-6 py-4 font-medium text-zinc-600 dark:text-zinc-400">{t.admin.users.columns.userIdName}</th>
                <th className="px-6 py-4 font-medium text-zinc-600 dark:text-zinc-400">{t.admin.users.columns.email}</th>
                <th className="px-6 py-4 font-medium text-zinc-600 dark:text-zinc-400">{t.admin.users.columns.role}</th>
                <th className="px-6 py-4 font-medium text-zinc-600 dark:text-zinc-400">{t.admin.users.columns.status}</th>
                <th className="px-6 py-4 font-medium text-zinc-600 dark:text-zinc-400 text-right">{t.admin.users.columns.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">{user.name ?? t.admin.users.unnamed}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{user.id}</div>
                  </td>
                  <td className="px-6 py-4">{user.email}</td>
                  <td className="px-6 py-4">
                    {user.role === "admin" ? (
                      <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 px-2 py-1 rounded-md text-xs font-medium">
                        <ShieldIcon className="size-3" /> Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md text-xs font-medium">
                        User
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {user.status !== "suspended" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2Icon className="size-4" /> {t.admin.users.statusLabels.active}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                        <XCircleIcon className="size-4" /> {t.admin.users.statusLabels.suspended}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                        onClick={() => openResetPasswordDialog(user)}
                      >
                        <KeyRoundIcon className="size-4 mr-1" />
                        {t.admin.users.actions.changePassword}
                      </Button>
                       {user.status !== "suspended" ? (
                         <Button 
                           variant="outline" 
                           size="sm" 
                           className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                           onClick={() => handleUpdateStatus(user.id, "suspended")}
                           disabled={user.isBootstrapAdmin}
                         >
                           <UserXIcon className="size-4 mr-1" />
                           {t.admin.users.actions.suspend}
                         </Button>
                       ) : (
                         <Button 
                           variant="outline" 
                           size="sm" 
                           className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                           onClick={() => handleUpdateStatus(user.id, "active")}
                         >
                           <UserCheckIcon className="size-4 mr-1" />
                           {t.admin.users.actions.activate}
                         </Button>
                       )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-700 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => openDeleteDialog(user)}
                        disabled={user.isBootstrapAdmin}
                      >
                        <Trash2Icon className="size-4 mr-1" />
                        {t.admin.users.actions.delete}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="p-8 text-center text-zinc-500">
              {t.admin.users.noRecords}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
