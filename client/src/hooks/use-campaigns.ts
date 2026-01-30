import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { Campaign, CampaignInfluencer, Influencer, InfluencerAccount } from "@shared/schema";

export type CampaignLineItem = CampaignInfluencer & { influencer?: Influencer & { accounts: InfluencerAccount[] } };
export type CampaignDetail = Campaign & { items: CampaignLineItem[] };

export function useCampaigns(workspaceId: number) {
  return useQuery<Campaign[]>({
    queryKey: [api.campaigns.list.path, workspaceId],
    queryFn: async () => {
      const url = buildUrl(api.campaigns.list.path, { workspaceId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
    enabled: !!workspaceId,
  });
}

export function useCampaign(id: number) {
  return useQuery<CampaignDetail>({
    queryKey: [api.campaigns.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.campaigns.get.path, { id });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch campaign");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateCampaign(workspaceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Campaign>) => {
      const url = buildUrl(api.campaigns.create.path, { workspaceId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create campaign");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.campaigns.list.path] });
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Campaign> }) => {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update campaign");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, variables.id] });
      queryClient.invalidateQueries({ queryKey: [api.campaigns.list.path] });
    },
  });
}

export function useAddInfluencersToCampaign(campaignId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (influencerIds: number[]) => {
      const res = await fetch(`/api/campaigns/${campaignId}/line-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencerIds }),
      });
      if (!res.ok) throw new Error("Failed to add influencers");
      return res.json() as Promise<CampaignInfluencer[]>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, campaignId] });
      queryClient.invalidateQueries({ queryKey: [api.influencers.list.path] });
    },
  });
}

export function useUpdateCampaignItem(campaignId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<CampaignInfluencer> }) => {
      const url = buildUrl(api.campaigns.updateItem.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update item");
      return res.json() as Promise<CampaignInfluencer>;
    },
    onSuccess: () => {
      // Invalidate the specific campaign if known, otherwise all campaign queries
      if (campaignId) {
        queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, campaignId] });
      } else {
        queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/finance/summary'] });
    },
  });
}

// Finance summary hook
export function useFinanceSummary(workspaceId: number, filters?: { month?: string; status?: string }) {
  const queryParams = new URLSearchParams({ workspaceId: String(workspaceId) });
  if (filters?.month) queryParams.set('month', filters.month);
  if (filters?.status) queryParams.set('status', filters.status);
  
  return useQuery({
    queryKey: ['/api/finance/summary', workspaceId, filters],
    queryFn: async () => {
      const res = await fetch(`/api/finance/summary?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch finance summary");
      return res.json() as Promise<{
        pendingTotal: number;
        paidThisMonth: number;
        pendingCount: number;
        items: CampaignLineItem[];
      }>;
    },
    enabled: !!workspaceId,
  });
}
