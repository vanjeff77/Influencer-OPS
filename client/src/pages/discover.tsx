import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useInfluencers, useCreateInfluencer, useInfluencer, useUpdateInfluencer, useAddContent, useSaveToGroup, useAssignToCampaign, useDeleteInfluencer, useBulkDeleteInfluencers } from "@/hooks/use-influencers";
import { useGroups } from "@/hooks/use-groups";
import { useCampaigns } from "@/hooks/use-campaigns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect, useMemo } from "react";
import { Search, Plus, Instagram, Youtube, Twitter, X, Users, Megaphone, Save, Clock, ExternalLink, ClipboardPaste, Copy, Trash2, ChevronDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CampaignInfluencer } from "@shared/schema";
import { PasteImportDialog } from "@/components/paste-import-dialog";
import { BulkEditDialog } from "@/components/bulk-edit-dialog";
import { Pencil } from "lucide-react";

export default function Discover() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string>("");
  const [followerFilter, setFollowerFilter] = useState<string[]>([]);
  const [contactFilter, setContactFilter] = useState<string[]>([]);
  const [replyFilter, setReplyFilter] = useState<string[]>([]);
  const [collabFilter, setCollabFilter] = useState<string[]>([]);
  const [tag1Filter, setTag1Filter] = useState<string[]>([]);
  const [tag2Filter, setTag2Filter] = useState<string[]>([]);
  const [tag3Filter, setTag3Filter] = useState<string[]>([]);
  const { data: influencers, isLoading } = useInfluencers(workspaceId || 0, { search, platform: undefined });
  const { data: campaigns } = useCampaigns(workspaceId || 0);
  const createInfluencer = useCreateInfluencer(workspaceId || 0);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchParams = useSearch();

  const { data: allCampaignItems } = useQuery<CampaignInfluencer[]>({
    queryKey: ['/api/campaign-influencers', workspaceId],
    enabled: !!workspaceId
  });

  const { data: clientsForImport } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['/api/clients', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/clients?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: !!workspaceId,
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<number | null>(null);
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [isPasteImportOpen, setIsPasteImportOpen] = useState(false);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirmInput, setBulkDeleteConfirmInput] = useState("");
  const bulkDeleteInfluencers = useBulkDeleteInfluencers();
  const queryClient = useQueryClient();
  const [newInfluencer, setNewInfluencer] = useState({ 
    name: "", 
    accounts: [{ platform: "IG", handle: "" }] 
  });

  const TEMPLATE_HEADERS = '닉네임\t플랫폼\t플랫폼 계정\t채널 URL\t팔로워\t컨택포인트\t메모\t클라이언트\t세부유형\t컨택여부\t회신 여부\t협업 여부\t콘텐츠 완성본 링크\t단가 메모';
  const [isCopying, setIsCopying] = useState(false);

  const handleCopyTemplate = async () => {
    if (isCopying) return;
    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(TEMPLATE_HEADERS);
      toast({
        title: KO.pages.discover.templateCopied
      });
    } catch (err) {
      toast({
        title: KO.pages.discover.copyFailed,
        variant: "destructive"
      });
    } finally {
      setTimeout(() => setIsCopying(false), 500);
    }
  };

  const handleImportComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/workspaces', workspaceId, 'influencers'] });
  };
  
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const selected = params.get('selected');
    if (selected) {
      setSelectedInfluencerId(parseInt(selected));
    }
  }, [searchParams]);

  // Extract unique clients from influencers
  const uniqueClients = useMemo(() => {
    if (!influencers) return [];
    const clients = new Set<string>();
    influencers.forEach(inf => {
      if (inf.client && inf.client.trim()) {
        clients.add(inf.client.trim());
      }
    });
    return Array.from(clients).sort();
  }, [influencers]);

  // Extract unique tag values from influencers
  const uniqueTags = useMemo(() => {
    if (!influencers) return { tag1: [], tag2: [], tag3: [] };
    const tag1Set = new Set<string>();
    const tag2Set = new Set<string>();
    const tag3Set = new Set<string>();
    influencers.forEach(inf => {
      if (inf.tag1 && inf.tag1.trim()) tag1Set.add(inf.tag1.trim());
      if (inf.tag2 && inf.tag2.trim()) tag2Set.add(inf.tag2.trim());
      if (inf.tag3 && inf.tag3.trim()) tag3Set.add(inf.tag3.trim());
    });
    return {
      tag1: Array.from(tag1Set).sort(),
      tag2: Array.from(tag2Set).sort(),
      tag3: Array.from(tag3Set).sort(),
    };
  }, [influencers]);

  // Filter influencers by all criteria
  const filteredInfluencers = useMemo(() => {
    if (!influencers) return [];
    
    return influencers.filter(inf => {
      // Client filter
      if (clientFilter && inf.client !== clientFilter) return false;
      
      // Platform filter - check if any selected platform matches
      if (platformFilter.length > 0) {
        const hasPlatform = inf.accounts?.some(acc => platformFilter.includes(acc.platform));
        if (!hasPlatform) return false;
      }
      
      // Follower filter - check max followers across all accounts (multi-select)
      if (followerFilter.length > 0) {
        const maxFollowers = Math.max(...(inf.accounts?.map(acc => acc.followers || 0) || [0]));
        const matchesAnyRange = followerFilter.some(range => {
          switch (range) {
            case 'under1k': return maxFollowers < 1000;
            case '1k-10k': return maxFollowers >= 1000 && maxFollowers < 10000;
            case '10k-100k': return maxFollowers >= 10000 && maxFollowers < 100000;
            case '100k-1m': return maxFollowers >= 100000 && maxFollowers < 1000000;
            case 'over1m': return maxFollowers >= 1000000;
            default: return false;
          }
        });
        if (!matchesAnyRange) return false;
      }
      
      // Contact status filter (multi-select)
      if (contactFilter.length > 0) {
        const matchesContact = contactFilter.some(status => {
          if (status === 'Y') return inf.contactStatus === 'Y';
          if (status === 'N') return inf.contactStatus !== 'Y';
          return false;
        });
        if (!matchesContact) return false;
      }
      
      // Reply status filter (multi-select)
      if (replyFilter.length > 0) {
        const matchesReply = replyFilter.some(status => {
          if (status === 'Y') return inf.replyStatus === 'Y';
          if (status === 'N') return inf.replyStatus !== 'Y';
          return false;
        });
        if (!matchesReply) return false;
      }
      
      // Collab status filter (multi-select)
      if (collabFilter.length > 0) {
        const matchesCollab = collabFilter.some(status => {
          if (status === 'Y') return inf.collabStatus === 'Y';
          if (status === 'N') return inf.collabStatus !== 'Y';
          return false;
        });
        if (!matchesCollab) return false;
      }
      
      // Tag1 filter (multi-select)
      if (tag1Filter.length > 0) {
        if (!inf.tag1 || !tag1Filter.includes(inf.tag1.trim())) return false;
      }
      
      // Tag2 filter (multi-select)
      if (tag2Filter.length > 0) {
        if (!inf.tag2 || !tag2Filter.includes(inf.tag2.trim())) return false;
      }
      
      // Tag3 filter (multi-select)
      if (tag3Filter.length > 0) {
        if (!inf.tag3 || !tag3Filter.includes(inf.tag3.trim())) return false;
      }
      
      return true;
    });
  }, [influencers, clientFilter, platformFilter, followerFilter, contactFilter, replyFilter, collabFilter, tag1Filter, tag2Filter, tag3Filter]);

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
    if (filteredInfluencers) {
      if (selectedIds.size === filteredInfluencers.length) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(filteredInfluencers.map(i => i.id)));
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
      accounts: validAccounts
    }, {
      onSuccess: () => {
        setIsAddOpen(false);
        setNewInfluencer({ name: "", accounts: [{ platform: "IG", handle: "" }] });
        toast({ title: KO.pages.discover.influencerAddedToast });
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
          
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsPasteImportOpen(true)} data-testid="button-paste-import">
              <ClipboardPaste className="w-3 h-3 mr-1" />
              대량 추가
            </Button>
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-influencer">
                  <Plus className="w-3 h-3 mr-1" />
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
                          placeholder="https://..." 
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
        </div>

        <PasteImportDialog
          open={isPasteImportOpen}
          onOpenChange={setIsPasteImportOpen}
          workspaceId={workspaceId || 0}
          onImportComplete={handleImportComplete}
          clients={clientsForImport}
        />

        <BulkEditDialog
          open={isBulkEditOpen}
          onOpenChange={setIsBulkEditOpen}
          workspaceId={workspaceId || 0}
          selectedIds={Array.from(selectedIds)}
          influencers={influencers || []}
          onEditComplete={() => {
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ['/api/influencers'] });
          }}
        />

        {selectedIds.size > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-md px-2 md:px-3 py-1.5 md:py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span className="text-xs md:text-sm font-medium">{selectedIds.size}명 선택됨</span>
            <div className="flex flex-wrap gap-1.5 md:gap-2">
              <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => setIsBulkEditOpen(true)} data-testid="button-bulk-edit">
                <Pencil className="w-3 h-3 mr-1" />
                일괄 수정
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => setIsGroupModalOpen(true)} data-testid="button-save-to-group">
                <Users className="w-3 h-3 mr-1" />
                그룹에 저장
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => setIsCampaignModalOpen(true)} data-testid="button-assign-campaign">
                <Megaphone className="w-3 h-3 mr-1" />
                캠페인에 배정
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs h-7 px-2 text-destructive border-destructive/50 hover:bg-destructive/10" 
                onClick={() => {
                  setBulkDeleteConfirmInput("");
                  setIsBulkDeleteOpen(true);
                }}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                {KO.pages.discover.bulkDelete}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedIds(new Set())}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Bulk Delete Confirmation Dialog */}
        <Dialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive">
                {KO.pages.discover.bulkDeleteConfirm.replace('{count}', selectedIds.size.toString())}
              </DialogTitle>
              <DialogDescription>
                {KO.pages.discover.bulkDeleteWarning}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              {selectedIds.size >= 5 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {KO.pages.discover.bulkDeleteCountPrompt}
                  </label>
                  <Input
                    type="text"
                    value={bulkDeleteConfirmInput}
                    onChange={(e) => setBulkDeleteConfirmInput(e.target.value)}
                    placeholder={KO.pages.discover.bulkDeleteCountPlaceholder}
                    className="text-center text-lg font-mono"
                    data-testid="input-bulk-delete-confirm"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsBulkDeleteOpen(false)}>
                {KO.common.cancel}
              </Button>
              <Button 
                variant="destructive"
                disabled={
                  bulkDeleteInfluencers.isPending || 
                  (selectedIds.size >= 5 && bulkDeleteConfirmInput !== selectedIds.size.toString())
                }
                onClick={() => {
                  bulkDeleteInfluencers.mutate(Array.from(selectedIds), {
                    onSuccess: (data) => {
                      toast({ 
                        title: KO.pages.discover.bulkDeleteSuccess.replace('{count}', data.deleted?.toString() || selectedIds.size.toString())
                      });
                      setSelectedIds(new Set());
                      setIsBulkDeleteOpen(false);
                    },
                    onError: () => {
                      toast({ title: KO.pages.discover.bulkDeleteFailed, variant: "destructive" });
                    }
                  });
                }}
                data-testid="button-confirm-bulk-delete"
              >
                {bulkDeleteInfluencers.isPending ? KO.pages.discover.deleting : KO.common.delete}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="flex flex-wrap gap-2 md:gap-3 items-center">
          <div className="relative flex-1 min-w-[150px] max-w-xs md:max-w-md">
            <Search className="absolute left-2 md:left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 text-muted-foreground" />
            <Input 
              placeholder={KO.pages.discover.searchPlaceholder}
              className="pl-7 md:pl-8 h-7 md:h-8 text-xs md:text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
            />
          </div>
          {/* Platform filter - multi-select */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 md:h-8 text-xs md:text-sm gap-1 min-w-[90px]" data-testid="button-platform-filter">
                플랫폼 {platformFilter.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{platformFilter.length}</Badge>}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2" align="start">
              <div className="space-y-1">
                {[
                  { value: 'IG', label: 'Instagram' },
                  { value: 'YT', label: 'YouTube' },
                  { value: 'TikTok', label: 'TikTok' },
                  { value: 'X', label: 'X (Twitter)' },
                  { value: 'Blog', label: '네이버 블로그' },
                ].map(item => (
                  <label key={item.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox 
                      checked={platformFilter.includes(item.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setPlatformFilter([...platformFilter, item.value]);
                        } else {
                          setPlatformFilter(platformFilter.filter(v => v !== item.value));
                        }
                      }}
                      data-testid={`checkbox-platform-${item.value}`}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Follower filter - multi-select */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 md:h-8 text-xs md:text-sm gap-1 min-w-[80px]" data-testid="button-follower-filter">
                팔로워 {followerFilter.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{followerFilter.length}</Badge>}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-36 p-2" align="start">
              <div className="space-y-1">
                {[
                  { value: 'under1k', label: '1천 미만' },
                  { value: '1k-10k', label: '1천~1만' },
                  { value: '10k-100k', label: '1만~10만' },
                  { value: '100k-1m', label: '10만~100만' },
                  { value: 'over1m', label: '100만+' },
                ].map(item => (
                  <label key={item.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox 
                      checked={followerFilter.includes(item.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFollowerFilter([...followerFilter, item.value]);
                        } else {
                          setFollowerFilter(followerFilter.filter(v => v !== item.value));
                        }
                      }}
                      data-testid={`checkbox-follower-${item.value}`}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Contact filter - multi-select */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 md:h-8 text-xs md:text-sm gap-1 min-w-[70px]" data-testid="button-contact-filter">
                컨택 {contactFilter.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{contactFilter.length}</Badge>}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-28 p-2" align="start">
              <div className="space-y-1">
                {[
                  { value: 'Y', label: 'Y' },
                  { value: 'N', label: 'N' },
                ].map(item => (
                  <label key={item.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox 
                      checked={contactFilter.includes(item.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setContactFilter([...contactFilter, item.value]);
                        } else {
                          setContactFilter(contactFilter.filter(v => v !== item.value));
                        }
                      }}
                      data-testid={`checkbox-contact-${item.value}`}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Reply filter - multi-select */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 md:h-8 text-xs md:text-sm gap-1 min-w-[70px]" data-testid="button-reply-filter">
                회신 {replyFilter.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{replyFilter.length}</Badge>}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-28 p-2" align="start">
              <div className="space-y-1">
                {[
                  { value: 'Y', label: 'Y' },
                  { value: 'N', label: 'N' },
                ].map(item => (
                  <label key={item.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox 
                      checked={replyFilter.includes(item.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setReplyFilter([...replyFilter, item.value]);
                        } else {
                          setReplyFilter(replyFilter.filter(v => v !== item.value));
                        }
                      }}
                      data-testid={`checkbox-reply-${item.value}`}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Collab filter - multi-select */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 md:h-8 text-xs md:text-sm gap-1 min-w-[70px]" data-testid="button-collab-filter">
                협업 {collabFilter.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{collabFilter.length}</Badge>}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-28 p-2" align="start">
              <div className="space-y-1">
                {[
                  { value: 'Y', label: 'Y' },
                  { value: 'N', label: 'N' },
                ].map(item => (
                  <label key={item.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox 
                      checked={collabFilter.includes(item.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setCollabFilter([...collabFilter, item.value]);
                        } else {
                          setCollabFilter(collabFilter.filter(v => v !== item.value));
                        }
                      }}
                      data-testid={`checkbox-collab-${item.value}`}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Tag1 filter - multi-select */}
          {uniqueTags.tag1.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 md:h-8 text-xs md:text-sm gap-1 min-w-[70px]" data-testid="button-tag1-filter">
                  태그1 {tag1Filter.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{tag1Filter.length}</Badge>}
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-2 max-h-60 overflow-y-auto" align="start">
                <div className="space-y-1">
                  {uniqueTags.tag1.map(tag => (
                    <label key={tag} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                      <Checkbox 
                        checked={tag1Filter.includes(tag)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setTag1Filter([...tag1Filter, tag]);
                          } else {
                            setTag1Filter(tag1Filter.filter(v => v !== tag));
                          }
                        }}
                        data-testid={`checkbox-tag1-${tag}`}
                      />
                      <span className="truncate">{tag}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Tag2 filter - multi-select */}
          {uniqueTags.tag2.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 md:h-8 text-xs md:text-sm gap-1 min-w-[70px]" data-testid="button-tag2-filter">
                  태그2 {tag2Filter.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{tag2Filter.length}</Badge>}
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-2 max-h-60 overflow-y-auto" align="start">
                <div className="space-y-1">
                  {uniqueTags.tag2.map(tag => (
                    <label key={tag} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                      <Checkbox 
                        checked={tag2Filter.includes(tag)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setTag2Filter([...tag2Filter, tag]);
                          } else {
                            setTag2Filter(tag2Filter.filter(v => v !== tag));
                          }
                        }}
                        data-testid={`checkbox-tag2-${tag}`}
                      />
                      <span className="truncate">{tag}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Tag3 filter - multi-select */}
          {uniqueTags.tag3.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 md:h-8 text-xs md:text-sm gap-1 min-w-[70px]" data-testid="button-tag3-filter">
                  태그3 {tag3Filter.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{tag3Filter.length}</Badge>}
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-2 max-h-60 overflow-y-auto" align="start">
                <div className="space-y-1">
                  {uniqueTags.tag3.map(tag => (
                    <label key={tag} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                      <Checkbox 
                        checked={tag3Filter.includes(tag)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setTag3Filter([...tag3Filter, tag]);
                          } else {
                            setTag3Filter(tag3Filter.filter(v => v !== tag));
                          }
                        }}
                        data-testid={`checkbox-tag3-${tag}`}
                      />
                      <span className="truncate">{tag}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Client filter buttons */}
        {uniqueClients.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-muted-foreground mr-1">클라이언트:</span>
            <Button 
              variant={clientFilter === "" ? "default" : "outline"} 
              size="sm" 
              className="h-7 text-xs px-3"
              onClick={() => setClientFilter("")}
              data-testid="button-client-filter-all"
            >
              전체
            </Button>
            {uniqueClients.map(client => (
              <Button 
                key={client}
                variant={clientFilter === client ? "default" : "outline"} 
                size="sm" 
                className="h-7 text-xs px-3"
                onClick={() => setClientFilter(client)}
                data-testid={`button-client-filter-${client}`}
              >
                {client}
              </Button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">{KO.common.loading}</div>
        ) : (
          <div className="border rounded-md overflow-hidden flex-1 bg-[#ffffff]">
            <div className="overflow-auto h-full">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0">
                  <TableRow className="h-8">
                    <TableHead className="w-8 px-2">
                      <Checkbox 
                        checked={filteredInfluencers && selectedIds.size === filteredInfluencers.length && filteredInfluencers.length > 0}
                        onCheckedChange={selectAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead className="px-2 text-xs font-semibold">{KO.pages.discover.name}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-16">{KO.pages.discover.platform}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-16 text-right">{KO.pages.discover.followers}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-24">{KO.pages.discover.client}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-20">{KO.pages.discover.tag1}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-20">{KO.pages.discover.tag2}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-20">{KO.pages.discover.tag3}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-16 text-center">{KO.pages.discover.contactStatusLabel}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-16 text-center">{KO.pages.discover.replyStatusLabel}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-16 text-center">{KO.pages.discover.collabStatusLabel}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-28">{KO.pages.discover.campaignStatus}</TableHead>
                    <TableHead className="px-2 text-xs font-semibold w-24">{KO.pages.discover.collaboration}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInfluencers?.map((inf) => {
                    const campaignData = influencerCampaignData.get(inf.id);
                    const mainAccount = inf.accounts?.[0];
                    const clients = campaignData?.campaigns.map((c: { client: string }) => c.client).filter(Boolean) || [];
                    const campaignClients = Array.from(new Set(clients));
                    
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
                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-0.5 shrink-0">
                              {inf.accounts?.map((acc, idx) => (
                                <PlatformIcon key={idx} p={acc.platform} />
                              ))}
                            </div>
                            <span className="text-sm font-medium truncate select-text">{inf.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-1">
                          <div className="flex items-center gap-0.5">
                            {inf.accounts?.map((acc, idx) => (
                              <PlatformIcon key={idx} p={acc.platform} />
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-1 text-right">
                          <span className="text-xs font-mono select-text">
                            {formatFollowers(inf.accounts?.reduce((sum, acc: any) => sum + (acc.followers || 0), 0) || 0)}
                          </span>
                        </TableCell>
                        <TableCell className="px-2 py-1">
                          <span className="text-xs truncate select-text">
                            {inf.client || KO.pages.discover.noClient}
                          </span>
                        </TableCell>
                        <TableCell className="px-2 py-1">
                          <span className="text-xs truncate select-text">{inf.tag1 || '-'}</span>
                        </TableCell>
                        <TableCell className="px-2 py-1">
                          <span className="text-xs truncate select-text">{inf.tag2 || '-'}</span>
                        </TableCell>
                        <TableCell className="px-2 py-1">
                          <span className="text-xs truncate select-text">{inf.tag3 || '-'}</span>
                        </TableCell>
                        <TableCell className="px-2 py-1 text-center">
                          {inf.contactStatus === 'Y' ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-green-100 text-green-700">Y</Badge>
                          ) : inf.contactStatus === 'N' ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">N</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-1 text-center">
                          {inf.replyStatus === 'Y' ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-blue-100 text-blue-700">Y</Badge>
                          ) : inf.replyStatus === 'N' ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">N</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-1 text-center">
                          {inf.collabStatus === 'Y' ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-purple-100 text-purple-700">Y</Badge>
                          ) : inf.collabStatus === 'N' ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">N</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
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
                      <TableCell colSpan={13} className="text-center py-12">
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

interface ClientForDrawer {
  id: number;
  workspaceId: number;
  name: string;
}

interface CampaignParticipation {
  id: number;
  campaignId: number;
  campaignName: string;
  clientName: string | null;
  status: string | null;
  payAmount: number | null;
  createdAt: string | null;
}

function InfluencerDetailDrawer({ influencerId, onClose, workspaceId }: { influencerId: number | null; onClose: () => void; workspaceId: number }) {
  const { data: influencer, isLoading } = useInfluencer(influencerId || 0);
  const updateInfluencer = useUpdateInfluencer();
  const deleteInfluencer = useDeleteInfluencer();
  const addContent = useAddContent(influencerId || 0);
  const { toast } = useToast();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [, setLocation] = useLocation();

  const { data: clientsList } = useQuery<ClientForDrawer[]>({
    queryKey: ['/api/clients', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/clients?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: !!workspaceId,
  });

  const { data: campaignHistory, isLoading: campaignHistoryLoading } = useQuery<CampaignParticipation[]>({
    queryKey: ['/api/influencers', influencerId, 'campaigns', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/influencers/${influencerId}/campaigns?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to fetch campaign history");
      return res.json();
    },
    enabled: !!influencerId && !!workspaceId,
  });
  
  const [memo, setMemo] = useState("");
  const [priceMemo, setPriceMemo] = useState("");
  const [tags, setTags] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [accounts, setAccounts] = useState<{ platform: string; handle: string; followers?: number }[]>([]);
  const [newContentLink, setNewContentLink] = useState("");
  const [contactPoint, setContactPoint] = useState("");
  const [client, setClient] = useState("");
  const [tag1, setTag1] = useState("");
  const [tag2, setTag2] = useState("");
  const [tag3, setTag3] = useState("");
  const [contactStatus, setContactStatus] = useState<string>("");
  const [replyStatus, setReplyStatus] = useState<string>("");
  const [collabStatus, setCollabStatus] = useState<string>("");
  const [finalContentUrl, setFinalContentUrl] = useState("");

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
      setPriceMemo(influencer.priceMemo || "");
      setTags(influencer.tags?.join(", ") || "");
      setEmail(influencer.email || "");
      setPhone(influencer.phone || "");
      setName(influencer.name || "");
      setAccounts(influencer.accounts?.map(acc => ({ platform: acc.platform, handle: acc.handle, followers: acc.followers })) || []);
      setContactPoint(influencer.contactPoint || "");
      setClient(influencer.client || "");
      setTag1(influencer.tag1 || "");
      setTag2(influencer.tag2 || "");
      setTag3(influencer.tag3 || "");
      setContactStatus(influencer.contactStatus || "");
      setReplyStatus(influencer.replyStatus || "");
      setCollabStatus(influencer.collabStatus || "");
      setFinalContentUrl(influencer.finalContentUrl || "");
    }
  }, [influencer]);

  const handleSave = () => {
    if (!influencerId) return;
    const validAccounts = accounts
      .filter(acc => acc.handle.trim())
      .map(acc => ({
        platform: acc.platform,
        handle: acc.handle,
        url: `https://${platformUrlMap[acc.platform] || ''}${acc.handle.replace('@', '')}`,
        followers: acc.followers || 0
      }));
    updateInfluencer.mutate({
      id: influencerId,
      data: {
        name,
        memo,
        priceMemo,
        priceMemoUpdatedAt: priceMemo ? new Date().toISOString() : null,
        tags: tags.split(",").map(t => t.trim()).filter(Boolean),
        email,
        phone,
        accounts: validAccounts,
        contactPoint,
        client,
        tag1,
        tag2,
        tag3,
        contactStatus: contactStatus || null,
        replyStatus: replyStatus || null,
        collabStatus: collabStatus || null,
        finalContentUrl
      }
    }, {
      onSuccess: () => toast({ title: KO.pages.discover.savedToast })
    });
  };

  const addAccount = () => {
    setAccounts([...accounts, { platform: "IG", handle: "" }]);
  };

  const removeAccount = (index: number) => {
    setAccounts(accounts.filter((_, i) => i !== index));
  };

  const updateAccount = (index: number, field: 'platform' | 'handle' | 'followers', value: string | number) => {
    const newAccounts = [...accounts];
    newAccounts[index] = { ...newAccounts[index], [field]: value };
    setAccounts(newAccounts);
  };

  const handleAddContent = () => {
    if (!newContentLink) return;
    addContent.mutate({ link: newContentLink, publishedAt: new Date() }, {
      onSuccess: () => {
        setNewContentLink("");
        toast({ title: KO.pages.discover.contentAddedToast });
      }
    });
  };

  const handleDelete = () => {
    if (!influencerId) return;
    deleteInfluencer.mutate(influencerId, {
      onSuccess: () => {
        toast({ title: KO.pages.discover.deleteInfluencerSuccess });
        setIsDeleteDialogOpen(false);
        onClose();
      },
      onError: () => {
        toast({ title: KO.pages.discover.deleteInfluencerFailed, variant: "destructive" });
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
                <div className="flex-1">
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
                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid="button-delete-influencer">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{KO.pages.discover.deleteInfluencerConfirm}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {KO.pages.discover.deleteInfluencerWarning}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{KO.common.cancel}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} disabled={deleteInfluencer.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete">
                        {deleteInfluencer.isPending ? KO.pages.discover.deleting : KO.common.delete}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </SheetHeader>

            <Tabs defaultValue="info" className="mt-6">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="info">{KO.pages.discover.basicInfo}</TabsTrigger>
                <TabsTrigger value="collab">{KO.pages.discover.collabHistory}</TabsTrigger>
                <TabsTrigger value="content">{KO.pages.discover.content}</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4 mt-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">{KO.pages.discover.nickname}</label>
                    <Input value={name} onChange={e => setName(e.target.value)} data-testid="input-influencer-name" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">{KO.pages.discover.client}</label>
                      <Select value={client || "__none__"} onValueChange={(v) => setClient(v === "__none__" ? "" : v)}>
                        <SelectTrigger data-testid="select-influencer-client">
                          <SelectValue placeholder="클라이언트 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">없음</SelectItem>
                          {clientsList?.map((c) => (
                            <SelectItem key={c.id} value={c.name}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm font-medium">{KO.pages.discover.tag1}</label>
                      <Input value={tag1} onChange={e => setTag1(e.target.value)} placeholder="태그1" data-testid="input-influencer-tag1" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{KO.pages.discover.tag2}</label>
                      <Input value={tag2} onChange={e => setTag2(e.target.value)} placeholder="태그2" data-testid="input-influencer-tag2" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{KO.pages.discover.tag3}</label>
                      <Input value={tag3} onChange={e => setTag3(e.target.value)} placeholder="태그3" data-testid="input-influencer-tag3" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">{KO.pages.discover.email}</label>
                      <Input value={contactPoint} onChange={e => setContactPoint(e.target.value)} placeholder="influencer@example.com" data-testid="input-influencer-contactpoint" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{KO.pages.discover.phone}</label>
                      <Input value={phone} onChange={e => setPhone(e.target.value)} data-testid="input-influencer-phone" />
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium">{KO.pages.discover.memo}</label>
                    <Textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder={KO.pages.discover.memo} className="min-h-[80px]" data-testid="input-influencer-memo" />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium">{KO.pages.discover.priceMemo}</label>
                    <Textarea 
                      value={priceMemo} 
                      onChange={e => setPriceMemo(e.target.value)} 
                      placeholder={KO.pages.discover.priceMemoPlaceholder}
                      className="min-h-[80px]" 
                      data-testid="input-influencer-price-memo" 
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">{KO.pages.discover.platformAccounts}</label>
                    <Button variant="outline" size="sm" onClick={addAccount} data-testid="button-add-account">
                      <Plus className="w-3 h-3 mr-1" />
                      {KO.pages.discover.addAccount}
                    </Button>
                  </div>
                  {accounts.map((acc, index) => (
                    <div key={index} className="flex gap-2 items-center flex-wrap">
                      <Select value={acc.platform} onValueChange={v => updateAccount(index, 'platform', v)}>
                        <SelectTrigger className="w-24" data-testid={`select-account-platform-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="IG">Instagram</SelectItem>
                          <SelectItem value="YT">YouTube</SelectItem>
                          <SelectItem value="TikTok">TikTok</SelectItem>
                          <SelectItem value="X">X</SelectItem>
                          <SelectItem value="Blog">Blog</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input 
                        value={acc.handle} 
                        onChange={e => updateAccount(index, 'handle', e.target.value)} 
                        placeholder="https://..."
                        className="flex-1 min-w-[100px]"
                        data-testid={`input-account-handle-${index}`}
                      />
                      <Input 
                        type="number"
                        value={acc.followers || ''} 
                        onChange={e => updateAccount(index, 'followers', parseInt(e.target.value) || 0)} 
                        placeholder={KO.pages.discover.followers}
                        className="w-24"
                        data-testid={`input-account-followers-${index}`}
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
                    <div className="text-sm text-muted-foreground text-center py-2">{KO.pages.discover.noAccounts}</div>
                  )}
                </div>

                <Button onClick={handleSave} disabled={updateInfluencer.isPending} className="w-full" data-testid="button-save-info">
                  <Save className="w-4 h-4 mr-2" />
                  {updateInfluencer.isPending ? KO.pages.discover.saving : KO.pages.discover.saveChanges}
                </Button>
              </TabsContent>

              <TabsContent value="collab" className="mt-4 space-y-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-sm font-medium">{KO.pages.discover.contactStatus}</label>
                      <Select value={contactStatus} onValueChange={setContactStatus}>
                        <SelectTrigger data-testid="select-contact-status">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Y">Y</SelectItem>
                          <SelectItem value="N">N</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">{KO.pages.discover.replyStatus}</label>
                      <Select value={replyStatus} onValueChange={setReplyStatus}>
                        <SelectTrigger data-testid="select-reply-status">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Y">Y</SelectItem>
                          <SelectItem value="N">N</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">{KO.pages.discover.collabStatus}</label>
                      <Select value={collabStatus} onValueChange={setCollabStatus}>
                        <SelectTrigger data-testid="select-collab-status">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Y">Y</SelectItem>
                          <SelectItem value="N">N</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium">{KO.pages.discover.finalContentUrl}</label>
                    <div className="flex gap-2">
                      <Input 
                        value={finalContentUrl} 
                        onChange={e => setFinalContentUrl(e.target.value)} 
                        placeholder="콘텐츠 완성본 URL" 
                        className="flex-1"
                        data-testid="input-final-content-url" 
                      />
                      {finalContentUrl && (
                        <Button variant="outline" size="icon" asChild>
                          <a href={finalContentUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                
                <Button onClick={handleSave} disabled={updateInfluencer.isPending} className="w-full" data-testid="button-save-collab">
                  <Save className="w-4 h-4 mr-2" />
                  {updateInfluencer.isPending ? KO.pages.discover.saving : KO.pages.discover.saveChanges}
                </Button>
                
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Megaphone className="w-4 h-4" />
                    {KO.pages.discover.campaignParticipation}
                  </h3>
                  <ScrollArea className="h-[180px]">
                    <div className="space-y-2">
                      {campaignHistoryLoading ? (
                        <div className="text-center text-muted-foreground py-6 text-sm">
                          로딩 중...
                        </div>
                      ) : campaignHistory && campaignHistory.length > 0 ? (
                        campaignHistory.map(participation => (
                          <Card 
                            key={participation.id} 
                            className="p-3 cursor-pointer hover-elevate"
                            onClick={() => setLocation(`/campaigns/${participation.campaignId}`)}
                            data-testid={`card-campaign-participation-${participation.id}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-sm truncate">{participation.campaignName}</div>
                                {participation.clientName && (
                                  <div className="text-xs text-muted-foreground truncate">{participation.clientName}</div>
                                )}
                              </div>
                              <div className="flex flex-col items-end shrink-0">
                                <Badge variant="outline" className="text-xs">{participation.status || '등록됨'}</Badge>
                                {participation.payAmount && participation.payAmount > 0 && (
                                  <span className="text-xs text-muted-foreground mt-1">
                                    {participation.payAmount.toLocaleString()}원
                                  </span>
                                )}
                              </div>
                            </div>
                          </Card>
                        ))
                      ) : (
                        <div className="text-center text-muted-foreground py-6 text-sm">
                          {KO.pages.discover.noCampaignHistory}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-medium mb-3">{KO.pages.discover.timeline}</h3>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-3">
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
                        <div className="text-center text-muted-foreground py-4 text-sm">{KO.pages.discover.noTimeline}</div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="content" className="mt-4 space-y-4">
                <div className="flex gap-2">
                  <Input 
                    placeholder={KO.pages.discover.contentLinkPlaceholder} 
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
                      <div className="text-center text-muted-foreground py-8">{KO.pages.discover.noContent}</div>
                    )}
                  </div>
                </ScrollArea>
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
          toast({ title: KO.pages.discover.savedToGroupToast });
          onSuccess();
        },
        onError: () => toast({ variant: "destructive", title: KO.pages.discover.saveFailed })
      });
    } else if (selectedGroupId) {
      saveToGroup.mutate({
        influencerIds: selectedIds,
        groupId: selectedGroupId
      }, {
        onSuccess: () => {
          toast({ title: KO.pages.discover.savedToGroupToast });
          onSuccess();
        },
        onError: () => toast({ variant: "destructive", title: KO.pages.discover.saveFailed })
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

interface Client {
  id: number;
  workspaceId: number;
  name: string;
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
  
  const { data: clients } = useQuery<Client[]>({
    queryKey: ['/api/clients', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/clients?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: !!workspaceId,
  });
  
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignClientId, setNewCampaignClientId] = useState("");

  const handleAssign = () => {
    if (isCreatingNew && newCampaignName && newCampaignClientId) {
      const selectedClient = clients?.find(c => c.id === parseInt(newCampaignClientId));
      assignToCampaign.mutate({
        influencerIds: selectedIds,
        createCampaign: { 
          workspaceId, 
          name: newCampaignName,
          client: selectedClient?.name || "",
          clientId: parseInt(newCampaignClientId)
        }
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
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
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
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">캠페인 이름 <span className="text-destructive">*</span></label>
                <Input 
                  placeholder="캠페인 이름" 
                  value={newCampaignName} 
                  onChange={e => setNewCampaignName(e.target.value)}
                  data-testid="input-new-campaign-name"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">클라이언트 <span className="text-destructive">*</span></label>
                <Select value={newCampaignClientId} onValueChange={setNewCampaignClientId}>
                  <SelectTrigger data-testid="select-new-campaign-client">
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
                {(!clients || clients.length === 0) && (
                  <p className="text-xs text-muted-foreground">설정 → 클라이언트에서 먼저 클라이언트를 추가하세요</p>
                )}
              </div>
              <Button variant="ghost" onClick={() => { setIsCreatingNew(false); setNewCampaignClientId(""); }}>취소</Button>
            </div>
          )}
        </div>
        <Button 
          onClick={handleAssign} 
          disabled={assignToCampaign.isPending || (!selectedCampaignId && (!newCampaignName || !newCampaignClientId))}
          data-testid="button-confirm-assign-campaign"
        >
          {assignToCampaign.isPending ? "배정 중..." : "배정"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
