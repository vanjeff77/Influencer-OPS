import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { 
  Search, Filter, AlertCircle, Clock, FileText, Calendar, MessageSquare, 
  CheckCircle2, Copy, Plus, Trash2, Instagram, Youtube, Twitter,
  ExternalLink, Save, AlertTriangle
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

  const createNote = useMutation({
    mutationFn: async ({ lineItemId, body }: { lineItemId: number; body: string }) => {
      return apiRequest('POST', `/api/line-items/${lineItemId}/feedback-notes`, { body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/line-items', selectedItemId] });
      toast({ title: KO.pages.operations.panel.noteSaved });
    }
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<FeedbackNote> }) => {
      return apiRequest('PATCH', `/api/feedback-notes/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/line-items', selectedItemId] });
    }
  });

  const deleteNote = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/feedback-notes/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/line-items', selectedItemId] });
      toast({ title: KO.pages.operations.panel.noteDeleted });
    }
  });

  const saveFeedbackSummary = useMutation({
    mutationFn: async ({ lineItemId, feedbackSummary }: { lineItemId: number; feedbackSummary: string }) => {
      return apiRequest('PATCH', `/api/line-items/${lineItemId}/feedback-summary`, { feedbackSummary });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/line-items', selectedItemId] });
      toast({ title: KO.pages.operations.panel.summarySaved });
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
          <ScrollArea className="max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{KO.pages.operations.influencer}</TableHead>
                  <TableHead>{KO.pages.operations.stage}</TableHead>
                  <TableHead>{KO.pages.operations.commStatus}</TableHead>
                  <TableHead>{KO.pages.operations.reviewStatus}</TableHead>
                  <TableHead>{KO.pages.operations.dueStatus}</TableHead>
                  <TableHead>{KO.pages.operations.contract}</TableHead>
                  <TableHead>{KO.pages.operations.draftDue}</TableHead>
                  <TableHead>{KO.pages.operations.uploadDue}</TableHead>
                  <TableHead>{KO.pages.operations.notes}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
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
                          <Badge variant="outline" className={getStageColor(item.stage || "선정완료")}>
                            {item.stage || "선정완료"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getCommStatusColor(item.commStatus || "컨택전")}>
                            {item.commStatus || "컨택전"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getReviewStatusColor(item.reviewStatus || "초안대기")}>
                            {item.reviewStatus || "초안대기"}
                          </Badge>
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
                        <TableCell className="text-xs">
                          {item.draftDueAt ? format(new Date(item.draftDueAt), 'MM/dd') : '-'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.uploadDueAt ? format(new Date(item.uploadDueAt), 'MM/dd') : '-'}
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
        </CardContent>
      </Card>

      <Sheet open={!!selectedItemId} onOpenChange={(open) => !open && setSelectedItemId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
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
              onCreateNote={(body) => createNote.mutate({ lineItemId: selectedItem.id, body })}
              onUpdateNote={(id, updates) => updateNote.mutate({ id, updates })}
              onDeleteNote={(id) => deleteNote.mutate(id)}
              onSaveSummary={(summary) => saveFeedbackSummary.mutate({ lineItemId: selectedItem.id, feedbackSummary: summary })}
              isSaving={updateOperations.isPending}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface OperationsPanelProps {
  item: LineItemWithDetails;
  onUpdate: (updates: Partial<CampaignInfluencer>) => void;
  onCreateNote: (body: string) => void;
  onUpdateNote: (id: number, updates: Partial<FeedbackNote>) => void;
  onDeleteNote: (id: number) => void;
  onSaveSummary: (summary: string) => void;
  isSaving: boolean;
}

function OperationsPanel({ item, onUpdate, onCreateNote, onUpdateNote, onDeleteNote, onSaveSummary, isSaving }: OperationsPanelProps) {
  const { toast } = useToast();
  const [localItem, setLocalItem] = useState(item);
  const [newNoteBody, setNewNoteBody] = useState("");
  const [feedbackSummary, setFeedbackSummary] = useState(item.feedbackSummary || "");

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
      draftUrl: localItem.draftUrl,
      draftFileId: localItem.draftFileId,
      finalUrl: localItem.finalUrl,
      finalFileId: localItem.finalFileId,
      isPublishedConfirmed: localItem.isPublishedConfirmed,
    });
  };

  const handleAddNote = () => {
    if (!newNoteBody.trim()) return;
    onCreateNote(newNoteBody.trim());
    setNewNoteBody("");
  };

  const generateSummaryFromSelected = () => {
    const selectedNotes = item.feedbackNotes?.filter(n => n.isSelectedForSummary) || [];
    if (selectedNotes.length === 0) {
      toast({ title: KO.pages.operations.panel.selectNotesFirst, variant: "destructive" });
      return;
    }
    const combined = selectedNotes.map(n => n.body).join("\n\n---\n\n");
    setFeedbackSummary(combined);
  };

  const copyFeedbackSummary = () => {
    navigator.clipboard.writeText(feedbackSummary);
    toast({ title: KO.pages.operations.panel.copied });
  };

  return (
    <div className="space-y-4">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{item.influencer?.name?.substring(0, 2) || 'IN'}</AvatarFallback>
          </Avatar>
          {item.influencer?.name || KO.pages.operations.influencer}
        </SheetTitle>
        <SheetDescription>
          {item.influencer?.email || KO.pages.discover.noEmail}
        </SheetDescription>
      </SheetHeader>

      {hasDanger && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <div className="flex flex-wrap gap-1">
            {dueBadges.filter(b => b.type === 'danger').map((b, i) => (
              <Badge key={i} variant="destructive">{b.text}</Badge>
            ))}
          </div>
        </div>
      )}

      <Accordion type="multiple" defaultValue={["status", "offer", "contract", "schedule", "content", "feedback"]} className="w-full">
        <AccordionItem value="status">
          <AccordionTrigger>{KO.pages.operations.panel.status}</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
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
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="offer">
          <AccordionTrigger>{KO.pages.operations.panel.offer}</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
              <div className="space-y-2 flex items-end gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="vatIncluded"
                    checked={localItem.offerVatIncluded || false}
                    onCheckedChange={(checked) => setLocalItem({...localItem, offerVatIncluded: !!checked})}
                    data-testid="checkbox-vat"
                  />
                  <Label htmlFor="vatIncluded">{KO.pages.operations.panel.vatIncluded}</Label>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="contract">
          <AccordionTrigger>{KO.pages.operations.panel.contractSection}</AccordionTrigger>
          <AccordionContent className="space-y-4">
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
            <div className="text-sm text-muted-foreground">
              {KO.pages.operations.panel.currentStatus}: {localItem.contractUrl && localItem.contractFileId ? KO.pages.operations.panel.linkAndFile : localItem.contractUrl ? KO.pages.operations.panel.linkOnly : localItem.contractFileId ? KO.pages.operations.panel.fileOnly : KO.pages.operations.panel.notAttached}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="schedule">
          <AccordionTrigger>{KO.pages.operations.panel.schedule}</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{KO.pages.operations.panel.draftDueAt}</Label>
                <Input
                  type="date"
                  value={localItem.draftDueAt ? format(new Date(localItem.draftDueAt), 'yyyy-MM-dd') : ""}
                  onChange={(e) => setLocalItem({...localItem, draftDueAt: e.target.value ? new Date(e.target.value) : null})}
                  data-testid="input-draft-due"
                />
              </div>
              <div className="space-y-2">
                <Label>{KO.pages.operations.panel.uploadDueAt}</Label>
                <Input
                  type="date"
                  value={localItem.uploadDueAt ? format(new Date(localItem.uploadDueAt), 'yyyy-MM-dd') : ""}
                  onChange={(e) => setLocalItem({...localItem, uploadDueAt: e.target.value ? new Date(e.target.value) : null})}
                  data-testid="input-upload-due"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="content">
          <AccordionTrigger>{KO.pages.operations.panel.content}</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="space-y-2">
              <Label>{KO.pages.operations.panel.draftUrl}</Label>
              <Input
                value={localItem.draftUrl || ""}
                onChange={(e) => setLocalItem({...localItem, draftUrl: e.target.value})}
                placeholder="https://..."
                data-testid="input-draft-url"
              />
            </div>
            <div className="space-y-2">
              <Label>{KO.pages.operations.panel.draftFileId}</Label>
              <Input
                value={localItem.draftFileId || ""}
                onChange={(e) => setLocalItem({...localItem, draftFileId: e.target.value})}
                placeholder="파일 ID"
                data-testid="input-draft-file"
              />
            </div>
            <div className="space-y-2">
              <Label>{KO.pages.operations.panel.finalUrl}</Label>
              <Input
                value={localItem.finalUrl || ""}
                onChange={(e) => setLocalItem({...localItem, finalUrl: e.target.value})}
                placeholder="https://..."
                data-testid="input-final-url"
              />
            </div>
            <div className="space-y-2">
              <Label>{KO.pages.operations.panel.finalFileId}</Label>
              <Input
                value={localItem.finalFileId || ""}
                onChange={(e) => setLocalItem({...localItem, finalFileId: e.target.value})}
                placeholder="파일 ID"
                data-testid="input-final-file"
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Checkbox
                id="publishedConfirmed"
                checked={localItem.isPublishedConfirmed || false}
                onCheckedChange={(checked) => setLocalItem({...localItem, isPublishedConfirmed: !!checked})}
                data-testid="checkbox-published"
              />
              <Label htmlFor="publishedConfirmed">{KO.pages.operations.panel.publishedConfirmed}</Label>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="feedback">
          <AccordionTrigger>{KO.pages.operations.panel.feedback}</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newNoteBody}
                onChange={(e) => setNewNoteBody(e.target.value)}
                placeholder={KO.pages.operations.panel.addNote}
                data-testid="input-new-note"
                onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
              />
              <Button size="sm" onClick={handleAddNote} data-testid="button-add-note">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-2">
                {item.feedbackNotes?.map((note) => (
                  <div key={note.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={note.isSelectedForSummary || false}
                          onCheckedChange={(checked) => onUpdateNote(note.id, { isSelectedForSummary: !!checked })}
                          data-testid={`checkbox-note-${note.id}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {note.author?.name || KO.pages.operations.panel.anonymous} · {note.createdAt ? format(new Date(note.createdAt), 'MM/dd HH:mm') : ''}
                        </span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDeleteNote(note.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-sm">{note.body}</p>
                  </div>
                ))}
                {(!item.feedbackNotes || item.feedbackNotes.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">{KO.pages.operations.panel.noNotes}</p>
                )}
              </div>
            </ScrollArea>

            <div className="border-t pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label>{KO.pages.operations.panel.feedbackSummary}</Label>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={generateSummaryFromSelected} data-testid="button-generate-summary">
                    {KO.pages.operations.panel.generateSummary}
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyFeedbackSummary} data-testid="button-copy-summary">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <Textarea
                value={feedbackSummary}
                onChange={(e) => setFeedbackSummary(e.target.value)}
                placeholder={KO.pages.operations.panel.feedbackSummary}
                rows={4}
                data-testid="textarea-summary"
              />
              <Button size="sm" onClick={() => onSaveSummary(feedbackSummary)} data-testid="button-save-summary">
                <Save className="w-4 h-4 mr-1" /> {KO.pages.operations.panel.saveSummary}
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="sticky bottom-0 bg-background pt-4 border-t">
        <Button className="w-full" onClick={handleSave} disabled={isSaving} data-testid="button-save-operations">
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? KO.pages.operations.panel.saving : KO.pages.operations.panel.save}
        </Button>
      </div>
    </div>
  );
}
