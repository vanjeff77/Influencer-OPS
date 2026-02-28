import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { KO } from "@/i18n/ko";
import DOMPurify from "dompurify";
import { 
  Send, 
  RefreshCw, 
  ChevronRight, 
  CheckCircle2, 
  Circle,
  CircleDot,
  AlertCircle, 
  Mail, 
  MessageSquare,
  MoreHorizontal,
  Save,
  User,
  Loader2,
  Users,
  FileText,
  Wallet,
  Reply,
  ArrowUpRight,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
  Maximize2
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { BulkEmailDialog } from "./bulk-email-dialog";
import { BulkEmailLogDialog } from "./bulk-email-log-dialog";
import { AttachEmailThreadDialog } from "./attach-email-thread-dialog";
import { api } from "@shared/routes";

interface CampaignLineItem {
  id: number;
  campaignId: number;
  influencerId: number;
  status: string | null;
  offerFee?: number | null;
  draftDueAt?: string | null;
  uploadDueAt?: string | null;
  firstContactCompleted?: boolean | null | undefined;
  firstContactAt?: string | null;
  firstContactMethod?: string | null;
  offerUsageMonths?: number | null;
  offerUsageRenewalFee?: number | null;
  stage?: string | null;
  influencer?: {
    id: number;
    name: string;
    email: string | null;
    memo: string | null;
    settlementType: string | null;
    bankName: string | null;
    accountHolder: string | null;
    accountNumber: string | null;
    businessName: string | null;
    businessRegNo: string | null;
    freelancerId: string | null;
    birthDate: string | null;
    accounts?: { platform: string; handle: string }[];
  };
}

interface Conversation {
  id: number;
  campaignLineItemId: number;
  subjectPrefix: string | null;
  gmailThreadId: string | null;
  lastMessageAt: string | null;
  lastReadAt: string | null;
  status: string | null;
  messageCount: number;
  lastMessage?: ConversationMessage;
  lineItem: CampaignLineItem;
}

interface ConversationMessage {
  id: number;
  conversationId: number;
  direction: string;
  senderEmail: string | null;
  senderName: string | null;
  recipientEmail: string | null;
  ccEmails: string[] | null;
  snippet: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  sendStatus: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string | null;
}

interface ConversationDetail {
  id: number;
  campaignLineItemId: number;
  subjectPrefix: string | null;
  gmailThreadId: string | null;
  messages: ConversationMessage[];
  lineItem: CampaignLineItem;
}

interface CampaignCommunicationProps {
  campaignId: number;
  campaignName?: string;
  workspaceId: number;
  lineItems: CampaignLineItem[];
}

function formatConversationDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateOnly.getTime() === today.getTime()) {
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours < 12 ? '오전' : '오후';
    return `${ampm} ${hours % 12 || 12}:${minutes}`;
  }
  if (dateOnly.getTime() === yesterday.getTime()) return '어제';
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}/${date.getDate()}(${dayNames[date.getDay()]})`;
  }
  const y = String(date.getFullYear()).slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

export function CampaignCommunication({ campaignId, campaignName, workspaceId, lineItems }: CampaignCommunicationProps) {
  const { toast } = useToast();
  const [selectedLineItemId, setSelectedLineItemId] = useState<number | null>(null);
  const [showFullMessage, setShowFullMessage] = useState<ConversationMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [bulkEmailLogOpen, setBulkEmailLogOpen] = useState(false);
  const [attachEmailOpen, setAttachEmailOpen] = useState(false);
  const [isFullSyncRunning, setIsFullSyncRunning] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [aiDraftDismissed, setAiDraftDismissed] = useState<number | null>(null);
  const [aiInstructionOpen, setAiInstructionOpen] = useState(false);
  const [aiInstructionText, setAiInstructionText] = useState("");
  const [aiInstructionEdited, setAiInstructionEdited] = useState(false);
  const [stepConfirmDialog, setStepConfirmDialog] = useState<{ open: boolean; targetStatus: string; type: 'contact_no_thread' | 'confirm_missing' | null }>({ open: false, targetStatus: '', type: null });

  const { data: workspaceData } = useQuery<any>({
    queryKey: ['/api/workspaces'],
    select: (data: any[]) => data?.find((w: any) => w.id === workspaceId),
  });
  const aiEnabled = workspaceData?.aiDraftEnabled === true;

  const { data: aiInstructionData } = useQuery<{ instruction: string }>({
    queryKey: ['/api/campaigns', campaignId, 'ai-instruction'],
    queryFn: () => apiRequest('GET', `/api/campaigns/${campaignId}/ai-instruction`).then(r => r.json()),
    enabled: aiEnabled,
  });

  useEffect(() => {
    if (aiInstructionData) {
      setAiInstructionText(aiInstructionData.instruction);
      setAiInstructionEdited(false);
    }
  }, [aiInstructionData]);

  const saveAiInstructionMutation = useMutation({
    mutationFn: (instruction: string) =>
      apiRequest('PUT', `/api/campaigns/${campaignId}/ai-instruction`, { instruction }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'ai-instruction'] });
      setAiInstructionEdited(false);
      toast({ title: "AI 지침이 저장되었습니다" });
    },
    onError: (err: any) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const { data: gmailStatus, isLoading: isLoadingGmail } = useQuery<{ connected: boolean; email?: string }>({
    queryKey: ['/api/email/gmail/status'],
  });

  const { data: conversations, isLoading: isLoadingConversations } = useQuery<Conversation[]>({
    queryKey: [`/api/conversations?campaignId=${campaignId}`],
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const filteredLineItems = useMemo(() => {
    let items = lineItems;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(li => 
        li.influencer?.name?.toLowerCase().includes(query) ||
        li.influencer?.email?.toLowerCase().includes(query)
      );
    }
    return [...items].sort((a, b) => {
      const convA = conversations?.find(c => c.campaignLineItemId === a.id);
      const convB = conversations?.find(c => c.campaignLineItemId === b.id);
      const lastMsgDateA = convA?.lastMessage?.sentAt || convA?.lastMessage?.createdAt;
      const lastMsgDateB = convB?.lastMessage?.sentAt || convB?.lastMessage?.createdAt;
      const unreadA = lastMsgDateA && (!convA?.lastReadAt || new Date(lastMsgDateA) > new Date(convA.lastReadAt)) ? 1 : 0;
      const unreadB = lastMsgDateB && (!convB?.lastReadAt || new Date(lastMsgDateB) > new Date(convB.lastReadAt)) ? 1 : 0;
      if (unreadA !== unreadB) return unreadB - unreadA;
      const dateA = lastMsgDateA ? new Date(lastMsgDateA).getTime() : 0;
      const dateB = lastMsgDateB ? new Date(lastMsgDateB).getTime() : 0;
      return dateB - dateA;
    });
  }, [lineItems, searchQuery, conversations]);

  const selectedLineItem = lineItems.find(li => li.id === selectedLineItemId);
  const existingConv = conversations?.find(c => c.campaignLineItemId === selectedLineItemId);

  const { data: conversationDetail, isLoading: isLoadingMessages, refetch: refetchConversation } = useQuery<ConversationDetail>({
    queryKey: ['/api/conversations', existingConv?.id?.toString()],
    enabled: !!existingConv?.id,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  const { data: aiDraft, refetch: refetchAiDraft } = useQuery<any>({
    queryKey: ['/api/conversations', existingConv?.id, 'ai-draft'],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${existingConv!.id}/ai-draft`, { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      return data;
    },
    enabled: aiEnabled && !!existingConv?.id,
  });

  const { data: pendingDraftConvIds } = useQuery<number[]>({
    queryKey: ['/api/conversations/ai-draft-ids', campaignId],
    queryFn: async () => {
      if (!conversations || conversations.length === 0) return [];
      const convIds = conversations.map(c => c.id);
      const res = await apiRequest('POST', '/api/conversations/ai-draft-ids', { conversationIds: convIds });
      const data = await res.json();
      return data.conversationIds || [];
    },
    enabled: aiEnabled && !!conversations && conversations.length > 0,
  });

  const generateAiDraft = useMutation({
    mutationFn: async (params: { conversationId: number; userFeedback?: string; requestedClassification?: string; requestedClassificationLabel?: string }) => {
      const res = await apiRequest('POST', `/api/conversations/${params.conversationId}/ai-draft`, {
        userFeedback: params.userFeedback,
        requestedClassification: params.requestedClassification,
        requestedClassificationLabel: params.requestedClassificationLabel,
      });
      return res.json();
    },
    onSuccess: () => {
      refetchAiDraft();
      queryClient.invalidateQueries({ queryKey: ['/api/conversations/ai-draft-ids', campaignId] });
    },
    onError: (err: any) => {
      toast({ title: "AI 초안 생성 실패", description: err.message, variant: "destructive" });
    },
  });

  const updateAiDraft = useMutation({
    mutationFn: async ({ draftId, status }: { draftId: number; status: string }) => {
      await apiRequest('PATCH', `/api/ai-drafts/${draftId}`, { status });
    },
    onSuccess: () => {
      refetchAiDraft();
      queryClient.invalidateQueries({ queryKey: ['/api/conversations/ai-draft-ids', campaignId] });
    },
  });

  const startConversation = useMutation({
    mutationFn: (lineItemId: number) => apiRequest('POST', `/api/line-items/${lineItemId}/start-conversation`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({ title: KO.pages.communication.startConversation });
    }
  });

  const syncMessages = useMutation({
    mutationFn: async ({ conversationId, fullSync = false }: { conversationId: number; fullSync?: boolean }) => {
      const res = await apiRequest('POST', `/api/conversations/${conversationId}/sync`, { fullSync });
      return res.json();
    },
    onSuccess: (data: any) => {
      refetchConversation();
      toast({ title: KO.pages.communication.syncSuccess, description: `${data.synced}${KO.pages.communication.syncedCount}` });
    }
  });

  const toggleFirstContact = useMutation({
    mutationFn: async ({ lineItemId, completed }: { lineItemId: number; completed: boolean }) => {
      const res = await apiRequest('PATCH', `/api/line-items/${lineItemId}/first-contact`, {
        firstContactCompleted: completed,
      });
      return res.json();
    },
    onMutate: async ({ lineItemId, completed }) => {
      await queryClient.cancelQueries({ queryKey: [api.campaigns.get.path, campaignId] });
      
      const previousCampaign = queryClient.getQueryData([api.campaigns.get.path, campaignId]);
      
      queryClient.setQueryData([api.campaigns.get.path, campaignId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items?.map((item: any) => 
            item.id === lineItemId 
              ? { ...item, firstContactCompleted: completed, firstContactAt: completed ? new Date().toISOString() : null } 
              : item
          )
        };
      });
      
      return { previousCampaign };
    },
    onError: (err, vars, context) => {
      if (context?.previousCampaign) {
        queryClient.setQueryData([api.campaigns.get.path, campaignId], context.previousCampaign);
      }
      toast({ title: "저장 실패", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: KO.pages.bulkEmail.toggleFirstContact });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, campaignId] });
      queryClient.invalidateQueries({ queryKey: [api.campaigns.list.path] });
    },
  });

  const HEADER_STEPS = [
    { key: 'waiting', label: '대기' },
    { key: 'contacted', label: '컨택' },
    { key: 'confirmed', label: '확정' },
    { key: 'contracted', label: '계약' },
  ] as const;

  const headerCurrentStatus = selectedLineItem?.status || 'waiting';
  const headerCurrentStepIndex = HEADER_STEPS.findIndex(s => s.key === headerCurrentStatus);

  const updateLineItemStatus = useMutation({
    mutationFn: (data: any) => apiRequest('PATCH', `/api/line-items/${selectedLineItem?.id}/operations`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, campaignId] });
      queryClient.invalidateQueries({ queryKey: [api.campaigns.list.path] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({ title: KO.pages.communication.saved });
    }
  });

  const handleHeaderStepClick = async (stepKey: string) => {
    if (!selectedLineItem || stepKey === headerCurrentStatus) return;
    const targetIndex = HEADER_STEPS.findIndex(s => s.key === stepKey);

    if (targetIndex < headerCurrentStepIndex) {
      updateLineItemStatus.mutate({ status: stepKey });
      return;
    }

    if (targetIndex >= 1 && headerCurrentStepIndex < 1) {
      try {
        const res = await fetch(`/api/campaigns/${selectedLineItem.campaignId}/line-items/${selectedLineItem.id}/has-thread`);
        const data = await res.json();
        if (!data.hasThread) {
          setStepConfirmDialog({ open: true, targetStatus: stepKey, type: 'contact_no_thread' });
          return;
        }
      } catch {
        setStepConfirmDialog({ open: true, targetStatus: stepKey, type: 'contact_no_thread' });
        return;
      }
    }

    if (targetIndex >= 2) {
      const hasFee = selectedLineItem.offerFee && selectedLineItem.offerFee > 0;
      const hasUploadDate = !!selectedLineItem.uploadDueAt;
      if (!hasFee || !hasUploadDate) {
        setStepConfirmDialog({ open: true, targetStatus: stepKey, type: 'confirm_missing' });
        return;
      }
    }

    updateLineItemStatus.mutate({ status: stepKey });
  };

  const handleSelectLineItem = async (li: CampaignLineItem) => {
    setSelectedLineItemId(li.id);
    setAiDraftDismissed(null);
    const conv = conversations?.find(c => c.campaignLineItemId === li.id);
    if (!conv) {
      startConversation.mutate(li.id);
    } else if (conv.lastMessage && (conv.lastMessage.sentAt || conv.lastMessage.createdAt) && (!conv.lastReadAt || new Date(conv.lastMessage.sentAt || conv.lastMessage.createdAt || '') > new Date(conv.lastReadAt))) {
      try {
        await apiRequest('PATCH', `/api/conversations/${conv.id}`, { lastReadAt: new Date().toISOString() });
        queryClient.invalidateQueries({ queryKey: [`/api/conversations?campaignId=${campaignId}`] });
      } catch {}
    }
  };

  const stripSubjectFromSnippet = (snippet: string | null): string => {
    if (!snippet) return '';
    const subjectPattern = /^\[(?:Re:\s*)?(?:\[[^\]]*\])?\s*[^\]]*\]\s*/i;
    return snippet.replace(subjectPattern, '').trim() || snippet;
  };

  const getFirstContactBadge = (li: CampaignLineItem) => {
    if (li.firstContactCompleted) {
      return (
        <Badge 
          variant="outline" 
          className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            toggleFirstContact.mutate({ lineItemId: li.id, completed: false });
          }}
          data-testid={`badge-first-contact-${li.id}`}
        >
          <CheckCircle2 className="w-3 h-3 mr-1" />
          {KO.pages.bulkEmail.firstContactCompleted}
        </Badge>
      );
    }
    return (
      <Badge 
        variant="outline" 
        className="bg-gray-50 text-gray-500 border-gray-200 text-[10px] cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          toggleFirstContact.mutate({ lineItemId: li.id, completed: true });
        }}
        data-testid={`badge-first-contact-not-${li.id}`}
      >
        {KO.pages.bulkEmail.firstContactNotCompleted}
      </Badge>
    );
  };

  const getStatusBadge = (conv?: Conversation) => {
    if (!conv) return null;
    switch (conv.status) {
      case 'replied':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]" data-testid={`badge-status-replied-${conv.id}`}>{KO.pages.communication.replied}</Badge>;
      case 'no_response':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[10px]" data-testid={`badge-status-no-response-${conv.id}`}>{KO.pages.communication.noResponse}</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]" data-testid={`badge-status-failed-${conv.id}`}>{KO.pages.communication.failed}</Badge>;
      default:
        return conv.messageCount > 0 ? <Badge variant="secondary" className="text-[10px]" data-testid={`badge-message-count-${conv.id}`}>{conv.messageCount}건</Badge> : null;
    }
  };

  const handleFullSyncAll = async () => {
    if (!conversations || conversations.length === 0) {
      toast({ title: "동기화할 대화가 없습니다." });
      return;
    }
    setIsFullSyncRunning(true);
    setSyncProgress({ current: 0, total: conversations.length });
    try {
      const res = await apiRequest('POST', `/api/campaigns/${campaignId}/sync-all`);
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?campaignId=${campaignId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({ title: `동기화 완료: ${result.synced}개 새 메시지` });
    } catch (err) {
      toast({ title: "동기화 실패", variant: "destructive" });
    } finally {
      setIsFullSyncRunning(false);
      setSyncProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {aiEnabled && (
        <div className="border rounded-lg bg-purple-50/50 dark:bg-purple-950/20" data-testid="section-ai-instruction">
          <button
            onClick={() => setAiInstructionOpen(!aiInstructionOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-left hover:bg-purple-100/50 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
            data-testid="button-toggle-ai-instruction"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span>캠페인 AI 지침</span>
              {aiInstructionText && (
                <span className="text-xs text-muted-foreground max-w-[300px] truncate">
                  — {aiInstructionText.substring(0, 50)}{aiInstructionText.length > 50 ? '...' : ''}
                </span>
              )}
            </div>
            {aiInstructionOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {aiInstructionOpen && (
            <div className="px-4 pb-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                이 캠페인의 AI 초안 생성 시 추가 적용할 지침을 작성하세요. (예: 캠페인 특이사항, 단가 가이드라인 등)
              </p>
              <Textarea
                value={aiInstructionText}
                onChange={(e) => {
                  setAiInstructionText(e.target.value);
                  setAiInstructionEdited(true);
                }}
                className="font-mono text-xs min-h-[120px] leading-relaxed bg-white dark:bg-gray-900"
                placeholder="예: 이 캠페인의 제안 단가는 50만원이며, 최대 70만원까지 협의 가능합니다. 인플루언서가 단가 네고를 시도하면 60만원을 먼저 제안하세요."
                data-testid="textarea-ai-instruction"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => saveAiInstructionMutation.mutate(aiInstructionText)}
                  disabled={saveAiInstructionMutation.isPending || !aiInstructionEdited}
                  data-testid="button-save-ai-instruction"
                >
                  {saveAiInstructionMutation.isPending ? "저장 중..." : "지침 저장"}
                </Button>
                {aiInstructionEdited && (
                  <span className="text-xs text-amber-600">수정됨 — 저장하지 않으면 반영되지 않습니다</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[600px] lg:h-[calc(100vh-100px)]">
      {/* Left Panel: Line Items List */}
      <div className="lg:col-span-3 border rounded-lg overflow-hidden flex flex-col bg-[#ffffff]" data-testid="panel-conversations-list">
        <div className="p-3 border-b bg-muted/30">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <span className="text-sm font-medium">인플루언서</span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setBulkEmailOpen(true)}
                data-testid="button-bulk-email"
              >
                <Users className="w-3 h-3 mr-1" />
                {KO.pages.bulkEmail.title}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={handleFullSyncAll}
                disabled={isFullSyncRunning}
                data-testid="button-full-sync-all"
              >
                {isFullSyncRunning ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3 mr-1" />
                )}
                {isFullSyncRunning ? `${syncProgress.current}/${syncProgress.total}` : '동기화'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setBulkEmailLogOpen(true)}
                data-testid="button-bulk-email-log"
              >
                <FileText className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isLoadingGmail ? (
              <Skeleton className="h-5 w-20" />
            ) : (
              <Badge variant={gmailStatus?.connected ? "default" : "secondary"} className="text-[10px]" data-testid="badge-gmail-status">
                {gmailStatus?.connected ? (
                  <><Mail className="w-3 h-3 mr-1" />{KO.pages.communication.gmailConnected}</>
                ) : (
                  KO.pages.communication.gmailNotConnected
                )}
              </Badge>
            )}
          </div>
        </div>
        <ScrollArea className="flex-1">
          {isLoadingConversations ? (
            <div className="p-3 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y">
              {filteredLineItems.map(li => {
                const conv = conversations?.find(c => c.campaignLineItemId === li.id);
                const isSelected = selectedLineItemId === li.id;
                const lastMsgDate = conv?.lastMessage?.sentAt || conv?.lastMessage?.createdAt;
                const hasUnread = lastMsgDate && (!conv?.lastReadAt || new Date(lastMsgDate) > new Date(conv.lastReadAt));
                return (
                  <div
                    key={li.id}
                    className={`p-3 cursor-pointer transition-colors overflow-hidden ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                    onClick={() => handleSelectLineItem(li)}
                    data-testid={`conversation-item-${li.id}`}
                  >
                    <div className="flex items-start gap-2 overflow-hidden">
                      <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                        <AvatarImage src={li.influencer?.accounts?.[0]?.profileImageUrl || undefined} />
                        <AvatarFallback className="text-xs">{li.influencer?.name?.substring(0, 2) || 'IN'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 w-0 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className={`text-sm truncate w-0 flex-1 ${hasUnread ? 'font-bold' : 'font-medium'}`}>{li.influencer?.name}</span>
                          {aiEnabled && conv && pendingDraftConvIds?.includes(conv.id) && (
                            <Sparkles className="w-3 h-3 text-purple-500 shrink-0" data-testid={`icon-ai-draft-${li.id}`} />
                          )}
                          {hasUnread && (
                            <span className="w-2 h-2 bg-destructive rounded-full shrink-0" aria-label="새 메시지" data-testid={`badge-unread-${li.id}`} />
                          )}
                          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                            {conv?.lastMessage && (
                              <>
                                {conv.lastMessage.direction === 'inbound' ? (
                                  <Reply className="w-3.5 h-3.5 text-orange-500" data-testid={`icon-needs-reply-${li.id}`} />
                                ) : (
                                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/50" data-testid={`icon-sent-${li.id}`} />
                                )}
                                <span className="text-xs tabular-nums whitespace-nowrap text-foreground font-semibold" data-testid={`text-last-message-date-${li.id}`}>
                                  {formatConversationDate(conv.lastMessage.sentAt || conv.lastMessage.createdAt)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className={`text-xs flex items-center gap-1 mt-0.5 overflow-hidden ${hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                          <span className="truncate w-0 flex-1">
                            {conv?.lastMessage?.snippet ? stripSubjectFromSnippet(conv.lastMessage.snippet) : (li.influencer?.email || KO.pages.communication.noConversations)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredLineItems.length === 0 && lineItems.length > 0 && (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  검색 결과가 없습니다
                </div>
              )}
              {lineItems.length === 0 && (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  이 캠페인에 인플루언서가 없습니다
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
      {/* Center Panel: Message Thread */}
      <div className="lg:col-span-7 border rounded-lg overflow-hidden flex flex-col" data-testid="panel-message-thread">
        {selectedLineItem ? (
          <>
            <div className="p-3 border-b flex flex-col gap-2 bg-[#ffffff]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={selectedLineItem.influencer?.accounts?.[0]?.profileImageUrl || undefined} />
                    <AvatarFallback className="text-xs">{selectedLineItem.influencer?.name?.substring(0, 2)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{selectedLineItem.influencer?.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{selectedLineItem.influencer?.email || KO.pages.communication.noEmail}</div>
                  </div>
                  <div
                    className="inline-flex items-center gap-0.5 rounded-md bg-muted dark:bg-muted/60 p-0.5 ml-2"
                    data-testid={`progress-bar-header-${selectedLineItem.id}`}
                  >
                    {HEADER_STEPS.map((step, idx) => {
                      const isCurrent = step.key === headerCurrentStatus;
                      const isCompleted = idx < headerCurrentStepIndex;
                      return (
                        <Button
                          key={step.key}
                          variant={isCurrent ? "default" : "ghost"}
                          size="sm"
                          onClick={() => handleHeaderStepClick(step.key)}
                          className={`gap-1 h-7 px-2 text-xs ${isCompleted ? 'text-primary font-medium' : ''}`}
                          data-testid={`step-header-${step.key}-${selectedLineItem.id}`}
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
                </div>
                <div className="flex items-center gap-1 shrink-0">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setAttachEmailOpen(true)}
                  data-testid="button-attach-email"
                >
                  <Mail className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">{KO.pages.attachEmail.title}</span>
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => existingConv && syncMessages.mutate({ conversationId: existingConv.id })}
                      disabled={syncMessages.isPending || !existingConv}
                      data-testid="button-sync-messages"
                    >
                      <RefreshCw className={`w-4 h-4 mr-1 ${syncMessages.isPending ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">{KO.pages.communication.syncMessages}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>새 이메일 동기화</TooltipContent>
                </Tooltip>
                </div>
              </div>
            </div>
            {stepConfirmDialog.open && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-background rounded-lg p-6 max-w-[400px] shadow-lg space-y-4">
                  <h3 className="font-semibold">
                    {stepConfirmDialog.type === 'contact_no_thread' ? '컨택 확인' : '확정 불가'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {stepConfirmDialog.type === 'contact_no_thread'
                      ? '메일에 컨택내역이 없습니다. 컨택으로 기록할까요?'
                      : '확정 처리 전 광고비와 업로드 일정을 입력해주세요'}
                  </p>
                  <div className="flex justify-end gap-2">
                    {stepConfirmDialog.type === 'contact_no_thread' ? (
                      <>
                        <Button variant="outline" onClick={() => setStepConfirmDialog({ open: false, targetStatus: '', type: null })}>취소</Button>
                        <Button onClick={() => {
                          updateLineItemStatus.mutate({ status: stepConfirmDialog.targetStatus });
                          setStepConfirmDialog({ open: false, targetStatus: '', type: null });
                        }}>확인</Button>
                      </>
                    ) : (
                      <Button onClick={() => setStepConfirmDialog({ open: false, targetStatus: '', type: null })}>확인</Button>
                    )}
                  </div>
                </div>
              </div>
            )}
            <ScrollArea className="relative overflow-hidden flex-1 p-4 bg-[#ffffff]">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <MessageThread 
                  messages={conversationDetail?.messages || []} 
                  onViewFull={setShowFullMessage}
                  influencerName={selectedLineItem.influencer?.name}
                  influencerEmail={selectedLineItem.influencer?.email}
                />
              )}
            </ScrollArea>
            <MessageComposer 
              conversationId={existingConv?.id} 
              influencerEmail={selectedLineItem.influencer?.email}
              senderEmail={conversationDetail?.messages?.find((m: any) => m.direction === 'outbound')?.senderEmail || null}
              lastMessageCc={(() => {
                const allCc = new Set<string>();
                conversationDetail?.messages?.forEach((msg: any) => {
                  if (msg.ccEmails && Array.isArray(msg.ccEmails)) {
                    msg.ccEmails.forEach((e: string) => {
                      if (e) allCc.add(e.toLowerCase().trim());
                    });
                  }
                });
                const senderEmail = conversationDetail?.messages?.find((m: any) => m.direction === 'outbound')?.senderEmail;
                const infEmail = selectedLineItem.influencer?.email;
                if (senderEmail) allCc.delete(senderEmail.toLowerCase().trim());
                if (infEmail) allCc.delete(infEmail.toLowerCase().trim());
                const result = Array.from(allCc);
                return result.length > 0 ? result : null;
              })()}
              aiDraft={aiEnabled && aiDraft && aiDraftDismissed !== aiDraft.id ? aiDraft : null}
              aiEnabled={aiEnabled}
              isLastInbound={conversationDetail?.messages && conversationDetail.messages.length > 0 && conversationDetail.messages[conversationDetail.messages.length - 1]?.direction === 'inbound'}
              onGenerateDraft={(userFeedback?: string, requestedClassification?: string, requestedClassificationLabel?: string) => existingConv && generateAiDraft.mutate({ conversationId: existingConv.id, userFeedback, requestedClassification, requestedClassificationLabel })}
              isGeneratingDraft={generateAiDraft.isPending}
              onUseDraft={(draftId: number) => updateAiDraft.mutate({ draftId, status: 'used' })}
              onDismissDraft={(draftId: number) => {
                setAiDraftDismissed(draftId);
                updateAiDraft.mutate({ draftId, status: 'dismissed' });
              }}
              onSent={() => {
                refetchConversation();
                if (existingConv?.id) {
                  syncMessages.mutate({ conversationId: existingConv.id });
                }
                queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, campaignId] });
                queryClient.invalidateQueries({ queryKey: [`/api/conversations?campaignId=${campaignId}`] });
              }}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{KO.pages.communication.selectInfluencer}</p>
            </div>
          </div>
        )}
      </div>
      {/* Right Panel: Influencer Details */}
      <div className="lg:col-span-2 border rounded-lg overflow-hidden" data-testid="panel-influencer-details">
        {selectedLineItem ? (
          <InfluencerDetailPanel 
            key={selectedLineItem.influencer?.id ?? selectedLineItem.id}
            influencer={selectedLineItem.influencer} 
            lineItem={selectedLineItem}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center p-6">
              <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{KO.pages.communication.influencerDetails}</p>
            </div>
          </div>
        )}
      </div>
      {/* Full Message Drawer */}
      <Sheet open={!!showFullMessage} onOpenChange={(open) => !open && setShowFullMessage(null)}>
        <SheetContent className="w-[500px] sm:max-w-[500px] flex flex-col h-full">
          <SheetHeader className="shrink-0">
            <SheetTitle>{KO.pages.communication.viewFullMessage}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 mt-4">
            {showFullMessage && (
              <div 
                className="prose prose-sm max-w-none dark:prose-invert pr-4" 
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(showFullMessage.bodyHtml || showFullMessage.bodyText || '') }} 
              />
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
      {/* Bulk Email Dialog */}
      <BulkEmailDialog
        open={bulkEmailOpen}
        onOpenChange={setBulkEmailOpen}
        campaignId={campaignId}
        campaignName={campaignName || ''}
        lineItems={lineItems}
        workspaceId={workspaceId}
      />
      {/* Bulk Email Log Dialog */}
      <BulkEmailLogDialog
        open={bulkEmailLogOpen}
        onOpenChange={setBulkEmailLogOpen}
        campaignId={campaignId}
      />
      {/* Attach Email Thread Dialog */}
      {selectedLineItem && (
        <AttachEmailThreadDialog
          open={attachEmailOpen}
          onOpenChange={setAttachEmailOpen}
          lineItemId={selectedLineItem.id}
          influencerEmail={selectedLineItem.influencer?.email}
          campaignId={campaignId}
          workspaceId={workspaceId}
        />
      )}
    </div>
    </div>
  );
}

function MessageThread({ messages, onViewFull, influencerName, influencerEmail }: { messages: ConversationMessage[]; onViewFull: (msg: ConversationMessage) => void; influencerName?: string; influencerEmail?: string }) {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {KO.pages.communication.noConversations}
      </div>
    );
  }

  const getDisplaySnippet = (snippet: string | null): string => {
    if (!snippet) return '(내용 없음)';
    const subjectPattern = /^\[(?:Re:\s*)?(?:\[[^\]]*\])?\s*[^\]]*\]\s*/i;
    return snippet.replace(subjectPattern, '').trim() || snippet;
  };

  const formatMessageTime = (date: Date): string => {
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = dayNames[date.getDay()];
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours < 12 ? '오전' : '오후';
    const displayHours = hours % 12 || 12;
    return `${month}/${day}(${dayOfWeek}) ${ampm} ${displayHours}:${minutes}`;
  };

  const inboundSenderColors = [
    'bg-slate-200 dark:bg-slate-700',
    'bg-blue-100 dark:bg-blue-900',
    'bg-green-100 dark:bg-green-900',
    'bg-amber-100 dark:bg-amber-900',
    'bg-purple-100 dark:bg-purple-900',
    'bg-pink-100 dark:bg-pink-900',
    'bg-cyan-100 dark:bg-cyan-900',
  ];

  const uniqueInboundSenders = Array.from(new Set(
    messages
      .filter(m => m.direction === 'inbound' && m.senderEmail)
      .map(m => m.senderEmail?.toLowerCase())
  ));

  const getSenderColor = (senderEmail: string | null | undefined): string => {
    if (!senderEmail) return inboundSenderColors[0];
    const index = uniqueInboundSenders.indexOf(senderEmail.toLowerCase());
    return inboundSenderColors[index % inboundSenderColors.length];
  };

  const getSenderDisplayName = (msg: ConversationMessage): string | null => {
    if (msg.direction === 'outbound') return null;
    if (influencerName && influencerEmail && msg.senderEmail?.toLowerCase() === influencerEmail.toLowerCase()) {
      return influencerName;
    }
    if (msg.senderName) return msg.senderName;
    if (msg.senderEmail) return msg.senderEmail.split('@')[0];
    return null;
  };

  return (
    <div className="space-y-3">
      {messages.map(msg => {
        const isFromInfluencer = influencerEmail && msg.senderEmail?.toLowerCase() === influencerEmail.toLowerCase();
        const isOutbound = !isFromInfluencer;
        const senderName = getSenderDisplayName(msg);
        const timeStr = (msg.sentAt || msg.receivedAt) ? formatMessageTime(new Date(msg.sentAt || msg.receivedAt!)) : null;
        return (
          <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} items-end gap-1.5`}>
            {isOutbound && timeStr && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 mb-1 flex items-center gap-1" data-testid={`text-msg-time-${msg.id}`}>
                {msg.sendStatus === 'sent' && <CheckCircle2 className="w-3 h-3" />}
                {timeStr}
              </span>
            )}
            <div className="max-w-[75%]">
              {senderName && isFromInfluencer && (
                <p className="text-[11px] font-medium text-muted-foreground mb-0.5 ml-1">{senderName}</p>
              )}
              <div 
                className={`rounded-lg p-3 cursor-pointer transition-colors ${
                  isOutbound 
                    ? 'bg-yellow-300 text-gray-900' 
                    : getSenderColor(msg.senderEmail)
                } ${msg.sendStatus === 'failed' ? 'border-2 border-red-500' : ''}`}
                onClick={() => onViewFull(msg)}
                data-testid={`message-bubble-${msg.id}`}
              >
                <p className="text-sm line-clamp-2">{getDisplaySnippet(msg.snippet)}</p>
                {msg.sendStatus === 'failed' && (
                  <div className="flex items-center gap-1 mt-1">
                    <Badge variant="destructive" className="text-[10px]" data-testid={`badge-send-failed-${msg.id}`}>
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {KO.pages.communication.failed}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
            {!isOutbound && timeStr && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 mb-1" data-testid={`text-msg-time-${msg.id}`}>
                {timeStr}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MessageComposer({ conversationId, influencerEmail, senderEmail, lastMessageCc, aiDraft, aiEnabled, isLastInbound, onGenerateDraft, isGeneratingDraft, onUseDraft, onDismissDraft, onSent }: { conversationId?: number; influencerEmail?: string | null; senderEmail?: string | null; lastMessageCc?: string[] | null; aiDraft?: any; aiEnabled?: boolean; isLastInbound?: boolean; onGenerateDraft?: (userFeedback?: string, requestedClassification?: string, requestedClassificationLabel?: string) => void; isGeneratingDraft?: boolean; onUseDraft?: (id: number) => void; onDismissDraft?: (id: number) => void; onSent: () => void }) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [cc, setCc] = useState(lastMessageCc?.join(', ') || "");
  const [showCcEdit, setShowCcEdit] = useState(false);
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [expandDialogOpen, setExpandDialogOpen] = useState(false);
  const [expandMessage, setExpandMessage] = useState("");
  const [expandCc, setExpandCc] = useState("");

  const lastCcKey = lastMessageCc ? [...lastMessageCc].sort().join('|') : '';
  useEffect(() => {
    const newCc = lastMessageCc?.join(', ') || "";
    setCc(newCc);
  }, [lastCcKey]);

  const ccList = cc.split(',').map(e => e.trim()).filter(Boolean);

  const sendMessage = useMutation({
    mutationFn: (data: { body: string; cc?: string }) => 
      apiRequest('POST', `/api/conversations/${conversationId}/messages`, data),
    onSuccess: () => {
      setMessage("");
      setCc("");
      setShowCcEdit(false);
      onSent();
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({ title: KO.toast.sent });
    },
    onError: () => {
      toast({ variant: "destructive", title: KO.toast.sendFailed });
    }
  });

  const handleSend = () => {
    if (!message.trim() || !conversationId) return;
    sendMessage.mutate({ body: message, cc: cc.trim() || undefined });
  };

  if (!influencerEmail) {
    return (
      <div className="p-3 border-t bg-muted/30 text-center text-sm text-muted-foreground">
        {KO.pages.communication.noEmail}
      </div>
    );
  }

  const handleUseDraft = () => {
    if (aiDraft) {
      setMessage(aiDraft.draft);
      onUseDraft?.(aiDraft.id);
    }
  };

  return (
    <div className="p-3 border-t bg-[#ffffff]">
      {aiDraft && (
        <div className="mb-3 rounded-lg border border-purple-200 bg-purple-50/50 p-3" data-testid="card-ai-draft">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-medium text-purple-700">AI 초안</span>
              {aiDraft.classification && (
                <Badge variant="outline" className="text-[10px] bg-purple-100 text-purple-600 border-purple-200" data-testid="badge-ai-classification">
                  {aiDraft.classification} {aiDraft.classificationLabel}
                </Badge>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => onDismissDraft?.(aiDraft.id)}
              data-testid="button-dismiss-draft"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="text-sm text-foreground whitespace-pre-wrap mb-2 max-h-[120px] overflow-y-auto" data-testid="text-ai-draft-body">
            {aiDraft.draft}
          </div>
          {aiDraft.alternativesParsed && aiDraft.alternativesParsed.length > 0 && (
            <div className="mb-2 flex items-center gap-1.5 flex-wrap" data-testid="section-alternatives">
              <span className="text-[10px] text-muted-foreground">다른 옵션:</span>
              {aiDraft.alternativesParsed.map((alt: { classification: string; classificationLabel: string }, idx: number) => (
                <Button
                  key={idx}
                  size="sm"
                  variant="outline"
                  className="text-[10px] h-6 px-2 py-0 text-purple-600 border-purple-200 hover:bg-purple-50"
                  onClick={() => onGenerateDraft?.(undefined, alt.classification, alt.classificationLabel)}
                  disabled={isGeneratingDraft}
                  data-testid={`button-alternative-${idx}`}
                >
                  {alt.classification} {alt.classificationLabel}
                </Button>
              ))}
            </div>
          )}
          {showFeedbackInput && (
            <div className="mb-2 space-y-2" data-testid="section-feedback-input">
              <Textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="수정 요청사항을 입력하세요 (예: 좀 더 정중하게, 단가를 강조해주세요)"
                className="text-xs min-h-[60px] max-h-[100px] resize-none bg-white dark:bg-gray-900"
                data-testid="textarea-feedback"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="text-xs bg-purple-600 text-white"
                  onClick={() => {
                    onGenerateDraft?.(feedbackText || undefined);
                    setShowFeedbackInput(false);
                    setFeedbackText("");
                  }}
                  disabled={isGeneratingDraft}
                  data-testid="button-submit-regenerate"
                >
                  {isGeneratingDraft ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" />재생성 중...</>
                  ) : (
                    <><RefreshCw className="w-3 h-3 mr-1" />재생성</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => { setShowFeedbackInput(false); setFeedbackText(""); }}
                  data-testid="button-cancel-feedback"
                >
                  취소
                </Button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 border-purple-200"
              onClick={handleUseDraft}
              data-testid="button-use-draft"
            >
              <Sparkles className="w-3 h-3 mr-1" />
              초안 사용
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs text-purple-600 border-purple-200 hover:bg-purple-50"
              onClick={() => setShowFeedbackInput(!showFeedbackInput)}
              disabled={isGeneratingDraft}
              data-testid="button-toggle-feedback"
            >
              <MessageSquare className="w-3 h-3 mr-1" />
              다른 답변 요청하기
            </Button>
          </div>
        </div>
      )}

      {!aiDraft && aiEnabled && isLastInbound && conversationId && (
        <div className="mb-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50"
            onClick={() => onGenerateDraft?.()}
            disabled={isGeneratingDraft}
            data-testid="button-generate-draft"
          >
            {isGeneratingDraft ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" />AI 초안 생성 중...</>
            ) : (
              <><Sparkles className="w-3 h-3 mr-1" />AI 초안 생성</>
            )}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {senderEmail && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground cursor-help" data-testid="badge-sender">
                발신 <Mail className="w-2.5 h-2.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{senderEmail}</p>
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground cursor-help" data-testid="badge-recipient">
              수신 <User className="w-2.5 h-2.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">{influencerEmail}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground cursor-pointer"
              onClick={() => setShowCcEdit(!showCcEdit)}
              data-testid="badge-cc"
            >
              참조 {ccList.length > 0 ? ccList.length + '명' : '없음'} <Users className="w-2.5 h-2.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {ccList.length > 0 ? (
              <>
                <p className="text-xs font-medium mb-1">참조 목록:</p>
                {ccList.map((email, i) => (
                  <p key={i} className="text-xs">{email}</p>
                ))}
                <p className="text-[10px] text-muted-foreground mt-1">클릭하여 편집</p>
              </>
            ) : (
              <p className="text-xs">참조 없음 (클릭하여 추가)</p>
            )}
          </TooltipContent>
        </Tooltip>
      </div>
      {showCcEdit && (
        <Input
          placeholder="참조 (CC): 이메일 주소, 쉼표로 구분"
          value={cc}
          onChange={(e) => setCc(e.target.value)}
          className="mb-2 text-sm"
          autoFocus
          data-testid="input-email-cc"
        />
      )}
      <div className="flex gap-2">
        <Textarea 
          placeholder={KO.pages.communication.typeMessage}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="min-h-[60px] max-h-[120px] text-sm resize-none"
          data-testid="input-message-body"
        />
        <div className="flex flex-col gap-1">
          <Button 
            size="icon" 
            onClick={handleSend} 
            disabled={sendMessage.isPending || !message.trim()}
            data-testid="button-send-message"
          >
            {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setExpandMessage(message);
              setExpandCc(cc);
              setExpandDialogOpen(true);
            }}
            data-testid="button-expand-composer"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Dialog open={expandDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setMessage(expandMessage);
          setCc(expandCc);
        }
        setExpandDialogOpen(open);
      }}>
        <DialogContent className="max-w-2xl" data-testid="dialog-expand-composer">
          <DialogHeader>
            <DialogTitle>메시지 작성</DialogTitle>
            <DialogDescription className="sr-only">넓은 화면에서 메시지를 작성합니다</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              {senderEmail && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted">
                  <Mail className="w-3 h-3" /> {senderEmail}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted">
                <User className="w-3 h-3" /> {influencerEmail}
              </span>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">참조 (CC)</label>
              <Input
                placeholder="이메일 주소, 쉼표로 구분"
                value={expandCc}
                onChange={(e) => setExpandCc(e.target.value)}
                className="text-sm"
                data-testid="input-expand-cc"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">본문</label>
              <Textarea
                placeholder={KO.pages.communication.typeMessage}
                value={expandMessage}
                onChange={(e) => setExpandMessage(e.target.value)}
                className="text-sm resize-y"
                style={{ minHeight: '300px' }}
                autoFocus
                data-testid="input-expand-message-body"
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  if (!expandMessage.trim() || !conversationId) return;
                  sendMessage.mutate(
                    { body: expandMessage, cc: expandCc.trim() || undefined },
                    {
                      onSuccess: () => {
                        setExpandMessage("");
                        setExpandCc("");
                        setExpandDialogOpen(false);
                      },
                    }
                  );
                }}
                disabled={sendMessage.isPending || !expandMessage.trim()}
                data-testid="button-expand-send"
              >
                {sendMessage.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                전송
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfluencerDetailPanel({ influencer, lineItem }: { influencer?: CampaignLineItem['influencer']; lineItem: CampaignLineItem }) {
  const { toast } = useToast();
  const [memo, setMemo] = useState(influencer?.memo || "");
  
  const [offerFee, setOfferFee] = useState<string>(lineItem.offerFee?.toString() || "");
  const [offerFeeDisplay, setOfferFeeDisplay] = useState<string>(lineItem.offerFee ? Number(lineItem.offerFee).toLocaleString() : "");
  const [draftDueAt, setDraftDueAt] = useState(lineItem.draftDueAt ? new Date(lineItem.draftDueAt).toISOString().split('T')[0] : "");
  const [uploadDueAt, setUploadDueAt] = useState(lineItem.uploadDueAt ? new Date(lineItem.uploadDueAt).toISOString().split('T')[0] : "");
  const [offerUsageMonths, setOfferUsageMonths] = useState(lineItem.offerUsageMonths?.toString() || "");
  const [offerUsageRenewalFee, setOfferUsageRenewalFee] = useState(lineItem.offerUsageRenewalFee?.toString() || "");

  useEffect(() => {
    setOfferFee(lineItem.offerFee?.toString() || "");
    setOfferFeeDisplay(lineItem.offerFee ? Number(lineItem.offerFee).toLocaleString() : "");
    setDraftDueAt(lineItem.draftDueAt ? new Date(lineItem.draftDueAt).toISOString().split('T')[0] : "");
    setUploadDueAt(lineItem.uploadDueAt ? new Date(lineItem.uploadDueAt).toISOString().split('T')[0] : "");
    setOfferUsageMonths(lineItem.offerUsageMonths?.toString() || "");
    setOfferUsageRenewalFee(lineItem.offerUsageRenewalFee?.toString() || "");
  }, [lineItem.id, lineItem.offerFee, lineItem.draftDueAt, lineItem.uploadDueAt, lineItem.offerUsageMonths, lineItem.offerUsageRenewalFee]);

  useEffect(() => {
    setMemo(influencer?.memo || "");
  }, [influencer?.id, influencer?.memo]);

  const [settlementType, setSettlementType] = useState(influencer?.settlementType || "");
  const [bankName, setBankName] = useState(influencer?.bankName || "");
  const [accountHolder, setAccountHolder] = useState(influencer?.accountHolder || "");
  const [accountNumber, setAccountNumber] = useState(influencer?.accountNumber || "");
  const [businessName, setBusinessName] = useState(influencer?.businessName || "");
  const [businessRegNo, setBusinessRegNo] = useState(influencer?.businessRegNo || "");
  const [freelancerId, setFreelancerId] = useState(influencer?.freelancerId || "");

  useEffect(() => {
    setSettlementType(influencer?.settlementType || "");
    setBankName(influencer?.bankName || "");
    setAccountHolder(influencer?.accountHolder || "");
    setAccountNumber(influencer?.accountNumber || "");
    setBusinessName(influencer?.businessName || "");
    setBusinessRegNo(influencer?.businessRegNo || "");
    setFreelancerId(influencer?.freelancerId || "");
  }, [influencer?.id, influencer?.settlementType, influencer?.bankName, influencer?.accountHolder, influencer?.accountNumber, influencer?.businessName, influencer?.businessRegNo, influencer?.freelancerId]);

  const updateInfluencer = useMutation({
    mutationFn: (data: any) => apiRequest('PATCH', `/api/influencers/${influencer?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/influencers'] });
      queryClient.invalidateQueries({ queryKey: [api.influencers.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, lineItem.campaignId] });
      queryClient.invalidateQueries({ queryKey: [api.campaigns.list.path] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({ title: KO.pages.communication.saved });
    }
  });

  const updateLineItem = useMutation({
    mutationFn: (data: any) => apiRequest('PATCH', `/api/line-items/${lineItem.id}/operations`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, lineItem.campaignId] });
      queryClient.invalidateQueries({ queryKey: [api.campaigns.list.path] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({ title: KO.pages.communication.saved });
    }
  });

  const handleSave = () => {
    const lineItemData: Record<string, any> = {
      draftDueAt: draftDueAt || null,
      uploadDueAt: uploadDueAt || null,
      offerUsageMonths: offerUsageMonths ? parseInt(offerUsageMonths) : null,
      offerUsageRenewalFee: offerUsageRenewalFee ? parseInt(offerUsageRenewalFee) : null,
    };
    if (offerFee !== "") {
      lineItemData.offerFee = parseInt(offerFee);
    }

    if (influencer?.id) {
      updateInfluencer.mutate({
        memo,
        settlementType: settlementType || null,
        bankName: bankName || null,
        accountHolder: accountHolder || null,
        accountNumber: accountNumber || null,
        businessName: businessName || null,
        businessRegNo: businessRegNo || null,
        freelancerId: freelancerId || null,
        settlementInfoUpdatedAt: new Date().toISOString()
      }, {
        onError: () => toast({ title: "인플루언서 정보 저장 실패", variant: "destructive" })
      });
    }
    updateLineItem.mutate(lineItemData, {
      onError: () => toast({ title: "캠페인 항목 저장 실패", variant: "destructive" })
    });
  };

  if (!influencer) return null;

  const isSettlementInfoComplete = () => {
    const hasBank = bankName && accountHolder && accountNumber;
    if (settlementType === '사업자') {
      return hasBank && businessName && businessRegNo;
    } else if (settlementType === '프리랜서') {
      return hasBank && freelancerId;
    }
    return false;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-background border-b p-3">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={influencer.accounts?.[0]?.profileImageUrl || undefined} />
            <AvatarFallback className="text-[10px]">{influencer.name?.substring(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-xs truncate">{influencer.name}</h3>
            {influencer.email && (
              <div className="text-[10px] text-muted-foreground truncate">{influencer.email}</div>
            )}
          </div>
          <Button 
            size="sm"
            onClick={handleSave} 
            disabled={updateInfluencer.isPending || updateLineItem.isPending}
            data-testid="button-save-influencer"
          >
            {(updateInfluencer.isPending || updateLineItem.isPending) ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Save className="w-3 h-3 mr-1" />
            )}
            저장
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4 bg-[#ffffff]">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">광고료(VAT+)</label>
            <div className="relative mt-1">
              <Input 
                type="text"
                inputMode="numeric"
                value={offerFeeDisplay}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  setOfferFee(raw);
                  setOfferFeeDisplay(raw ? Number(raw).toLocaleString() : "");
                }}
                placeholder="0"
                className="mt-0 h-8 text-sm pr-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                data-testid="input-lineitem-offer-fee"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">원</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">초안 예정일</label>
            <Input 
              type="date"
              value={draftDueAt}
              onChange={(e) => {
                setDraftDueAt(e.target.value);
                updateLineItem.mutate({ draftDueAt: e.target.value || null });
              }}
              className="mt-1 h-7 text-xs"
              data-testid="input-lineitem-draft-due"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">업로드 예정일</label>
            <Input 
              type="date"
              value={uploadDueAt}
              onChange={(e) => {
                setUploadDueAt(e.target.value);
                updateLineItem.mutate({ uploadDueAt: e.target.value || null });
              }}
              className="mt-1 h-7 text-xs"
              data-testid="input-lineitem-upload-due"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{KO.pages.communication.memo}</label>
            <Textarea 
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={KO.pages.communication.memoPlaceholder}
              className="mt-1 min-h-[100px] text-sm"
              data-testid="input-influencer-memo"
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            <span className="text-sm font-semibold">{KO.pages.settlement.settlementInfo}</span>
            {isSettlementInfoComplete() ? (
              <Badge variant="outline" className="ml-auto text-[10px] bg-green-100 text-green-700 border-0">
                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />완료
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-auto text-[10px] bg-orange-100 text-orange-700 border-0">
                미비
              </Badge>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{KO.pages.settlement.settlementType}</label>
            <Select value={settlementType} onValueChange={setSettlementType}>
              <SelectTrigger className="mt-1 h-8 text-sm" data-testid="select-settlement-type">
                <SelectValue placeholder="유형 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="사업자">{KO.pages.settlement.business}</SelectItem>
                <SelectItem value="프리랜서">{KO.pages.settlement.freelancer}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{KO.pages.settlement.bankName}</label>
            <Input 
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="은행명"
              className="mt-1 h-7 text-xs"
              data-testid="input-bank-name"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{KO.pages.settlement.accountHolder}</label>
            <Input 
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              placeholder="예금주"
              className="mt-1 h-7 text-xs"
              data-testid="input-account-holder"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{KO.pages.settlement.accountNumber}</label>
            <Input 
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="계좌번호"
              className="mt-1 h-7 text-xs"
              data-testid="input-account-number"
            />
          </div>
          {settlementType === '사업자' && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{KO.pages.settlement.businessName}</label>
                <Input 
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="사업자명"
                  className="mt-1 h-7 text-xs"
                  data-testid="input-business-name"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{KO.pages.settlement.businessRegNo}</label>
                <Input 
                  value={businessRegNo}
                  onChange={(e) => setBusinessRegNo(e.target.value)}
                  placeholder="000-00-00000"
                  className="mt-1 h-7 text-xs"
                  data-testid="input-business-reg-no"
                />
              </div>
            </>
          )}
          {settlementType === '프리랜서' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">{KO.pages.settlement.freelancerId}</label>
              <Input 
                value={freelancerId}
                onChange={(e) => setFreelancerId(e.target.value)}
                placeholder="000000-0000000"
                className="mt-1 h-8 text-sm"
                data-testid="input-freelancer-id"
              />
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <span className="text-sm font-semibold">2차활용</span>
          <div>
            <label className="text-xs font-medium text-muted-foreground">2차활용 기간 (개월)</label>
            <Input 
              type="number"
              value={offerUsageMonths}
              onChange={(e) => setOfferUsageMonths(e.target.value)}
              placeholder="0"
              className="mt-1 h-7 text-xs"
              data-testid="input-usage-months"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">2차활용 갱신 비용 (원)</label>
            <Input 
              type="number"
              value={offerUsageRenewalFee}
              onChange={(e) => setOfferUsageRenewalFee(e.target.value)}
              placeholder="0"
              className="mt-1 h-7 text-xs"
              data-testid="input-renewal-fee"
            />
          </div>
        </div>
      </div>
      </ScrollArea>
    </div>
  );
}
