import { useUser } from "@/hooks/use-auth";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useQuery, useMutation } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ExternalLink,
  Clock,
  Mail,
  FileVideo,
  Wallet,
  Building2,
  Sparkles,
  RefreshCw,
  MessageSquare,
  Loader2,
  X,
  Send,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { KO } from "@/i18n/ko";
import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import DOMPurify from "dompurify";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ApiTask {
  id: string;
  type: string;
  title: string;
  campaignId: number;
  campaignName: string;
  lineItemId: number;
  influencerId: number;
  influencerName: string;
  stage: string;
  dueIn: number;
  priority: number;
  link: string;
}

interface Task {
  id: string;
  title: string;
  campaignName: string;
  influencerName: string;
  status: string;
  dueIn: number;
  priority: number;
  link: string;
  completed: boolean;
}

interface EmailFeedItem {
  type: 'email';
  id: number;
  conversationId: number;
  snippet: string;
  bodyHtml: string | null;
  bodyText: string | null;
  senderEmail: string;
  senderName: string;
  receivedAt: string;
  campaignName: string;
  campaignId: number;
  influencerName: string;
  influencerEmail: string;
  clientName: string;
  clientLogoUrl: string | null;
  aiDraft: {
    id: number;
    draft: string;
    classification: string;
    classificationLabel: string;
    alternativesParsed: { classification: string; classificationLabel: string }[] | null;
  } | null;
}

interface SubmissionFeedItem {
  type: 'submission';
  id: number;
  submissionType: string;
  fileName: string;
  oneDriveLink: string | null;
  submittedAt: string;
  campaignName: string;
  campaignId: number;
  influencerName: string;
  clientName: string;
  clientLogoUrl: string | null;
}

interface SettlementFeedItem {
  type: 'settlement';
  id: number;
  influencerName: string;
  settlementType: string | null;
  bankName: string | null;
  accountNumber: string | null;
  updatedAt: string;
  campaignName: string;
  campaignId: number;
  clientName: string;
  clientLogoUrl: string | null;
}

type FeedItem = EmailFeedItem | SubmissionFeedItem | SettlementFeedItem;

interface FeedResponse {
  recentReplies: EmailFeedItem[];
  recentSubmissions: SubmissionFeedItem[];
  recentSettlements: SettlementFeedItem[];
}

const STORAGE_KEY = "overview_completed_tasks";

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function ClientLogo({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="w-9 h-9 rounded-lg object-cover border border-border/50"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        data-testid="img-client-logo"
      />
    );
  }
  return (
    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center border border-border/50" data-testid="icon-client-fallback">
      <Building2 className="w-4 h-4 text-muted-foreground" />
    </div>
  );
}

function EmailReplyCard({ item, aiEnabled }: { item: EmailFeedItem; aiEnabled: boolean }) {
  const { toast } = useToast();
  const [replyText, setReplyText] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [showFullMessage, setShowFullMessage] = useState(false);
  const [aiDraft, setAiDraft] = useState(item.aiDraft);
  const [dismissed, setDismissed] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  const sendMutation = useMutation({
    mutationFn: (data: { body: string }) =>
      apiRequest('POST', `/api/conversations/${item.conversationId}/messages`, data),
    onSuccess: () => {
      setReplyText("");
      setShowReply(false);
      toast({ title: "답장이 발송되었습니다" });
      queryClient.invalidateQueries({ queryKey: ['/api/overview/feed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    },
    onError: () => {
      toast({ variant: "destructive", title: "답장 발송에 실패했습니다" });
    }
  });

  const generateDraftMutation = useMutation({
    mutationFn: async (data?: { userFeedback?: string; requestedClassification?: string; requestedClassificationLabel?: string }) => {
      await apiRequest('POST', `/api/conversations/${item.conversationId}/ai-draft`, data || {});
      const res = await fetch(`/api/conversations/${item.conversationId}/ai-draft`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch draft');
      return res.json();
    },
    onSuccess: (draft: any) => {
      if (draft && draft.alternatives) {
        try { draft.alternativesParsed = JSON.parse(draft.alternatives); } catch {}
      }
      setAiDraft(draft);
      setDismissed(false);
    },
    onError: () => {
      toast({ variant: "destructive", title: "AI 초안 생성에 실패했습니다" });
    }
  });

  const dismissDraft = async (draftId: number) => {
    try {
      await apiRequest('PATCH', `/api/ai-drafts/${draftId}`, { status: 'dismissed' });
      setDismissed(true);
    } catch {}
  };

  const handleUseDraft = () => {
    if (aiDraft) {
      setReplyText(aiDraft.draft);
      setShowReply(true);
      apiRequest('PATCH', `/api/ai-drafts/${aiDraft.id}`, { status: 'used' }).catch(() => {});
    }
  };

  const handleSend = () => {
    if (!replyText.trim()) return;
    sendMutation.mutate({ body: replyText });
  };

  const visibleDraft = aiEnabled && aiDraft && !dismissed ? aiDraft : null;

  return (
    <Card className="border-l-4 border-l-blue-400" data-testid={`feed-email-${item.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <ClientLogo logoUrl={item.clientLogoUrl} name={item.clientName} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className="text-[10px] shrink-0" data-testid="badge-campaign-name">{item.campaignName}</Badge>
              <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                <Mail className="w-2.5 h-2.5 mr-0.5" />수신
              </Badge>
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                <Clock className="w-2.5 h-2.5 inline mr-0.5" />{timeAgo(item.receivedAt)}
              </span>
            </div>
            <p className="text-sm font-medium" data-testid="text-influencer-name">{item.influencerName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.senderEmail}</p>
            <div
              className="mt-2 cursor-pointer hover:bg-muted/30 rounded p-1.5 -mx-1.5 transition-colors"
              onClick={() => setShowFullMessage(true)}
              data-testid="button-view-full-message"
            >
              <p className="text-sm text-foreground/80 line-clamp-3" data-testid="text-email-body">
                {item.bodyText || item.snippet}
              </p>
              <span className="text-[10px] text-blue-600 hover:underline mt-0.5 inline-block">전문 보기</span>
            </div>

            {visibleDraft && (
              <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50/50 p-3" data-testid="card-ai-draft">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-medium text-purple-700">AI 초안</span>
                    {visibleDraft.classification && (
                      <Badge variant="outline" className="text-[10px] bg-purple-100 text-purple-600 border-purple-200" data-testid="badge-ai-classification">
                        {visibleDraft.classification} {visibleDraft.classificationLabel}
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => dismissDraft(visibleDraft.id)}
                    data-testid="button-dismiss-draft"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="text-sm text-foreground whitespace-pre-wrap mb-2 max-h-[120px] overflow-y-auto" data-testid="text-ai-draft-body">
                  {visibleDraft.draft}
                </div>
                {visibleDraft.alternativesParsed && visibleDraft.alternativesParsed.length > 0 && (
                  <div className="mb-2 flex items-center gap-1.5 flex-wrap" data-testid="section-alternatives">
                    <span className="text-[10px] text-muted-foreground">다른 옵션:</span>
                    {visibleDraft.alternativesParsed.map((alt, idx) => (
                      <Button
                        key={idx}
                        size="sm"
                        variant="outline"
                        className="text-[10px] h-6 px-2 py-0 text-purple-600 border-purple-200 hover:bg-purple-50"
                        onClick={() => generateDraftMutation.mutate({ requestedClassification: alt.classification, requestedClassificationLabel: alt.classificationLabel })}
                        disabled={generateDraftMutation.isPending}
                        data-testid={`button-alternative-${idx}`}
                      >
                        {alt.classification} {alt.classificationLabel}
                      </Button>
                    ))}
                  </div>
                )}
                {showFeedback && (
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
                          generateDraftMutation.mutate({ userFeedback: feedbackText || undefined });
                          setShowFeedback(false);
                          setFeedbackText("");
                        }}
                        disabled={generateDraftMutation.isPending}
                        data-testid="button-submit-regenerate"
                      >
                        {generateDraftMutation.isPending ? (
                          <><Loader2 className="w-3 h-3 mr-1 animate-spin" />재생성 중...</>
                        ) : (
                          <><RefreshCw className="w-3 h-3 mr-1" />재생성</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs"
                        onClick={() => { setShowFeedback(false); setFeedbackText(""); }}
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
                    <Sparkles className="w-3 h-3 mr-1" />초안 사용
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs text-purple-600 border-purple-200 hover:bg-purple-50"
                    onClick={() => setShowFeedback(!showFeedback)}
                    disabled={generateDraftMutation.isPending}
                    data-testid="button-toggle-feedback"
                  >
                    <MessageSquare className="w-3 h-3 mr-1" />다른 답변 요청하기
                  </Button>
                </div>
              </div>
            )}

            {!visibleDraft && aiEnabled && (
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                  onClick={() => generateDraftMutation.mutate({})}
                  disabled={generateDraftMutation.isPending}
                  data-testid="button-generate-draft"
                >
                  {generateDraftMutation.isPending ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" />AI 초안 생성 중...</>
                  ) : (
                    <><Sparkles className="w-3 h-3 mr-1" />AI 초안 생성</>
                  )}
                </Button>
              </div>
            )}

            {!showReply ? (
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => setShowReply(true)}
                  data-testid="button-open-reply"
                >
                  <Mail className="w-3 h-3 mr-1" />답장하기
                </Button>
              </div>
            ) : (
              <div className="mt-3 space-y-2" data-testid="section-reply-composer">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="답장을 입력하세요..."
                  className="text-sm min-h-[80px] max-h-[200px] resize-none"
                  data-testid="textarea-reply"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleSend}
                    disabled={!replyText.trim() || sendMutation.isPending}
                    data-testid="button-send-reply"
                  >
                    {sendMutation.isPending ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" />발송 중...</>
                    ) : (
                      <><Send className="w-3 h-3 mr-1" />발송</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => { setShowReply(false); setReplyText(""); }}
                    data-testid="button-cancel-reply"
                  >
                    취소
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
      <Sheet open={showFullMessage} onOpenChange={setShowFullMessage}>
        <SheetContent className="w-[500px] sm:max-w-[500px] flex flex-col h-full">
          <SheetHeader className="shrink-0">
            <SheetTitle>
              <span className="text-sm font-normal text-muted-foreground">{item.influencerName}</span>
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 mt-4">
            <div
              className="prose prose-sm max-w-none dark:prose-invert pr-4"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.bodyHtml || item.bodyText || item.snippet || '') }}
              data-testid="text-full-message-body"
            />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function SubmissionCard({ item }: { item: SubmissionFeedItem }) {
  return (
    <Card className="border-l-4 border-l-green-400" data-testid={`feed-submission-${item.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <ClientLogo logoUrl={item.clientLogoUrl} name={item.clientName} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className="text-[10px] shrink-0" data-testid="badge-campaign-name">{item.campaignName}</Badge>
              <Badge
                variant="secondary"
                className={`text-[10px] ${item.submissionType === 'draft' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'}`}
              >
                <FileVideo className="w-2.5 h-2.5 mr-0.5" />
                {item.submissionType === 'draft' ? '초안' : '완성본'}
              </Badge>
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                <Clock className="w-2.5 h-2.5 inline mr-0.5" />{timeAgo(item.submittedAt)}
              </span>
            </div>
            <p className="text-sm font-medium" data-testid="text-influencer-name">{item.influencerName}</p>
            <p className="text-xs text-muted-foreground mt-1">{item.fileName}</p>
            {item.oneDriveLink && (
              <a
                href={item.oneDriveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
                data-testid="link-onedrive"
              >
                <ExternalLink className="w-3 h-3" />파일 열기
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SettlementCard({ item }: { item: SettlementFeedItem }) {
  return (
    <Card className="border-l-4 border-l-orange-400" data-testid={`feed-settlement-${item.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <ClientLogo logoUrl={item.clientLogoUrl} name={item.clientName} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className="text-[10px] shrink-0" data-testid="badge-campaign-name">{item.campaignName}</Badge>
              <Badge variant="secondary" className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                <Wallet className="w-2.5 h-2.5 mr-0.5" />정산정보
              </Badge>
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                <Clock className="w-2.5 h-2.5 inline mr-0.5" />{timeAgo(item.updatedAt)}
              </span>
            </div>
            <p className="text-sm font-medium" data-testid="text-influencer-name">{item.influencerName}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              {item.settlementType && <span>{item.settlementType}</span>}
              {item.bankName && <span>{item.bankName}</span>}
              {item.accountNumber && <span>{item.accountNumber}</span>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { data: user } = useUser();
  const { data: workspaces } = useWorkspaces();
  const workspace = workspaces?.[0];
  const workspaceId = workspace?.id;
  const aiEnabled = (workspace as any)?.aiDraftEnabled === true;
  const [, navigate] = useLocation();
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'email' | 'submission' | 'settlement'>('all');

  const { data: apiTasks = [], isLoading: tasksLoading } = useQuery<ApiTask[]>({
    queryKey: ["/api/overview/tasks", workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/overview/tasks?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error('Failed to fetch tasks');
      return res.json();
    },
    enabled: !!workspaceId,
  });

  const { data: feedData, isLoading: feedLoading, isError: feedError, refetch: refetchFeed } = useQuery<FeedResponse>({
    queryKey: ["/api/overview/feed", workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/overview/feed?workspaceId=${workspaceId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch feed');
      return res.json();
    },
    enabled: !!workspaceId,
    refetchInterval: 60000,
  });

  useEffect(() => {
    const savedCompleted = localStorage.getItem(STORAGE_KEY);
    if (savedCompleted) {
      setCompletedTaskIds(JSON.parse(savedCompleted));
    }
  }, []);

  const tasks = useMemo(() => {
    return apiTasks.map(task => ({
      id: task.id,
      title: task.title,
      campaignName: task.campaignName,
      influencerName: task.influencerName,
      status: task.stage || task.type,
      dueIn: task.dueIn,
      priority: task.priority,
      link: task.link,
      completed: completedTaskIds.includes(task.id)
    }));
  }, [apiTasks, completedTaskIds]);

  const handleTaskToggle = (taskId: string) => {
    setCompletedTaskIds(prev => {
      const newIds = prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newIds));
      return newIds;
    });
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.priority - b.priority;
  });

  const feedItems = useMemo(() => {
    if (!feedData) return [];
    const all: (FeedItem & { sortDate: number })[] = [];
    for (const r of feedData.recentReplies) {
      all.push({ ...r, sortDate: new Date(r.receivedAt).getTime() });
    }
    for (const s of feedData.recentSubmissions) {
      all.push({ ...s, sortDate: new Date(s.submittedAt).getTime() });
    }
    for (const st of feedData.recentSettlements) {
      all.push({ ...st, sortDate: new Date(st.updatedAt).getTime() });
    }
    all.sort((a, b) => b.sortDate - a.sortDate);
    return all;
  }, [feedData]);

  const filteredFeed = activeTab === 'all' ? feedItems : feedItems.filter(f => f.type === activeTab);

  const getDueBadge = (dueIn: number) => {
    if (dueIn < 0) return <Badge variant="destructive" className="text-xs">{KO.pages.home.todaysTasks.delayed}</Badge>;
    if (dueIn === 0) return <Badge variant="destructive" className="text-xs">{KO.pages.home.todaysTasks.dDay}-0</Badge>;
    if (dueIn <= 3) return <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">{KO.pages.home.todaysTasks.dDay}-{dueIn}</Badge>;
    return <Badge variant="secondary" className="text-xs">{KO.pages.home.todaysTasks.dDay}-{dueIn}</Badge>;
  };

  const emailCount = feedData?.recentReplies?.length || 0;
  const submissionCount = feedData?.recentSubmissions?.length || 0;
  const settlementCount = feedData?.recentSettlements?.length || 0;

  return (
    <Layout>
      <div className="space-y-6 md:space-y-8 max-w-[1000px] mx-auto">
        {sortedTasks.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base md:text-lg" data-testid="text-tasks-title">{KO.pages.home.todaysTasks.title}</CardTitle>
              <CardDescription className="text-xs md:text-sm">{KO.pages.home.todaysTasks.subtitle}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {sortedTasks.map((task) => (
                <div key={task.id} className={`flex items-start gap-3 p-3 rounded-lg border ${task.completed ? 'bg-muted/50 opacity-60' : 'bg-card'}`} data-testid={`task-item-${task.id}`}>
                  <Checkbox
                    checked={task.completed}
                    onCheckedChange={() => handleTaskToggle(task.id)}
                    className="mt-0.5"
                    data-testid={`checkbox-task-${task.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>{task.title}</span>
                      {getDueBadge(task.dueIn)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {task.campaignName} · {task.influencerName} · {task.status}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => navigate(task.link)}
                    data-testid={`button-task-goto-${task.id}`}
                  >
                    {KO.pages.home.todaysTasks.goTo}
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <h2 className="text-lg font-semibold" data-testid="text-feed-title">최근 피드</h2>
            <div className="flex gap-1 ml-auto">
              {[
                { key: 'all' as const, label: '전체' },
                { key: 'email' as const, label: `이메일 (${emailCount})`, icon: Mail },
                { key: 'submission' as const, label: `콘텐츠 (${submissionCount})`, icon: FileVideo },
                { key: 'settlement' as const, label: `정산 (${settlementCount})`, icon: Wallet },
              ].map(tab => (
                <Button
                  key={tab.key}
                  size="sm"
                  variant={activeTab === tab.key ? "default" : "ghost"}
                  className="text-xs h-7 px-2"
                  onClick={() => setActiveTab(tab.key)}
                  data-testid={`button-tab-${tab.key}`}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>

          {feedError ? (
            <Card>
              <CardContent className="p-8 text-center" data-testid="text-feed-error">
                <p className="text-sm text-destructive mb-3">피드를 불러오는 데 실패했습니다.</p>
                <Button size="sm" variant="outline" onClick={() => refetchFeed()} data-testid="button-retry-feed">
                  <RefreshCw className="w-3 h-3 mr-1" />다시 시도
                </Button>
              </CardContent>
            </Card>
          ) : feedLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="w-9 h-9 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredFeed.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground text-sm" data-testid="text-feed-empty">
                {activeTab === 'all' ? '아직 피드 항목이 없습니다.' :
                  activeTab === 'email' ? '최근 수신 이메일이 없습니다.' :
                  activeTab === 'submission' ? '최근 콘텐츠 제출이 없습니다.' :
                  '최근 정산정보 기입이 없습니다.'}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3" data-testid="section-feed-list">
              {filteredFeed.map((item) => {
                if (item.type === 'email') return <EmailReplyCard key={`email-${item.id}`} item={item} aiEnabled={aiEnabled} />;
                if (item.type === 'submission') return <SubmissionCard key={`sub-${item.id}`} item={item} />;
                if (item.type === 'settlement') return <SettlementCard key={`set-${item.id}`} item={item} />;
                return null;
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
