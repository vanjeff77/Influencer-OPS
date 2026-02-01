import { useState, useMemo } from "react";
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
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface CampaignLineItem {
  id: number;
  campaignId: number;
  influencerId: number;
  status: string | null;
  influencer?: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    tags: string[] | null;
    memo: string | null;
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

export function CampaignCommunication({ campaignId, lineItems }: { campaignId: number; lineItems: CampaignLineItem[] }) {
  const { toast } = useToast();
  const [selectedLineItemId, setSelectedLineItemId] = useState<number | null>(null);
  const [showFullMessage, setShowFullMessage] = useState<ConversationMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
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
    mutationFn: (lineItemId: number) => apiRequest(`/api/line-items/${lineItemId}/start-conversation`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({ title: KO.pages.communication.startConversation });
    }
  });

  const syncMessages = useMutation({
    mutationFn: (conversationId: number) => apiRequest(`/api/conversations/${conversationId}/sync`, { method: 'POST' }),
    onSuccess: (data: any) => {
      refetchConversation();
      toast({ title: KO.pages.communication.syncSuccess, description: `${data.synced}${KO.pages.communication.syncedCount}` });
    }
  });

  const handleSelectLineItem = (li: CampaignLineItem) => {
    setSelectedLineItemId(li.id);
    const conv = conversations?.find(c => c.campaignLineItemId === li.id);
    if (!conv) {
      startConversation.mutate(li.id);
    }
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
      <div className="lg:col-span-3 border rounded-lg overflow-hidden flex flex-col" data-testid="panel-conversations-list">
        <div className="p-3 border-b bg-muted/30">
          <div className="flex items-center justify-between mb-2 gap-2">
            <span className="text-sm font-medium">인플루언서</span>
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
                          {getStatusBadge(conv)}
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
            <ScrollArea className="flex-1 p-4">
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
              onSent={() => refetchConversation()}
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
        <SheetContent className="w-[500px] sm:max-w-[500px]">
          <SheetHeader>
            <SheetTitle>{KO.pages.communication.viewFullMessage}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {showFullMessage && (
              <div 
                className="prose prose-sm max-w-none dark:prose-invert" 
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(showFullMessage.bodyHtml || showFullMessage.bodyText || '') }} 
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
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

  return (
    <div className="space-y-3">
      {messages.map(msg => (
        <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
          <div 
            className={`max-w-[80%] rounded-lg p-3 cursor-pointer transition-colors ${
              msg.direction === 'outbound' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted'
            } ${msg.sendStatus === 'failed' ? 'border-2 border-red-500' : ''}`}
            onClick={() => onViewFull(msg)}
            data-testid={`message-bubble-${msg.id}`}
          >
            <p className="text-sm line-clamp-2">{msg.snippet || '(내용 없음)'}</p>
            <div className={`flex items-center gap-2 mt-1 text-xs ${msg.direction === 'outbound' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
              {msg.sentAt || msg.receivedAt ? (
                <span>{format(new Date(msg.sentAt || msg.receivedAt!), 'M/d HH:mm', { locale: ko })}</span>
              ) : null}
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
      ))}
    </div>
  );
}

function MessageComposer({ conversationId, influencerEmail, onSent }: { conversationId?: number; influencerEmail?: string | null; onSent: () => void }) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const sendMessage = useMutation({
    mutationFn: (data: { body: string; subject: string }) => 
      apiRequest(`/api/conversations/${conversationId}/messages`, { 
        method: 'POST', 
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      }),
    onSuccess: () => {
      setMessage("");
      setSubject("");
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
    sendMessage.mutate({ body: message, subject });
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
        <Input 
          placeholder={KO.pages.email.subject}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mb-2 h-8 text-sm"
          data-testid="input-email-subject"
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
  const [phone, setPhone] = useState(influencer?.phone || "");
  const [tags, setTags] = useState(influencer?.tags?.join(", ") || "");

  const updateInfluencer = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/influencers/${influencer?.id}`, { 
      method: 'PATCH',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/influencers'] });
      toast({ title: KO.pages.communication.saved });
    }
  });

  const handleSave = () => {
    if (!influencer?.id) return;
    updateInfluencer.mutate({
      memo,
      email,
      phone,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean)
    });
  };

  if (!influencer) return null;

  return (
    <ScrollArea className="h-full max-h-[600px]">
      <div className="p-4 space-y-4">
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
            <label className="text-xs font-medium text-muted-foreground">{KO.pages.communication.contact}</label>
            <Input 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="mt-1 h-8 text-sm"
              data-testid="input-influencer-email"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">전화번호</label>
            <Input 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-1234-5678"
              className="mt-1 h-8 text-sm"
              data-testid="input-influencer-phone"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{KO.pages.communication.tags}</label>
            <Input 
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="뷰티, 패션, 라이프스타일..."
              className="mt-1 h-8 text-sm"
              data-testid="input-influencer-tags"
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

        <Button 
          onClick={handleSave} 
          disabled={updateInfluencer.isPending}
          className="w-full"
          data-testid="button-save-influencer"
        >
          {updateInfluencer.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{KO.pages.communication.saving}</>
          ) : (
            <><Save className="w-4 h-4 mr-2" />{KO.pages.communication.saveChanges}</>
          )}
        </Button>
      </div>
    </ScrollArea>
  );
}
