import Layout from "@/components/layout";
import { useCampaign, useUpdateCampaignItem, useAddInfluencersToCampaign, useCampaignContents, useCreateCampaignContent, useUpdateCampaignContent, useDeleteCampaignContent } from "@/hooks/use-campaigns";
import { useInfluencers } from "@/hooks/use-influencers";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useRoute } from "wouter";
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
import { ArrowLeft, CheckCircle2, CircleDollarSign, FileText, Plus, Search, Users, Instagram, Youtube, Twitter, Save, MessageCircle, ExternalLink, Eye, Heart, MessageSquare, Share2, Trash2, Edit3, Image } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { KO } from "@/i18n/ko";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { CampaignLineItem, CampaignContentWithInfluencer } from "@/hooks/use-campaigns";
import { CampaignCommunication } from "@/components/campaign-communication";
import { CampaignOperations } from "@/components/campaign-operations";
import type { CampaignContent } from "@shared/schema";
import { Settings2 } from "lucide-react";

export default function CampaignDetail() {
  const [, params] = useRoute("/campaigns/:id");
  const id = Number(params?.id);
  const { data: campaign, isLoading } = useCampaign(id);
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  const updateItem = useUpdateCampaignItem(id);
  const { toast } = useToast();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedLineItem, setSelectedLineItem] = useState<CampaignLineItem | null>(null);
  
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

  const handleStatusUpdate = (itemId: number, field: string, value: string) => {
    updateItem.mutate({ id: itemId, updates: { [field]: value } }, {
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
      <div className="flex flex-col gap-6">
        <Link href="/campaigns" className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors w-fit" data-testid="link-back">
          <ArrowLeft className="w-4 h-4 mr-1" /> 캠페인 목록으로
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
              <Badge variant="outline" className="text-sm bg-green-50 text-green-700 border-green-200 capitalize">
                {campaign.status === 'active' ? KO.status.active : campaign.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-2 text-lg">클라이언트: {campaign.client}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground mb-1">총 예산</div>
            <div className="text-2xl font-bold font-mono">{campaign.budget?.toLocaleString()}원</div>
            <div className="text-xs text-muted-foreground mt-1">예산 사용률: {budgetUtilization}%</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">인플루언서</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{campaign.items?.length || 0}명</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">계약 완료</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{contractedCount}건</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">지급 완료</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{paidCount}건</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">집행 금액</CardTitle>
              <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSpend.toLocaleString()}원</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="influencers" className="w-full">
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="influencers">인플루언서</TabsTrigger>
            <TabsTrigger value="operations" className="flex items-center gap-1">
              <Settings2 className="w-4 h-4" />
              운영
            </TabsTrigger>
            <TabsTrigger value="communication" className="flex items-center gap-1">
              <MessageCircle className="w-4 h-4" />
              {KO.pages.communication.title}
            </TabsTrigger>
            <TabsTrigger value="content">콘텐츠</TabsTrigger>
            <TabsTrigger value="finance">정산</TabsTrigger>
          </TabsList>
          
          <TabsContent value="influencers">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>참여 인플루언서</CardTitle>
                  <Button size="sm" onClick={() => setIsAddModalOpen(true)} data-testid="button-add-campaign-influencer">
                    <Plus className="w-4 h-4 mr-2" />
                    인플루언서 추가
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
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
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {item.influencer?.name?.substring(0, 2) || 'IN'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{item.influencer?.name || `인플루언서 #${item.influencerId}`}</div>
                              <div className="text-xs text-muted-foreground">{item.influencer?.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.influencer?.accounts?.[0] && (
                            <PlatformIcon p={item.influencer.accounts[0].platform} />
                          )}
                        </TableCell>
                        <TableCell>
                          <Select 
                            defaultValue={item.status || 'contacted'} 
                            onValueChange={(val) => {
                              handleStatusUpdate(item.id, 'status', val);
                            }}
                          >
                            <SelectTrigger className="w-[130px] h-8" onClick={e => e.stopPropagation()}>
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
                          <Badge 
                            variant={item.contractStatus === 'signed' ? 'default' : 'secondary'} 
                            className={item.contractStatus === 'signed' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}
                          >
                            {getContractLabel(item.contractStatus || 'pending')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={item.paymentStatus === 'paid' ? 'default' : 'outline'}
                            className={item.paymentStatus === 'paid' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : ''}
                          >
                            {getPaymentLabel(item.paymentStatus || 'pending')}
                          </Badge>
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
          
          <TabsContent value="operations">
            <CampaignOperations campaignId={id} lineItems={campaign.items || []} />
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

          <TabsContent value="content">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <CardTitle className="text-base md:text-lg">콘텐츠 관리</CardTitle>
                  <Button 
                    size="sm" 
                    onClick={() => {
                      setEditingContent(null);
                      setContentForm({
                        lineItemId: campaign.items?.[0]?.id || 0,
                        influencerId: campaign.items?.[0]?.influencerId || 0,
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
                      setIsContentModalOpen(true);
                    }}
                    data-testid="button-add-content"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    콘텐츠 추가
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {contentsLoading ? (
                  <div className="text-center py-12 text-muted-foreground">{KO.common.loading}</div>
                ) : !contents || contents.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
                    <Image className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>등록된 콘텐츠가 없습니다</p>
                    <p className="text-sm mt-1">콘텐츠를 추가하여 캠페인 성과를 추적하세요</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {contents.map(content => (
                      <Card key={content.id} className="overflow-hidden hover-elevate" data-testid={`card-content-${content.id}`}>
                        <div className="aspect-video bg-muted relative">
                          {content.thumbnailUrl ? (
                            <img src={content.thumbnailUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Image className="w-8 h-8 opacity-30" />
                            </div>
                          )}
                          <Badge className="absolute top-2 left-2" variant="secondary">
                            {content.platform}
                          </Badge>
                        </div>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium truncate">
                              {content.influencer?.name || '인플루언서'}
                            </span>
                            <div className="flex gap-1">
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-7 w-7"
                                onClick={() => window.open(content.contentUrl, '_blank')}
                                data-testid={`button-view-content-${content.id}`}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingContent(content);
                                  setContentForm({
                                    lineItemId: content.lineItemId,
                                    influencerId: content.influencerId,
                                    platform: content.platform,
                                    contentUrl: content.contentUrl,
                                    thumbnailUrl: content.thumbnailUrl || '',
                                    publishedAt: content.publishedAt ? format(new Date(content.publishedAt), 'yyyy-MM-dd') : '',
                                    views: content.views || 0,
                                    likes: content.likes || 0,
                                    comments: content.comments || 0,
                                    shares: content.shares || 0,
                                    engagementRate: content.engagementRate || '',
                                    memo: content.memo || ''
                                  });
                                  setIsContentModalOpen(true);
                                }}
                                data-testid={`button-edit-content-${content.id}`}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm('콘텐츠를 삭제하시겠습니까?')) {
                                    deleteContent.mutate(content.id, {
                                      onSuccess: () => toast({ title: '콘텐츠가 삭제되었습니다.' })
                                    });
                                  }
                                }}
                                data-testid={`button-delete-content-${content.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              <span>{(content.views || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Heart className="w-3 h-3" />
                              <span>{(content.likes || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" />
                              <span>{(content.comments || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Share2 className="w-3 h-3" />
                              <span>{(content.shares || 0).toLocaleString()}</span>
                            </div>
                          </div>
                          {content.publishedAt && (
                            <div className="text-xs text-muted-foreground mt-2">
                              게시: {format(new Date(content.publishedAt), 'yyyy.MM.dd')}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Content Add/Edit Modal */}
            <Dialog open={isContentModalOpen} onOpenChange={setIsContentModalOpen}>
              <DialogContent className="max-w-[95vw] md:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingContent ? '콘텐츠 수정' : '콘텐츠 추가'}</DialogTitle>
                  <DialogDescription>캠페인 콘텐츠 정보를 입력하세요</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">인플루언서</label>
                    <Select 
                      value={String(contentForm.lineItemId)} 
                      onValueChange={v => {
                        const item = campaign.items?.find(i => i.id === parseInt(v));
                        setContentForm({
                          ...contentForm, 
                          lineItemId: parseInt(v), 
                          influencerId: item?.influencerId || 0
                        });
                      }}
                    >
                      <SelectTrigger data-testid="select-content-influencer">
                        <SelectValue placeholder="인플루언서 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {campaign.items?.map(item => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.influencer?.name || `인플루언서 #${item.influencerId}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">플랫폼</label>
                      <Select value={contentForm.platform} onValueChange={v => setContentForm({...contentForm, platform: v})}>
                        <SelectTrigger data-testid="select-content-platform">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="IG">Instagram</SelectItem>
                          <SelectItem value="YT">YouTube</SelectItem>
                          <SelectItem value="TikTok">TikTok</SelectItem>
                          <SelectItem value="X">X (Twitter)</SelectItem>
                          <SelectItem value="Blog">네이버 블로그</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">게시일</label>
                      <Input 
                        type="date" 
                        value={contentForm.publishedAt} 
                        onChange={e => setContentForm({...contentForm, publishedAt: e.target.value})}
                        data-testid="input-content-published-at"
                      />
                    </div>
                  </div>
                  
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">콘텐츠 URL</label>
                    <Input 
                      placeholder="https://instagram.com/p/..." 
                      value={contentForm.contentUrl}
                      onChange={e => setContentForm({...contentForm, contentUrl: e.target.value})}
                      data-testid="input-content-url"
                    />
                  </div>
                  
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">썸네일 URL (선택)</label>
                    <Input 
                      placeholder="https://..." 
                      value={contentForm.thumbnailUrl}
                      onChange={e => setContentForm({...contentForm, thumbnailUrl: e.target.value})}
                      data-testid="input-content-thumbnail"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="grid gap-2">
                      <label className="text-xs font-medium">조회수</label>
                      <Input 
                        type="number" 
                        value={contentForm.views}
                        onChange={e => setContentForm({...contentForm, views: parseInt(e.target.value) || 0})}
                        data-testid="input-content-views"
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs font-medium">좋아요</label>
                      <Input 
                        type="number" 
                        value={contentForm.likes}
                        onChange={e => setContentForm({...contentForm, likes: parseInt(e.target.value) || 0})}
                        data-testid="input-content-likes"
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs font-medium">댓글</label>
                      <Input 
                        type="number" 
                        value={contentForm.comments}
                        onChange={e => setContentForm({...contentForm, comments: parseInt(e.target.value) || 0})}
                        data-testid="input-content-comments"
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs font-medium">공유</label>
                      <Input 
                        type="number" 
                        value={contentForm.shares}
                        onChange={e => setContentForm({...contentForm, shares: parseInt(e.target.value) || 0})}
                        data-testid="input-content-shares"
                      />
                    </div>
                  </div>
                  
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">참여율 (선택)</label>
                    <Input 
                      placeholder="3.5%" 
                      value={contentForm.engagementRate}
                      onChange={e => setContentForm({...contentForm, engagementRate: e.target.value})}
                      data-testid="input-content-engagement"
                    />
                  </div>
                  
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">메모 (선택)</label>
                    <Textarea 
                      placeholder="콘텐츠 관련 메모..."
                      value={contentForm.memo}
                      onChange={e => setContentForm({...contentForm, memo: e.target.value})}
                      data-testid="input-content-memo"
                    />
                  </div>
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsContentModalOpen(false)}>취소</Button>
                  <Button 
                    onClick={() => {
                      if (!contentForm.contentUrl) {
                        toast({ title: '콘텐츠 URL을 입력하세요', variant: 'destructive' });
                        return;
                      }
                      if (!contentForm.lineItemId) {
                        toast({ title: '인플루언서를 선택하세요', variant: 'destructive' });
                        return;
                      }
                      
                      const data = {
                        lineItemId: contentForm.lineItemId,
                        influencerId: contentForm.influencerId,
                        platform: contentForm.platform,
                        contentUrl: contentForm.contentUrl,
                        thumbnailUrl: contentForm.thumbnailUrl || undefined,
                        publishedAt: contentForm.publishedAt ? new Date(contentForm.publishedAt) : undefined,
                        views: contentForm.views,
                        likes: contentForm.likes,
                        comments: contentForm.comments,
                        shares: contentForm.shares,
                        engagementRate: contentForm.engagementRate || undefined,
                        memo: contentForm.memo || undefined
                      };
                      
                      if (editingContent) {
                        updateContent.mutate({ id: editingContent.id, ...data }, {
                          onSuccess: () => {
                            toast({ title: '콘텐츠가 수정되었습니다' });
                            setIsContentModalOpen(false);
                          }
                        });
                      } else {
                        createContent.mutate(data, {
                          onSuccess: () => {
                            toast({ title: '콘텐츠가 추가되었습니다' });
                            setIsContentModalOpen(false);
                          }
                        });
                      }
                    }}
                    disabled={createContent.isPending || updateContent.isPending}
                    data-testid="button-save-content"
                  >
                    {createContent.isPending || updateContent.isPending ? '저장 중...' : '저장'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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
                    <div className="text-2xl font-bold">
                      {(campaign.items?.filter(i => i.paymentStatus === 'paid').reduce((a, b) => a + (b.payAmount || 0), 0) || 0).toLocaleString()}원
                    </div>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">지급 대기</div>
                    <div className="text-2xl font-bold text-orange-600">
                      {(campaign.items?.filter(i => i.paymentStatus !== 'paid').reduce((a, b) => a + (b.payAmount || 0), 0) || 0).toLocaleString()}원
                    </div>
                  </div>
                </div>
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
