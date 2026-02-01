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
      <div className="flex flex-col gap-4 md:gap-8">
        <div>
          <h1 className="text-xl md:text-3xl font-bold tracking-tight">{KO.pages.finance.title}</h1>
          <p className="text-muted-foreground text-xs md:text-base mt-0.5 md:mt-1">{KO.pages.finance.subtitle}</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-6">
            {[1,2,3].map(i => (
              <Card key={i} className="border-border/60 shadow-sm">
                <CardHeader className="p-3 md:p-6 pb-1 md:pb-2"><Skeleton className="h-3 md:h-4 w-16 md:w-24" /></CardHeader>
                <CardContent className="p-3 md:p-6 pt-0"><Skeleton className="h-6 md:h-8 w-20 md:w-32" /></CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-6">
            <Card className="border-border/60 shadow-sm" data-testid="card-paid-month">
              <CardHeader className="flex flex-row items-center justify-between p-3 md:p-6 pb-1 md:pb-2 gap-2">
                <CardTitle className="text-[10px] md:text-sm font-medium text-muted-foreground">{KO.pages.finance.totalSpend}</CardTitle>
                <DollarSign className="h-3 w-3 md:h-4 md:w-4 text-green-500 shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-6 pt-0">
                <div className="text-lg md:text-3xl font-bold">{paidThisMonth.toLocaleString()}원</div>
                <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1 flex items-center">
                  <TrendingUp className="w-2.5 h-2.5 md:w-3 md:h-3 text-green-500 mr-0.5 md:mr-1 shrink-0" />
                  <span className="truncate">{KO.pages.finance.fromLastMonth}</span>
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/60 shadow-sm" data-testid="card-pending">
              <CardHeader className="flex flex-row items-center justify-between p-3 md:p-6 pb-1 md:pb-2 gap-2">
                <CardTitle className="text-[10px] md:text-sm font-medium text-muted-foreground">{KO.pages.finance.pendingPayments}</CardTitle>
                <Clock className="h-3 w-3 md:h-4 md:w-4 text-orange-500 shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-6 pt-0">
                <div className="text-lg md:text-3xl font-bold">{pendingTotal.toLocaleString()}원</div>
                <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">{pendingCount}{KO.pages.finance.invoicesPending}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 shadow-sm col-span-2 md:col-span-1" data-testid="card-avg">
              <CardHeader className="flex flex-row items-center justify-between p-3 md:p-6 pb-1 md:pb-2 gap-2">
                <CardTitle className="text-[10px] md:text-sm font-medium text-muted-foreground">{KO.pages.finance.avgCost}</CardTitle>
                <CreditCard className="h-3 w-3 md:h-4 md:w-4 text-blue-500 shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-6 pt-0">
                <div className="text-lg md:text-3xl font-bold">{avgPerInfluencer.toLocaleString()}원</div>
                <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">{KO.pages.finance.basedOnCampaigns}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="text-base md:text-xl">{KO.pages.finance.recentTransactions}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            {isLoading ? (
              <div className="space-y-2 md:space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-10 md:h-12 w-full" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 md:py-10 text-muted-foreground text-sm">
                정산 내역이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-3 md:mx-0">
                <Table className="min-w-[500px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs md:text-sm">{KO.pages.finance.campaign}</TableHead>
                      <TableHead className="text-xs md:text-sm">{KO.pages.finance.influencer}</TableHead>
                      <TableHead className="text-xs md:text-sm hidden md:table-cell">단계</TableHead>
                      <TableHead className="text-xs md:text-sm">{KO.pages.finance.status}</TableHead>
                      <TableHead className="text-xs md:text-sm text-right">{KO.pages.finance.amount}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} data-testid={`row-transaction-${item.id}`}>
                        <TableCell className="font-medium text-xs md:text-sm py-2">{getCampaignName(item.campaignId)}</TableCell>
                        <TableCell className="text-xs md:text-sm py-2">{getInfluencerName(item.influencerId)}</TableCell>
                        <TableCell className="hidden md:table-cell py-2">
                          <Badge variant="outline" className="capitalize text-xs">
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge 
                            variant={item.paymentStatus === 'paid' ? 'default' : 'outline'} 
                            className={`text-[10px] md:text-xs ${item.paymentStatus === 'paid' ? 'bg-green-100 text-green-700 hover:bg-green-200 border-0' : ''}`}
                          >
                            {getStatusLabel(item.paymentStatus || 'pending')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs md:text-sm py-2">
                          {(item.payAmount || 0).toLocaleString()}원
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
