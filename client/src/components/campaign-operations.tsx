import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { 
  Filter, AlertCircle, Clock, FileText, Calendar, MessageSquare, 
  CheckCircle2, CircleDot, Circle, Instagram, Youtube, Twitter, Check,
  ExternalLink, Save, AlertTriangle, CalendarIcon, Send, Download, Mail, Loader2, ArrowLeft, Pencil, ClipboardList
} from "lucide-react";
import type { CampaignInfluencer, Influencer, InfluencerAccount, FeedbackNote, User } from "@shared/schema";
import { KO } from "@/i18n/ko";


import { TiptapEditor } from '@/components/tiptap-editor';

interface LineItemWithDetails extends CampaignInfluencer {
  influencer?: Influencer & { accounts: InfluencerAccount[] };
  feedbackNotes?: (FeedbackNote & { author?: User })[];
}

interface CampaignOperationsProps {
  campaignId: number;
  workspaceId?: number;
  lineItems: LineItemWithDetails[];
}

const BANK_LIST = [
  "KB국민은행", "신한은행", "하나은행", "우리은행", "NH농협은행",
  "IBK기업은행", "카카오뱅크", "토스뱅크", "SC제일은행", "씨티은행",
  "케이뱅크", "새마을금고", "신협", "우체국", "수협은행",
  "대구은행", "부산은행", "경남은행", "광주은행", "전북은행", "제주은행"
];

function getContractInfoCompleteness(item: LineItemWithDetails): { filled: number; total: number } {
  const total = 8;
  let filled = 0;
  if (item.uploadDueAt) filled++;
  if (item.offerFee) filled++;
  const inf = item.influencer;
  if (inf?.bankName) filled++;
  if (inf?.accountNumber) filled++;
  if (inf?.accountHolder) filled++;
  if (inf?.businessName) filled++;
  if (inf?.freelancerId || inf?.businessRegNo) filled++;
  if (inf?.settlementType) filled++;
  return { filled, total };
}

const PROGRESS_STEPS = [
  { key: 'waiting', label: '대기' },
  { key: 'contacted', label: '컨택완료' },
  { key: 'confirmed', label: '확정완료' },
  { key: 'contracted', label: '계약완료' },
] as const;

const STAGES = ["선정완료", "오퍼확정", "계약진행", "일정확정", "초안수신", "피드백중", "완성본확정", "완료", "보류"] as const;
const COMM_STATUSES = ["컨택전", "미응답", "협의중", "수락", "거절", "보류"] as const;
const REVIEW_STATUSES = ["초안대기", "검토중", "피드백전달", "승인완료", "업로드완료"] as const;

const getStageColor = (stage: string) => {
  switch(stage) {
    case "완료": return "bg-green-100 text-green-800";
    case "완성본확정": return "bg-blue-100 text-blue-800";
    case "피드백중": return "bg-yellow-100 text-yellow-800";
    case "초안수신": return "bg-purple-100 text-purple-800";
    case "보류": return "bg-gray-200 text-gray-500";
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

export function CampaignOperations({ campaignId, workspaceId = 1, lineItems }: CampaignOperationsProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [contractDialogItem, setContractDialogItem] = useState<LineItemWithDetails | null>(null);
  const [contractInfoItem, setContractInfoItem] = useState<LineItemWithDetails | null>(null);

  const updateOperations = useMutation({
    mutationFn: async (data: { id: number; updates: Partial<CampaignInfluencer> }) => {
      return apiRequest('PATCH', `/api/line-items/${data.id}/operations`, data.updates);
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: [api.campaigns.get.path, campaignId] });
      await queryClient.cancelQueries({ queryKey: ['/api/line-items', data.id] });
      
      const previousCampaign = queryClient.getQueryData([api.campaigns.get.path, campaignId]);
      const previousItem = queryClient.getQueryData(['/api/line-items', data.id]);
      
      queryClient.setQueryData([api.campaigns.get.path, campaignId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items?.map((item: any) => 
            item.id === data.id ? { ...item, ...data.updates } : item
          )
        };
      });
      
      queryClient.setQueryData(['/api/line-items', data.id], (old: any) => {
        if (!old) return old;
        return { ...old, ...data.updates };
      });
      
      return { previousCampaign, previousItem, id: data.id };
    },
    onError: (err, data, context) => {
      if (context?.previousCampaign) {
        queryClient.setQueryData([api.campaigns.get.path, campaignId], context.previousCampaign);
      }
      if (context?.previousItem) {
        queryClient.setQueryData(['/api/line-items', context.id], context.previousItem);
      }
      toast({ title: "저장 실패", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: KO.pages.operations.panel.saved });
    },
    onSettled: (_, __, data) => {
      queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, campaignId] });
      queryClient.invalidateQueries({ queryKey: ['/api/line-items', data.id] });
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
      return true;
    });
  }, [lineItems, search]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 bg-[transparent]">{KO.pages.operations.influencer}</TableHead>
                    <TableHead>{KO.pages.operations.adFeeVat}</TableHead>
                    <TableHead>{KO.pages.operations.contractInfo} / {KO.pages.operations.contractGenerate}</TableHead>
                    <TableHead>{KO.pages.operations.contract}</TableHead>
                    <TableHead>{KO.pages.operations.draftDue}</TableHead>
                    <TableHead>{KO.pages.operations.uploadDue}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {KO.pages.operations.noItems}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => {
                    const hasContract = item.contractUrl || item.contractFileId || item.contractContent;
                    return (
                      <TableRow 
                        key={item.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setContractDialogItem(item)}
                        data-testid={`row-operations-item-${item.id}`}
                      >
                        <TableCell className="py-1.5">
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
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.offerFee != null ? (
                            <span className="font-medium">{item.offerFee.toLocaleString()}원</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-0">
                            {(() => {
                              const { filled, total } = getContractInfoCompleteness(item);
                              const isComplete = filled === total;
                              const colorClass = isComplete
                                ? 'border-green-500 text-green-700 bg-green-50 dark:border-green-600 dark:text-green-400 dark:bg-green-950/30'
                                : 'border-yellow-500 text-yellow-700 bg-yellow-50 dark:border-yellow-600 dark:text-yellow-400 dark:bg-yellow-950/30';
                              return (
                                <button
                                  className={`relative h-7 text-xs font-medium px-2.5 border rounded-l-md rounded-r-none ${colorClass} flex items-center gap-1`}
                                  onClick={() => setContractInfoItem(item)}
                                  data-testid={`button-contract-info-${item.id}`}
                                  aria-label={`계약정보 ${filled}/${total}`}
                                >
                                  <ClipboardList className="w-3 h-3" />
                                  {isComplete ? '정보완료' : <>계약 정보 {filled}/{total}</>}
                                </button>
                              );
                            })()}
                            <button
                              className="relative h-7 text-xs font-medium px-2.5 border border-l-0 rounded-r-md rounded-l-none bg-blue-600 text-white flex items-center gap-1"
                              onClick={() => setContractDialogItem(item)}
                              data-testid={`button-contract-generate-${item.id}`}
                            >
                              <FileText className="w-3 h-3" />
                              계약서 만들기
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {hasContract ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              <FileText className="w-3 h-3 mr-1" />
                              {item.contractContent ? '작성완료' : item.contractUrl ? '링크' : '파일'}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">미작성</Badge>
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
                      </TableRow>
                    );
                  })
                )}
                </TableBody>
              </Table>
          </div>
        </CardContent>
      </Card>

      <ContractGenerateDialog 
        item={contractDialogItem}
        campaignId={campaignId}
        workspaceId={workspaceId}
        onClose={() => setContractDialogItem(null)}
      />


      {contractInfoItem && (
        <ContractInfoDialog
          item={contractInfoItem}
          campaignId={campaignId}
          onClose={() => setContractInfoItem(null)}
        />
      )}
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

  useEffect(() => {
    setLocalItem(item);
  }, [item]);

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
                    {STAGES.filter(s => s !== "보류").map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    <SelectSeparator />
                    <SelectItem value="보류">보류</SelectItem>
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
  workspaceId: number;
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


function ContractGenerateDialog({ item, campaignId, workspaceId, onClose }: ContractGenerateDialogProps) {
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [contractContent, setContractContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailBody, setEmailBody] = useState('');
  const [hasSavedContent, setHasSavedContent] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const { data: templates = [], isLoading: isLoadingTemplates } = useQuery<ContractTemplate[]>({
    queryKey: ['/api/workspaces', workspaceId, 'contract-templates'],
    queryFn: () => fetch(`/api/workspaces/${workspaceId}/contract-templates`).then(r => r.json()),
    enabled: !!item,
  });

  const { data: savedContract, isLoading: isLoadingSaved } = useQuery<{ contractContent: string | null; contractTemplateId: number | null }>({
    queryKey: ['/api/line-items', item?.id, 'contract-content'],
    queryFn: () => fetch(`/api/line-items/${item!.id}/contract-content`).then(r => r.json()),
    enabled: !!item,
  });

  const handleLoadSavedContent = () => {
    if (savedContract?.contractContent) {
      setContractContent(savedContract.contractContent);
      setSelectedTemplateId(savedContract.contractTemplateId || null);
      setIsEditing(true);
      setHasSavedContent(true);
    }
  };

  const handleLoadTemplate = async () => {
    if (!selectedTemplateId || !item) return;
    setIsLoadingPreview(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/contract-templates/${selectedTemplateId}/render-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItemId: item.id }),
      });
      if (!response.ok) throw new Error('Failed to load template preview');
      const data = await response.json();
      setContractContent(data.content);
      setIsEditing(true);
      setHasSavedContent(false);
    } catch (err) {
      toast({ title: '템플릿 로딩 실패', variant: 'destructive' });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSave = async () => {
    if (!item) return;
    setIsSaving(true);
    try {
      await apiRequest('PATCH', `/api/line-items/${item.id}/contract-content`, {
        contractContent,
        contractTemplateId: selectedTemplateId,
      });
      setHasSavedContent(true);
      queryClient.invalidateQueries({ queryKey: ['/api/line-items', item.id, 'contract-content'] });
      toast({ title: '계약서가 저장되었습니다.' });
    } catch (err) {
      toast({ title: '계약서 저장 실패', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async (format: 'pdf' | 'docx') => {
    if (!item) return;
    setIsGenerating(true);
    try {
      const templateId = selectedTemplateId || savedContract?.contractTemplateId || 0;
      const endpoint = format === 'pdf' 
        ? `/api/workspaces/${workspaceId}/contract-templates/${templateId}/generate-pdf`
        : `/api/workspaces/${workspaceId}/contract-templates/${templateId}/generate-docx`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          lineItemId: item.id,
          useCustomContent: true,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        toast({ title: errorData.message || `${format.toUpperCase()} 생성 실패`, variant: 'destructive' });
        return;
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `계약서_${item.influencer?.name || 'contract'}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: `${format.toUpperCase()} 파일이 다운로드되었습니다.` });
    } catch (err: any) {
      toast({ title: `${format.toUpperCase()} 생성 실패`, description: err?.message, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    if (!item) return;
    setIsSendingEmail(true);
    try {
      const response = await apiRequest('POST', `/api/line-items/${item.id}/send-contract-email`, {
        emailBody: emailBody || undefined,
      });
      const data = await response.json();
      toast({ title: data.message || '계약서가 이메일로 발송되었습니다.' });
      setShowEmailDialog(false);
      setEmailBody('');
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'conversations'] });
      queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, campaignId] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', 'campaignId', campaignId.toString()] });
    } catch (err: any) {
      toast({ title: '이메일 발송 실패', description: err?.message, variant: 'destructive' });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleClose = () => {
    setIsEditing(false);
    setContractContent('');
    setSelectedTemplateId(null);
    setHasSavedContent(false);
    setShowEmailDialog(false);
    setEmailBody('');
    onClose();
  };

  if (!item) return null;

  const hasSaved = savedContract?.contractContent;

  return (
    <>
      <Dialog open={!!item && !showEmailDialog} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setIsEditing(false)} data-testid="button-back-to-template">
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  계약서 편집 - {item.influencer?.name}
                </div>
              ) : (
                `계약서 작성 - ${item.influencer?.name}`
              )}
            </DialogTitle>
            {!isEditing && (
              <DialogDescription>
                템플릿을 선택하여 초안을 작성하거나, 기존 저장된 계약서를 편집할 수 있습니다.
              </DialogDescription>
            )}
          </DialogHeader>

          {(() => {
            const currentStatus = item.status || 'waiting';
            const currentStepIndex = PROGRESS_STEPS.findIndex(s => s.key === currentStatus);
            return (
              <div
                className="flex items-center gap-0.5 rounded-md bg-muted dark:bg-muted/60 p-0.5"
                data-testid="progress-bar-operations"
              >
                {PROGRESS_STEPS.map((step, idx) => {
                  const isCurrent = step.key === currentStatus;
                  const isCompleted = idx < currentStepIndex;
                  return (
                    <Button
                      key={step.key}
                      variant={isCurrent ? "default" : "ghost"}
                      size="sm"
                      onClick={() => {
                        apiRequest('PATCH', `/api/line-items/${item.id}/operations`, { status: step.key });
                        queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, campaignId] });
                      }}
                      className={`flex-1 gap-1 h-7 px-2 text-xs ${isCompleted ? 'text-primary font-medium' : ''}`}
                      data-testid={`step-ops-${step.key}`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                      ) : isCurrent ? (
                        <CircleDot className="w-3 h-3 shrink-0" />
                      ) : (
                        <Circle className="w-3 h-3 shrink-0" />
                      )}
                      {step.label}
                    </Button>
                  );
                })}
              </div>
            );
          })()}

          {!isEditing ? (
            <div className="space-y-4 py-4">
              {(isLoadingSaved) ? (
                <Skeleton className="h-20 w-full" />
              ) : hasSaved ? (
                <div className="p-4 border rounded-md bg-muted/30 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium">저장된 계약서가 있습니다</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    이전에 저장한 개별 계약서를 이어서 편집하거나, 새 템플릿으로 다시 작성할 수 있습니다.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="default" size="sm" onClick={handleLoadSavedContent} data-testid="button-load-saved-contract">
                      <Pencil className="w-3 h-3 mr-1" />
                      저장된 계약서 편집
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>{hasSaved ? '새 템플릿으로 다시 작성' : KO.contractTemplates.selectTemplate}</Label>
                {isLoadingTemplates ? (
                  <Skeleton className="h-10 w-full" />
                ) : templates.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4 text-center border rounded-md">
                    {KO.contractTemplates.noTemplates}
                    <br />
                    <span className="text-xs">설정에서 템플릿을 먼저 등록해주세요.</span>
                  </div>
                ) : (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
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
                    </div>
                    <Button 
                      onClick={handleLoadTemplate} 
                      disabled={!selectedTemplateId || isLoadingPreview}
                      data-testid="button-load-template"
                    >
                      {isLoadingPreview ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileText className="w-4 h-4 mr-1" />}
                      초안 작성
                    </Button>
                  </div>
                )}
              </div>

              {selectedTemplateId && (
                <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md">
                  <strong>사용 가능 변수:</strong> {KO.contractTemplates.variableHint}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div>
                <TiptapEditor
                  value={contractContent}
                  onChange={setContractContent}
                  toolbar="full"
                  data-testid="editor-contract-content"
                />
              </div>


              <div className="flex items-center justify-between gap-2 flex-wrap pt-8">
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-contract">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                    저장
                  </Button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button 
                    variant="outline" 
                    onClick={() => handleDownload('pdf')} 
                    disabled={isGenerating || !hasSavedContent}
                    data-testid="button-download-pdf"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    {isGenerating ? '생성 중...' : 'PDF'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => handleDownload('docx')} 
                    disabled={isGenerating || !hasSavedContent}
                    data-testid="button-download-docx"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    {isGenerating ? '생성 중...' : 'DOCX'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setEmailBody(`안녕하세요, ${item.influencer?.name}님.\n\n계약서를 첨부하여 보내드립니다.\n확인 부탁드립니다.`);
                      setShowEmailDialog(true);
                    }}
                    disabled={!hasSavedContent}
                    data-testid="button-email-contract"
                  >
                    <Mail className="w-4 h-4 mr-1" />
                    이메일 발송
                  </Button>
                </div>
              </div>
              {!hasSavedContent && isEditing && (
                <p className="text-xs text-muted-foreground">
                  다운로드 및 이메일 발송은 계약서를 먼저 저장한 후 사용할 수 있습니다.
                </p>
              )}
            </div>
          )}

          {!isEditing && (
            <DialogFooter>
              <Button variant="outline" onClick={handleClose} data-testid="button-cancel-contract">
                닫기
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showEmailDialog} onOpenChange={(open) => !open && setShowEmailDialog(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>계약서 이메일 발송</DialogTitle>
            <DialogDescription>
              {item.influencer?.name}님에게 계약서 PDF를 첨부하여 이메일을 보냅니다.
              기존 이메일 스레드의 답장으로 발송됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>이메일 본문</Label>
              <Textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="min-h-[120px]"
                placeholder="이메일 본문을 입력하세요..."
                data-testid="textarea-email-body"
              />
            </div>
            <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md space-y-1">
              <p>수신: {item.influencer?.email || '이메일 없음'}</p>
              <p>첨부: 계약서_{item.influencer?.name}_{new Date().toISOString().split('T')[0]}.pdf</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
              취소
            </Button>
            <Button 
              onClick={handleSendEmail} 
              disabled={isSendingEmail}
              data-testid="button-confirm-send-email"
            >
              {isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
              발송
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ContractInfoDialogProps {
  item: LineItemWithDetails;
  campaignId: number;
  onClose: () => void;
}

function ContractInfoDialog({ item, campaignId, onClose }: ContractInfoDialogProps) {
  const { toast } = useToast();
  const inf = item.influencer;
  
  const [uploadDueAt, setUploadDueAt] = useState<Date | undefined>(
    item.uploadDueAt ? new Date(item.uploadDueAt) : undefined
  );
  const [offerFee, setOfferFee] = useState(item.offerFee?.toString() || '');
  const [offerUsageMonths, setOfferUsageMonths] = useState(item.offerUsageMonths?.toString() || '');
  const [offerUsageRenewalFee, setOfferUsageRenewalFee] = useState((item as any).offerUsageRenewalFee?.toString() || '');
  
  const [settlementType, setSettlementType] = useState(inf?.settlementType || '');
  const [bankName, setBankName] = useState(inf?.bankName || '');
  const [accountNumber, setAccountNumber] = useState(inf?.accountNumber || '');
  const [accountHolder, setAccountHolder] = useState(inf?.accountHolder || '');
  const [businessName, setBusinessName] = useState(inf?.businessName || '');
  const [idNumber, setIdNumber] = useState(
    (inf?.settlementType === '사업자' || inf?.settlementType === '면세사업자') ? (inf?.businessRegNo || '') : (inf?.freelancerId || '')
  );
  
  const [isSaving, setIsSaving] = useState(false);
  
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const lineItemUpdates: any = {
        uploadDueAt: uploadDueAt || null,
        offerFee: offerFee ? parseInt(offerFee) : null,
        offerUsageMonths: offerUsageMonths ? parseInt(offerUsageMonths) : null,
        offerUsageRenewalFee: offerUsageRenewalFee ? parseInt(offerUsageRenewalFee) : null,
      };
      
      const influencerUpdates: any = {
        settlementType: settlementType || null,
        bankName: bankName || null,
        accountNumber: accountNumber || null,
        accountHolder: accountHolder || null,
        businessName: businessName || null,
      };
      if (settlementType === '사업자' || settlementType === '면세사업자') {
        influencerUpdates.businessRegNo = idNumber || null;
        influencerUpdates.freelancerId = null;
      } else {
        influencerUpdates.freelancerId = idNumber || null;
        influencerUpdates.businessRegNo = null;
      }
      
      const promises: Promise<any>[] = [];
      promises.push(apiRequest('PATCH', `/api/line-items/${item.id}/operations`, lineItemUpdates));
      if (inf?.id) {
        promises.push(apiRequest('PATCH', `/api/influencers/${inf.id}`, influencerUpdates));
      }
      
      await Promise.all(promises);
      
      queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, campaignId] });
      queryClient.invalidateQueries({ queryKey: ['/api/line-items', item.id] });
      if (inf?.id) {
        queryClient.invalidateQueries({ queryKey: ['/api/influencers', inf.id] });
      }
      
      toast({ title: "계약정보가 저장되었습니다" });
      onClose();
    } catch (err) {
      toast({ title: "저장 실패", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
  
  const accounts = inf?.accounts || [];
  const { filled, total } = getContractInfoCompleteness(item);
  
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-contract-info">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            계약정보 기입
          </DialogTitle>
          <DialogDescription>
            {inf?.name || '인플루언서'} — 입력 완성도 {filled}/{total}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-5">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold border-b pb-1.5">캠페인 정보</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">업로드 예정일</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start font-normal"
                      data-testid="input-contract-upload-due"
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                      {uploadDueAt ? format(uploadDueAt, 'yyyy-MM-dd') : <span className="text-muted-foreground">선택</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={uploadDueAt}
                      onSelect={(date) => setUploadDueAt(date || undefined)}
                      locale={ko}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">광고비 (원)</Label>
                <Input
                  type="number"
                  value={offerFee}
                  onChange={(e) => setOfferFee(e.target.value)}
                  placeholder="0"
                  data-testid="input-contract-offer-fee"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">2차활용 기간 (개월)</Label>
                <Input
                  type="number"
                  value={offerUsageMonths}
                  onChange={(e) => setOfferUsageMonths(e.target.value)}
                  placeholder="0"
                  data-testid="input-contract-usage-months"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">2차활용 갱신 비용 (원)</Label>
                <Input
                  type="number"
                  value={offerUsageRenewalFee}
                  onChange={(e) => setOfferUsageRenewalFee(e.target.value)}
                  placeholder="0"
                  data-testid="input-contract-renewal-fee"
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <h4 className="text-sm font-semibold border-b pb-1.5">정산 정보</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">은행명</Label>
                <Select value={bankName} onValueChange={setBankName}>
                  <SelectTrigger data-testid="select-contract-bank">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {BANK_LIST.map(bank => (
                      <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">예금주명</Label>
                <Input
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="예금주명"
                  data-testid="input-contract-account-holder"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">계좌번호</Label>
                <Input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="- 없이 입력"
                  data-testid="input-contract-account-number"
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <h4 className="text-sm font-semibold border-b pb-1.5">신원 정보</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">정산 유형</Label>
                <Select value={settlementType} onValueChange={(val) => {
                    setSettlementType(val);
                    if (val === '사업자' || val === '면세사업자') {
                      setIdNumber(inf?.businessRegNo || '');
                    } else {
                      setIdNumber(inf?.freelancerId || '');
                    }
                  }}>
                  <SelectTrigger data-testid="select-contract-settlement-type">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="사업자">사업자 (세금계산서 처리, 부가세 10%)</SelectItem>
                    <SelectItem value="프리랜서">프리랜서 (부가세 X, 3.3% 공제)</SelectItem>
                    <SelectItem value="면세사업자">면세사업자 (*해당하는 경우에만 선택)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">성명 / 사업자명</Label>
                <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="성명 또는 사업자명"
                  data-testid="input-contract-business-name"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{(settlementType === '사업자' || settlementType === '면세사업자') ? '사업자등록번호' : '주민등록번호'}</Label>
                <Input
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder={(settlementType === '사업자' || settlementType === '면세사업자') ? '000-00-00000' : '000000-0000000'}
                  data-testid="input-contract-id-number"
                />
              </div>
            </div>
          </div>
        </div>
        
        <DialogFooter className="flex gap-2 mt-4">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-contract-info">
            취소
          </Button>
          <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-contract-info">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
