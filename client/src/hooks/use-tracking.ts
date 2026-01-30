import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertTrackingJob } from "@shared/routes";

export function useTrackingJobs(workspaceId: number) {
  return useQuery({
    queryKey: [api.tracking.list.path, workspaceId],
    queryFn: async () => {
      const url = buildUrl(api.tracking.list.path, { workspaceId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch tracking jobs");
      return api.tracking.list.responses[200].parse(await res.json());
    },
    enabled: !!workspaceId,
  });
}

export function useTrackingMetrics(jobId: number) {
  return useQuery({
    queryKey: [api.tracking.getMetrics.path, jobId],
    queryFn: async () => {
      const url = buildUrl(api.tracking.getMetrics.path, { id: jobId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch metrics");
      return api.tracking.getMetrics.responses[200].parse(await res.json());
    },
    enabled: !!jobId,
  });
}

export function useCreateTrackingJob(workspaceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertTrackingJob) => {
      const url = buildUrl(api.tracking.create.path, { workspaceId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create job");
      return api.tracking.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tracking.list.path] });
    },
  });
}

export function useMockUpdateTracking(jobId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const url = buildUrl(api.tracking.mockUpdate.path, { id: jobId });
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error("Failed to update");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tracking.getMetrics.path, jobId] });
    },
  });
}
