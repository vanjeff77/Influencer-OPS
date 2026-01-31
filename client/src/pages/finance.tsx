import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useFinanceSummary, useCampaigns } from "@/hooks/use-campaigns";
import { useInfluencers } from "@/hooks/use-influencers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Clock, CreditCard } from "lucide-react";
import { KO } from "@/i18n/ko";

export default function Finance() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  
  const { data: financeSummary, isLoading } = useFinanceSummary(workspaceId || 0);
  const { data: campaigns } = useCampaigns(workspaceId || 0);
  const { data: influencers } = useInfluencers(workspaceId || 0);

  const getInfluencerName = (id: number) => {
    return influencers?.find(i => i.id === id)?.name || `인플루언서 ${id}`;
  };

  const getCampaignName = (campaignId: number) => {
    return campaigns?.find(c => c.id === campaignId)?.name || `캠페인 ${campaignId}`;
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'paid': return KO.status.paid;
      case 'pending': 
      case 'requested': return KO.status.pending;
      default: return status;
    }
  };

  const pendingTotal = financeSummary?.pendingTotal || 0;
  const paidThisMonth = financeSummary?.paidThisMonth || 0;
  const pendingCount = financeSummary?.pendingCount || 0;
  const items = financeSummary?.items || [];

  const totalProcessed = paidThisMonth + pendingTotal;
  const avgPerInfluencer = items.length > 0 ? Math.round(totalProcessed / items.length) : 0;

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{KO.pages.finance.title}</h1>
          <p className="text-muted-foreground mt-1">{KO.pages.finance.subtitle}</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1,2,3].map(i => (
              <Card key={i} className="border-border/60 shadow-sm">
                <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
                <CardContent><Skeleton className="h-8 w-32" /></CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-border/60 shadow-sm" data-testid="card-paid-month">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{KO.pages.finance.totalSpend}</CardTitle>
                <DollarSign className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{paidThisMonth.toLocaleString()}원</div>
                <p className="text-xs text-muted-foreground mt-1 flex items-center">
                  <TrendingUp className="w-3 h-3 text-green-500 mr-1" />
                  {KO.pages.finance.fromLastMonth}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/60 shadow-sm" data-testid="card-pending">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{KO.pages.finance.pendingPayments}</CardTitle>
                <Clock className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{pendingTotal.toLocaleString()}원</div>
                <p className="text-xs text-muted-foreground mt-1">{pendingCount}{KO.pages.finance.invoicesPending}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 shadow-sm" data-testid="card-avg">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{KO.pages.finance.avgCost}</CardTitle>
                <CreditCard className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{avgPerInfluencer.toLocaleString()}원</div>
                <p className="text-xs text-muted-foreground mt-1">{KO.pages.finance.basedOnCampaigns}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{KO.pages.finance.recentTransactions}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                정산 내역이 없습니다.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{KO.pages.finance.campaign}</TableHead>
                    <TableHead>{KO.pages.finance.influencer}</TableHead>
                    <TableHead>단계</TableHead>
                    <TableHead>{KO.pages.finance.status}</TableHead>
                    <TableHead className="text-right">{KO.pages.finance.amount}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} data-testid={`row-transaction-${item.id}`}>
                      <TableCell className="font-medium">{getCampaignName(item.campaignId)}</TableCell>
                      <TableCell>{getInfluencerName(item.influencerId)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={item.paymentStatus === 'paid' ? 'default' : 'outline'} 
                          className={item.paymentStatus === 'paid' ? 'bg-green-100 text-green-700 hover:bg-green-200 border-0' : ''}
                        >
                          {getStatusLabel(item.paymentStatus || 'pending')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(item.payAmount || 0).toLocaleString()}원
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
