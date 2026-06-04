import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest } from "@/lib/queryClient";

export function useEmailAccounts(workspaceId: number) {
  return useQuery({
    queryKey: [api.email.listAccounts.path, workspaceId],
    queryFn: async () => {
      const url = buildUrl(api.email.listAccounts.path, { workspaceId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch email accounts");
      return api.email.listAccounts.responses[200].parse(await res.json());
    },
    enabled: !!workspaceId,
  });
}

export function useEmailThreads(accountId: number) {
  return useQuery({
    queryKey: [api.email.threads.path, accountId],
    queryFn: async () => {
      const url = buildUrl(api.email.threads.path, { accountId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch threads");
      return api.email.threads.responses[200].parse(await res.json());
    },
    enabled: !!accountId,
  });
}

export function useEmailThread(threadId: string) {
  return useQuery({
    queryKey: [api.email.threadDetails.path, threadId],
    queryFn: async () => {
      const url = buildUrl(api.email.threadDetails.path, { threadId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch thread details");
      return api.email.threadDetails.responses[200].parse(await res.json());
    },
    enabled: !!threadId,
  });
}

export function useSyncEmail(accountId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const url = buildUrl(api.email.sync.path, { id: accountId });
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error("Failed to sync");
      return api.email.sync.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.email.threads.path] });
    },
  });
}

export function useSendBulkEmail() {
  return useMutation({
    mutationFn: async (data: { accountId: number; to: string[]; subject: string; bodyTemplate: string }) => {
      const res = await apiRequest("POST", api.email.sendBulk.path, data);
      return api.email.sendBulk.responses[200].parse(await res.json());
    },
  });
}
