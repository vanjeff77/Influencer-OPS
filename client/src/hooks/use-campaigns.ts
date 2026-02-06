import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { Campaign, CampaignInfluencer, Influencer, InfluencerAccount, CampaignContent } from "@shared/schema";

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

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete campaign");
      return res.json();
    },
    onSuccess: () => {
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

export function useDeleteCampaignItem(campaignId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/line-items/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete line item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, campaignId] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/settlement/queue'] });
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

// Campaign Contents hooks
export type CampaignContentWithInfluencer = CampaignContent & { influencer?: Influencer };

export function useCampaignContents(campaignId: number) {
  return useQuery<CampaignContentWithInfluencer[]>({
    queryKey: ['/api/campaigns', campaignId, 'contents'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/contents`);
      if (!res.ok) throw new Error("Failed to fetch campaign contents");
      return res.json();
    },
    enabled: !!campaignId,
  });
}

export function useCreateCampaignContent(campaignId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<CampaignContent>) => {
      const res = await fetch(`/api/campaigns/${campaignId}/contents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create campaign content");
      return res.json() as Promise<CampaignContent>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'contents'] });
    },
  });
}

export function useUpdateCampaignContent(campaignId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<CampaignContent> & { id: number }) => {
      const res = await fetch(`/api/campaign-contents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update campaign content");
      return res.json() as Promise<CampaignContent>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'contents'] });
    },
  });
}

export function useDeleteCampaignContent(campaignId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/campaign-contents/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete campaign content");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'contents'] });
    },
  });
}

// Settlement Work Queue Types
export type SettlementQueueItem = CampaignInfluencer & { 
  campaign?: { id: number; name: string; clientId?: number | null };
  influencer?: Influencer & { accounts: InfluencerAccount[] };
  client?: { id: number; name: string } | null;
  settlementInfoComplete: boolean;
};

export type SettlementQueueKPI = {
  pendingCount: number;
  pendingTotal: number;
  incompleteInfoCount: number;
  holdCount: number;
  settlementRequestCount: number;
  settlementRequestTotal: number;
};

export type SettlementQueueResult = {
  kpi: SettlementQueueKPI;
  items: SettlementQueueItem[];
};

export function useSettlementWorkQueue(workspaceId: number, filters?: {
  clientId?: number;
  campaignId?: number;
  payoutStatus?: string;
  settlementInfoComplete?: boolean;
  uploadCompletedOnly?: boolean;
}) {
  return useQuery<SettlementQueueResult>({
    queryKey: ['/api/settlement/queue', workspaceId, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ workspaceId: workspaceId.toString() });
      if (filters?.clientId) params.set('clientId', filters.clientId.toString());
      if (filters?.campaignId) params.set('campaignId', filters.campaignId.toString());
      if (filters?.payoutStatus) params.set('payoutStatus', filters.payoutStatus);
      if (filters?.settlementInfoComplete !== undefined) params.set('settlementInfoComplete', filters.settlementInfoComplete.toString());
      if (filters?.uploadCompletedOnly !== undefined) params.set('uploadCompletedOnly', filters.uploadCompletedOnly.toString());
      
      const res = await fetch(`/api/settlement/queue?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch settlement queue");
      return res.json();
    },
    enabled: !!workspaceId,
  });
}

export function useUpdateLineItemPayout(workspaceId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: {
      workspaceId?: number;
      payoutStatus?: string;
      payoutAmountSupply?: number;
      payoutVat?: number;
      payoutTotal?: number;
      payoutMemo?: string;
      invoiceIssuedAt?: string;
      payoutDueAt?: string;
      paidAt?: string;
    } }) => {
      const res = await fetch(`/api/settlement/items/${id}/payout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, workspaceId: data.workspaceId || workspaceId }),
      });
      if (!res.ok) throw new Error("Failed to update payout");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settlement/queue'] });
    },
  });
}

export function useMarkPaid(workspaceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: number) => {
      const res = await fetch(`/api/settlement/items/${itemId}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) throw new Error("Failed to mark as paid");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settlement/queue'] });
    },
  });
}

export function useMarkUploadCompleted() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, completed }: { id: number; completed: boolean }) => {
      const res = await fetch(`/api/settlement/items/${id}/upload-completed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) throw new Error("Failed to update upload status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settlement/queue'] });
      queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path] });
      queryClient.invalidateQueries({ queryKey: [api.campaigns.list.path] });
    },
  });
}
