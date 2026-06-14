import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import {
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  listSkills,
  updateAgent,
} from "./api";
import type { CreateAgentRequest, UpdateAgentRequest } from "./types";
import { getCurrentTenantId, subscribeTenantChange } from "@/core/tenants/store";

function useTenantKey() {
  return useSyncExternalStore(subscribeTenantChange, () => getCurrentTenantId() ?? "_");
}

export function useAgents() {
  const tenantKey = useTenantKey();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["agents", tenantKey],
    queryFn: () => listAgents(),
  });
  return { agents: data ?? [], isLoading, error, refetch };
}

export function useAgent(name: string | null | undefined) {
  const tenantKey = useTenantKey();
  const { data, isLoading, error } = useQuery({
    queryKey: ["agents", tenantKey, name],
    queryFn: () => getAgent(name!),
    enabled: !!name,
  });
  return { agent: data ?? null, isLoading, error };
}

export function useSkills() {
  const tenantKey = useTenantKey();
  const { data, isLoading, error } = useQuery({
    queryKey: ["skills", tenantKey],
    queryFn: () => listSkills(),
  });
  return { skills: data ?? [], isLoading, error };
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (request: CreateAgentRequest) => createAgent(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agents", tenantKey] });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: ({
      name,
      request,
    }: {
      name: string;
      request: UpdateAgentRequest;
    }) => updateAgent(name, request),
    onSuccess: (_data, { name }) => {
      void queryClient.invalidateQueries({ queryKey: ["agents", tenantKey] });
      void queryClient.invalidateQueries({ queryKey: ["agents", tenantKey, name] });
    },
  });
}

export function useToggleAgent() {
  const queryClient = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: ({
      name,
      enabled,
    }: {
      name: string;
      enabled: boolean;
    }) => updateAgent(name, { enabled }),
    onSuccess: (_data, { name }) => {
      void queryClient.invalidateQueries({ queryKey: ["agents", tenantKey] });
      void queryClient.invalidateQueries({ queryKey: ["agents", tenantKey, name] });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (name: string) => deleteAgent(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agents", tenantKey] });
    },
  });
}
