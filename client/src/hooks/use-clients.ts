import { useQuery } from "@tanstack/react-query";

export interface Client {
  id: number;
  workspaceId: number;
  name: string;
  logoUrl?: string | null;
  memo?: string | null;
  status?: string;
}

export function useClients(workspaceId: number) {
  return useQuery<Client[]>({
    queryKey: [`/api/clients?workspaceId=${workspaceId}`],
    enabled: !!workspaceId,
  });
}
