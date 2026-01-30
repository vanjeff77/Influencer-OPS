import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { Group, GroupInfluencer, Influencer, InfluencerAccount } from "@shared/schema";

export type GroupWithCount = Group & { memberCount: number };
export type GroupMember = GroupInfluencer & { influencer: Influencer & { accounts: InfluencerAccount[] } };
export type GroupDetail = Group & { members: GroupMember[] };

export function useGroups(workspaceId: number) {
  return useQuery<GroupWithCount[]>({
    queryKey: [api.groups.list.path, workspaceId],
    queryFn: async () => {
      const url = buildUrl(api.groups.list.path, { workspaceId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch groups");
      return res.json();
    },
    enabled: !!workspaceId,
  });
}

export function useGroup(id: number) {
  return useQuery<GroupDetail>({
    queryKey: ['/api/groups', id],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${id}`);
      if (!res.ok) throw new Error("Failed to fetch group");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateGroup(workspaceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const url = buildUrl(api.groups.create.path, { workspaceId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create group");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.groups.list.path] });
    },
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Group> }) => {
      const res = await fetch(`/api/groups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update group");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/groups', variables.id] });
      queryClient.invalidateQueries({ queryKey: [api.groups.list.path] });
    },
  });
}

export function useAddInfluencersToGroup(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (influencerIds: number[]) => {
      const res = await fetch(`/api/groups/${groupId}/influencers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencerIds }),
      });
      if (!res.ok) throw new Error("Failed to add influencers");
      return res.json() as Promise<{ success: boolean }>;
    },
    onSuccess: () => {
      // Invalidate specific group and list
      queryClient.invalidateQueries({ queryKey: ['/api/groups', groupId] });
      queryClient.invalidateQueries({ queryKey: [api.groups.list.path] });
      // Also invalidate influencer timeline since adding to group creates timeline events
      queryClient.invalidateQueries({ queryKey: ['/api/influencers'] });
    },
  });
}

export function useRemoveInfluencerFromGroup(groupId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (influencerId: number) => {
      const res = await fetch(`/api/groups/${groupId}/members/${influencerId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove influencer");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/groups', groupId] });
      queryClient.invalidateQueries({ queryKey: [api.groups.list.path] });
    },
  });
}
