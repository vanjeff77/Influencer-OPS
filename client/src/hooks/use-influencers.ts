import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateInfluencerWithAccounts } from "@shared/routes";

export function useInfluencers(workspaceId: number, params?: { search?: string; tags?: string }) {
  const path = buildUrl(api.influencers.list.path, { workspaceId });
  
  // Construct query string manually since we don't have a helper for it yet in shared
  const queryParams = new URLSearchParams();
  if (params?.search) queryParams.set("search", params.search);
  if (params?.tags) queryParams.set("tags", params.tags);
  const url = `${path}?${queryParams.toString()}`;

  return useQuery({
    queryKey: [api.influencers.list.path, workspaceId, params],
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch influencers");
      return api.influencers.list.responses[200].parse(await res.json());
    },
    enabled: !!workspaceId,
  });
}

export function useCreateInfluencer(workspaceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateInfluencerWithAccounts) => {
      const url = buildUrl(api.influencers.create.path, { workspaceId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create influencer");
      return api.influencers.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.influencers.list.path] });
    },
  });
}
