import Layout from "@/components/layout";
import { useCampaign, useUpdateCampaignItem } from "@/hooks/use-campaigns";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, CheckCircle2, CircleDollarSign, FileText } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

export default function CampaignDetail() {
  const [, params] = useRoute("/campaigns/:id");
  const id = Number(params?.id);
  const { data: campaign, isLoading } = useCampaign(id);
  const updateItem = useUpdateCampaignItem();

  if (isLoading) return <Layout><div>Loading...</div></Layout>;
  if (!campaign) return <Layout><div>Campaign not found</div></Layout>;

  // Calculate totals
  const totalSpend = campaign.items?.reduce((acc, item) => acc + (item.payAmount || 0), 0) || 0;
  const budgetUtilization = campaign.budget ? Math.round((totalSpend / campaign.budget) * 100) : 0;

  const handleStatusUpdate = (itemId: number, field: string, value: string) => {
    updateItem.mutate({ id: itemId, updates: { [field]: value } });
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <Link href="/campaigns" className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Campaigns
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
              <Badge variant="outline" className="text-sm bg-green-50 text-green-700 border-green-200 capitalize">
                {campaign.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-2 text-lg">Client: {campaign.client}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground mb-1">Total Budget</div>
            <div className="text-2xl font-bold font-mono">${campaign.budget?.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">Utilization: {budgetUtilization}%</div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Influencers</CardTitle>
              <UsersIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{campaign.items?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Committed Spend</CardTitle>
              <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalSpend.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {campaign.items?.filter(i => i.status === 'posted').length || 0} / {campaign.items?.length || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="influencers" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="influencers">Influencers</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="finance">Finance</TabsTrigger>
          </TabsList>
          
          <TabsContent value="influencers">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Participating Influencers</CardTitle>
                  <Button size="sm">Add Influencer</Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Influencer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Contract</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaign.items?.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                           {/* In a real app we would join the influencer name here */}
                           Influencer #{item.influencerId}
                        </TableCell>
                        <TableCell>
                          <Select 
                            defaultValue={item.status} 
                            onValueChange={(val) => handleStatusUpdate(item.id, 'status', val)}
                          >
                            <SelectTrigger className="w-[130px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="contacted">Contacted</SelectItem>
                              <SelectItem value="negotiated">Negotiated</SelectItem>
                              <SelectItem value="contracted">Contracted</SelectItem>
                              <SelectItem value="posted">Posted</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.contractStatus === 'signed' ? 'default' : 'secondary'} className="cursor-pointer">
                            {item.contractStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.paymentStatus === 'paid' ? 'default' : 'outline'}>
                            {item.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${item.payAmount?.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!campaign.items?.length && (
                      <TableRow>
                         <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                           No influencers added to this campaign yet.
                         </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="content">
            <div className="py-12 text-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
              Content gallery placeholder
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function UsersIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
