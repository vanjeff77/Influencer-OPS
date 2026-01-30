import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertCampaign } from "@shared/routes";

export function useCampaigns(workspaceId: number) {
  return useQuery({
    queryKey: [api.campaigns.list.path, workspaceId],
    queryFn: async () => {
      const url = buildUrl(api.campaigns.list.path, { workspaceId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return api.campaigns.list.responses[200].parse(await res.json());
    },
    enabled: !!workspaceId,
  });
}

export function useCampaign(id: number) {
  return useQuery({
    queryKey: [api.campaigns.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.campaigns.get.path, { id });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch campaign");
      return api.campaigns.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateCampaign(workspaceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertCampaign) => {
      const url = buildUrl(api.campaigns.create.path, { workspaceId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create campaign");
      return api.campaigns.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.campaigns.list.path] });
    },
  });
}

export function useUpdateCampaignItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      const url = buildUrl(api.campaigns.updateItem.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update item");
      return api.campaigns.updateItem.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      // Invalidate specific campaign if possible, or list. 
      // Ideally we'd know the campaign ID here to be more specific.
      queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path] });
    },
  });
}
