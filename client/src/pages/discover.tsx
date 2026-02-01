import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useInfluencers, useCreateInfluencer, useInfluencer, useUpdateInfluencer, useAddContent, useSaveToGroup, useAssignToCampaign } from "@/hooks/use-influencers";
import { useGroups } from "@/hooks/use-groups";
import { useCampaigns } from "@/hooks/use-campaigns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect, useMemo } from "react";
import { Search, Plus, Instagram, Youtube, Twitter, X, Users, Megaphone, Save, Clock, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KO } from "@/i18n/ko";
import { format } from "date-fns";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { CampaignInfluencer } from "@shared/schema";

export default function Discover() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("");
  const { data: influencers, isLoading } = useInfluencers(workspaceId || 0, { search, platform: platformFilter || undefined });
  const { data: campaigns } = useCampaigns(workspaceId || 0);
  const createInfluencer = useCreateInfluencer(workspaceId || 0);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchParams = useSearch();

  const { data: allCampaignItems } = useQuery<CampaignInfluencer[]>({
    queryKey: ['/api/campaign-influencers', workspaceId],
    enabled: !!workspaceId
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<number | null>(null);
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [newInfluencer, setNewInfluencer] = useState({ 
    name: "", 
    email: "", 
    accounts: [{ platform: "IG", handle: "" }] 
  });
  
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const selected = params.get('selected');
    if (selected) {
      setSelectedInfluencerId(parseInt(selected));
    }
  }, [searchParams]);

  const influencerCampaignData = useMemo(() => {
    if (!allCampaignItems || !campaigns) return new Map();
    
    const dataMap = new Map<number, { 
      campaigns: { id: number; name: string; client: string; status: string }[];
      latestStatus: string;
      totalCampaigns: number;
      activeCampaigns: number;
    }>();
    
    allCampaignItems.forEach(item => {
      const campaign = campaigns.find(c => c.id === item.campaignId);
      if (!campaign) return;
      
      const existing = dataMap.get(item.influencerId) || { 
        campaigns: [], 
        latestStatus: '', 
        totalCampaigns: 0, 
        activeCampaigns: 0 
      };
      
      existing.campaigns.push({
        id: campaign.id,
        name: campaign.name,
        client: campaign.client || '',
        status: item.status || 'contacted'
      });
      existing.totalCampaigns++;
      if (item.status !== 'paid') {
        existing.activeCampaigns++;
      }
      existing.latestStatus = item.status || 'contacted';
      
      dataMap.set(item.influencerId, existing);
    });
    
    return dataMap;
  }, [allCampaignItems, campaigns]);

  const handleInfluencerClick = (id: number) => {
    setSelectedInfluencerId(id);
    setLocation(`/discover?selected=${id}`);
  };

  const handleCloseDetail = () => {
    setSelectedInfluencerId(null);
    setLocation('/discover');
  };

  const toggleSelection = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (influencers) {
      if (selectedIds.size === influencers.length) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(influencers.map(i => i.id)));
      }
    }
  };

  const platformUrlMap: Record<string, string> = {
    IG: 'instagram.com',
    YT: 'youtube.com/@',
    TikTok: 'tiktok.com/@',
    X: 'x.com',
    Blog: 'blog.naver.com',
  };

  const handleCreate = () => {
    if (!newInfluencer.name) return;
    const validAccounts = newInfluencer.accounts
      .filter(acc => acc.handle.trim())
      .map(acc => ({
        platform: acc.platform,
        handle: acc.handle,
        url: `https://${platformUrlMap[acc.platform] || 'example.com'}/${acc.handle}`,
        verified: false
      }));
    createInfluencer.mutate({
      name: newInfluencer.name,
      email: newInfluencer.email,
      accounts: validAccounts
    }, {
      onSuccess: () => {
        setIsAddOpen(false);
        setNewInfluencer({ name: "", email: "", accounts: [{ platform: "IG", handle: "" }] });
        toast({ title: "인플루언서가 추가되었습니다." });
      }
    });
  };

  const formatFollowers = (count: number | null | undefined) => {
    if (!count) return "-";
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'contacted': return '연락 완료';
      case 'negotiated': return '협상 중';
      case 'contracted': return '계약 완료';
      case 'posted': return '게시 완료';
      case 'paid': return '정산 완료';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'contacted': return 'bg-gray-100 text-gray-700';
      case 'negotiated': return 'bg-yellow-100 text-yellow-700';
      case 'contracted': return 'bg-blue-100 text-blue-700';
      case 'posted': return 'bg-green-100 text-green-700';
      case 'paid': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const PlatformIcon = ({ p }: { p: string }) => {
    switch(p) {
      case 'IG': return <Instagram className="w-3 h-3 text-pink-600" />;
      case 'YT': return <Youtube className="w-3 h-3 text-red-600" />;
      case 'X': return <Twitter className="w-3 h-3 text-blue-400" />;
      default: return <span className="text-[10px] font-bold">{p}</span>;
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-3 md:gap-4 h-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4">
          <div>
            <h1 className="text-lg md:text-2xl font-bold tracking-tight">{KO.pages.discover.title}</h1>
            <p className="text-xs md:text-sm text-muted-foreground">{KO.pages.discover.subtitle}</p>
          </div>
          
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="text-xs md:text-sm h-7 md:h-8" data-testid="button-add-influencer">
                <Plus className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                {KO.pages.discover.addInfluencer}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] md:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base md:text-lg">{KO.pages.discover.addNewInfluencer}</DialogTitle>
                <DialogDescription className="text-xs md:text-sm">새로운 인플루언서 정보를 입력하세요.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:gap-4 py-3 md:py-4">
                <div className="grid gap-1.5 md:gap-2">
                  <label className="text-xs md:text-sm">{KO.pages.discover.name}</label>
                  <Input className="h-8 md:h-10 text-sm" value={newInfluencer.name} onChange={e => setNewInfluencer({...newInfluencer, name: e.target.value})} placeholder="홍길동" data-testid="input-influencer-name" />
                </div>
                <div className="grid gap-1.5 md:gap-2">
                  <label className="text-xs md:text-sm">{KO.pages.discover.email}</label>
                  <Input className="h-8 md:h-10 text-sm" value={newInfluencer.email} onChange={e => setNewInfluencer({...newInfluencer, email: e.target.value})} placeholder="influencer@example.com" data-testid="input-influencer-email" />
                </div>
                
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs md:text-sm font-medium">플랫폼 계정</label>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      className="h-6 text-xs"
                      onClick={() => setNewInfluencer({
                        ...newInfluencer, 
                        accounts: [...newInfluencer.accounts, { platform: "IG", handle: "" }]
                      })}
                      data-testid="button-add-platform"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      플랫폼 추가
                    </Button>
                  </div>
                  
                  {newInfluencer.accounts.map((account, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <Select 
                          value={account.platform} 
                          onValueChange={v => {
                            const newAccounts = [...newInfluencer.accounts];
                            newAccounts[index] = { ...newAccounts[index], platform: v };
                            setNewInfluencer({ ...newInfluencer, accounts: newAccounts });
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm" data-testid={`select-platform-${index}`}>
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
                      <div className="col-span-7">
                        <Input 
                          className="h-8 text-sm" 
                          value={account.handle} 
                          onChange={e => {
                            const newAccounts = [...newInfluencer.accounts];
                            newAccounts[index] = { ...newAccounts[index], handle: e.target.value };
                            setNewInfluencer({ ...newInfluencer, accounts: newAccounts });
                          }}
                          placeholder="@username 또는 블로그 ID" 
                          data-testid={`input-handle-${index}`}
                        />
                      </div>
                      {newInfluencer.accounts.length > 1 && (
                        <div className="col-span-1">
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              const newAccounts = newInfluencer.accounts.filter((_, i) => i !== index);
                              setNewInfluencer({ ...newInfluencer, accounts: newAccounts });
                            }}
                            data-testid={`button-remove-platform-${index}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <Button size="sm" onClick={handleCreate} disabled={createInfluencer.isPending} data-testid="button-submit-influencer">
                {createInfluencer.isPending ? "추가 중..." : "추가"}
              </Button>
            </DialogContent>
          </Dialog>
        </div>

        {selectedIds.size > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-md px-2 md:px-3 py-1.5 md:py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span className="text-xs md:text-sm font-medium">{selectedIds.size}명 선택됨</span>
            <div className="flex flex-wrap gap-1.5 md:gap-2">
              <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => setIsGroupModalOpen(true)} data-testid="button-save-to-group">
                <Users className="w-3 h-3 mr-1" />
                그룹에 저장
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => setIsCampaignModalOpen(true)} data-testid="button-assign-campaign">
                <Megaphone className="w-3 h-3 mr-1" />
                캠페인에 배정
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedIds(new Set())}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2 md:gap-3 items-center">
          <div className="relative flex-1 max-w-xs md:max-w-md">
            <Search className="absolute left-2 md:left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 text-muted-foreground" />
            <Input 
              placeholder={KO.pages.discover.searchPlaceholder}
              className="pl-7 md:pl-8 h-7 md:h-8 text-xs md:text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
            />
          </div>
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[90px] md:w-[140px] h-7 md:h-8 text-xs md:text-sm" data-testid="select-platform-filter">
              <SelectValue placeholder="플랫폼" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="IG">Instagram</SelectItem>
              <SelectItem value="YT">YouTube</SelectItem>
              <SelectItem value="TikTok">TikTok</SelectItem>
              <SelectItem value="X">X (Twitter)</SelectItem>
              <SelectItem value="Blog">네이버 블로그</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">{KO.common.loading}</div>
        ) : (
          <div className="border rounded-md overflow-hidden flex-1">
            <div className="overflow-auto h-full">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0">
                  <TableRow className="h-8">
                    <TableHead className="w-8 px-2">
                      <Checkbox 
                        checked={influencers && selectedIds.size === influencers.length && influencers.length > 0}
                        onCheckedChange={selectAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead className="px-2 text-xs font-semibold">{KO.pages.discover.name}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-24">{KO.pages.discover.platform}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-20 text-right">{KO.pages.discover.followers}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-28">{KO.pages.discover.client}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-28">{KO.pages.discover.campaignStatus}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-24">{KO.pages.discover.collaboration}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {influencers?.map((inf) => {
                    const campaignData = influencerCampaignData.get(inf.id);
                    const mainAccount = inf.accounts?.[0];
                    const clients = campaignData?.campaigns.map((c: { client: string }) => c.client).filter(Boolean) || [];
                    const uniqueClients = Array.from(new Set(clients));
                    
                    return (
                      <TableRow 
                        key={inf.id} 
                        className={`h-8 cursor-pointer hover:bg-muted/30 select-text ${selectedIds.has(inf.id) ? 'bg-primary/5' : ''}`}
                        onClick={() => handleInfluencerClick(inf.id)}
                        data-testid={`row-influencer-${inf.id}`}
                      >
                        <TableCell className="px-2 py-1">
                          <Checkbox 
                            checked={selectedIds.has(inf.id)}
                            onClick={(e) => toggleSelection(inf.id, e)}
                            data-testid={`checkbox-influencer-${inf.id}`}
                          />
                        </TableCell>
                        <TableCell className="px-2 py-1">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6 shrink-0">
                              <AvatarFallback className="text-[10px] bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 font-medium">
                                {inf.name.substring(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium truncate select-text">{inf.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-1">
                          {mainAccount && (
                            <div className="flex items-center gap-1">
                              <PlatformIcon p={mainAccount.platform} />
                              <span className="text-xs text-muted-foreground truncate select-text">{mainAccount.handle}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-1 text-right">
                          <span className="text-xs font-mono select-text">
                            {formatFollowers((mainAccount as any)?.followers)}
                          </span>
                        </TableCell>
                        <TableCell className="px-2 py-1">
                          <span className="text-xs truncate select-text">
                            {uniqueClients.length > 0 ? uniqueClients.slice(0, 2).join(', ') : KO.pages.discover.noClient}
                            {uniqueClients.length > 2 && ` +${uniqueClients.length - 2}`}
                          </span>
                        </TableCell>
                        <TableCell className="px-2 py-1">
                          {campaignData ? (
                            <span className="text-xs select-text">
                              {campaignData.activeCampaigns > 0 && (
                                <span className="text-blue-600">{campaignData.activeCampaigns} {KO.pages.discover.activeCampaigns}</span>
                              )}
                              {campaignData.activeCampaigns > 0 && (campaignData.totalCampaigns - campaignData.activeCampaigns) > 0 && ' / '}
                              {(campaignData.totalCampaigns - campaignData.activeCampaigns) > 0 && (
                                <span className="text-muted-foreground">{campaignData.totalCampaigns - campaignData.activeCampaigns} {KO.pages.discover.completedCampaigns}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{KO.pages.discover.noCampaign}</span>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-1">
                          {campaignData?.latestStatus ? (
                            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 h-5 ${getStatusColor(campaignData.latestStatus)}`}>
                              {getStatusLabel(campaignData.latestStatus)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  
                  {influencers?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <h3 className="text-sm font-medium text-muted-foreground">{KO.pages.discover.noResults}</h3>
                        <p className="text-xs text-muted-foreground/60 mt-1">{KO.pages.discover.noResultsHint}</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <InfluencerDetailDrawer 
        influencerId={selectedInfluencerId} 
        onClose={handleCloseDetail}
        workspaceId={workspaceId || 0}
      />

      <GroupSelectionModal 
        open={isGroupModalOpen}
        onOpenChange={setIsGroupModalOpen}
        workspaceId={workspaceId || 0}
        selectedIds={Array.from(selectedIds)}
        onSuccess={() => {
          setSelectedIds(new Set());
          setIsGroupModalOpen(false);
        }}
      />

      <CampaignSelectionModal 
        open={isCampaignModalOpen}
        onOpenChange={setIsCampaignModalOpen}
        workspaceId={workspaceId || 0}
        selectedIds={Array.from(selectedIds)}
        onSuccess={() => {
          setSelectedIds(new Set());
          setIsCampaignModalOpen(false);
        }}
      />
    </Layout>
  );
}

function InfluencerDetailDrawer({ influencerId, onClose, workspaceId }: { influencerId: number | null; onClose: () => void; workspaceId: number }) {
  const { data: influencer, isLoading } = useInfluencer(influencerId || 0);
  const updateInfluencer = useUpdateInfluencer();
  const addContent = useAddContent(influencerId || 0);
  const { toast } = useToast();
  
  const [memo, setMemo] = useState("");
  const [tags, setTags] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [accounts, setAccounts] = useState<{ platform: string; handle: string }[]>([]);
  const [newContentLink, setNewContentLink] = useState("");

  const platformUrlMap: Record<string, string> = {
    IG: 'instagram.com',
    YT: 'youtube.com/@',
    TikTok: 'tiktok.com/@',
    X: 'x.com',
    Blog: 'blog.naver.com',
  };

  useEffect(() => {
    if (influencer) {
      setMemo(influencer.memo || "");
      setTags(influencer.tags?.join(", ") || "");
      setEmail(influencer.email || "");
      setPhone(influencer.phone || "");
      setName(influencer.name || "");
      setAccounts(influencer.accounts?.map(acc => ({ platform: acc.platform, handle: acc.handle })) || []);
    }
  }, [influencer]);

  const handleSave = () => {
    if (!influencerId) return;
    const validAccounts = accounts
      .filter(acc => acc.handle.trim())
      .map(acc => ({
        platform: acc.platform,
        handle: acc.handle,
        url: `https://${platformUrlMap[acc.platform] || ''}${acc.handle.replace('@', '')}`
      }));
    updateInfluencer.mutate({
      id: influencerId,
      data: {
        name,
        memo,
        tags: tags.split(",").map(t => t.trim()).filter(Boolean),
        email,
        phone,
        accounts: validAccounts
      }
    }, {
      onSuccess: () => toast({ title: "저장되었습니다." })
    });
  };

  const addAccount = () => {
    setAccounts([...accounts, { platform: "IG", handle: "" }]);
  };

  const removeAccount = (index: number) => {
    setAccounts(accounts.filter((_, i) => i !== index));
  };

  const updateAccount = (index: number, field: 'platform' | 'handle', value: string) => {
    const newAccounts = [...accounts];
    newAccounts[index] = { ...newAccounts[index], [field]: value };
    setAccounts(newAccounts);
  };

  const handleAddContent = () => {
    if (!newContentLink) return;
    addContent.mutate({ link: newContentLink, publishedAt: new Date() }, {
      onSuccess: () => {
        setNewContentLink("");
        toast({ title: "콘텐츠가 추가되었습니다." });
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
    <Sheet open={!!influencerId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
        {isLoading || !influencer ? (
          <div className="flex items-center justify-center h-full">로딩 중...</div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-4 pr-8">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 text-xl font-bold">
                    {influencer.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <SheetTitle className="text-xl">{influencer.name}</SheetTitle>
                  <div className="flex gap-2 mt-2">
                    {influencer.accounts?.map(acc => (
                      <Badge key={acc.id} variant="outline" className="gap-1">
                        <PlatformIcon p={acc.platform} />
                        {acc.handle}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </SheetHeader>

            <Tabs defaultValue="info" className="mt-6">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="info">기본정보</TabsTrigger>
                <TabsTrigger value="content">콘텐츠</TabsTrigger>
                <TabsTrigger value="timeline">타임라인</TabsTrigger>
                <TabsTrigger value="memo">메모</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4 mt-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">이름</label>
                    <Input value={name} onChange={e => setName(e.target.value)} data-testid="input-influencer-name" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">이메일</label>
                    <Input value={email} onChange={e => setEmail(e.target.value)} data-testid="input-influencer-email" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">전화번호</label>
                    <Input value={phone} onChange={e => setPhone(e.target.value)} data-testid="input-influencer-phone" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">태그 (쉼표로 구분)</label>
                    <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="뷰티, 패션, 라이프스타일" data-testid="input-influencer-tags" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">플랫폼 계정</label>
                    <Button variant="outline" size="sm" onClick={addAccount} data-testid="button-add-account">
                      <Plus className="w-3 h-3 mr-1" />
                      추가
                    </Button>
                  </div>
                  {accounts.map((acc, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Select value={acc.platform} onValueChange={v => updateAccount(index, 'platform', v)}>
                        <SelectTrigger className="w-28" data-testid={`select-account-platform-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="IG">Instagram</SelectItem>
                          <SelectItem value="YT">YouTube</SelectItem>
                          <SelectItem value="TikTok">TikTok</SelectItem>
                          <SelectItem value="X">X</SelectItem>
                          <SelectItem value="Blog">네이버 블로그</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input 
                        value={acc.handle} 
                        onChange={e => updateAccount(index, 'handle', e.target.value)} 
                        placeholder="@handle" 
                        className="flex-1"
                        data-testid={`input-account-handle-${index}`}
                      />
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => removeAccount(index)}
                        data-testid={`button-remove-account-${index}`}
                      >
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {accounts.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center py-2">등록된 플랫폼 계정이 없습니다.</div>
                  )}
                </div>

                <Button onClick={handleSave} disabled={updateInfluencer.isPending} className="w-full" data-testid="button-save-info">
                  <Save className="w-4 h-4 mr-2" />
                  {updateInfluencer.isPending ? "저장 중..." : "저장"}
                </Button>
              </TabsContent>

              <TabsContent value="content" className="mt-4 space-y-4">
                <div className="flex gap-2">
                  <Input 
                    placeholder="콘텐츠 링크 추가" 
                    value={newContentLink} 
                    onChange={e => setNewContentLink(e.target.value)}
                    data-testid="input-content-link"
                  />
                  <Button onClick={handleAddContent} disabled={addContent.isPending} data-testid="button-add-content">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {influencer.contents?.map(content => (
                      <Card key={content.id} className="p-3">
                        <div className="flex items-center gap-3">
                          {content.thumbnail && (
                            <img src={content.thumbnail} alt="" className="w-16 h-16 rounded object-cover" />
                          )}
                          <div className="flex-1 min-w-0">
                            <a href={content.link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate block">
                              {content.link}
                            </a>
                            {content.publishedAt && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {format(new Date(content.publishedAt), 'yyyy.MM.dd')}
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                    {(!influencer.contents || influencer.contents.length === 0) && (
                      <div className="text-center text-muted-foreground py-8">콘텐츠가 없습니다.</div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="timeline" className="mt-4">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {influencer.timeline?.map(event => (
                      <div key={event.id} className="flex gap-3">
                        <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                        <div>
                          <div className="font-medium text-sm">{event.title}</div>
                          <div className="text-xs text-muted-foreground">{event.description}</div>
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {event.createdAt && format(new Date(event.createdAt), 'yyyy.MM.dd HH:mm')}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!influencer.timeline || influencer.timeline.length === 0) && (
                      <div className="text-center text-muted-foreground py-8">이력이 없습니다.</div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="memo" className="mt-4 space-y-4">
                <Textarea 
                  placeholder="인플루언서에 대한 메모를 작성하세요..." 
                  value={memo} 
                  onChange={e => setMemo(e.target.value)}
                  className="min-h-[200px]"
                  data-testid="textarea-memo"
                />
                <Button onClick={handleSave} disabled={updateInfluencer.isPending} className="w-full" data-testid="button-save-memo">
                  <Save className="w-4 h-4 mr-2" />
                  저장
                </Button>
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function GroupSelectionModal({ open, onOpenChange, workspaceId, selectedIds, onSuccess }: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  workspaceId: number;
  selectedIds: number[];
  onSuccess: () => void;
}) {
  const { data: groups } = useGroups(workspaceId);
  const saveToGroup = useSaveToGroup();
  const { toast } = useToast();
  
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const handleSave = () => {
    if (isCreatingNew && newGroupName) {
      saveToGroup.mutate({
        influencerIds: selectedIds,
        createGroup: { workspaceId, name: newGroupName }
      }, {
        onSuccess: () => {
          toast({ title: "그룹에 저장되었습니다." });
          onSuccess();
        },
        onError: () => toast({ variant: "destructive", title: "저장 실패" })
      });
    } else if (selectedGroupId) {
      saveToGroup.mutate({
        influencerIds: selectedIds,
        groupId: selectedGroupId
      }, {
        onSuccess: () => {
          toast({ title: "그룹에 저장되었습니다." });
          onSuccess();
        },
        onError: () => toast({ variant: "destructive", title: "저장 실패" })
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>그룹에 저장</DialogTitle>
          <DialogDescription>{selectedIds.length}명의 인플루언서를 그룹에 저장합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {!isCreatingNew ? (
            <>
              <div className="space-y-2">
                {groups?.map(g => (
                  <div 
                    key={g.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedGroupId === g.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                    onClick={() => setSelectedGroupId(g.id)}
                    data-testid={`group-option-${g.id}`}
                  >
                    <div className="font-medium">{g.name}</div>
                    <div className="text-xs text-muted-foreground">{g.memberCount}명</div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full" onClick={() => setIsCreatingNew(true)}>
                <Plus className="w-4 h-4 mr-2" />
                새 그룹 만들기
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <Input 
                placeholder="그룹 이름" 
                value={newGroupName} 
                onChange={e => setNewGroupName(e.target.value)}
                data-testid="input-new-group-name"
              />
              <Button variant="ghost" onClick={() => setIsCreatingNew(false)}>취소</Button>
            </div>
          )}
        </div>
        <Button 
          onClick={handleSave} 
          disabled={saveToGroup.isPending || (!selectedGroupId && !newGroupName)}
          data-testid="button-confirm-save-group"
        >
          {saveToGroup.isPending ? "저장 중..." : "저장"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function CampaignSelectionModal({ open, onOpenChange, workspaceId, selectedIds, onSuccess }: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  workspaceId: number;
  selectedIds: number[];
  onSuccess: () => void;
}) {
  const { data: campaigns } = useCampaigns(workspaceId);
  const assignToCampaign = useAssignToCampaign();
  const { toast } = useToast();
  
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");

  const handleAssign = () => {
    if (isCreatingNew && newCampaignName) {
      assignToCampaign.mutate({
        influencerIds: selectedIds,
        createCampaign: { workspaceId, name: newCampaignName }
      }, {
        onSuccess: () => {
          toast({ title: "캠페인에 배정되었습니다." });
          onSuccess();
        },
        onError: () => toast({ variant: "destructive", title: "배정 실패" })
      });
    } else if (selectedCampaignId) {
      assignToCampaign.mutate({
        influencerIds: selectedIds,
        campaignId: selectedCampaignId
      }, {
        onSuccess: () => {
          toast({ title: "캠페인에 배정되었습니다." });
          onSuccess();
        },
        onError: () => toast({ variant: "destructive", title: "배정 실패" })
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>캠페인에 배정</DialogTitle>
          <DialogDescription>{selectedIds.length}명의 인플루언서를 캠페인에 배정합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {!isCreatingNew ? (
            <>
              <div className="space-y-2">
                {campaigns?.map(c => (
                  <div 
                    key={c.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedCampaignId === c.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                    onClick={() => setSelectedCampaignId(c.id)}
                    data-testid={`campaign-option-${c.id}`}
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.client}</div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full" onClick={() => setIsCreatingNew(true)}>
                <Plus className="w-4 h-4 mr-2" />
                새 캠페인 만들기
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <Input 
                placeholder="캠페인 이름" 
                value={newCampaignName} 
                onChange={e => setNewCampaignName(e.target.value)}
                data-testid="input-new-campaign-name"
              />
              <Button variant="ghost" onClick={() => setIsCreatingNew(false)}>취소</Button>
            </div>
          )}
        </div>
        <Button 
          onClick={handleAssign} 
          disabled={assignToCampaign.isPending || (!selectedCampaignId && !newCampaignName)}
          data-testid="button-confirm-assign-campaign"
        >
          {assignToCampaign.isPending ? "배정 중..." : "배정"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
