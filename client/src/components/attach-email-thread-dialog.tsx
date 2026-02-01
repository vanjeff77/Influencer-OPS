import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { KO } from "@/i18n/ko";
import { 
  Mail, 
  Search, 
  Link2, 
  Loader2, 
  ChevronRight, 
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  MessageSquare
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface EmailAccount {
  id: number;
  email: string;
  provider: string;
  imapHost?: string;
  smtpHost?: string;
}

interface ThreadSearchResult {
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  messageCount: number;
}

interface AttachEmailThreadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineItemId: number;
  influencerEmail?: string | null;
  campaignId: number;
  workspaceId: number;
}

type Step = 'account' | 'search' | 'results' | 'confirm';

export function AttachEmailThreadDialog({
  open,
  onOpenChange,
  lineItemId,
  influencerEmail,
  campaignId,
  workspaceId,
}: AttachEmailThreadDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('account');
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [searchMode, setSearchMode] = useState<'email' | 'subject' | 'messageId'>('email');
  const [searchQuery, setSearchQuery] = useState(influencerEmail || '');
  const [searchResults, setSearchResults] = useState<ThreadSearchResult[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const { data: emailAccounts, isLoading: isLoadingAccounts } = useQuery<EmailAccount[]>({
    queryKey: ['/api/workspaces', workspaceId, 'email-accounts'],
    queryFn: () => fetch(`/api/workspaces/${workspaceId}/email-accounts`).then(r => r.json()),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setStep('account');
      setSelectedAccountId(null);
      setSearchQuery(influencerEmail || '');
      setSearchResults([]);
      setSelectedThread(null);
    }
  }, [open, influencerEmail]);

  useEffect(() => {
    if (emailAccounts?.length === 1 && !selectedAccountId) {
      setSelectedAccountId(emailAccounts[0].id);
    }
  }, [emailAccounts, selectedAccountId]);

  const searchThreads = async () => {
    if (!selectedAccountId || !searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const res = await fetch('/api/email/search-threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          searchMode,
          query: searchQuery.trim(),
        }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || '검색 실패');
      }
      
      const data = await res.json();
      setSearchResults(data.threads || []);
      setStep('results');
    } catch (err: any) {
      toast({
        title: '검색 실패',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const attachThread = useMutation({
    mutationFn: async () => {
      if (!selectedThread || !selectedAccountId) throw new Error('스레드를 선택해주세요');
      
      const res = await apiRequest('POST', '/api/conversations/attach-thread', {
        lineItemId,
        accountId: selectedAccountId,
        threadId: selectedThread.threadId,
        threadSubject: selectedThread.subject,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      toast({ title: KO.pages.attachEmail.attachSuccess });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: '연결 실패',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const handleBack = () => {
    switch (step) {
      case 'search':
        setStep('account');
        break;
      case 'results':
        setStep('search');
        break;
      case 'confirm':
        setStep('results');
        break;
    }
  };

  const handleNext = () => {
    switch (step) {
      case 'account':
        if (selectedAccountId) setStep('search');
        break;
      case 'search':
        searchThreads();
        break;
      case 'results':
        if (selectedThread) setStep('confirm');
        break;
      case 'confirm':
        attachThread.mutate();
        break;
    }
  };

  const renderAccountStep = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {KO.pages.attachEmail.selectAccountDesc}
      </p>
      
      {isLoadingAccounts ? (
        <div className="space-y-2">
          {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : !emailAccounts?.length ? (
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-4">
            {KO.pages.attachEmail.noEmailAccounts}
          </p>
          <Button 
            onClick={() => window.location.href = '/email'}
            data-testid="button-go-to-email-center"
          >
            {KO.pages.attachEmail.goToEmailCenter}
          </Button>
        </div>
      ) : (
        <RadioGroup
          value={selectedAccountId?.toString() || ''}
          onValueChange={(v) => setSelectedAccountId(parseInt(v))}
        >
          {emailAccounts.map(account => (
            <div
              key={account.id}
              className={`flex items-center space-x-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                selectedAccountId === account.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
              }`}
              onClick={() => setSelectedAccountId(account.id)}
              data-testid={`account-option-${account.id}`}
            >
              <RadioGroupItem value={account.id.toString()} id={`account-${account.id}`} />
              <div className="flex-1">
                <Label htmlFor={`account-${account.id}`} className="cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    <span className="font-medium">{account.email}</span>
                    <Badge variant="secondary" className="text-xs">
                      {account.provider === 'imap' ? 'IMAP' : 'Gmail'}
                    </Badge>
                  </div>
                </Label>
              </div>
            </div>
          ))}
        </RadioGroup>
      )}
    </div>
  );

  const renderSearchStep = () => (
    <div className="space-y-4">
      <Tabs value={searchMode} onValueChange={(v) => setSearchMode(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="email" data-testid="tab-search-email">
            {KO.pages.attachEmail.searchByEmail}
          </TabsTrigger>
          <TabsTrigger value="subject" data-testid="tab-search-subject">
            {KO.pages.attachEmail.searchBySubject}
          </TabsTrigger>
          <TabsTrigger value="messageId" data-testid="tab-search-messageid">
            {KO.pages.attachEmail.searchByMessageId}
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="email" className="space-y-2">
          <Label>{KO.pages.attachEmail.recipientEmail}</Label>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="example@email.com"
            data-testid="input-search-email"
          />
          <p className="text-xs text-muted-foreground">
            {KO.pages.attachEmail.searchByEmailDesc}
          </p>
        </TabsContent>
        
        <TabsContent value="subject" className="space-y-2">
          <Label>{KO.pages.attachEmail.subjectKeyword}</Label>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="캠페인 제안"
            data-testid="input-search-subject"
          />
        </TabsContent>
        
        <TabsContent value="messageId" className="space-y-2">
          <Label>{KO.pages.attachEmail.messageId}</Label>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="<message-id@example.com>"
            data-testid="input-search-messageid"
          />
          <p className="text-xs text-muted-foreground">
            {KO.pages.attachEmail.advancedOption}
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );

  const renderResultsStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {searchResults.length}개 스레드 발견
        </span>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setStep('search')}
          data-testid="button-search-again"
        >
          <Search className="w-4 h-4 mr-1" />
          다시 검색
        </Button>
      </div>
      
      {searchResults.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            {KO.pages.attachEmail.noResults}
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            {searchResults.map((thread, idx) => (
              <div
                key={thread.threadId}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedThread?.threadId === thread.threadId 
                    ? 'border-primary bg-primary/5' 
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => setSelectedThread(thread)}
                data-testid={`thread-result-${idx}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{thread.subject}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {thread.from}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {format(new Date(thread.date), 'PPp', { locale: ko })}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary" className="text-xs">
                      {thread.messageCount}건
                    </Badge>
                    {selectedThread?.threadId === thread.threadId && (
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  const renderConfirmStep = () => (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg bg-muted/30">
        <h4 className="font-medium mb-2">{KO.pages.attachEmail.selectedThread}</h4>
        {selectedThread && (
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">제목: </span>
              {selectedThread.subject}
            </div>
            <div>
              <span className="text-muted-foreground">발신자: </span>
              {selectedThread.from}
            </div>
            <div>
              <span className="text-muted-foreground">날짜: </span>
              {format(new Date(selectedThread.date), 'PPp', { locale: ko })}
            </div>
            <div>
              <span className="text-muted-foreground">메시지 수: </span>
              {selectedThread.messageCount}건
            </div>
          </div>
        )}
      </div>
      
      <p className="text-sm text-muted-foreground">
        {KO.pages.attachEmail.confirmDesc}
      </p>
    </div>
  );

  const getStepTitle = () => {
    switch (step) {
      case 'account': return KO.pages.attachEmail.step1Title;
      case 'search': return KO.pages.attachEmail.step2Title;
      case 'results': return KO.pages.attachEmail.step3Title;
      case 'confirm': return KO.pages.attachEmail.step4Title;
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'account': return !!selectedAccountId && emailAccounts?.length;
      case 'search': return searchQuery.trim().length > 0;
      case 'results': return !!selectedThread;
      case 'confirm': return true;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            {KO.pages.attachEmail.title}
          </DialogTitle>
        </DialogHeader>
        
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-4">
            {(['account', 'search', 'results', 'confirm'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center">
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step === s 
                      ? 'bg-primary text-primary-foreground' 
                      : i < ['account', 'search', 'results', 'confirm'].indexOf(step)
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i + 1}
                </div>
                {i < 3 && (
                  <div className={`w-8 h-0.5 ${
                    i < ['account', 'search', 'results', 'confirm'].indexOf(step)
                      ? 'bg-primary'
                      : 'bg-muted'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <h3 className="font-medium">{getStepTitle()}</h3>
        </div>

        <div className="min-h-[300px]">
          {step === 'account' && renderAccountStep()}
          {step === 'search' && renderSearchStep()}
          {step === 'results' && renderResultsStep()}
          {step === 'confirm' && renderConfirmStep()}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 'account'}
            data-testid="button-back"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {KO.common.back}
          </Button>
          
          <Button
            onClick={handleNext}
            disabled={!canProceed() || isSearching || attachThread.isPending}
            data-testid="button-next"
          >
            {isSearching || attachThread.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : null}
            {step === 'confirm' 
              ? KO.pages.attachEmail.attachButton 
              : step === 'search' 
                ? KO.pages.attachEmail.searchButton
                : KO.common.next}
            {step !== 'confirm' && step !== 'search' && (
              <ChevronRight className="w-4 h-4 ml-1" />
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
