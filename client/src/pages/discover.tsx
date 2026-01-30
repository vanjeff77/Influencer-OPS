import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useInfluencers, useCreateInfluencer } from "@/hooks/use-influencers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Search, Filter, Plus, Instagram, Youtube, Twitter } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Discover() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id; // Simplification: using first workspace
  
  const [search, setSearch] = useState("");
  const { data: influencers, isLoading } = useInfluencers(workspaceId || 0, { search });
  const createInfluencer = useCreateInfluencer(workspaceId || 0);
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newInfluencer, setNewInfluencer] = useState({ name: "", email: "", handle: "", platform: "IG" });

  const handleCreate = () => {
    if (!newInfluencer.name) return;
    createInfluencer.mutate({
      name: newInfluencer.name,
      email: newInfluencer.email,
      accounts: newInfluencer.handle ? [{
        platform: newInfluencer.platform,
        handle: newInfluencer.handle,
        url: `https://${newInfluencer.platform}.com/${newInfluencer.handle}`,
        verified: false
      }] : []
    }, {
      onSuccess: () => {
        setIsAddOpen(false);
        setNewInfluencer({ name: "", email: "", handle: "", platform: "IG" });
        toast({ title: "Influencer added", description: "Successfully added to your database." });
      }
    });
  };

  const PlatformIcon = ({ p }: { p: string }) => {
    switch(p) {
      case 'IG': return <Instagram className="w-4 h-4 text-pink-600" />;
      case 'YT': return <Youtube className="w-4 h-4 text-red-600" />;
      case 'X': return <Twitter className="w-4 h-4 text-blue-400" />;
      default: return <span className="text-xs font-bold">{p}</span>;
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Discover</h1>
            <p className="text-muted-foreground mt-1">Find and manage influencers for your campaigns.</p>
          </div>
          
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-lg shadow-primary/20">
                <Plus className="w-4 h-4 mr-2" />
                Add Influencer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Influencer</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <label>Name</label>
                  <Input value={newInfluencer.name} onChange={e => setNewInfluencer({...newInfluencer, name: e.target.value})} placeholder="Jane Doe" />
                </div>
                <div className="grid gap-2">
                  <label>Email</label>
                  <Input value={newInfluencer.email} onChange={e => setNewInfluencer({...newInfluencer, email: e.target.value})} placeholder="jane@example.com" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                     <label>Platform</label>
                     <select 
                       className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                       value={newInfluencer.platform}
                       onChange={e => setNewInfluencer({...newInfluencer, platform: e.target.value})}
                     >
                       <option value="IG">Instagram</option>
                       <option value="YT">YouTube</option>
                       <option value="TikTok">TikTok</option>
                     </select>
                  </div>
                  <div className="col-span-2">
                     <label>Handle</label>
                     <Input value={newInfluencer.handle} onChange={e => setNewInfluencer({...newInfluencer, handle: e.target.value})} placeholder="@janedoe" />
                  </div>
                </div>
              </div>
              <Button onClick={handleCreate} disabled={createInfluencer.isPending}>
                {createInfluencer.isPending ? "Adding..." : "Add to Database"}
              </Button>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search influencers by name or handle..." 
              className="pl-9 bg-muted/30 border-transparent focus:bg-background focus:border-primary transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </Button>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">Loading influencers...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {influencers?.map((inf) => (
              <Card key={inf.id} className="p-5 hover:shadow-md transition-shadow cursor-pointer group border-border/60">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                      <AvatarFallback className="bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 font-bold">
                        {inf.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold text-lg leading-none group-hover:text-primary transition-colors">{inf.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1 truncate max-w-[150px]">{inf.email || "No email"}</p>
                    </div>
                  </div>
                  {inf.accounts && inf.accounts.length > 0 && (
                    <div className="flex gap-1">
                      {inf.accounts.map(acc => (
                        <div key={acc.id} className="p-1.5 bg-muted rounded-full">
                          <PlatformIcon p={acc.platform} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {inf.tags?.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="font-normal text-xs">{tag}</Badge>
                    ))}
                    {!inf.tags?.length && <span className="text-xs text-muted-foreground italic">No tags</span>}
                  </div>
                  
                  {inf.accounts && inf.accounts.length > 0 && (
                     <div className="bg-muted/30 rounded-lg p-3 text-sm flex justify-between items-center">
                        <span className="text-muted-foreground">Top Account</span>
                        <span className="font-mono font-medium">{inf.accounts[0].handle}</span>
                     </div>
                  )}
                </div>
              </Card>
            ))}
            
            {influencers?.length === 0 && (
              <div className="col-span-full text-center py-20 bg-muted/10 rounded-xl border border-dashed border-border">
                <h3 className="text-lg font-medium text-muted-foreground">No influencers found</h3>
                <p className="text-sm text-muted-foreground/60 mt-1">Try adjusting your search or add a new influencer.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
