"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import {
  addTenantMember,
  addTenantMembersByEmail,
  loadCurrentTenant,
  loadTenantAuditLogs,
  loadTenantMembers,
  loadTenants,
  removeTenantMember,
  searchTenantSelectableUsers,
  switchTenant,
  updateTenantMemberStatus,
  updateTenantMemberRole,
  type CurrentTenant,
  type TenantAuditScope,
  type TenantMember,
  type TenantMemberRole,
  type TenantItem,
  type TenantSelectableUser,
} from "./api";
import { setCurrentTenantId } from "./store";

export function useTenantList() {
  return useQuery<TenantItem[]>({
    queryKey: ["tenants", "list"],
    queryFn: loadTenants,
    staleTime: 60_000,
  });
}

export function useCurrentTenant() {
  const query = useQuery<CurrentTenant>({
    queryKey: ["tenants", "current"],
    queryFn: loadCurrentTenant,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (query.data?.tenant_id) {
      setCurrentTenantId(query.data.tenant_id);
    }
  }, [query.data?.tenant_id]);

  return query;
}

export function useSwitchTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tenantId: string) => switchTenant(tenantId),
    onSuccess: (tenant: CurrentTenant) => {
      setCurrentTenantId(tenant.tenant_id);
      toast.success("工作空间已切换");
      void queryClient.invalidateQueries({ queryKey: ["tenants"] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["memory"] });
      void queryClient.invalidateQueries({ queryKey: ["models"] });
      void queryClient.invalidateQueries({ queryKey: ["tenantModels"] });
      void queryClient.invalidateQueries({ queryKey: ["availableModels"] });
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
      void queryClient.invalidateQueries({ queryKey: ["tenantSkills"] });
      void queryClient.invalidateQueries({ queryKey: ["availableSkills"] });
      void queryClient.invalidateQueries({ queryKey: ["mcp"] });
      void queryClient.invalidateQueries({ queryKey: ["tenantMcpConfig"] });
      void queryClient.invalidateQueries({ queryKey: ["availableMcpConfig"] });
      void queryClient.invalidateQueries({ queryKey: ["artifacts"] });
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["alertSources"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "切换工作空间失败",
      );
    },
  });
}

export function useTenantMembers({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<TenantMember[]>({
    queryKey: ["tenants", "members"],
    queryFn: loadTenantMembers,
    enabled,
    refetchOnWindowFocus: false,
  });
}

export function useTenantSelectableUsers(
  {
    enabled = true,
    keyword,
    limit = 20,
  }: {
    enabled?: boolean;
    keyword?: string;
    limit?: number;
  } = {},
) {
  const normalizedKeyword = keyword?.trim() ?? "";
  return useQuery<TenantSelectableUser[]>({
    queryKey: ["tenants", "users", { keyword: normalizedKeyword, limit }],
    queryFn: () => searchTenantSelectableUsers({ keyword: normalizedKeyword, limit }),
    enabled,
    refetchOnWindowFocus: false,
  });
}

export function useAddTenantMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { user_id: string; role: TenantMemberRole }) => addTenantMember(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenants", "members"] });
    },
  });
}

export function useAddTenantMembersByEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { emails: string[]; role: TenantMemberRole }) =>
      addTenantMembersByEmail(input.emails, input.role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenants", "members"] });
    },
  });
}

export function useUpdateTenantMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { userId: string; role: TenantMemberRole }) =>
      updateTenantMemberRole(input.userId, input.role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenants", "members"] });
    },
  });
}

export function useRemoveTenantMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => removeTenantMember(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenants", "members"] });
    },
  });
}

export function useUpdateTenantMemberStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { userId: string; status: "active" | "inactive" }) =>
      updateTenantMemberStatus(input.userId, input.status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenants", "members"] });
    },
  });
}

export function useTenantAuditLogs(
  {
    enabled = true,
    limit = 100,
    scope,
  }: {
    enabled?: boolean;
    limit?: number;
    scope?: TenantAuditScope;
  } = {},
) {
  return useQuery({
    queryKey: ["tenants", "audit", { limit, scope }],
    queryFn: () => loadTenantAuditLogs({ limit, scope }),
    enabled,
    refetchOnWindowFocus: false,
  });
}
