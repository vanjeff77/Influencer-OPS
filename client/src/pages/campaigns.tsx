import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useCampaigns, useCreateCampaign } from "@/hooks/use-campaigns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, DollarSign, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { format } from "date-fns";

export default function Campaigns() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  const { data: campaigns, isLoading } = useCampaigns(workspaceId || 0);
  const createCampaign = useCreateCampaign(workspaceId || 0);
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", client: "", goal: "", budget: 0 });

  const handleCreate = () => {
    if (!newCampaign.name) return;
    createCampaign.mutate({
      ...newCampaign,
      status: "active"
    }, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setNewCampaign({ name: "", client: "", goal: "", budget: 0 });
        toast({ title: "Campaign Created", description: "You can now add influencers." });
      }
    });
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
            <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
            <p className="text-muted-foreground mt-1">Manage your active marketing campaigns.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="shadow-lg shadow-primary/20">
                <Plus className="w-5 h-5 mr-2" />
                New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Campaign</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <label>Campaign Name</label>
                  <Input value={newCampaign.name} onChange={e => setNewCampaign({...newCampaign, name: e.target.value})} placeholder="Summer Launch 2024" />
                </div>
                <div className="grid gap-2">
                  <label>Client</label>
                  <Input value={newCampaign.client} onChange={e => setNewCampaign({...newCampaign, client: e.target.value})} placeholder="Acme Corp" />
                </div>
                <div className="grid gap-2">
                  <label>Goal</label>
                  <Input value={newCampaign.goal} onChange={e => setNewCampaign({...newCampaign, goal: e.target.value})} placeholder="Brand Awareness" />
                </div>
                <div className="grid gap-2">
                  <label>Budget ($)</label>
                  <Input type="number" value={newCampaign.budget} onChange={e => setNewCampaign({...newCampaign, budget: Number(e.target.value)})} placeholder="5000" />
                </div>
              </div>
              <Button onClick={handleCreate} disabled={createCampaign.isPending}>
                {createCampaign.isPending ? "Creating..." : "Create Campaign"}
              </Button>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div>Loading campaigns...</div>
        ) : (
          <div className="grid gap-6">
            {campaigns?.map((campaign) => (
              <Link key={campaign.id} href={`/campaigns/${campaign.id}`} className="block">
                <Card className="hover:border-primary/50 transition-all hover:shadow-md cursor-pointer group">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="space-y-1">
                      <CardTitle className="text-xl group-hover:text-primary transition-colors">{campaign.name}</CardTitle>
                      <CardDescription>{campaign.client} • Created {format(new Date(campaign.createdAt || new Date()), 'MMM d, yyyy')}</CardDescription>
                    </div>
                    <Badge variant="outline" className={`capitalize border-0 ${getStatusColor(campaign.status || 'draft')}`}>
                      {campaign.status}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <DollarSign className="w-4 h-4" />
                        <span>Budget: <span className="text-foreground font-medium">${campaign.budget?.toLocaleString()}</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>Goal: <span className="text-foreground font-medium">{campaign.goal || "Not set"}</span></span>
                      </div>
                      <div className="flex items-center justify-end text-primary text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        View Details <ArrowRight className="w-4 h-4 ml-1" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            
            {campaigns?.length === 0 && (
              <div className="text-center py-20 bg-muted/10 rounded-xl border border-dashed border-border">
                <p className="text-muted-foreground">No campaigns yet. Create your first one!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
