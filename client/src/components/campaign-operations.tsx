import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { 
  Search, Filter, AlertCircle, Clock, FileText, Calendar, MessageSquare, 
  CheckCircle2, Instagram, Youtube, Twitter,
  ExternalLink, Save, AlertTriangle, CalendarIcon
} from "lucide-react";
import type { CampaignInfluencer, Influencer, InfluencerAccount, FeedbackNote, User } from "@shared/schema";
import { KO } from "@/i18n/ko";

interface LineItemWithDetails extends CampaignInfluencer {
  influencer?: Influencer & { accounts: InfluencerAccount[] };
  feedbackNotes?: (FeedbackNote & { author?: User })[];
}

interface CampaignOperationsProps {
  campaignId: number;
  lineItems: LineItemWithDetails[];
}

const STAGES = ["선정완료", "오퍼확정", "계약진행", "일정확정", "초안수신", "피드백중", "완성본확정", "완료"] as const;
const COMM_STATUSES = ["컨택전", "미응답", "협의중", "수락", "거절", "보류"] as const;
const REVIEW_STATUSES = ["초안대기", "검토중", "피드백전달", "승인완료", "업로드완료"] as const;

const getStageColor = (stage: string) => {
  switch(stage) {
    case "완료": return "bg-green-100 text-green-800";
    case "완성본확정": return "bg-blue-100 text-blue-800";
    case "피드백중": return "bg-yellow-100 text-yellow-800";
    case "초안수신": return "bg-purple-100 text-purple-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

const getCommStatusColor = (status: string) => {
  switch(status) {
    case "수락": return "bg-green-100 text-green-800";
    case "거절": return "bg-red-100 text-red-800";
    case "협의중": return "bg-blue-100 text-blue-800";
    case "미응답": return "bg-orange-100 text-orange-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

const getReviewStatusColor = (status: string) => {
  switch(status) {
    case "승인완료": case "업로드완료": return "bg-green-100 text-green-800";
    case "피드백전달": return "bg-yellow-100 text-yellow-800";
    case "검토중": return "bg-blue-100 text-blue-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

const getDueBadges = (item: LineItemWithDetails): { text: string; type: 'danger' | 'warning' | 'info' }[] => {
  const badges: { text: string; type: 'danger' | 'warning' | 'info' }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (item.draftDueAt && !item.draftUrl && !item.draftFileId) {
    const draftDue = new Date(item.draftDueAt);
    draftDue.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((draftDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) badges.push({ text: KO.pages.operations.due.draftDelayed, type: 'danger' });
    else if (diffDays === 0) badges.push({ text: KO.pages.operations.due.draftDday, type: 'warning' });
    else if (diffDays === 1) badges.push({ text: KO.pages.operations.due.draftD1, type: 'info' });
  }
  
  if (item.uploadDueAt && (!item.finalUrl || !item.isPublishedConfirmed)) {
    const uploadDue = new Date(item.uploadDueAt);
    uploadDue.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((uploadDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) badges.push({ text: KO.pages.operations.due.uploadDelayed, type: 'danger' });
    else if (diffDays === 0) badges.push({ text: KO.pages.operations.due.uploadDday, type: 'warning' });
    else if (diffDays === 1) badges.push({ text: KO.pages.operations.due.uploadD1, type: 'info' });
  }
  
  return badges.slice(0, 2);
};

const PlatformIcon = ({ p }: { p: string }) => {
  switch(p) {
    case 'IG': return <Instagram className="w-4 h-4 text-pink-600" />;
    case 'YT': return <Youtube className="w-4 h-4 text-red-600" />;
    case 'X': return <Twitter className="w-4 h-4 text-blue-400" />;
    default: return <span className="text-xs font-bold">{p}</span>;
  }
};

export function CampaignOperations({ campaignId, lineItems }: CampaignOperationsProps) {
  const { toast } = useToast();
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [commFilter, setCommFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all");
  const [contractDialogItem, setContractDialogItem] = useState<LineItemWithDetails | null>(null);

  const { data: selectedItem, isLoading: isLoadingDetails } = useQuery<LineItemWithDetails>({
    queryKey: ['/api/line-items', selectedItemId],
    enabled: !!selectedItemId,
  });

  const updateOperations = useMutation({
    mutationFn: async (data: { id: number; updates: Partial<CampaignInfluencer> }) => {
      return apiRequest('PATCH', `/api/line-items/${data.id}/operations`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['/api/line-items', selectedItemId] });
      toast({ title: KO.pages.operations.panel.saved });
    }
  });

  const filteredItems = useMemo(() => {
    return lineItems.filter(item => {
      if (search) {
        const searchLower = search.toLowerCase();
        const name = item.influencer?.name?.toLowerCase() || "";
        const email = item.influencer?.email?.toLowerCase() || "";
        if (!name.includes(searchLower) && !email.includes(searchLower)) return false;
      }
      if (stageFilter !== "all" && item.stage !== stageFilter) return false;
      if (commFilter !== "all" && item.commStatus !== commFilter) return false;
      if (reviewFilter !== "all" && item.reviewStatus !== reviewFilter) return false;
      
      if (dueFilter !== "all") {
        const badges = getDueBadges(item);
        if (dueFilter === "overdue") {
          if (!badges.some(b => b.type === 'danger')) return false;
        } else if (dueFilter === "dueSoon") {
          if (!badges.some(b => b.type === 'warning' || b.type === 'info')) return false;
        }
      }
      
      return true;
    });
  }, [lineItems, search, stageFilter, commFilter, reviewFilter, dueFilter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={KO.pages.operations.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-operations"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[120px]" data-testid="select-stage-filter">
            <SelectValue placeholder={KO.pages.operations.filterStage} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{KO.pages.operations.filterAll}</SelectItem>
            {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={commFilter} onValueChange={setCommFilter}>
          <SelectTrigger className="w-[120px]" data-testid="select-comm-filter">
            <SelectValue placeholder={KO.pages.operations.filterComm} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{KO.pages.operations.filterAll}</SelectItem>
            {COMM_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={reviewFilter} onValueChange={setReviewFilter}>
          <SelectTrigger className="w-[120px]" data-testid="select-review-filter">
            <SelectValue placeholder={KO.pages.operations.filterReview} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{KO.pages.operations.filterAll}</SelectItem>
            {REVIEW_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dueFilter} onValueChange={setDueFilter}>
          <SelectTrigger className="w-[120px]" data-testid="select-due-filter">
            <SelectValue placeholder={KO.pages.operations.filterDue} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{KO.pages.operations.filterAll}</SelectItem>
            <SelectItem value="dueSoon">{KO.pages.operations.filterDueSoon}</SelectItem>
            <SelectItem value="overdue">{KO.pages.operations.filterOverdue}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <ScrollArea className="max-h-[600px]">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10">{KO.pages.operations.influencer}</TableHead>
                    <TableHead>{KO.pages.operations.stage}</TableHead>
                    <TableHead>{KO.pages.operations.commStatus}</TableHead>
                    <TableHead>{KO.pages.operations.reviewStatus}</TableHead>
                    <TableHead>{KO.pages.operations.dueStatus}</TableHead>
                    <TableHead>{KO.pages.operations.contract}</TableHead>
                    <TableHead>{KO.pages.operations.draftDue}</TableHead>
                    <TableHead>{KO.pages.operations.uploadDue}</TableHead>
                    <TableHead>{KO.pages.operations.contractGenerate}</TableHead>
                    <TableHead>{KO.pages.operations.notes}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {KO.pages.operations.noItems}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => {
                    const dueBadges = getDueBadges(item);
                    const hasContract = item.contractUrl || item.contractFileId;
                    return (
                      <TableRow 
                        key={item.id} 
                        className={`cursor-pointer hover:bg-muted/50 ${selectedItemId === item.id ? 'bg-muted' : ''}`}
                        onClick={() => setSelectedItemId(item.id)}
                        data-testid={`row-operations-item-${item.id}`}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-xs">
                                {item.influencer?.name?.substring(0, 2) || 'IN'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-sm">{item.influencer?.name || '-'}</div>
                              <div className="flex items-center gap-1">
                                {item.influencer?.accounts?.[0] && (
                                  <PlatformIcon p={item.influencer.accounts[0].platform} />
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {item.influencer?.accounts?.[0]?.followers?.toLocaleString() || 0}
                                </span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={item.stage || "선정완료"} 
                            onValueChange={(val) => {
                              updateOperations.mutate({ id: item.id, updates: { stage: val } });
                            }}
                          >
                            <SelectTrigger 
                              className={`w-[100px] h-7 text-xs border-0 ${getStageColor(item.stage || "선정완료")}`}
                              onClick={e => e.stopPropagation()}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={item.commStatus || "컨택전"} 
                            onValueChange={(val) => {
                              updateOperations.mutate({ id: item.id, updates: { commStatus: val } });
                            }}
                          >
                            <SelectTrigger 
                              className={`w-[90px] h-7 text-xs border-0 ${getCommStatusColor(item.commStatus || "컨택전")}`}
                              onClick={e => e.stopPropagation()}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {COMM_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={item.reviewStatus || "초안대기"} 
                            onValueChange={(val) => {
                              updateOperations.mutate({ id: item.id, updates: { reviewStatus: val } });
                            }}
                          >
                            <SelectTrigger 
                              className={`w-[100px] h-7 text-xs border-0 ${getReviewStatusColor(item.reviewStatus || "초안대기")}`}
                              onClick={e => e.stopPropagation()}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {REVIEW_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {dueBadges.map((badge, i) => (
                              <Badge 
                                key={i} 
                                variant="outline" 
                                className={
                                  badge.type === 'danger' ? 'bg-red-100 text-red-800 border-red-300' :
                                  badge.type === 'warning' ? 'bg-orange-100 text-orange-800 border-orange-300' :
                                  'bg-blue-100 text-blue-800 border-blue-300'
                                }
                              >
                                {badge.text}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {hasContract ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              <FileText className="w-3 h-3 mr-1" />
                              {item.contractUrl && item.contractFileId ? '둘다' : item.contractUrl ? '링크' : '파일'}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">미첨부</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs" onClick={(e) => e.stopPropagation()}>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-28 text-xs justify-start font-normal"
                                data-testid={`button-draft-due-${item.id}`}
                              >
                                <CalendarIcon className="mr-1 h-3 w-3 text-muted-foreground" />
                                {item.draftDueAt ? format(new Date(item.draftDueAt), 'MM/dd') : <span className="text-muted-foreground">선택</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={item.draftDueAt ? new Date(item.draftDueAt) : undefined}
                                onSelect={(date) => {
                                  updateOperations.mutate({ id: item.id, updates: { draftDueAt: date || null } });
                                }}
                                locale={ko}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell className="text-xs" onClick={(e) => e.stopPropagation()}>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-28 text-xs justify-start font-normal"
                                data-testid={`button-upload-due-${item.id}`}
                              >
                                <CalendarIcon className="mr-1 h-3 w-3 text-muted-foreground" />
                                {item.uploadDueAt ? format(new Date(item.uploadDueAt), 'MM/dd') : <span className="text-muted-foreground">선택</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={item.uploadDueAt ? new Date(item.uploadDueAt) : undefined}
                                onSelect={(date) => {
                                  updateOperations.mutate({ id: item.id, updates: { uploadDueAt: date || null } });
                                }}
                                locale={ko}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setContractDialogItem(item)}
                            data-testid={`button-contract-generate-${item.id}`}
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            작성
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {(item as any).feedbackNotes?.length || 0}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedItemId} onOpenChange={(open) => !open && setSelectedItemId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {isLoadingDetails ? (
            <div className="space-y-4 p-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : selectedItem ? (
            <OperationsPanel 
              item={selectedItem} 
              onUpdate={(updates) => updateOperations.mutate({ id: selectedItem.id, updates })}
              isSaving={updateOperations.isPending}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ContractGenerateDialog 
        item={contractDialogItem}
        campaignId={campaignId}
        onClose={() => setContractDialogItem(null)}
      />
    </div>
  );
}

interface OperationsPanelProps {
  item: LineItemWithDetails;
  onUpdate: (updates: Partial<CampaignInfluencer>) => void;
  isSaving: boolean;
}

function OperationsPanel({ item, onUpdate, isSaving }: OperationsPanelProps) {
  const [localItem, setLocalItem] = useState(item);

  const dueBadges = getDueBadges(item);
  const hasDanger = dueBadges.some(b => b.type === 'danger');

  const handleSave = () => {
    onUpdate({
      stage: localItem.stage,
      commStatus: localItem.commStatus,
      reviewStatus: localItem.reviewStatus,
      offerFee: localItem.offerFee,
      offerVatIncluded: localItem.offerVatIncluded,
      offerUsageMonths: localItem.offerUsageMonths,
      offerUsageNote: localItem.offerUsageNote,
      offerDeadlineNote: localItem.offerDeadlineNote,
      contractUrl: localItem.contractUrl,
      contractFileId: localItem.contractFileId,
      draftDueAt: localItem.draftDueAt,
      uploadDueAt: localItem.uploadDueAt,
    });
  };

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700">
              {item.influencer?.name?.substring(0, 2) || 'IN'}
            </AvatarFallback>
          </Avatar>
          <div>
            <span className="text-lg">{item.influencer?.name || KO.pages.operations.influencer}</span>
            <p className="text-sm font-normal text-muted-foreground">{item.influencer?.email || KO.pages.discover.noEmail}</p>
          </div>
        </DialogTitle>
        <DialogDescription className="sr-only">
          인플루언서 운영 상세 정보 편집
        </DialogDescription>
      </DialogHeader>

      {hasDanger && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <div className="flex flex-wrap gap-1">
            {dueBadges.filter(b => b.type === 'danger').map((b, i) => (
              <Badge key={i} variant="destructive">{b.text}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">{KO.pages.operations.panel.status}</h3>
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-2">
                <Label>{KO.pages.operations.stage}</Label>
                <Select value={localItem.stage || "선정완료"} onValueChange={(val) => setLocalItem({...localItem, stage: val})}>
                  <SelectTrigger data-testid="select-stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{KO.pages.operations.commStatus}</Label>
                <Select value={localItem.commStatus || "컨택전"} onValueChange={(val) => setLocalItem({...localItem, commStatus: val})}>
                  <SelectTrigger data-testid="select-comm-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMM_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{KO.pages.operations.reviewStatus}</Label>
                <Select value={localItem.reviewStatus || "초안대기"} onValueChange={(val) => setLocalItem({...localItem, reviewStatus: val})}>
                  <SelectTrigger data-testid="select-review-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REVIEW_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">{KO.pages.operations.panel.schedule}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{KO.pages.operations.panel.draftDueAt}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start font-normal"
                      data-testid="button-draft-due-panel"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      {localItem.draftDueAt ? format(new Date(localItem.draftDueAt), 'yyyy년 MM월 dd일', { locale: ko }) : <span className="text-muted-foreground">날짜 선택</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={localItem.draftDueAt ? new Date(localItem.draftDueAt) : undefined}
                      onSelect={(date) => setLocalItem({...localItem, draftDueAt: date || null})}
                      locale={ko}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>{KO.pages.operations.panel.uploadDueAt}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start font-normal"
                      data-testid="button-upload-due-panel"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      {localItem.uploadDueAt ? format(new Date(localItem.uploadDueAt), 'yyyy년 MM월 dd일', { locale: ko }) : <span className="text-muted-foreground">날짜 선택</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={localItem.uploadDueAt ? new Date(localItem.uploadDueAt) : undefined}
                      onSelect={(date) => setLocalItem({...localItem, uploadDueAt: date || null})}
                      locale={ko}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">{KO.pages.operations.panel.offer}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{KO.pages.operations.panel.fee}</Label>
                  <Input
                    type="number"
                    value={localItem.offerFee || ""}
                    onChange={(e) => setLocalItem({...localItem, offerFee: parseInt(e.target.value) || null})}
                    placeholder="0"
                    data-testid="input-offer-fee"
                  />
                </div>
                <div className="space-y-2 flex items-end">
                  <div className="flex items-center gap-2 h-9">
                    <Checkbox
                      id="vatIncluded"
                      checked={localItem.offerVatIncluded || false}
                      onCheckedChange={(checked) => setLocalItem({...localItem, offerVatIncluded: !!checked})}
                      data-testid="checkbox-vat"
                    />
                    <Label htmlFor="vatIncluded" className="text-sm">{KO.pages.operations.panel.vatIncluded}</Label>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{KO.pages.operations.panel.usageMonths}</Label>
                  <Input
                    type="number"
                    value={localItem.offerUsageMonths || ""}
                    onChange={(e) => setLocalItem({...localItem, offerUsageMonths: parseInt(e.target.value) || null})}
                    placeholder="예: 6"
                    data-testid="input-usage-months"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{KO.pages.operations.panel.usageNote}</Label>
                  <Input
                    value={localItem.offerUsageNote || ""}
                    onChange={(e) => setLocalItem({...localItem, offerUsageNote: e.target.value})}
                    placeholder="SNS 재게시 등"
                    data-testid="input-usage-note"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{KO.pages.operations.panel.deadlineNote}</Label>
                <Input
                  value={localItem.offerDeadlineNote || ""}
                  onChange={(e) => setLocalItem({...localItem, offerDeadlineNote: e.target.value})}
                  placeholder="촬영 후 3일 이내 초안 전달"
                  data-testid="input-deadline-note"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">{KO.pages.operations.panel.contractSection}</h3>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{KO.pages.operations.panel.contractUrl}</Label>
                <Input
                  value={localItem.contractUrl || ""}
                  onChange={(e) => setLocalItem({...localItem, contractUrl: e.target.value})}
                  placeholder="https://..."
                  data-testid="input-contract-url"
                />
              </div>
              <div className="space-y-2">
                <Label>{KO.pages.operations.panel.contractFileId}</Label>
                <Input
                  value={localItem.contractFileId || ""}
                  onChange={(e) => setLocalItem({...localItem, contractFileId: e.target.value})}
                  placeholder="파일 ID 또는 URL"
                  data-testid="input-contract-file"
                />
              </div>
              <div className="text-sm text-muted-foreground p-2 bg-muted/50 rounded">
                {KO.pages.operations.panel.currentStatus}: {localItem.contractUrl && localItem.contractFileId ? KO.pages.operations.panel.linkAndFile : localItem.contractUrl ? KO.pages.operations.panel.linkOnly : localItem.contractFileId ? KO.pages.operations.panel.fileOnly : KO.pages.operations.panel.notAttached}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t">
        <Button className="w-full" onClick={handleSave} disabled={isSaving} data-testid="button-save-operations">
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? KO.pages.operations.panel.saving : KO.pages.operations.panel.save}
        </Button>
      </div>
    </div>
  );
}

// Contract Generate Dialog Component
interface ContractGenerateDialogProps {
  item: LineItemWithDetails | null;
  campaignId: number;
  onClose: () => void;
}

interface ContractTemplate {
  id: number;
  workspaceId: number;
  name: string;
  description: string | null;
  content: string;
  variables: string[] | null;
  isDefault: boolean | null;
}

function ContractGenerateDialog({ item, campaignId, onClose }: ContractGenerateDialogProps) {
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const workspaceId = 1; // TODO: Get from context

  const { data: templates = [], isLoading: isLoadingTemplates } = useQuery<ContractTemplate[]>({
    queryKey: ['/api/workspaces', workspaceId, 'contract-templates'],
    queryFn: () => fetch(`/api/workspaces/${workspaceId}/contract-templates`).then(r => r.json()),
    enabled: !!item,
  });

  const handleGenerateDocx = async () => {
    if (!selectedTemplateId || !item) return;
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/contract-templates/${selectedTemplateId}/generate-docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItemId: item.id }),
      });
      
      if (!response.ok) throw new Error('Failed to generate DOCX');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `계약서_${item.influencer?.name || 'contract'}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: 'DOCX 파일이 다운로드되었습니다.' });
    } catch (err) {
      toast({ title: '계약서 생성 실패', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!selectedTemplateId || !item) return;
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/contract-templates/${selectedTemplateId}/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItemId: item.id }),
      });
      
      if (!response.ok) throw new Error('Failed to generate PDF');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `계약서_${item.influencer?.name || 'contract'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: 'PDF 파일이 다운로드되었습니다.' });
    } catch (err) {
      toast({ title: '계약서 생성 실패', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  if (!item) return null;

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{KO.contractTemplates.generate}</DialogTitle>
          <DialogDescription>
            {item.influencer?.name}님의 계약서를 생성합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>{KO.contractTemplates.selectTemplate}</Label>
            {isLoadingTemplates ? (
              <Skeleton className="h-10 w-full" />
            ) : templates.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 text-center border rounded-md">
                {KO.contractTemplates.noTemplates}
                <br />
                <span className="text-xs">설정에서 템플릿을 먼저 등록해주세요.</span>
              </div>
            ) : (
              <Select
                value={selectedTemplateId?.toString() || ""}
                onValueChange={(val) => setSelectedTemplateId(parseInt(val))}
              >
                <SelectTrigger data-testid="select-contract-template">
                  <SelectValue placeholder="템플릿 선택" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.name}
                      {t.isDefault && <Badge variant="secondary" className="ml-2 text-xs">기본</Badge>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedTemplateId && (
            <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md">
              <strong>사용 가능 변수:</strong><br />
              {KO.contractTemplates.variableHint}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-contract">
            취소
          </Button>
          <Button 
            variant="outline"
            onClick={handleGeneratePdf}
            disabled={!selectedTemplateId || isGenerating}
            data-testid="button-generate-pdf"
          >
            <FileText className="w-4 h-4 mr-1" />
            {isGenerating ? KO.contractTemplates.generating : KO.contractTemplates.downloadPdf}
          </Button>
          <Button 
            onClick={handleGenerateDocx}
            disabled={!selectedTemplateId || isGenerating}
            data-testid="button-generate-docx"
          >
            <FileText className="w-4 h-4 mr-1" />
            {isGenerating ? KO.contractTemplates.generating : KO.contractTemplates.downloadDocx}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
