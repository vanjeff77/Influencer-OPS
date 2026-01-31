import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { Influencer, InfluencerAccount, Content, TimelineEvent, CreateInfluencerWithAccounts } from "@shared/schema";

export type InfluencerWithAccounts = Influencer & { accounts: InfluencerAccount[] };
export type InfluencerDetail = Influencer & { accounts: InfluencerAccount[]; contents: Content[]; timeline: TimelineEvent[] };

export function useInfluencers(workspaceId: number, params?: { search?: string; platform?: string; tags?: string }) {
  const path = buildUrl(api.influencers.list.path, { workspaceId });
  
  const queryParams = new URLSearchParams();
  if (params?.search) queryParams.set("search", params.search);
  if (params?.platform) queryParams.set("platform", params.platform);
  if (params?.tags) queryParams.set("tags", params.tags);
  const url = queryParams.toString() ? `${path}?${queryParams.toString()}` : path;

  return useQuery<InfluencerWithAccounts[]>({
    queryKey: [api.influencers.list.path, workspaceId, params],
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch influencers");
      return res.json();
    },
    enabled: !!workspaceId,
  });
}

export function useInfluencer(id: number) {
  return useQuery<InfluencerDetail>({
    queryKey: ['/api/influencers', id],
    queryFn: async () => {
      const res = await fetch(`/api/influencers/${id}`);
      if (!res.ok) throw new Error("Failed to fetch influencer");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateInfluencer(workspaceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<CreateInfluencerWithAccounts, 'workspaceId'>) => {
      const url = buildUrl(api.influencers.create.path, { workspaceId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, workspaceId }),
      });
      if (!res.ok) throw new Error("Failed to create influencer");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.influencers.list.path] });
    },
  });
}

export function useUpdateInfluencer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Influencer> }) => {
      const res = await fetch(`/api/influencers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update influencer");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/influencers', variables.id] });
      queryClient.invalidateQueries({ queryKey: [api.influencers.list.path] });
    },
  });
}

export function useAddContent(influencerId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { link: string; thumbnail?: string; publishedAt?: Date }) => {
      const res = await fetch(`/api/influencers/${influencerId}/contents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add content");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/influencers', influencerId] });
    },
  });
}

export function useDeleteContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contentId: number) => {
      const res = await fetch(`/api/contents/${contentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete content");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/influencers'] });
    },
  });
}

// Bulk operations
export function useSaveToGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ influencerIds, groupId, createGroup }: { 
      influencerIds: number[]; 
      groupId?: number; 
      createGroup?: { workspaceId: number; name: string; description?: string } 
    }) => {
      const res = await fetch('/api/bulk/save-to-group', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencerIds, groupId, createGroup }),
      });
      if (!res.ok) throw new Error("Failed to save to group");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
    },
  });
}

export function useAssignToCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ influencerIds, campaignId, createCampaign }: { 
      influencerIds: number[]; 
      campaignId?: number; 
      createCampaign?: { workspaceId: number; name: string; client?: string } 
    }) => {
      const res = await fetch('/api/bulk/assign-to-campaign', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencerIds, campaignId, createCampaign }),
      });
      if (!res.ok) throw new Error("Failed to assign to campaign");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
    },
  });
}
