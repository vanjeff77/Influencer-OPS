import Layout from "@/components/layout";
import { useCampaign, useUpdateCampaign, useUpdateCampaignItem, useDeleteCampaignItem, useAddInfluencersToCampaign, useCampaignContents, useCreateCampaignContent, useUpdateCampaignContent, useDeleteCampaignContent, useDeleteCampaign } from "@/hooks/use-campaigns";
import { useInfluencers } from "@/hooks/use-influencers";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, CheckCircle2, CircleDollarSign, FileText, Plus, Search, Users, Instagram, Youtube, Twitter, Save, MessageCircle, ExternalLink, Eye, Heart, MessageSquare, Share2, Trash2, Edit3, Image, Pencil } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { KO } from "@/i18n/ko";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { CampaignLineItem, CampaignContentWithInfluencer } from "@/hooks/use-campaigns";
import { CampaignCommunication } from "@/components/campaign-communication";
import { CampaignOperations } from "@/components/campaign-operations";
import { CampaignContents } from "@/components/campaign-contents";
import type { CampaignContent } from "@shared/schema";
import { Settings2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface Client {
  id: number;
  workspaceId: number;
  name: string;
}

export default function CampaignDetail() {
  const [, params] = useRoute("/campaigns/:id");
  const id = Number(params?.id);
  const { data: campaign, isLoading } = useCampaign(id);
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  const updateItem = useUpdateCampaignItem(id);
  const updateCampaign = useUpdateCampaign();
  const { toast } = useToast();

  const { data: clients } = useQuery<Client[]>({
    queryKey: ['/api/clients', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/clients?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: !!workspaceId,
  });

  const [, navigate] = useLocation();
  const deleteCampaign = useDeleteCampaign();
  const deleteItem = useDeleteCampaignItem(id);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedLineItem, setSelectedLineItem] = useState<CampaignLineItem | null>(null);
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [isDeleteCampaignOpen, setIsDeleteCampaignOpen] = useState(false);
  const [isDeleteInfluencerOpen, setIsDeleteInfluencerOpen] = useState(false);
  const [selectedInfluencerIds, setSelectedInfluencerIds] = useState<Set<number>>(new Set());

  const handleClientChange = () => {
    if (!selectedClientId) return;
    const selectedClient = clients?.find(c => c.id === parseInt(selectedClientId));
    updateCampaign.mutate({
      id,
      data: {
        clientId: parseInt(selectedClientId),
        client: selectedClient?.name || ""
      }
    }, {
      onSuccess: () => {
        toast({ title: "클라이언트가 변경되었습니다." });
        setIsEditingClient(false);
        setSelectedClientId("");
      },
      onError: () => {
        toast({ variant: "destructive", title: "변경 실패" });
      }
    });
  };

  const handleStatusChange = (newStatus: string) => {
    updateCampaign.mutate({
      id,
      data: { status: newStatus }
    }, {
      onSuccess: () => {
        toast({ title: "캠페인 상태가 변경되었습니다." });
        setIsEditingStatus(false);
      },
      onError: () => {
        toast({ variant: "destructive", title: "변경 실패" });
      }
    });
  };

  const handleDeleteCampaign = () => {
    deleteCampaign.mutate(id, {
      onSuccess: () => {
        toast({ title: "캠페인이 삭제되었습니다." });
        navigate("/campaigns");
      },
      onError: () => {
        toast({ variant: "destructive", title: "삭제 실패", description: "캠페인 삭제 중 오류가 발생했습니다." });
      }
    });
  };

  const handleDeleteSelectedInfluencers = async () => {
    const itemsToDelete = campaign?.items?.filter(item => selectedInfluencerIds.has(item.id)) || [];
    let successCount = 0;
    for (const item of itemsToDelete) {
      try {
        await new Promise<void>((resolve, reject) => {
          deleteItem.mutate(item.id, {
            onSuccess: () => { successCount++; resolve(); },
            onError: (err) => reject(err)
          });
        });
      } catch (e) {
        // continue with others
      }
    }
    setSelectedInfluencerIds(new Set());
    setIsDeleteInfluencerOpen(false);
    toast({ title: `${successCount}명의 인플루언서가 캠페인에서 제외되었습니다.` });
  };

  const toggleInfluencerSelection = (itemId: number) => {
    const newSelected = new Set(selectedInfluencerIds);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedInfluencerIds(newSelected);
  };

  const selectAllInfluencers = () => {
    if (!campaign?.items) return;
    if (selectedInfluencerIds.size === campaign.items.length) {
      setSelectedInfluencerIds(new Set());
    } else {
      setSelectedInfluencerIds(new Set(campaign.items.map(i => i.id)));
    }
  };
  
  // Content tab state
  const { data: contents, isLoading: contentsLoading } = useCampaignContents(id);
  const createContent = useCreateCampaignContent(id);
  const updateContent = useUpdateCampaignContent(id);
  const deleteContent = useDeleteCampaignContent(id);
  const [isContentModalOpen, setIsContentModalOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<CampaignContentWithInfluencer | null>(null);
  const [contentForm, setContentForm] = useState({
    lineItemId: 0,
    influencerId: 0,
    platform: 'IG',
    contentUrl: '',
    thumbnailUrl: '',
    publishedAt: '',
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    engagementRate: '',
    memo: ''
  });

  if (isLoading) return <Layout><div className="flex items-center justify-center h-64">{KO.common.loading}</div></Layout>;
  if (!campaign) return <Layout><div className="flex items-center justify-center h-64">캠페인을 찾을 수 없습니다</div></Layout>;

  const totalSpend = campaign.items?.reduce((acc, item) => acc + (item.payAmount || 0), 0) || 0;
  const budgetUtilization = campaign.budget ? Math.round((totalSpend / campaign.budget) * 100) : 0;
  const contractedCount = campaign.items?.filter(i => i.contractStatus === 'signed').length || 0;
  const paidCount = campaign.items?.filter(i => i.paymentStatus === 'paid').length || 0;

  const handleStatusUpdate = (itemId: number, field: string, value: string | number | Date | null) => {
    const item = campaign.items?.find(i => i.id === itemId);
    const updates: Record<string, any> = { [field]: value };
    
    if (field === 'payoutAmountSupply' || field === 'payoutVat') {
      const supply = field === 'payoutAmountSupply' ? (value as number) : (item?.payoutAmountSupply || 0);
      const vat = field === 'payoutVat' ? (value as number) : (item?.payoutVat || 0);
      updates.payoutTotal = supply + vat;
    }
    
    updateItem.mutate({ id: itemId, updates }, {
      onSuccess: () => toast({ title: "상태가 업데이트되었습니다." })
    });
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'contacted': return '연락 완료';
      case 'negotiated': return '협상 중';
      case 'contracted': return '계약 완료';
      case 'posted': return '게시 완료';
      default: return status;
    }
  };

  const getContractLabel = (status: string) => {
    switch(status) {
      case 'pending': return '대기 중';
      case 'sent': return '발송됨';
      case 'signed': return '서명 완료';
      default: return status;
    }
  };

  const getPaymentLabel = (status: string) => {
    switch(status) {
      case 'pending': return '대기 중';
      case 'invoiced': return '청구됨';
      case 'paid': return '지급 완료';
      default: return status;
    }
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
      <div className="flex flex-col gap-3">
        <Link href="/campaigns" className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors w-fit" data-testid="link-back">
          <ArrowLeft className="w-4 h-4 mr-1" /> 캠페인 목록으로
        </Link>

        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
              {isEditingStatus ? (
                <Select value={campaign.status || "대기중"} onValueChange={(v) => handleStatusChange(v)}>
                  <SelectTrigger className="w-[120px] h-8" data-testid="select-campaign-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="대기중">대기중</SelectItem>
                    <SelectItem value="진행중">진행중</SelectItem>
                    <SelectItem value="완료">완료</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge 
                  variant="outline" 
                  className={`text-sm cursor-pointer ${
                    campaign.status === '진행중' ? 'bg-green-50 text-green-700 border-green-200' :
                    campaign.status === '완료' ? 'bg-gray-100 text-gray-600 border-gray-300' :
                    'bg-yellow-50 text-yellow-700 border-yellow-200'
                  }`}
                  onClick={() => setIsEditingStatus(true)}
                  data-testid="badge-campaign-status"
                >
                  {campaign.status || '대기중'}
                  <Pencil className="w-3 h-3 ml-1" />
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {isEditingClient ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">클라이언트:</span>
                  <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                    <SelectTrigger className="w-[160px] h-7 text-sm" data-testid="select-edit-client">
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
                  <Button size="sm" className="h-7" onClick={handleClientChange} disabled={!selectedClientId || updateCampaign.isPending} data-testid="button-save-client">
                    <Save className="w-3 h-3 mr-1" />
                    저장
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => { setIsEditingClient(false); setSelectedClientId(""); }} data-testid="button-cancel-client">
                    취소
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm">클라이언트: {campaign.client || "미설정"}</p>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsEditingClient(true)} data-testid="button-edit-client">
                    <Pencil className="w-3 h-3" />
                  </Button>
                </>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">인플루언서</span>
                <span className="font-semibold">{campaign.items?.length || 0}명</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">계약</span>
                <span className="font-semibold">{contractedCount}건</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">지급</span>
                <span className="font-semibold">{paidCount}건</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CircleDollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">집행</span>
                <span className="font-semibold">{totalSpend.toLocaleString()}원</span>
              </div>
            </div>
            <div className="hidden md:block h-8 w-px bg-border" />
            <div className="text-right">
              <div className="text-xs text-muted-foreground">총 예산</div>
              <div className="text-lg font-bold font-mono">{campaign.budget?.toLocaleString()}원</div>
              <div className="text-xs text-muted-foreground">사용률: {budgetUtilization}%</div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-destructive border-destructive/50 h-8"
              onClick={() => setIsDeleteCampaignOpen(true)}
              data-testid="button-delete-campaign"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              삭제
            </Button>
          </div>
        </div>

        <Tabs defaultValue="influencers" className="w-full">
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="influencers">선정</TabsTrigger>
            <TabsTrigger value="communication" className="flex items-center gap-1">
              <MessageCircle className="w-4 h-4" />
              {KO.pages.communication.title}
            </TabsTrigger>
            <TabsTrigger value="operations" className="flex items-center gap-1">
              <Settings2 className="w-4 h-4" />
              운영
            </TabsTrigger>
            <TabsTrigger value="content">콘텐츠</TabsTrigger>
            <TabsTrigger value="finance">정산</TabsTrigger>
          </TabsList>
          
          <TabsContent value="influencers">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>참여 인플루언서</CardTitle>
                  <div className="flex items-center gap-2">
                    {selectedInfluencerIds.size > 0 && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="text-destructive border-destructive/50"
                        onClick={() => setIsDeleteInfluencerOpen(true)} 
                        data-testid="button-remove-campaign-influencer"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {selectedInfluencerIds.size}명 제외
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setIsAddModalOpen(true)} data-testid="button-add-campaign-influencer">
                      <Plus className="w-4 h-4 mr-2" />
                      인플루언서 추가
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox 
                          checked={campaign.items && campaign.items.length > 0 && selectedInfluencerIds.size === campaign.items.length}
                          onCheckedChange={selectAllInfluencers}
                          data-testid="checkbox-select-all-influencers"
                        />
                      </TableHead>
                      <TableHead>인플루언서</TableHead>
                      <TableHead>플랫폼</TableHead>
                      <TableHead>진행 상태</TableHead>
                      <TableHead>계약</TableHead>
                      <TableHead>지급</TableHead>
                      <TableHead className="text-right">금액</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaign.items?.map((item) => (
                      <TableRow 
                        key={item.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedLineItem(item)}
                        data-testid={`row-campaign-item-${item.id}`}
                      >
                        <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox 
                            checked={selectedInfluencerIds.has(item.id)}
                            onCheckedChange={() => toggleInfluencerSelection(item.id)}
                            data-testid={`checkbox-influencer-${item.id}`}
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div>
                            <div className="font-medium">{item.influencer?.name || `인플루언서 #${item.influencerId}`}</div>
                            <div className="text-xs text-muted-foreground">{item.influencer?.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.influencer?.accounts?.[0] && (
                            <PlatformIcon p={item.influencer.accounts[0].platform} />
                          )}
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={item.status || 'contacted'} 
                            onValueChange={(val) => {
                              handleStatusUpdate(item.id, 'status', val);
                            }}
                          >
                            <SelectTrigger 
                              className={`w-[120px] h-7 text-xs border-0 ${
                                item.status === 'posted' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                item.status === 'contracted' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                item.status === 'negotiated' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                              }`} 
                              onClick={e => e.stopPropagation()}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="contacted">연락 완료</SelectItem>
                              <SelectItem value="negotiated">협상 중</SelectItem>
                              <SelectItem value="contracted">계약 완료</SelectItem>
                              <SelectItem value="posted">게시 완료</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={item.contractStatus || 'pending'} 
                            onValueChange={(val) => {
                              handleStatusUpdate(item.id, 'contractStatus', val);
                            }}
                          >
                            <SelectTrigger 
                              className={`w-[100px] h-7 text-xs border-0 ${
                                item.contractStatus === 'signed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                item.contractStatus === 'sent' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                              }`} 
                              onClick={e => e.stopPropagation()}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">대기 중</SelectItem>
                              <SelectItem value="sent">발송됨</SelectItem>
                              <SelectItem value="signed">서명 완료</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={item.paymentStatus || 'pending'} 
                            onValueChange={(val) => {
                              handleStatusUpdate(item.id, 'paymentStatus', val);
                            }}
                          >
                            <SelectTrigger 
                              className={`w-[100px] h-7 text-xs border-0 ${
                                item.paymentStatus === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                item.paymentStatus === 'invoiced' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' :
                                'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                              }`} 
                              onClick={e => e.stopPropagation()}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">대기 중</SelectItem>
                              <SelectItem value="invoiced">청구됨</SelectItem>
                              <SelectItem value="paid">지급 완료</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.payAmount?.toLocaleString()}원
                        </TableCell>
                      </TableRow>
                    ))}
                    {!campaign.items?.length && (
                      <TableRow>
                         <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                           이 캠페인에 아직 인플루언서가 없습니다.
                         </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="communication">
            <CampaignCommunication 
              campaignId={id}
              campaignName={campaign.name}
              workspaceId={workspaceId || 1}
              lineItems={campaign.items?.map(item => ({
                id: item.id,
                campaignId: item.campaignId,
                influencerId: item.influencerId,
                status: item.status,
                firstContactCompleted: item.firstContactCompleted,
                influencer: item.influencer
              })) || []}
            />
          </TabsContent>
          
          <TabsContent value="operations">
            <CampaignOperations campaignId={id} lineItems={campaign.items || []} />
          </TabsContent>

          <TabsContent value="content">
            <CampaignContents 
              campaignId={id} 
              lineItems={campaign.items?.map(item => ({
                ...item,
                firstContactCompleted: item.firstContactCompleted,
                influencer: item.influencer
              })) || []}
            />
          </TabsContent>

          <TabsContent value="finance">
            <Card>
              <CardHeader>
                <CardTitle>정산 현황</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">총 집행액</div>
                    <div className="text-2xl font-bold">{totalSpend.toLocaleString()}원</div>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">지급 완료</div>
                    <div className="text-2xl font-bold text-green-600">
                      {(campaign.items?.filter(i => i.payoutStatus === '지급완료').reduce((a, b) => a + ((b.payoutAmountSupply || 0) + (b.payoutVat || 0)), 0) || 0).toLocaleString()}원
                    </div>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">지급 대기</div>
                    <div className="text-2xl font-bold text-orange-600">
                      {(campaign.items?.filter(i => i.payoutStatus !== '지급완료').reduce((a, b) => a + ((b.payoutAmountSupply || 0) + (b.payoutVat || 0)), 0) || 0).toLocaleString()}원
                    </div>
                  </div>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>인플루언서</TableHead>
                      <TableHead>정산상태</TableHead>
                      <TableHead className="text-right">공급가</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-right">총액</TableHead>
                      <TableHead>지급예정일</TableHead>
                      <TableHead>메모</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaign.items?.map((item) => (
                        <TableRow key={item.id} data-testid={`row-settlement-${item.id}`}>
                          <TableCell className="py-1.5">
                            <div className="font-medium text-sm">{item.influencer?.name || '-'}</div>
                          </TableCell>
                          <TableCell>
                            <Select 
                              value={item.payoutStatus || "정산정보미비"} 
                              onValueChange={(val) => handleStatusUpdate(item.id, 'payoutStatus', val)}
                            >
                              <SelectTrigger 
                                className={`w-[110px] h-7 text-xs border-0 ${
                                  item.payoutStatus === '지급완료' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                  item.payoutStatus === '지급대기' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                  item.payoutStatus === '보류' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                  'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                                }`}
                                data-testid={`select-payout-status-${item.id}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="정산정보미비" data-testid={`option-정산정보미비-${item.id}`}>정산정보미비</SelectItem>
                                <SelectItem value="증빙요청" data-testid={`option-증빙요청-${item.id}`}>증빙요청</SelectItem>
                                <SelectItem value="증빙수령" data-testid={`option-증빙수령-${item.id}`}>증빙수령</SelectItem>
                                <SelectItem value="지급대기" data-testid={`option-지급대기-${item.id}`}>지급대기</SelectItem>
                                <SelectItem value="지급완료" data-testid={`option-지급완료-${item.id}`}>지급완료</SelectItem>
                                <SelectItem value="보류" data-testid={`option-보류-${item.id}`}>보류</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input 
                              type="number"
                              className="w-24 h-7 text-xs text-right"
                              key={`supply-${item.id}-${item.payoutAmountSupply}`}
                              defaultValue={item.payoutAmountSupply || ""}
                              placeholder="0"
                              onBlur={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                if (val !== (item.payoutAmountSupply || 0)) {
                                  handleStatusUpdate(item.id, 'payoutAmountSupply', val);
                                }
                              }}
                              data-testid={`input-supply-${item.id}`}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input 
                              type="number"
                              className="w-20 h-7 text-xs text-right"
                              key={`vat-${item.id}-${item.payoutVat}`}
                              defaultValue={item.payoutVat || ""}
                              placeholder="0"
                              onBlur={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                if (val !== (item.payoutVat || 0)) {
                                  handleStatusUpdate(item.id, 'payoutVat', val);
                                }
                              }}
                              data-testid={`input-vat-${item.id}`}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {((item.payoutAmountSupply || 0) + (item.payoutVat || 0)).toLocaleString()}원
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="date"
                              className="w-28 h-7 text-xs"
                              key={`due-${item.id}-${item.payoutDueAt}`}
                              defaultValue={item.payoutDueAt ? new Date(item.payoutDueAt).toISOString().split('T')[0] : ""}
                              onBlur={(e) => {
                                const oldDate = item.payoutDueAt ? new Date(item.payoutDueAt).toISOString().split('T')[0] : "";
                                if (e.target.value !== oldDate) {
                                  handleStatusUpdate(item.id, 'payoutDueAt', e.target.value ? new Date(e.target.value).toISOString() : null);
                                }
                              }}
                              data-testid={`input-due-${item.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              className="w-32 h-7 text-xs"
                              key={`memo-${item.id}-${item.payoutMemo}`}
                              defaultValue={item.payoutMemo || ""}
                              placeholder="메모"
                              onBlur={(e) => {
                                if (e.target.value !== (item.payoutMemo || '')) {
                                  handleStatusUpdate(item.id, 'payoutMemo', e.target.value);
                                }
                              }}
                              data-testid={`input-memo-${item.id}`}
                            />
                          </TableCell>
                        </TableRow>
                    ))}
                    {(!campaign.items || campaign.items.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          등록된 인플루언서가 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Influencer Modal */}
      <AddInfluencerModal 
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        campaignId={id}
        workspaceId={workspaceId || 0}
        existingInfluencerIds={campaign.items?.map(i => i.influencerId) || []}
      />

      {/* Line Item Detail Drawer */}
      <LineItemDetailDrawer 
        item={selectedLineItem}
        onClose={() => setSelectedLineItem(null)}
        onUpdate={handleStatusUpdate}
      />

      {/* Delete Campaign Confirmation Dialog */}
      <Dialog open={isDeleteCampaignOpen} onOpenChange={setIsDeleteCampaignOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>캠페인 삭제</DialogTitle>
            <DialogDescription>
              "{campaign.name}" 캠페인을 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며 캠페인에 포함된 모든 인플루언서 정보도 함께 삭제됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsDeleteCampaignOpen(false)} data-testid="button-cancel-delete-campaign">
              취소
            </Button>
            <Button variant="destructive" onClick={handleDeleteCampaign} disabled={deleteCampaign.isPending} data-testid="button-confirm-delete-campaign">
              {deleteCampaign.isPending ? "삭제 중..." : "삭제"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Influencer from Campaign Confirmation Dialog */}
      <Dialog open={isDeleteInfluencerOpen} onOpenChange={setIsDeleteInfluencerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>인플루언서 제외</DialogTitle>
            <DialogDescription>
              선택한 {selectedInfluencerIds.size}명의 인플루언서를 캠페인에서 제외하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsDeleteInfluencerOpen(false)} data-testid="button-cancel-remove-influencer">
              취소
            </Button>
            <Button variant="destructive" onClick={handleDeleteSelectedInfluencers} disabled={deleteItem.isPending} data-testid="button-confirm-remove-influencer">
              {deleteItem.isPending ? "처리 중..." : "제외"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function AddInfluencerModal({ open, onOpenChange, campaignId, workspaceId, existingInfluencerIds }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: number;
  workspaceId: number;
  existingInfluencerIds: number[];
}) {
  const { data: influencers } = useInfluencers(workspaceId);
  const addInfluencers = useAddInfluencersToCampaign(campaignId);
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const availableInfluencers = influencers?.filter(i => !existingInfluencerIds.includes(i.id)) || [];
  const filteredInfluencers = availableInfluencers.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase()) || 
    i.email?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelection = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleAdd = () => {
    if (selectedIds.size === 0) return;
    addInfluencers.mutate(Array.from(selectedIds), {
      onSuccess: () => {
        toast({ title: "인플루언서가 추가되었습니다." });
        setSelectedIds(new Set());
        onOpenChange(false);
      },
      onError: () => toast({ variant: "destructive", title: "추가 실패" })
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>인플루언서 추가</DialogTitle>
          <DialogDescription>캠페인에 추가할 인플루언서를 선택하세요.</DialogDescription>
        </DialogHeader>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="검색..." 
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-influencers"
          />
        </div>

        <ScrollArea className="h-[300px] border rounded-lg">
          <div className="p-2 space-y-1">
            {filteredInfluencers.map(inf => (
              <div 
                key={inf.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors flex items-center gap-3 ${selectedIds.has(inf.id) ? 'bg-primary/10 border border-primary' : 'hover:bg-muted border border-transparent'}`}
                onClick={() => toggleSelection(inf.id)}
                data-testid={`add-influencer-option-${inf.id}`}
              >
                <Checkbox checked={selectedIds.has(inf.id)} />
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{inf.name.substring(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{inf.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{inf.email}</div>
                </div>
              </div>
            ))}
            {filteredInfluencers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {availableInfluencers.length === 0 ? "모든 인플루언서가 이미 추가되었습니다." : "검색 결과가 없습니다."}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">{selectedIds.size}명 선택됨</span>
          <Button onClick={handleAdd} disabled={addInfluencers.isPending || selectedIds.size === 0} data-testid="button-confirm-add-influencers">
            {addInfluencers.isPending ? "추가 중..." : "추가"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LineItemDetailDrawer({ item, onClose, onUpdate }: {
  item: CampaignLineItem | null;
  onClose: () => void;
  onUpdate: (itemId: number, field: string, value: string) => void;
}) {
  const updateItem = useUpdateCampaignItem();
  const { toast } = useToast();
  
  const [payAmount, setPayAmount] = useState("");

  if (!item) return null;

  const handleSaveAmount = () => {
    updateItem.mutate({ id: item.id, updates: { payAmount: parseInt(payAmount) } }, {
      onSuccess: () => toast({ title: "금액이 저장되었습니다." })
    });
  };

  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback>{item.influencer?.name?.substring(0, 2) || 'IN'}</AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle>{item.influencer?.name || `인플루언서 #${item.influencerId}`}</SheetTitle>
              <div className="text-sm text-muted-foreground">{item.influencer?.email}</div>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="overview">개요</TabsTrigger>
            <TabsTrigger value="contract">계약</TabsTrigger>
            <TabsTrigger value="settlement">정산</TabsTrigger>
            <TabsTrigger value="content">콘텐츠</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium">진행 상태</label>
                <Select 
                  value={item.status || 'contacted'} 
                  onValueChange={(val) => onUpdate(item.id, 'status', val)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contacted">연락 완료</SelectItem>
                    <SelectItem value="negotiated">협상 중</SelectItem>
                    <SelectItem value="contracted">계약 완료</SelectItem>
                    <SelectItem value="posted">게시 완료</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">메모</label>
                <Textarea placeholder="이 라인아이템에 대한 메모..." className="min-h-[100px]" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="contract" className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium">계약 상태</label>
              <Select 
                value={item.contractStatus || 'pending'} 
                onValueChange={(val) => onUpdate(item.id, 'contractStatus', val)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">대기 중</SelectItem>
                  <SelectItem value="sent">발송됨</SelectItem>
                  <SelectItem value="signed">서명 완료</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">계약서 업로드</label>
              <Input type="file" className="mt-1" />
            </div>
          </TabsContent>

          <TabsContent value="settlement" className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium">지급 상태</label>
              <Select 
                value={item.paymentStatus || 'pending'} 
                onValueChange={(val) => onUpdate(item.id, 'paymentStatus', val)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">대기 중</SelectItem>
                  <SelectItem value="invoiced">청구됨</SelectItem>
                  <SelectItem value="paid">지급 완료</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">금액 (원)</label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  value={payAmount || item.payAmount?.toString() || ''} 
                  onChange={e => setPayAmount(e.target.value)}
                  placeholder="500000"
                />
                <Button onClick={handleSaveAmount} disabled={updateItem.isPending}>
                  <Save className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">세금계산서 업로드</label>
              <Input type="file" className="mt-1" />
            </div>
          </TabsContent>

          <TabsContent value="content" className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium">콘텐츠 링크</label>
              <Input placeholder="https://instagram.com/p/..." defaultValue={item.contentLink || ''} />
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
