import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useCampaigns, useCreateCampaign } from "@/hooks/use-campaigns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, DollarSign, ArrowRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { KO } from "@/i18n/ko";

interface Client {
  id: number;
  workspaceId: number;
  name: string;
}

export default function Campaigns() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  const { data: campaigns, isLoading } = useCampaigns(workspaceId || 0);
  const createCampaign = useCreateCampaign(workspaceId || 0);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchString = useSearch();

  const { data: clients } = useQuery<Client[]>({
    queryKey: ['/api/clients', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/clients?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: !!workspaceId,
  });

  const searchParams = new URLSearchParams(searchString);
  const campaignStatusParam = searchParams.get("campaignStatus");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", clientId: "", goal: "", budget: 0 });
  const [advertiserFilter, setAdvertiserFilter] = useState<string>("all");

  const activeFilters = [
    campaignStatusParam && { key: "campaignStatus", label: campaignStatusParam },
  ].filter(Boolean) as { key: string; label: string }[];

  const clearFilter = (key: string) => {
    const params = new URLSearchParams(searchString);
    params.delete(key);
    navigate(`/campaigns${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const clearAllFilters = () => {
    navigate("/campaigns");
  };

  // Advertiser filter options
  const advertisers = [
    { id: "all", name: "전체" },
    { id: "codingvalley", name: "코딩밸리" },
    { id: "grab", name: "Grab" },
    { id: "voye", name: "Voye" },
  ];

  // Filter campaigns by advertiser and query params
  const filteredCampaigns = useMemo(() => {
    if (!campaigns) return [];
    let filtered = campaigns;
    
    // Advertiser filter
    if (advertiserFilter !== "all") {
      filtered = filtered.filter(c => 
        c.client?.toLowerCase().includes(advertisers.find(a => a.id === advertiserFilter)?.name.toLowerCase() || "")
      );
    }
    
    // Campaign status filter from query param
    if (campaignStatusParam) {
      const statusMap: Record<string, string> = {
        "진행중": "active",
        "대기": "draft",
        "완료": "completed",
      };
      const status = statusMap[campaignStatusParam] || campaignStatusParam;
      filtered = filtered.filter(c => c.status === status);
    }
    
    return filtered;
  }, [campaigns, advertiserFilter, campaignStatusParam]);

  const handleCreate = () => {
    if (!newCampaign.name || !newCampaign.clientId) return;
    const selectedClient = clients?.find(c => c.id === parseInt(newCampaign.clientId));
    createCampaign.mutate({
      name: newCampaign.name,
      client: selectedClient?.name || "",
      clientId: parseInt(newCampaign.clientId),
      goal: newCampaign.goal,
      budget: newCampaign.budget,
      status: "active"
    }, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setNewCampaign({ name: "", clientId: "", goal: "", budget: 0 });
        toast({ title: KO.pages.campaigns.campaignCreated, description: KO.pages.campaigns.campaignCreatedDesc });
      }
    });
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'active': return KO.status.active;
      case 'completed': return KO.status.completed;
      case 'draft': return KO.status.draft;
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'active': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'completed': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'draft': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-4 md:gap-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl md:text-3xl font-bold tracking-tight">{KO.pages.campaigns.title}</h1>
            <p className="text-muted-foreground text-xs md:text-base mt-0.5 md:mt-1">{KO.pages.campaigns.subtitle}</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="shadow-lg shadow-primary/20 text-xs md:text-sm" data-testid="button-new-campaign">
                <Plus className="w-4 h-4 mr-1 md:mr-2" />
                {KO.pages.campaigns.newCampaign}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] md:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base md:text-lg">{KO.pages.campaigns.createNewCampaign}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 md:gap-4 py-3 md:py-4">
                <div className="grid gap-1.5 md:gap-2">
                  <label className="text-xs md:text-sm">{KO.pages.campaigns.campaignName}</label>
                  <Input className="h-8 md:h-10 text-sm" value={newCampaign.name} onChange={e => setNewCampaign({...newCampaign, name: e.target.value})} placeholder="서머 런칭 2024" />
                </div>
                <div className="grid gap-1.5 md:gap-2">
                  <label className="text-xs md:text-sm">{KO.pages.campaigns.client} <span className="text-destructive">*</span></label>
                  <Select value={newCampaign.clientId} onValueChange={(value) => setNewCampaign({...newCampaign, clientId: value})}>
                    <SelectTrigger className="h-8 md:h-10 text-sm" data-testid="select-campaign-client">
                      <SelectValue placeholder="클라이언트 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((client) => (
                        <SelectItem key={client.id} value={client.id.toString()}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(!clients || clients.length === 0) && (
                    <p className="text-xs text-muted-foreground">설정 → 클라이언트에서 먼저 클라이언트를 추가하세요</p>
                  )}
                </div>
                <div className="grid gap-1.5 md:gap-2">
                  <label className="text-xs md:text-sm">{KO.pages.campaigns.goal}</label>
                  <Input className="h-8 md:h-10 text-sm" value={newCampaign.goal} onChange={e => setNewCampaign({...newCampaign, goal: e.target.value})} placeholder="브랜드 인지도 향상" />
                </div>
                <div className="grid gap-1.5 md:gap-2">
                  <label className="text-xs md:text-sm">{KO.pages.campaigns.budget} (원)</label>
                  <Input className="h-8 md:h-10 text-sm" type="number" value={newCampaign.budget} onChange={e => setNewCampaign({...newCampaign, budget: Number(e.target.value)})} placeholder="5000000" />
                </div>
              </div>
              <Button size="sm" onClick={handleCreate} disabled={createCampaign.isPending} data-testid="button-submit-campaign">
                {createCampaign.isPending ? KO.pages.campaigns.creating : KO.pages.campaigns.createCampaign}
              </Button>
            </DialogContent>
          </Dialog>
        </div>

        {/* Active Filters Display */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{KO.pages.filter.currentFilter}</span>
            {activeFilters.map((filter) => (
              <Badge key={filter.key} variant="secondary" className="gap-1 text-xs" data-testid={`badge-filter-${filter.key}`}>
                {filter.label}
                <span onClick={() => clearFilter(filter.key)} className="cursor-pointer ml-1" data-testid={`button-remove-filter-${filter.key}`}>
                  <X className="w-3 h-3" />
                </span>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" onClick={clearAllFilters} data-testid="button-clear-all-filters">
              {KO.pages.filter.clearAll}
            </Button>
          </div>
        )}

        {/* Advertiser Filter Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
          {advertisers.map((adv) => (
            <Button
              key={adv.id}
              variant={advertiserFilter === adv.id ? "default" : "outline"}
              size="sm"
              onClick={() => setAdvertiserFilter(adv.id)}
              data-testid={`button-advertiser-${adv.id}`}
            >
              {adv.name}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-sm">{KO.common.loading}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {filteredCampaigns?.map((campaign) => (
              <Link key={campaign.id} href={`/campaigns/${campaign.id}`} className="block">
                <Card className="hover:border-primary/50 transition-all hover:shadow-md cursor-pointer group h-full" data-testid={`card-campaign-${campaign.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 p-3 md:p-4 pb-1 md:pb-2 gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <CardTitle className="text-sm md:text-base group-hover:text-primary transition-colors truncate">{campaign.name}</CardTitle>
                      <CardDescription className="text-[10px] md:text-xs">{campaign.client} • {format(new Date(campaign.createdAt || new Date()), 'yyyy.MM.dd')}</CardDescription>
                    </div>
                    <Badge variant="outline" className={`capitalize border-0 text-[10px] shrink-0 ${getStatusColor(campaign.status || 'draft')}`}>
                      {getStatusLabel(campaign.status || 'draft')}
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-3 md:p-4 pt-0">
                    <div className="flex flex-col gap-1.5 mt-2">
                      <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-muted-foreground">
                        <DollarSign className="w-3 h-3 shrink-0" />
                        <span className="truncate">{KO.pages.campaigns.budget}: <span className="text-foreground font-medium">{campaign.budget?.toLocaleString()}원</span></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span className="truncate">{KO.pages.campaigns.goal}: <span className="text-foreground font-medium">{campaign.goal || KO.pages.campaigns.notSet}</span></span>
                      </div>
                    </div>
                    <div className="hidden md:flex items-center justify-end text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity mt-2">
                      {KO.common.viewDetails} <ArrowRight className="w-3 h-3 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            
            {filteredCampaigns?.length === 0 && (
              <div className="text-center py-12 md:py-20 bg-muted/10 rounded-xl border border-dashed border-border">
                <p className="text-muted-foreground text-sm">
                  {advertiserFilter === "all" ? KO.pages.campaigns.noCampaigns : "선택한 광고주의 캠페인이 없습니다."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
