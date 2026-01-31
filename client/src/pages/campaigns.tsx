import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useCampaigns, useCreateCampaign } from "@/hooks/use-campaigns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, DollarSign, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { format } from "date-fns";
import { KO } from "@/i18n/ko";

export default function Campaigns() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  const { data: campaigns, isLoading } = useCampaigns(workspaceId || 0);
  const createCampaign = useCreateCampaign(workspaceId || 0);
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", client: "", goal: "", budget: 0 });
  const [advertiserFilter, setAdvertiserFilter] = useState<string>("all");

  // Advertiser filter options
  const advertisers = [
    { id: "all", name: "전체" },
    { id: "codingvalley", name: "코딩밸리" },
    { id: "grab", name: "Grab" },
    { id: "voye", name: "Voye" },
  ];

  // Filter campaigns by advertiser
  const filteredCampaigns = useMemo(() => {
    if (!campaigns) return [];
    if (advertiserFilter === "all") return campaigns;
    return campaigns.filter(c => 
      c.client?.toLowerCase().includes(advertisers.find(a => a.id === advertiserFilter)?.name.toLowerCase() || "")
    );
  }, [campaigns, advertiserFilter]);

  const handleCreate = () => {
    if (!newCampaign.name) return;
    createCampaign.mutate({
      ...newCampaign,
      status: "active"
    }, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setNewCampaign({ name: "", client: "", goal: "", budget: 0 });
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
      case 'active': return 'bg-green-100 text-green-700 hover:bg-green-100';
      case 'completed': return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
      case 'draft': return 'bg-gray-100 text-gray-700 hover:bg-gray-100';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{KO.pages.campaigns.title}</h1>
            <p className="text-muted-foreground mt-1">{KO.pages.campaigns.subtitle}</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="shadow-lg shadow-primary/20" data-testid="button-new-campaign">
                <Plus className="w-5 h-5 mr-2" />
                {KO.pages.campaigns.newCampaign}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{KO.pages.campaigns.createNewCampaign}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <label>{KO.pages.campaigns.campaignName}</label>
                  <Input value={newCampaign.name} onChange={e => setNewCampaign({...newCampaign, name: e.target.value})} placeholder="서머 런칭 2024" />
                </div>
                <div className="grid gap-2">
                  <label>{KO.pages.campaigns.client}</label>
                  <Input value={newCampaign.client} onChange={e => setNewCampaign({...newCampaign, client: e.target.value})} placeholder="ACME 코퍼레이션" />
                </div>
                <div className="grid gap-2">
                  <label>{KO.pages.campaigns.goal}</label>
                  <Input value={newCampaign.goal} onChange={e => setNewCampaign({...newCampaign, goal: e.target.value})} placeholder="브랜드 인지도 향상" />
                </div>
                <div className="grid gap-2">
                  <label>{KO.pages.campaigns.budget} (원)</label>
                  <Input type="number" value={newCampaign.budget} onChange={e => setNewCampaign({...newCampaign, budget: Number(e.target.value)})} placeholder="5000000" />
                </div>
              </div>
              <Button onClick={handleCreate} disabled={createCampaign.isPending} data-testid="button-submit-campaign">
                {createCampaign.isPending ? KO.pages.campaigns.creating : KO.pages.campaigns.createCampaign}
              </Button>
            </DialogContent>
          </Dialog>
        </div>

        {/* Advertiser Filter Buttons */}
        <div className="flex items-center gap-2">
          {advertisers.map((adv) => (
            <Button
              key={adv.id}
              variant={advertiserFilter === adv.id ? "default" : "outline"}
              size="sm"
              onClick={() => setAdvertiserFilter(adv.id)}
              data-testid={`button-advertiser-${adv.id}`}
              className={advertiserFilter === adv.id ? "" : "bg-background"}
            >
              {adv.name}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div>{KO.common.loading}</div>
        ) : (
          <div className="grid gap-6">
            {filteredCampaigns?.map((campaign) => (
              <Link key={campaign.id} href={`/campaigns/${campaign.id}`} className="block">
                <Card className="hover:border-primary/50 transition-all hover:shadow-md cursor-pointer group" data-testid={`card-campaign-${campaign.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="space-y-1">
                      <CardTitle className="text-xl group-hover:text-primary transition-colors">{campaign.name}</CardTitle>
                      <CardDescription>{campaign.client} • {KO.pages.campaigns.created} {format(new Date(campaign.createdAt || new Date()), 'yyyy.MM.dd')}</CardDescription>
                    </div>
                    <Badge variant="outline" className={`capitalize border-0 ${getStatusColor(campaign.status || 'draft')}`}>
                      {getStatusLabel(campaign.status || 'draft')}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <DollarSign className="w-4 h-4" />
                        <span>{KO.pages.campaigns.budget}: <span className="text-foreground font-medium">{campaign.budget?.toLocaleString()}원</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>{KO.pages.campaigns.goal}: <span className="text-foreground font-medium">{campaign.goal || KO.pages.campaigns.notSet}</span></span>
                      </div>
                      <div className="flex items-center justify-end text-primary text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        {KO.common.viewDetails} <ArrowRight className="w-4 h-4 ml-1" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            
            {filteredCampaigns?.length === 0 && (
              <div className="text-center py-20 bg-muted/10 rounded-xl border border-dashed border-border">
                <p className="text-muted-foreground">
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
