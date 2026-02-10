import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { KO } from "@/i18n/ko";
import DOMPurify from "dompurify";
import { 
  Send, 
  RefreshCw, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle, 
  Mail, 
  MessageSquare,
  MoreHorizontal,
  Save,
  User,
  Loader2,
  Users,
  FileText,
  Wallet
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
    accounts?: { platform: string; handle: string }[];
  };
}

interface Conversation {
  id: number;
  campaignLineItemId: number;
  subjectPrefix: string | null;
  gmailThreadId: string | null;
  lastMessageAt: string | null;
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

export function CampaignCommunication({ campaignId, campaignName, workspaceId, lineItems }: CampaignCommunicationProps) {
  const { toast } = useToast();
  const [selectedLineItemId, setSelectedLineItemId] = useState<number | null>(null);
  const [showFullMessage, setShowFullMessage] = useState<ConversationMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [bulkEmailLogOpen, setBulkEmailLogOpen] = useState(false);
  const [attachEmailOpen, setAttachEmailOpen] = useState(false);
  
  const { data: gmailStatus, isLoading: isLoadingGmail } = useQuery<{ connected: boolean; email?: string }>({
    queryKey: ['/api/email/gmail/status'],
  });

  const { data: conversations, isLoading: isLoadingConversations } = useQuery<Conversation[]>({
    queryKey: ['/api/conversations', 'campaignId', campaignId.toString()],
    queryFn: () => fetch(`/api/conversations?campaignId=${campaignId}`).then(r => r.json()),
  });

  const filteredLineItems = useMemo(() => {
    if (!searchQuery.trim()) return lineItems;
    const query = searchQuery.toLowerCase();
    return lineItems.filter(li => 
      li.influencer?.name?.toLowerCase().includes(query) ||
      li.influencer?.email?.toLowerCase().includes(query)
    );
  }, [lineItems, searchQuery]);

  const selectedLineItem = lineItems.find(li => li.id === selectedLineItemId);
  const existingConv = conversations?.find(c => c.campaignLineItemId === selectedLineItemId);

  const { data: conversationDetail, isLoading: isLoadingMessages, refetch: refetchConversation } = useQuery<ConversationDetail>({
    queryKey: ['/api/conversations', existingConv?.id?.toString()],
    enabled: !!existingConv?.id,
  });

  const startConversation = useMutation({
    mutationFn: (lineItemId: number) => apiRequest('POST', `/api/line-items/${lineItemId}/start-conversation`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({ title: KO.pages.communication.startConversation });
    }
  });

  const syncMessages = useMutation({
    mutationFn: async (conversationId: number) => {
      const res = await apiRequest('POST', `/api/conversations/${conversationId}/sync`);
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

  const handleSelectLineItem = (li: CampaignLineItem) => {
    setSelectedLineItemId(li.id);
    const conv = conversations?.find(c => c.campaignLineItemId === li.id);
    if (!conv) {
      startConversation.mutate(li.id);
    }
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[400px] lg:h-[600px]">
      {/* Left Panel: Line Items List */}
      <div className="lg:col-span-3 border rounded-lg overflow-hidden flex flex-col bg-[#ffffff]" data-testid="panel-conversations-list">
        <div className="p-3 border-b bg-muted/30">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <span className="text-sm font-medium">인플루언서</span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setBulkEmailOpen(true)}
                data-testid="button-bulk-email"
              >
                <Users className="w-3 h-3 mr-1" />
                {KO.pages.bulkEmail.title}
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
          <Input 
            placeholder="검색..." 
            className="h-8 text-sm" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-conversations" 
          />
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
                return (
                  <div
                    key={li.id}
                    className={`p-3 cursor-pointer transition-colors ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                    onClick={() => handleSelectLineItem(li)}
                    data-testid={`conversation-item-${li.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="text-xs">{li.influencer?.name?.substring(0, 2) || 'IN'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-sm truncate">{li.influencer?.name}</span>
                          <div className="flex items-center gap-1">
                            {getFirstContactBadge(li)}
                            {getStatusBadge(conv)}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {conv?.lastMessage?.snippet || li.influencer?.email || KO.pages.communication.noConversations}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
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
      <div className="lg:col-span-5 border rounded-lg overflow-hidden flex flex-col" data-testid="panel-message-thread">
        {selectedLineItem ? (
          <>
            <div className="p-3 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs">{selectedLineItem.influencer?.name?.substring(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{selectedLineItem.influencer?.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{selectedLineItem.influencer?.email || KO.pages.communication.noEmail}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setAttachEmailOpen(true)}
                  data-testid="button-attach-email"
                >
                  <Mail className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">{KO.pages.attachEmail.title}</span>
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => existingConv && syncMessages.mutate(existingConv.id)}
                  disabled={syncMessages.isPending || !existingConv}
                  data-testid="button-sync-messages"
                >
                  <RefreshCw className={`w-4 h-4 mr-1 ${syncMessages.isPending ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{KO.pages.communication.syncMessages}</span>
                </Button>
              </div>
            </div>
            <ScrollArea className="relative overflow-hidden flex-1 p-4 bg-[#ffffff]">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <MessageThread 
                  messages={conversationDetail?.messages || []} 
                  onViewFull={setShowFullMessage}
                />
              )}
            </ScrollArea>
            <MessageComposer 
              conversationId={existingConv?.id} 
              influencerEmail={selectedLineItem.influencer?.email}
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
              onSent={() => {
                refetchConversation();
                if (existingConv?.id) {
                  syncMessages.mutate(existingConv.id);
                }
                queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, campaignId] });
                queryClient.invalidateQueries({ queryKey: ['/api/conversations', 'campaignId', campaignId.toString()] });
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
      <div className="lg:col-span-4 border rounded-lg overflow-hidden" data-testid="panel-influencer-details">
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
  );
}

function MessageThread({ messages, onViewFull }: { messages: ConversationMessage[]; onViewFull: (msg: ConversationMessage) => void }) {
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
    if (msg.senderName) return msg.senderName;
    if (msg.senderEmail) return msg.senderEmail.split('@')[0];
    return null;
  };

  return (
    <div className="space-y-3">
      {messages.map(msg => {
        const senderName = getSenderDisplayName(msg);
        return (
          <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[80%] rounded-lg p-3 cursor-pointer transition-colors ${
                msg.direction === 'outbound' 
                  ? 'bg-primary text-primary-foreground' 
                  : getSenderColor(msg.senderEmail)
              } ${msg.sendStatus === 'failed' ? 'border-2 border-red-500' : ''}`}
              onClick={() => onViewFull(msg)}
              data-testid={`message-bubble-${msg.id}`}
            >
              {senderName && uniqueInboundSenders.length > 1 && (
                <p className="text-xs font-medium text-muted-foreground mb-1">{senderName}</p>
              )}
              <p className="text-sm line-clamp-2">{getDisplaySnippet(msg.snippet)}</p>
              <div className={`flex items-center gap-2 mt-1 text-xs ${msg.direction === 'outbound' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                {msg.sentAt || msg.receivedAt ? (
                  <span>{formatMessageTime(new Date(msg.sentAt || msg.receivedAt!))}</span>
                ) : null}
                {msg.ccEmails && msg.ccEmails.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={`text-[10px] px-1 rounded cursor-help ${msg.direction === 'outbound' ? 'bg-primary-foreground/20' : 'bg-muted'}`} data-testid={`cc-indicator-${msg.id}`}>
                        참조 {msg.ccEmails.length}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs font-medium mb-1">참조:</p>
                      {msg.ccEmails.map((email, i) => (
                        <p key={i} className="text-xs">{email}</p>
                      ))}
                    </TooltipContent>
                  </Tooltip>
                )}
                {msg.sendStatus === 'failed' && (
                  <Badge variant="destructive" className="text-[10px]" data-testid={`badge-send-failed-${msg.id}`}>
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {KO.pages.communication.failed}
                  </Badge>
                )}
                {msg.sendStatus === 'sent' && msg.direction === 'outbound' && (
                  <CheckCircle2 className="w-3 h-3" />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MessageComposer({ conversationId, influencerEmail, lastMessageCc, onSent }: { conversationId?: number; influencerEmail?: string | null; lastMessageCc?: string[] | null; onSent: () => void }) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [cc, setCc] = useState(lastMessageCc?.join(', ') || "");
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCc, setShowCc] = useState(!!lastMessageCc?.length);

  const lastCcKey = lastMessageCc ? [...lastMessageCc].sort().join('|') : '';
  useEffect(() => {
    const newCc = lastMessageCc?.join(', ') || "";
    setCc(newCc);
    setShowCc(!!lastMessageCc?.length);
  }, [lastCcKey]);

  const sendMessage = useMutation({
    mutationFn: (data: { body: string; subject: string; cc?: string }) => 
      apiRequest('POST', `/api/conversations/${conversationId}/messages`, data),
    onSuccess: () => {
      setMessage("");
      setSubject("");
      setCc("");
      setShowCc(false);
      setIsExpanded(false);
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
    sendMessage.mutate({ body: message, subject, cc: cc.trim() || undefined });
  };

  if (!influencerEmail) {
    return (
      <div className="p-3 border-t bg-muted/30 text-center text-sm text-muted-foreground">
        {KO.pages.communication.noEmail}
      </div>
    );
  }

  return (
    <div className="p-3 border-t">
      {isExpanded && (
        <>
          <Input 
            placeholder={KO.pages.email.subject}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mb-2 h-8 text-sm"
            data-testid="input-email-subject"
          />
          {showCc ? (
            <Input 
              placeholder="참조 (CC): 이메일 주소, 쉼표로 구분"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="mb-2 h-8 text-sm"
              data-testid="input-email-cc"
            />
          ) : (
            <Button 
              variant="ghost" 
              size="sm" 
              className="mb-2 h-6 text-xs text-muted-foreground"
              onClick={() => setShowCc(true)}
              data-testid="button-add-cc"
            >
              + 참조 추가 (CC)
            </Button>
          )}
        </>
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
            variant="outline"
            onClick={() => setIsExpanded(!isExpanded)}
            data-testid="button-expand-composer"
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function InfluencerDetailPanel({ influencer, lineItem }: { influencer?: CampaignLineItem['influencer']; lineItem: CampaignLineItem }) {
  const { toast } = useToast();
  const [memo, setMemo] = useState(influencer?.memo || "");
  const [email, setEmail] = useState(influencer?.email || "");
  
  const [offerFee, setOfferFee] = useState<string>(lineItem.offerFee?.toString() || "");
  const [offerFeeDisplay, setOfferFeeDisplay] = useState<string>(lineItem.offerFee ? Number(lineItem.offerFee).toLocaleString() : "");
  const [draftDueAt, setDraftDueAt] = useState(lineItem.draftDueAt ? new Date(lineItem.draftDueAt).toISOString().split('T')[0] : "");
  const [uploadDueAt, setUploadDueAt] = useState(lineItem.uploadDueAt ? new Date(lineItem.uploadDueAt).toISOString().split('T')[0] : "");

  useEffect(() => {
    setOfferFee(lineItem.offerFee?.toString() || "");
    setOfferFeeDisplay(lineItem.offerFee ? Number(lineItem.offerFee).toLocaleString() : "");
    setDraftDueAt(lineItem.draftDueAt ? new Date(lineItem.draftDueAt).toISOString().split('T')[0] : "");
    setUploadDueAt(lineItem.uploadDueAt ? new Date(lineItem.uploadDueAt).toISOString().split('T')[0] : "");
  }, [lineItem.offerFee, lineItem.draftDueAt, lineItem.uploadDueAt]);

  useEffect(() => {
    setMemo(influencer?.memo || "");
    setEmail(influencer?.email || "");
  }, [influencer?.memo, influencer?.email]);

  const [settlementType, setSettlementType] = useState(influencer?.settlementType || "");
  const [bankName, setBankName] = useState(influencer?.bankName || "");
  const [accountHolder, setAccountHolder] = useState(influencer?.accountHolder || "");
  const [accountNumber, setAccountNumber] = useState(influencer?.accountNumber || "");
  const [businessName, setBusinessName] = useState(influencer?.businessName || "");
  const [businessRegNo, setBusinessRegNo] = useState(influencer?.businessRegNo || "");
  const [freelancerId, setFreelancerId] = useState(influencer?.freelancerId || "");

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
    };
    if (offerFee !== "") {
      lineItemData.offerFee = parseInt(offerFee);
    }

    if (influencer?.id) {
      updateInfluencer.mutate({ memo, email }, {
        onError: () => toast({ title: "인플루언서 정보 저장 실패", variant: "destructive" })
      });
    }
    updateLineItem.mutate(lineItemData, {
      onError: () => toast({ title: "캠페인 항목 저장 실패", variant: "destructive" })
    });
  };

  const handleSaveSettlement = () => {
    if (!influencer?.id) return;
    updateInfluencer.mutate({
      settlementType,
      bankName,
      accountHolder,
      accountNumber,
      businessName,
      businessRegNo,
      freelancerId,
      settlementInfoUpdatedAt: new Date().toISOString()
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
    <ScrollArea className="h-full max-h-[600px]">
      <div className="p-4 space-y-4 bg-[#ffffff]">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback>{influencer.name?.substring(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{influencer.name}</h3>
            <div className="text-sm text-muted-foreground truncate">
              {influencer.accounts?.[0] && `@${influencer.accounts[0].handle}`}
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">이메일</label>
            <Input 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="mt-1 h-8 text-sm"
              data-testid="input-influencer-email"
            />
          </div>
          <Separator />
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">초안 예정일</label>
              <Input 
                type="date"
                value={draftDueAt}
                onChange={(e) => {
                  setDraftDueAt(e.target.value);
                  updateLineItem.mutate({ draftDueAt: e.target.value || null });
                }}
                className="mt-1 h-8 text-sm"
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
                className="mt-1 h-8 text-sm"
                data-testid="input-lineitem-upload-due"
              />
            </div>
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

        <Button 
          onClick={handleSave} 
          disabled={updateInfluencer.isPending || updateLineItem.isPending}
          className="w-full"
          data-testid="button-save-influencer"
        >
          {(updateInfluencer.isPending || updateLineItem.isPending) ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{KO.pages.communication.saving}</>
          ) : (
            <><Save className="w-4 h-4 mr-2" />{KO.pages.communication.saveChanges}</>
          )}
        </Button>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="settlement">
            <AccordionTrigger className="text-sm">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                <span>{KO.pages.settlement.settlementInfo}</span>
                {isSettlementInfoComplete() ? (
                  <Badge variant="outline" className="ml-2 text-[10px] bg-green-100 text-green-700 border-0">
                    <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />완료
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-2 text-[10px] bg-orange-100 text-orange-700 border-0">
                    미비
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 pt-2">
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
                    className="mt-1 h-8 text-sm"
                    data-testid="input-bank-name"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{KO.pages.settlement.accountHolder}</label>
                  <Input 
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    placeholder="예금주"
                    className="mt-1 h-8 text-sm"
                    data-testid="input-account-holder"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{KO.pages.settlement.accountNumber}</label>
                  <Input 
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="계좌번호"
                    className="mt-1 h-8 text-sm"
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
                        placeholder="상호명"
                        className="mt-1 h-8 text-sm"
                        data-testid="input-business-name"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">{KO.pages.settlement.businessRegNo}</label>
                      <Input 
                        value={businessRegNo}
                        onChange={(e) => setBusinessRegNo(e.target.value)}
                        placeholder="000-00-00000"
                        className="mt-1 h-8 text-sm"
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
                <Button 
                  onClick={handleSaveSettlement} 
                  disabled={updateInfluencer.isPending}
                  className="w-full"
                  data-testid="button-save-settlement"
                >
                  {updateInfluencer.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />저장 중...</>
                  ) : (
                    <><Save className="w-4 h-4 mr-2" />정산정보 저장</>
                  )}
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </ScrollArea>
  );
}
