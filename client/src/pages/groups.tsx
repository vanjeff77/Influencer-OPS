import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useGroups, useGroup, useCreateGroup, useAddInfluencersToGroup, useRemoveInfluencerFromGroup } from "@/hooks/use-groups";
import { useInfluencers } from "@/hooks/use-influencers";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Users, Download, Trash2, Search, Instagram, Youtube, Twitter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useSearch } from "wouter";
import { KO } from "@/i18n/ko";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CachedAvatar } from "@/components/cached-avatar";

export default function Groups() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  const { data: groups, isLoading } = useGroups(workspaceId || 0);
  const createGroup = useCreateGroup(workspaceId || 0);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchParams = useSearch();

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);

  // URL-based group selection
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const groupId = params.get('group');
    if (groupId) {
      setSelectedGroupId(parseInt(groupId));
    } else if (groups && groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].id);
    }
  }, [searchParams, groups]);

  const handleGroupClick = (groupId: number) => {
    setSelectedGroupId(groupId);
    setLocation(`/groups?group=${groupId}`);
  };

  const handleCreate = () => {
    if (!newGroupName) return;
    createGroup.mutate({ name: newGroupName, description: "커스텀 그룹" }, {
      onSuccess: (newGroup) => {
        setIsCreateOpen(false);
        setNewGroupName("");
        setSelectedGroupId(newGroup.id);
        toast({ title: KO.pages.groups.groupCreated });
      }
    });
  };

  const handleDownloadCSV = () => {
    toast({ title: "다운로드 시작", description: "CSV 파일이 준비되었습니다." });
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row gap-3 md:gap-6 h-[calc(100vh-8rem)] md:h-[calc(100vh-10rem)]">
        {/* Left: Group List */}
        <div className="w-full md:w-56 lg:w-72 flex flex-col gap-2 md:gap-4 shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-lg md:text-xl font-bold">{KO.pages.groups.title}</h1>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-7 w-7 md:h-8 md:w-8 p-0" data-testid="button-create-group">
                  <Plus className="w-3 h-3 md:w-4 md:h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[90vw] md:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base md:text-lg">{KO.pages.groups.newGroup}</DialogTitle>
                  <DialogDescription className="text-xs md:text-sm">새로운 인플루언서 그룹을 만듭니다.</DialogDescription>
                </DialogHeader>
                <div className="py-3 md:py-4">
                  <label className="text-xs md:text-sm font-medium mb-1.5 md:mb-2 block">{KO.pages.groups.groupName}</label>
                  <Input className="h-8 md:h-10 text-sm" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="예: 뷰티 블로거 2024" />
                </div>
                <Button size="sm" onClick={handleCreate} disabled={createGroup.isPending} data-testid="button-submit-group">
                  {createGroup.isPending ? KO.nav.creating : KO.common.create}
                </Button>
              </DialogContent>
            </Dialog>
          </div>

          <ScrollArea className="flex-1 max-h-32 md:max-h-none">
            <div className="flex md:flex-col gap-1.5 md:gap-2 md:pr-2 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0">
              {groups?.map(group => (
                <Card 
                  key={group.id} 
                  className={`cursor-pointer transition-all hover:shadow-md shrink-0 w-36 md:w-full ${selectedGroupId === group.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => handleGroupClick(group.id)}
                  data-testid={`card-group-${group.id}`}
                >
                  <CardHeader className="p-2 md:p-4 pb-1 md:pb-2 flex flex-row items-center justify-between space-y-0 gap-1">
                    <CardTitle className="text-xs md:text-base font-medium truncate">{group.name}</CardTitle>
                    <Users className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground shrink-0" />
                  </CardHeader>
                  <CardContent className="p-2 md:p-4 pt-0">
                    <div className="text-[10px] md:text-sm text-muted-foreground">{group.memberCount}명</div>
                  </CardContent>
                </Card>
              ))}
              {!groups?.length && !isLoading && (
                <div className="text-center py-4 md:py-8 text-muted-foreground text-xs md:text-sm w-full">
                  {KO.pages.groups.noGroups}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Group Detail */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {selectedGroupId ? (
            <GroupDetailView 
              groupId={selectedGroupId} 
              workspaceId={workspaceId || 0}
              isAddMemberOpen={isAddMemberOpen}
              setIsAddMemberOpen={setIsAddMemberOpen}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Users className="w-8 h-8 md:w-12 md:h-12 mx-auto mb-2 md:mb-3 opacity-30" />
                <span className="text-sm">그룹을 선택하세요</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function GroupDetailView({ groupId, workspaceId, isAddMemberOpen, setIsAddMemberOpen }: { 
  groupId: number; 
  workspaceId: number;
  isAddMemberOpen: boolean;
  setIsAddMemberOpen: (open: boolean) => void;
}) {
  const { data: group, isLoading } = useGroup(groupId);
  const removeInfluencer = useRemoveInfluencerFromGroup(groupId);
  const { toast } = useToast();

  const handleRemove = (influencerId: number) => {
    removeInfluencer.mutate(influencerId, {
      onSuccess: () => toast({ title: "멤버가 제거되었습니다." })
    });
  };

  const handleDownloadCSV = () => {
    if (!group) return;
    const headers = ['이름', '이메일', '플랫폼', '핸들', '태그'];
    const rows = group.members.map(m => [
      m.influencer.name,
      m.influencer.email || '',
      m.influencer.accounts?.[0]?.platform || '',
      m.influencer.accounts?.[0]?.handle || '',
      m.influencer.tags?.join(', ') || ''
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${group.name}-members.csv`;
    a.click();
    
    toast({ title: "다운로드 완료" });
  };

  const PlatformIcon = ({ p }: { p: string }) => {
    switch(p) {
      case 'IG': return <Instagram className="w-4 h-4 text-pink-600" />;
      case 'YT': return <Youtube className="w-4 h-4 text-red-600" />;
      case 'X': return <Twitter className="w-4 h-4 text-blue-400" />;
      default: return <span className="text-xs font-bold">{p}</span>;
    }
  };

  if (isLoading || !group) {
    return <div className="flex-1 flex items-center justify-center">로딩 중...</div>;
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 md:mb-4 gap-2">
        <div>
          <h2 className="text-lg md:text-2xl font-bold">{group.name}</h2>
          <p className="text-muted-foreground text-xs md:text-base">{group.description}</p>
        </div>
        <div className="flex gap-1.5 md:gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" className="text-xs h-7 md:h-8 flex-1 sm:flex-none" onClick={handleDownloadCSV} data-testid="button-download-csv">
            <Download className="w-3 h-3 mr-1 md:mr-2" />
            <span className="hidden sm:inline">다운로드</span>
            <span className="sm:hidden">CSV</span>
          </Button>
          <Button size="sm" className="text-xs h-7 md:h-8 flex-1 sm:flex-none" onClick={() => setIsAddMemberOpen(true)} data-testid="button-add-member">
            <Plus className="w-3 h-3 mr-1 md:mr-2" />
            <span className="hidden sm:inline">인플루언서 추가</span>
            <span className="sm:hidden">추가</span>
          </Button>
        </div>
      </div>

      <Card className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="overflow-x-auto">
            <Table className="min-w-[400px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs md:text-sm">인플루언서</TableHead>
                  <TableHead className="text-xs md:text-sm hidden md:table-cell">플랫폼</TableHead>
                  <TableHead className="text-xs md:text-sm">핸들</TableHead>
                  <TableHead className="text-xs md:text-sm hidden lg:table-cell">태그</TableHead>
                  <TableHead className="w-[40px] md:w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.members.map(member => (
                  <TableRow key={member.id} data-testid={`row-member-${member.influencer.id}`}>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2 md:gap-3">
                        <CachedAvatar
                          className="h-6 w-6 md:h-8 md:w-8"
                          src={member.influencer.accounts?.[0]?.profileImageUrl}
                          fallback={member.influencer.name.substring(0, 2)}
                          fallbackClassName="text-[10px] md:text-xs"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-xs md:text-sm truncate">{member.influencer.name}</div>
                          <div className="text-[10px] md:text-xs text-muted-foreground truncate">{member.influencer.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 hidden md:table-cell">
                      {member.influencer.accounts?.[0] && (
                        <PlatformIcon p={member.influencer.accounts[0].platform} />
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <span className="font-mono text-xs md:text-sm">{member.influencer.accounts?.[0]?.handle}</span>
                    </TableCell>
                    <TableCell className="py-2 hidden lg:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {member.influencer.tags?.slice(0, 2).map((tag, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px] md:text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive hover:text-destructive h-6 w-6 md:h-8 md:w-8"
                        onClick={() => handleRemove(member.influencer.id)}
                        data-testid={`button-remove-member-${member.influencer.id}`}
                      >
                        <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {group.members.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 md:py-8 text-muted-foreground text-xs md:text-sm">
                      멤버가 없습니다. 인플루언서를 추가해주세요.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </Card>

      <AddMemberModal 
        open={isAddMemberOpen} 
        onOpenChange={setIsAddMemberOpen}
        groupId={groupId}
        workspaceId={workspaceId}
        existingMemberIds={group.members.map(m => m.influencer.id)}
      />
    </>
  );
}

function AddMemberModal({ open, onOpenChange, groupId, workspaceId, existingMemberIds }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: number;
  workspaceId: number;
  existingMemberIds: number[];
}) {
  const { data: influencers } = useInfluencers(workspaceId);
  const addInfluencers = useAddInfluencersToGroup(groupId);
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const availableInfluencers = influencers?.filter(i => !existingMemberIds.includes(i.id)) || [];
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
      <DialogContent className="max-w-[90vw] md:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base md:text-lg">인플루언서 추가</DialogTitle>
          <DialogDescription className="text-xs md:text-sm">그룹에 추가할 인플루언서를 선택하세요.</DialogDescription>
        </DialogHeader>
        
        <div className="relative">
          <Search className="absolute left-2.5 md:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground" />
          <Input 
            placeholder="검색..." 
            className="pl-8 md:pl-9 h-8 md:h-10 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <ScrollArea className="h-[240px] md:h-[300px] border rounded-lg">
          <div className="p-1.5 md:p-2 space-y-1">
            {filteredInfluencers.map(inf => (
              <div 
                key={inf.id}
                className={`p-2 md:p-3 rounded-lg cursor-pointer transition-colors flex items-center gap-2 md:gap-3 ${selectedIds.has(inf.id) ? 'bg-primary/10 border border-primary' : 'hover:bg-muted border border-transparent'}`}
                onClick={() => toggleSelection(inf.id)}
                data-testid={`add-member-option-${inf.id}`}
              >
                <Checkbox checked={selectedIds.has(inf.id)} className="h-4 w-4" />
                <CachedAvatar
                  className="h-6 w-6 md:h-8 md:w-8"
                  src={inf.accounts?.[0]?.profileImageUrl}
                  fallback={inf.name.substring(0, 2)}
                  fallbackClassName="text-[10px] md:text-xs"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs md:text-sm truncate">{inf.name}</div>
                  <div className="text-[10px] md:text-xs text-muted-foreground truncate">{inf.email}</div>
                </div>
              </div>
            ))}
            {filteredInfluencers.length === 0 && (
              <div className="text-center py-6 md:py-8 text-muted-foreground text-xs md:text-sm">
                추가 가능한 인플루언서가 없습니다.
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-between items-center">
          <span className="text-xs md:text-sm text-muted-foreground">{selectedIds.size}명 선택됨</span>
          <Button size="sm" onClick={handleAdd} disabled={addInfluencers.isPending || selectedIds.size === 0} data-testid="button-confirm-add-members">
            {addInfluencers.isPending ? "추가 중..." : "추가"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
