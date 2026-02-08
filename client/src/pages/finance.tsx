import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useSettlementWorkQueue, useMarkPaid, useUpdateLineItemPayout, SettlementQueueItem } from "@/hooks/use-campaigns";
import { useCampaigns } from "@/hooks/use-campaigns";
import { useClients } from "@/hooks/use-clients";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, AlertTriangle, Pause, CheckCircle2, Copy, CreditCard, X, Download, Send } from "lucide-react";
import { KO } from "@/i18n/ko";
import { useLocation, useSearch } from "wouter";
import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Finance() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  
  const searchParams = new URLSearchParams(searchString);
  const payoutStatusParam = searchParams.get("payoutStatus");
  const clientIdParam = searchParams.get("clientId");
  const campaignIdParam = searchParams.get("campaignId");
  
  // Default to showing 정산요청 items when no filter is specified
  useEffect(() => {
    if (!payoutStatusParam && !clientIdParam && !campaignIdParam) {
      navigate("/finance?payoutStatus=정산요청", { replace: true });
    }
  }, [payoutStatusParam, clientIdParam, campaignIdParam, navigate]);
  
  const filters = useMemo(() => ({
    payoutStatus: payoutStatusParam || '정산요청',
    clientId: clientIdParam ? parseInt(clientIdParam) : undefined,
    campaignId: campaignIdParam ? parseInt(campaignIdParam) : undefined,
    uploadCompletedOnly: false,
  }), [payoutStatusParam, clientIdParam, campaignIdParam]);
  
  const { data: settlementData, isLoading } = useSettlementWorkQueue(workspaceId || 0, filters);
  const { data: campaigns } = useCampaigns(workspaceId || 0);
  const { data: clients } = useClients(workspaceId || 0);
  const markPaid = useMarkPaid(workspaceId || 0);
  
  const [selectedItem, setSelectedItem] = useState<SettlementQueueItem | null>(null);

  const activeFilters = [
    payoutStatusParam && { key: "payoutStatus", label: payoutStatusParam },
    clientIdParam && { key: "clientId", label: clients?.find(c => c.id === parseInt(clientIdParam))?.name || clientIdParam },
    campaignIdParam && { key: "campaignId", label: campaigns?.find(c => c.id === parseInt(campaignIdParam))?.name || campaignIdParam },
  ].filter(Boolean) as { key: string; label: string }[];

  const clearFilter = (key: string) => {
    const params = new URLSearchParams(searchString);
    params.delete(key);
    navigate(`/finance${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const clearAllFilters = () => {
    navigate("/finance");
  };

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchString);
    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    navigate(`/finance${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const kpi = settlementData?.kpi || { pendingCount: 0, pendingTotal: 0, incompleteInfoCount: 0, holdCount: 0, settlementRequestCount: 0, settlementRequestTotal: 0 };
  const items = settlementData?.items || [];

  // Group items by campaign for summary view
  const campaignSummary = useMemo(() => {
    const grouped = new Map<number, {
      campaignId: number;
      campaignName: string;
      clientName: string;
      totalAmount: number;
      itemCount: number;
      earliestDueDate: Date | null;
    }>();
    
    items.forEach(item => {
      if (!item.campaign?.id) return;
      const key = item.campaign.id;
      const existing = grouped.get(key);
      const dueDate = item.payoutDueAt ? new Date(item.payoutDueAt) : null;
      
      if (existing) {
        existing.totalAmount += (item.payoutTotal || item.offerFee || 0);
        existing.itemCount += 1;
        if (dueDate && (!existing.earliestDueDate || dueDate < existing.earliestDueDate)) {
          existing.earliestDueDate = dueDate;
        }
      } else {
        grouped.set(key, {
          campaignId: item.campaign.id,
          campaignName: item.campaign.name,
          clientName: item.client?.name || '-',
          totalAmount: item.payoutTotal || item.offerFee || 0,
          itemCount: 1,
          earliestDueDate: dueDate
        });
      }
    });
    
    return Array.from(grouped.values()).sort((a, b) => {
      // Sort by earliest due date (null dates at the end)
      if (!a.earliestDueDate && !b.earliestDueDate) return 0;
      if (!a.earliestDueDate) return 1;
      if (!b.earliestDueDate) return -1;
      return a.earliestDueDate.getTime() - b.earliestDueDate.getTime();
    });
  }, [items]);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case '입금완료': return 'default';
      case '정산요청': return 'secondary';
      case '지급대기': return 'secondary';
      case '정산정보미비': return 'destructive';
      case '보류': return 'outline';
      case '대기': return 'outline';
      default: return 'outline';
    }
  };

  const exportToCSV = () => {
    if (!items.length) return;
    
    const headers = ['광고주', '캠페인', '인플루언서', '사업자유형', '은행명', '예금주', '계좌번호', '광고료', '상태', '지급예정일'];
    const rows = items.map(item => [
      item.client?.name || '',
      item.campaign?.name || '',
      item.influencer?.name || '',
      item.influencer?.settlementType || '',
      item.influencer?.bankName || '',
      item.influencer?.accountHolder || '',
      item.influencer?.accountNumber || '',
      (item.payoutTotal || item.offerFee || 0).toString(),
      item.payoutStatus || '',
      item.payoutDueAt ? new Date(item.payoutDueAt).toLocaleDateString('ko-KR') : ''
    ]);
    
    const csvContent = [headers, ...rows].map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `settlement_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    toast({ title: 'CSV 파일이 다운로드되었습니다.' });
  };

  const copyForBank = (item: SettlementQueueItem) => {
    const inf = item.influencer;
    if (!inf) return;
    
    const lines = [
      inf.bankName || '',
      inf.accountNumber || '',
      inf.accountHolder || '',
      (item.payoutTotal || item.offerFee || 0).toString(),
    ];
    
    navigator.clipboard.writeText(lines.join('\t'));
    toast({ title: KO.pages.settlement.copiedToClipboard });
  };

  const handleMarkPaid = (item: SettlementQueueItem) => {
    markPaid.mutate(item.id, {
      onSuccess: () => {
        toast({ title: "입금 완료 처리되었습니다." });
        setSelectedItem(null);
      }
    });
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  return (
    <Layout>
      <div className="flex flex-col gap-4 md:gap-8">
        <div>
          <h1 className="text-xl md:text-3xl font-bold tracking-tight">{KO.pages.settlement.title}</h1>
          <p className="text-muted-foreground text-xs md:text-base mt-0.5 md:mt-1">{KO.pages.settlement.subtitle}</p>
        </div>

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

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
            {[1,2,3,4].map(i => (
              <Card key={i} className="border-border/60 shadow-sm">
                <CardHeader className="p-3 md:p-4 pb-1 md:pb-2"><Skeleton className="h-3 md:h-4 w-16 md:w-24" /></CardHeader>
                <CardContent className="p-3 md:p-4 pt-0"><Skeleton className="h-6 md:h-8 w-20 md:w-32" /></CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4">
            <Card 
              className={`border-border/60 shadow-sm cursor-pointer transition-colors ${payoutStatusParam === '정산요청' ? 'ring-2 ring-primary' : 'hover-elevate'}`}
              onClick={() => handleFilterChange('payoutStatus', payoutStatusParam === '정산요청' ? 'all' : '정산요청')}
              data-testid="card-settlement-request"
            >
              <CardHeader className="flex flex-row items-center justify-between p-3 md:p-4 pb-1 md:pb-2 gap-2">
                <CardTitle className="text-[10px] md:text-sm font-medium text-muted-foreground">정산요청</CardTitle>
                <Send className="h-3 w-3 md:h-4 md:w-4 text-blue-500 shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-lg md:text-2xl font-bold">{kpi.settlementRequestCount}건</div>
                <p className="text-[10px] md:text-xs text-muted-foreground">{kpi.settlementRequestTotal.toLocaleString()}원</p>
              </CardContent>
            </Card>

            <Card 
              className={`border-border/60 shadow-sm cursor-pointer transition-colors ${payoutStatusParam === '지급대기' ? 'ring-2 ring-primary' : 'hover-elevate'}`}
              onClick={() => handleFilterChange('payoutStatus', payoutStatusParam === '지급대기' ? 'all' : '지급대기')}
              data-testid="card-pending-count"
            >
              <CardHeader className="flex flex-row items-center justify-between p-3 md:p-4 pb-1 md:pb-2 gap-2">
                <CardTitle className="text-[10px] md:text-sm font-medium text-muted-foreground">{KO.pages.settlement.pendingCount}</CardTitle>
                <Clock className="h-3 w-3 md:h-4 md:w-4 text-yellow-500 shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-lg md:text-2xl font-bold">{kpi.pendingCount}건</div>
                <p className="text-[10px] md:text-xs text-muted-foreground">{kpi.pendingTotal.toLocaleString()}원</p>
              </CardContent>
            </Card>
            
            <Card 
              className={`border-border/60 shadow-sm cursor-pointer transition-colors ${payoutStatusParam === '정산정보미비' ? 'ring-2 ring-primary' : 'hover-elevate'}`}
              onClick={() => handleFilterChange('payoutStatus', payoutStatusParam === '정산정보미비' ? 'all' : '정산정보미비')}
              data-testid="card-incomplete-info"
            >
              <CardHeader className="flex flex-row items-center justify-between p-3 md:p-4 pb-1 md:pb-2 gap-2">
                <CardTitle className="text-[10px] md:text-sm font-medium text-muted-foreground">{KO.pages.settlement.incompleteInfo}</CardTitle>
                <AlertTriangle className="h-3 w-3 md:h-4 md:w-4 text-orange-500 shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-lg md:text-2xl font-bold">{kpi.incompleteInfoCount}건</div>
              </CardContent>
            </Card>
            
            <Card 
              className={`border-border/60 shadow-sm cursor-pointer transition-colors ${payoutStatusParam === '보류' ? 'ring-2 ring-primary' : 'hover-elevate'}`}
              onClick={() => handleFilterChange('payoutStatus', payoutStatusParam === '보류' ? 'all' : '보류')}
              data-testid="card-hold"
            >
              <CardHeader className="flex flex-row items-center justify-between p-3 md:p-4 pb-1 md:pb-2 gap-2">
                <CardTitle className="text-[10px] md:text-sm font-medium text-muted-foreground">{KO.pages.settlement.holdCount}</CardTitle>
                <Pause className="h-3 w-3 md:h-4 md:w-4 text-gray-500 shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-lg md:text-2xl font-bold">{kpi.holdCount}건</div>
              </CardContent>
            </Card>
            
            <Card className="border-border/60 shadow-sm" data-testid="card-total-amount">
              <CardHeader className="flex flex-row items-center justify-between p-3 md:p-4 pb-1 md:pb-2 gap-2">
                <CardTitle className="text-[10px] md:text-sm font-medium text-muted-foreground">{KO.pages.settlement.pendingTotal}</CardTitle>
                <CreditCard className="h-3 w-3 md:h-4 md:w-4 text-green-500 shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-lg md:text-2xl font-bold">{kpi.pendingTotal.toLocaleString()}원</div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <Select value={clientIdParam || 'all'} onValueChange={(val) => handleFilterChange('clientId', val)}>
            <SelectTrigger className="w-[140px]" data-testid="select-client-filter">
              <SelectValue placeholder={KO.pages.settlement.client} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 광고주</SelectItem>
              {clients?.map(c => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={campaignIdParam || 'all'} onValueChange={(val) => handleFilterChange('campaignId', val)}>
            <SelectTrigger className="w-[160px]" data-testid="select-campaign-filter">
              <SelectValue placeholder={KO.pages.settlement.campaignName} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 캠페인</SelectItem>
              {campaigns?.map(c => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Campaign Summary - shows when filtering by 정산요청 */}
        {payoutStatusParam === '정산요청' && campaignSummary.length > 0 && (
          <Card>
            <CardHeader className="p-3 md:p-6">
              <CardTitle className="text-base md:text-xl">캠페인별 정산 요약</CardTitle>
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0">
              <div className="overflow-x-auto -mx-3 md:mx-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs md:text-sm">광고주</TableHead>
                      <TableHead className="text-xs md:text-sm">캠페인</TableHead>
                      <TableHead className="text-xs md:text-sm text-center">건수</TableHead>
                      <TableHead className="text-xs md:text-sm text-right">광고료</TableHead>
                      <TableHead className="text-xs md:text-sm">정산 기한</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaignSummary.map(summary => (
                      <TableRow 
                        key={summary.campaignId}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleFilterChange('campaignId', summary.campaignId.toString())}
                        data-testid={`row-campaign-summary-${summary.campaignId}`}
                      >
                        <TableCell className="text-xs md:text-sm py-2">{summary.clientName}</TableCell>
                        <TableCell className="text-xs md:text-sm py-2 font-medium">{summary.campaignName}</TableCell>
                        <TableCell className="text-xs md:text-sm py-2 text-center">{summary.itemCount}건</TableCell>
                        <TableCell className="text-right font-mono text-xs md:text-sm py-2 font-medium">
                          {summary.totalAmount.toLocaleString()}원
                        </TableCell>
                        <TableCell className="text-xs md:text-sm py-2">
                          {summary.earliestDueDate ? (
                            <span className={summary.earliestDueDate <= new Date() ? 'text-red-600 font-medium' : ''}>
                              {summary.earliestDueDate.toLocaleDateString('ko-KR')}
                            </span>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="p-3 md:p-6 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base md:text-xl">{KO.pages.settlement.workQueue}</CardTitle>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={exportToCSV}
              disabled={items.length === 0}
              data-testid="button-export-csv"
            >
              <Download className="w-4 h-4 mr-1" />
              CSV 다운로드
            </Button>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            {isLoading ? (
              <div className="space-y-2 md:space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-10 md:h-12 w-full" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 md:py-10 text-muted-foreground text-sm">
                {KO.pages.settlement.noItems}
              </div>
            ) : (
              <div className="overflow-x-auto -mx-3 md:mx-0">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs md:text-sm">{KO.pages.settlement.client}</TableHead>
                      <TableHead className="text-xs md:text-sm">{KO.pages.settlement.campaignName}</TableHead>
                      <TableHead className="text-xs md:text-sm">{KO.pages.settlement.influencerName}</TableHead>
                      <TableHead className="text-xs md:text-sm">{KO.pages.settlement.settlementType}</TableHead>
                      <TableHead className="text-xs md:text-sm">{KO.pages.settlement.payoutStatus}</TableHead>
                      <TableHead className="text-xs md:text-sm text-right">{KO.pages.settlement.payoutAmount}</TableHead>
                      <TableHead className="text-xs md:text-sm">지급예정일</TableHead>
                      <TableHead className="text-xs md:text-sm w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow 
                        key={item.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedItem(item)}
                        data-testid={`row-settlement-${item.id}`}
                      >
                        <TableCell className="text-xs md:text-sm py-2">{item.client?.name || '-'}</TableCell>
                        <TableCell className="text-xs md:text-sm py-2">{item.campaign?.name || '-'}</TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[10px]">{item.influencer?.name?.substring(0,2) || '?'}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs md:text-sm">{item.influencer?.name || '?'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className="text-[10px] md:text-xs">
                            {item.influencer?.settlementType || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge 
                            variant={getStatusBadgeVariant(item.payoutStatus || '')}
                            className="text-[10px] md:text-xs"
                          >
                            {item.payoutStatus || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs md:text-sm py-2">
                          {(item.payoutTotal || item.offerFee || 0).toLocaleString()}원
                        </TableCell>
                        <TableCell className="text-xs md:text-sm py-2">
                          {item.payoutDueAt ? new Date(item.payoutDueAt).toLocaleDateString('ko-KR') : '-'}
                        </TableCell>
                        <TableCell className="py-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={(e) => { e.stopPropagation(); copyForBank(item); }}
                            data-testid={`button-copy-${item.id}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
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

      <SettlementDetailSheet 
        item={selectedItem} 
        workspaceId={workspaceId || 0}
        onClose={() => setSelectedItem(null)} 
        onMarkPaid={handleMarkPaid}
        isMarkingPaid={markPaid.isPending}
      />
    </Layout>
  );
}

function SettlementDetailSheet({ item, workspaceId, onClose, onMarkPaid, isMarkingPaid }: {
  item: SettlementQueueItem | null;
  workspaceId: number;
  onClose: () => void;
  onMarkPaid: (item: SettlementQueueItem) => void;
  isMarkingPaid: boolean;
}) {
  const updatePayout = useUpdateLineItemPayout(workspaceId);
  const { toast } = useToast();
  
  const [payoutStatus, setPayoutStatus] = useState('');
  const [payoutMemo, setPayoutMemo] = useState('');
  
  if (!item) return null;
  
  const inf = item.influencer;
  
  const handleSave = () => {
    updatePayout.mutate({ id: item.id, data: { payoutStatus, payoutMemo, workspaceId } }, {
      onSuccess: () => toast({ title: "저장되었습니다." })
    });
  };

  const copyForBank = () => {
    if (!inf) return;
    
    const lines = [
      inf.bankName || '',
      inf.accountNumber || '',
      inf.accountHolder || '',
      (item.payoutTotal || item.offerFee || 0).toString(),
    ];
    
    navigator.clipboard.writeText(lines.join('\t'));
    toast({ title: KO.pages.settlement.copiedToClipboard });
  };
  
  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] sm:max-w-[400px] overflow-hidden flex flex-col">
        <SheetHeader className="shrink-0">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback>{inf?.name?.substring(0, 2) || 'IN'}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate">{inf?.name || '인플루언서'}</SheetTitle>
              <div className="text-sm text-muted-foreground truncate">{item.campaign?.name}</div>
            </div>
          </div>
        </SheetHeader>
        
        <ScrollArea className="flex-1 -mx-6 px-6 mt-4">
          <div className="space-y-6 pb-4">
            <div>
              <h3 className="font-medium mb-3">{KO.pages.settlement.settlementInfo}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{KO.pages.settlement.settlementType}</span>
                  <Badge variant="outline">{inf?.settlementType || '-'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{KO.pages.settlement.bankName}</span>
                  <span>{inf?.bankName || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{KO.pages.settlement.accountHolder}</span>
                  <span>{inf?.accountHolder || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{KO.pages.settlement.accountNumber}</span>
                  <span className="font-mono">{inf?.accountNumber || '-'}</span>
                </div>
                {inf?.settlementType === '사업자' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{KO.pages.settlement.businessName}</span>
                      <span>{inf?.businessName || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{KO.pages.settlement.businessRegNo}</span>
                      <span className="font-mono">{inf?.businessRegNo || '-'}</span>
                    </div>
                  </>
                )}
                {inf?.settlementType === '프리랜서' && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{KO.pages.settlement.freelancerId}</span>
                    <span className="font-mono">{inf?.freelancerId ? '***-**-****' : '-'}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-muted-foreground">정산정보</span>
                  {item.settlementInfoComplete ? (
                    <Badge variant="default" className="bg-green-100 text-green-700 border-0">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {KO.pages.settlement.settlementInfoComplete}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {KO.pages.settlement.settlementInfoIncomplete}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="font-medium mb-3">{KO.pages.settlement.payoutAmount}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{KO.pages.settlement.supplyAmount}</span>
                  <span className="font-mono">{(item.payoutAmountSupply || item.offerFee || 0).toLocaleString()}원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{KO.pages.settlement.vat}</span>
                  <span className="font-mono">{(item.payoutVat || 0).toLocaleString()}원</span>
                </div>
                <div className="flex justify-between font-medium pt-2 border-t">
                  <span>{KO.pages.settlement.totalAmount}</span>
                  <span className="font-mono text-lg">{(item.payoutTotal || item.offerFee || 0).toLocaleString()}원</span>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="font-medium mb-3">{KO.pages.settlement.payoutStatus}</h3>
              <Select 
                value={payoutStatus || item.payoutStatus || ''} 
                onValueChange={setPayoutStatus}
              >
                <SelectTrigger data-testid="select-payout-status">
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="대기">대기</SelectItem>
                  <SelectItem value="정산정보미비">정산정보미비</SelectItem>
                  <SelectItem value="정산요청">정산요청</SelectItem>
                  <SelectItem value="지급대기">지급대기</SelectItem>
                  <SelectItem value="보류">보류</SelectItem>
                  <SelectItem value="입금완료">입금완료</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <h3 className="font-medium mb-3">{KO.pages.settlement.payoutMemo}</h3>
              <Textarea 
                value={payoutMemo || item.payoutMemo || ''} 
                onChange={(e) => setPayoutMemo(e.target.value)}
                placeholder="메모를 입력하세요..."
                className="min-h-[80px]"
              />
            </div>
          </div>
        </ScrollArea>
        
        <div className="shrink-0 pt-4 border-t space-y-2">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={copyForBank} data-testid="button-copy-bank">
              <Copy className="w-4 h-4 mr-2" />
              {KO.pages.settlement.copyForBank}
            </Button>
            <Button 
              variant="default" 
              className="flex-1 bg-green-600 hover:bg-green-700" 
              onClick={() => onMarkPaid(item)}
              disabled={isMarkingPaid || item.payoutStatus === '입금완료'}
              data-testid="button-mark-paid"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {KO.pages.settlement.markPaid}
            </Button>
          </div>
          {(payoutStatus !== item.payoutStatus || payoutMemo !== (item.payoutMemo || '')) && (
            <Button className="w-full" onClick={handleSave} disabled={updatePayout.isPending}>
              저장
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
