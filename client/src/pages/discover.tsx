import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useInfluencers, useCreateInfluencer, useInfluencer, useUpdateInfluencer, useAddContent, useSaveToGroup, useAssignToCampaign } from "@/hooks/use-influencers";
import { useGroups } from "@/hooks/use-groups";
import { useCampaigns } from "@/hooks/use-campaigns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect } from "react";
import { Search, Filter, Plus, Instagram, Youtube, Twitter, X, Users, Megaphone, Save, Clock, Link, ExternalLink, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KO } from "@/i18n/ko";
import { format } from "date-fns";
import { useLocation, useSearch } from "wouter";

export default function Discover() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("");
  const [advertiserFilter, setAdvertiserFilter] = useState<string>("all");
  const { data: influencers, isLoading } = useInfluencers(workspaceId || 0, { search, platform: platformFilter || undefined });
  
  // Example advertisers for filtering
  const advertisers = [
    { id: "all", name: "전체" },
    { id: "codingvalley", name: "코딩밸리" },
    { id: "grab", name: "Grab" },
    { id: "voye", name: "Voye" },
  ];
  const createInfluencer = useCreateInfluencer(workspaceId || 0);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchParams = useSearch();

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<number | null>(null);
  
  // Modal states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [newInfluencer, setNewInfluencer] = useState({ name: "", email: "", handle: "", platform: "IG" });
  
  // URL-based selection
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const selected = params.get('selected');
    if (selected) {
      setSelectedInfluencerId(parseInt(selected));
    }
  }, [searchParams]);

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

  const handleCreate = () => {
    if (!newInfluencer.name) return;
    createInfluencer.mutate({
      name: newInfluencer.name,
      email: newInfluencer.email,
      accounts: newInfluencer.handle ? [{
        platform: newInfluencer.platform,
        handle: newInfluencer.handle,
        url: `https://${newInfluencer.platform.toLowerCase()}.com/${newInfluencer.handle}`,
        verified: false
      }] : []
    }, {
      onSuccess: () => {
        setIsAddOpen(false);
        setNewInfluencer({ name: "", email: "", handle: "", platform: "IG" });
        toast({ title: "인플루언서가 추가되었습니다." });
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
      <div className="flex flex-col gap-6 h-full">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{KO.pages.discover.title}</h1>
            <p className="text-muted-foreground mt-1">{KO.pages.discover.subtitle}</p>
          </div>
          
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-lg shadow-primary/20" data-testid="button-add-influencer">
                <Plus className="w-4 h-4 mr-2" />
                {KO.pages.discover.addInfluencer}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{KO.pages.discover.addNewInfluencer}</DialogTitle>
                <DialogDescription>새로운 인플루언서 정보를 입력하세요.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <label>{KO.pages.discover.name}</label>
                  <Input value={newInfluencer.name} onChange={e => setNewInfluencer({...newInfluencer, name: e.target.value})} placeholder="홍길동" />
                </div>
                <div className="grid gap-2">
                  <label>{KO.pages.discover.email}</label>
                  <Input value={newInfluencer.email} onChange={e => setNewInfluencer({...newInfluencer, email: e.target.value})} placeholder="influencer@example.com" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                     <label>{KO.pages.discover.platform}</label>
                     <Select value={newInfluencer.platform} onValueChange={v => setNewInfluencer({...newInfluencer, platform: v})}>
                       <SelectTrigger><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="IG">Instagram</SelectItem>
                         <SelectItem value="YT">YouTube</SelectItem>
                         <SelectItem value="TikTok">TikTok</SelectItem>
                       </SelectContent>
                     </Select>
                  </div>
                  <div className="col-span-2">
                     <label>{KO.pages.discover.handle}</label>
                     <Input value={newInfluencer.handle} onChange={e => setNewInfluencer({...newInfluencer, handle: e.target.value})} placeholder="@username" />
                  </div>
                </div>
              </div>
              <Button onClick={handleCreate} disabled={createInfluencer.isPending} data-testid="button-submit-influencer">
                {createInfluencer.isPending ? "추가 중..." : "추가"}
              </Button>
            </DialogContent>
          </Dialog>
        </div>

        {/* Action bar for multi-select */}
        {selectedIds.size > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center justify-between">
            <span className="text-sm font-medium">{selectedIds.size}명 선택됨</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsGroupModalOpen(true)} data-testid="button-save-to-group">
                <Users className="w-4 h-4 mr-2" />
                그룹에 저장
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsCampaignModalOpen(true)} data-testid="button-assign-campaign">
                <Megaphone className="w-4 h-4 mr-2" />
                캠페인에 배정
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex gap-4 items-center">
          <Checkbox 
            checked={influencers && selectedIds.size === influencers.length && influencers.length > 0}
            onCheckedChange={selectAll}
            data-testid="checkbox-select-all"
          />
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder={KO.pages.discover.searchPlaceholder}
              className="pl-9 bg-muted/30 border-transparent focus:bg-background focus:border-primary transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
            />
          </div>
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-platform-filter">
              <SelectValue placeholder="플랫폼" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="IG">Instagram</SelectItem>
              <SelectItem value="YT">YouTube</SelectItem>
              <SelectItem value="TikTok">TikTok</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">{KO.common.loading}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {influencers?.map((inf) => (
              <Card 
                key={inf.id} 
                className={`p-5 hover:shadow-md transition-shadow cursor-pointer group border-border/60 ${selectedIds.has(inf.id) ? 'ring-2 ring-primary' : ''}`}
                onClick={() => handleInfluencerClick(inf.id)}
                data-testid={`card-influencer-${inf.id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      checked={selectedIds.has(inf.id)}
                      onClick={(e) => toggleSelection(inf.id, e)}
                      data-testid={`checkbox-influencer-${inf.id}`}
                    />
                    <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                      <AvatarFallback className="bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 font-bold">
                        {inf.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold text-lg leading-none group-hover:text-primary transition-colors">{inf.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1 truncate max-w-[150px]">{inf.email || KO.pages.discover.noEmail}</p>
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
                    {!inf.tags?.length && <span className="text-xs text-muted-foreground italic">{KO.pages.discover.noTags}</span>}
                  </div>
                  
                  {inf.accounts && inf.accounts.length > 0 && (
                     <div className="bg-muted/30 rounded-lg p-3 text-sm flex justify-between items-center">
                        <span className="text-muted-foreground">{KO.pages.discover.topAccount}</span>
                        <span className="font-mono font-medium">{inf.accounts[0].handle}</span>
                     </div>
                  )}
                </div>
              </Card>
            ))}
            
            {influencers?.length === 0 && (
              <div className="col-span-full text-center py-20 bg-muted/10 rounded-xl border border-dashed border-border">
                <h3 className="text-lg font-medium text-muted-foreground">{KO.pages.discover.noResults}</h3>
                <p className="text-sm text-muted-foreground/60 mt-1">{KO.pages.discover.noResultsHint}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Influencer Detail Drawer */}
      <InfluencerDetailDrawer 
        influencerId={selectedInfluencerId} 
        onClose={handleCloseDetail}
        workspaceId={workspaceId || 0}
      />

      {/* Group Modal */}
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

      {/* Campaign Modal */}
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

// Influencer Detail Drawer Component
function InfluencerDetailDrawer({ influencerId, onClose, workspaceId }: { influencerId: number | null; onClose: () => void; workspaceId: number }) {
  const { data: influencer, isLoading } = useInfluencer(influencerId || 0);
  const updateInfluencer = useUpdateInfluencer();
  const addContent = useAddContent(influencerId || 0);
  const { toast } = useToast();
  
  const [memo, setMemo] = useState("");
  const [tags, setTags] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [newContentLink, setNewContentLink] = useState("");

  useEffect(() => {
    if (influencer) {
      setMemo(influencer.memo || "");
      setTags(influencer.tags?.join(", ") || "");
      setEmail(influencer.email || "");
      setPhone(influencer.phone || "");
    }
  }, [influencer]);

  const handleSave = () => {
    if (!influencerId) return;
    updateInfluencer.mutate({
      id: influencerId,
      data: {
        memo,
        tags: tags.split(",").map(t => t.trim()).filter(Boolean),
        email,
        phone
      }
    }, {
      onSuccess: () => toast({ title: "저장되었습니다." })
    });
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
                  <Button onClick={handleSave} disabled={updateInfluencer.isPending} className="w-full" data-testid="button-save-info">
                    <Save className="w-4 h-4 mr-2" />
                    {updateInfluencer.isPending ? "저장 중..." : "저장"}
                  </Button>
                </div>

                {influencer.accounts?.map(acc => (
                  <Card key={acc.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <PlatformIcon p={acc.platform} />
                        <div>
                          <div className="font-medium">{acc.handle}</div>
                          <div className="text-xs text-muted-foreground">{acc.category || '카테고리 없음'}</div>
                        </div>
                      </div>
                      <a href={acc.url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon"><ExternalLink className="w-4 h-4" /></Button>
                      </a>
                    </div>
                  </Card>
                ))}
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

// Group Selection Modal
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

// Campaign Selection Modal
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
