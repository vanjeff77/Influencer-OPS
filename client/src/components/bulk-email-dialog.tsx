import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { api } from '@shared/routes';
import { Checkbox } from '@/components/ui/checkbox';
import { Mail, Send, Eye, AlertCircle, Check, X, Loader2, FileText, Users, TestTube, RotateCcw, Star } from 'lucide-react';
import DOMPurify from 'dompurify';
import { KO } from '@/i18n/ko';
import { TiptapEditor } from '@/components/tiptap-editor';

interface CampaignLineItem {
  id: number;
  influencer?: {
    id: number;
    name: string;
    email?: string | null;
  };
  firstContactCompleted?: boolean | null;
}

interface BulkEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: number;
  campaignName: string;
  lineItems: CampaignLineItem[];
  workspaceId: number;
}

interface EligibleItem {
  lineItemId: number;
  influencerId: number;
  name: string;
  email: string;
  variables: Record<string, string>;
}

interface ExcludedItem {
  lineItemId: number;
  influencerId: number;
  name: string;
  email: string | null;
  reason: string;
}

interface ValidationResult {
  totalSelected: number;
  eligibleCount: number;
  excludedCount: number;
  eligible: EligibleItem[];
  excluded: ExcludedItem[];
}

type Step = 'template' | 'preview' | 'test' | 'confirm';

export function BulkEmailDialog({ open, onOpenChange, campaignId, campaignName, lineItems, workspaceId }: BulkEmailDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<Step>('template');
  const [subject, setSubject] = useState(`[${campaignName}] 안녕하세요, {{influencer_name}}님!`);
  const [cc, setCc] = useState('');
  const [body, setBody] = useState(`<p>안녕하세요 {{influencer_name}}님,</p>
<p>{{campaign_name}} 캠페인 협업 제안 드립니다.</p>
<p>자세한 내용은 회신 부탁드립니다.</p>
<p>감사합니다.</p>`);
  const [selectedEmailAccountId, setSelectedEmailAccountId] = useState<string>('');
  const [previewInfluencerId, setPreviewInfluencerId] = useState<number | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [allowResend, setAllowResend] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [checkedLineItemIds, setCheckedLineItemIds] = useState<Set<number>>(() => new Set(lineItems.map(li => li.id)));
  
  
  const { data: emailAccounts, isLoading: isLoadingAccounts } = useQuery<any[]>({
    queryKey: ['/api/workspaces', workspaceId.toString(), 'email-accounts'],
    queryFn: () => fetch(`/api/workspaces/${workspaceId}/email-accounts`).then(r => r.json()),
    enabled: open && !!workspaceId,
  });
  
  const { data: emailTemplates = [] } = useQuery<any[]>({
    queryKey: ['/api/workspaces', workspaceId.toString(), 'email-templates'],
    queryFn: () => fetch(`/api/workspaces/${workspaceId}/email-templates`).then(r => r.json()),
    enabled: open && !!workspaceId,
  });

  const availableAccounts = useMemo(() => {
    return emailAccounts || [];
  }, [emailAccounts]);
  
  const selectedAccount = useMemo(() => {
    if (!selectedEmailAccountId || !availableAccounts.length) return null;
    return availableAccounts.find((acc: any) => acc.id.toString() === selectedEmailAccountId);
  }, [selectedEmailAccountId, availableAccounts]);
  
  const previewMutation = useMutation({
    mutationFn: async (influencerId: number) => {
      const res = await apiRequest('POST', '/api/bulk-email/preview', {
        subject,
        body,
        influencerId,
        campaignId,
        emailAccountId: selectedEmailAccountId ? parseInt(selectedEmailAccountId) : undefined,
      });
      return res.json();
    },
  });
  
  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/bulk-email/test', {
        subject,
        body,
        cc: cc.trim() || undefined,
        testEmail,
        emailAccountId: parseInt(selectedEmailAccountId),
        influencerId: previewInfluencerId || lineItems[0]?.influencer?.id,
        campaignId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: KO.pages.bulkEmail.testSuccess, description: data.message });
    },
    onError: (error: any) => {
      toast({ title: KO.pages.bulkEmail.testFailed, description: error.message, variant: 'destructive' });
    },
  });
  
  const lineItemsWithEmail = useMemo(() => {
    return lineItems.filter(li => li.influencer?.email);
  }, [lineItems]);

  const allChecked = lineItemsWithEmail.length > 0 && lineItemsWithEmail.every(li => checkedLineItemIds.has(li.id));
  const someChecked = lineItemsWithEmail.some(li => checkedLineItemIds.has(li.id));
  const checkedCount = lineItemsWithEmail.filter(li => checkedLineItemIds.has(li.id)).length;

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setCheckedLineItemIds(new Set(lineItemsWithEmail.map(li => li.id)));
    } else {
      setCheckedLineItemIds(new Set());
    }
  };

  const toggleOne = (lineItemId: number, checked: boolean) => {
    setCheckedLineItemIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(lineItemId);
      } else {
        next.delete(lineItemId);
      }
      return next;
    });
  };

  const validateMutation = useMutation({
    mutationFn: async (resend?: boolean) => {
      const selectedLineItemIds = Array.from(checkedLineItemIds);
      const res = await apiRequest('POST', '/api/bulk-email/validate', {
        subject,
        body,
        campaignId,
        allowResend: resend ?? allowResend,
        lineItemIds: selectedLineItemIds,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setValidation(data);
    },
  });
  
  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/bulk-email/start', {
        subject,
        body,
        cc: cc.trim() || undefined,
        campaignId,
        emailAccountId: parseInt(selectedEmailAccountId),
        eligible: validation?.eligible || [],
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: KO.pages.bulkEmail.sendStarted, description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/bulk-email/jobs', campaignId.toString()] });
      queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, campaignId] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', 'campaignId', campaignId.toString()] });
      onOpenChange(false);
      resetState();
    },
    onError: (error: any) => {
      toast({ title: KO.pages.bulkEmail.sendFailed, description: error.message, variant: 'destructive' });
    },
  });
  
  const resetState = () => {
    setStep('template');
    setValidation(null);
    setPreviewInfluencerId(null);
    setTestEmail('');
    setAllowResend(false);
    setCheckedLineItemIds(new Set(lineItemsWithEmail.map(li => li.id)));
  };
  
  const handlePreview = (influencerId: number) => {
    setPreviewInfluencerId(influencerId);
    previewMutation.mutate(influencerId);
  };
  
  const handleGoToConfirm = () => {
    validateMutation.mutate(allowResend);
    setStep('confirm');
  };
  
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetState(); }}>
      <DialogContent className="max-w-4xl h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            {KO.pages.bulkEmail.title}
          </DialogTitle>
          <DialogDescription>
            {campaignName} - {lineItems.length}{KO.pages.bulkEmail.recipientCount}
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={step} onValueChange={(v) => setStep(v as Step)} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="grid grid-cols-4 w-full shrink-0">
            <TabsTrigger value="template" className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">{KO.pages.bulkEmail.templateTab}</span>
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              <span className="hidden sm:inline">{KO.pages.bulkEmail.previewTab}</span>
            </TabsTrigger>
            <TabsTrigger value="test" className="flex items-center gap-1">
              <TestTube className="w-4 h-4" />
              <span className="hidden sm:inline">{KO.pages.bulkEmail.testTab}</span>
            </TabsTrigger>
            <TabsTrigger value="confirm" className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">{KO.pages.bulkEmail.confirmTab}</span>
            </TabsTrigger>
          </TabsList>
          
          <div className="flex-1 min-h-0 relative">
            <TabsContent value="template" className="absolute inset-0 flex flex-col p-1 overflow-hidden data-[state=inactive]:pointer-events-none">
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-2">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[180px] space-y-1">
                    <Label className="text-xs text-muted-foreground">{KO.pages.bulkEmail.selectAccount}</Label>
                    {isLoadingAccounts ? (
                      <Skeleton className="h-9 w-full" />
                    ) : availableAccounts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{KO.pages.bulkEmail.noImapAccount}</p>
                    ) : (
                      <Select value={selectedEmailAccountId} onValueChange={setSelectedEmailAccountId}>
                        <SelectTrigger data-testid="select-email-account">
                          <SelectValue placeholder={KO.pages.bulkEmail.selectAccountPlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableAccounts.map((acc: any) => (
                            <SelectItem key={acc.id} value={acc.id.toString()}>{acc.email}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {emailTemplates.length > 0 && (
                    <div className="flex-1 min-w-[180px] space-y-1">
                      <Label className="text-xs text-muted-foreground">{KO.emailTemplates.loadTemplate}</Label>
                      <Select
                        value=""
                        onValueChange={(templateId) => {
                          const tmpl = emailTemplates.find((t: any) => t.id.toString() === templateId);
                          if (tmpl) {
                            setSubject(tmpl.subject);
                            setBody(tmpl.bodyHtml);
                            toast({ title: KO.emailTemplates.applied });
                          }
                        }}
                      >
                        <SelectTrigger data-testid="select-email-template">
                          <SelectValue placeholder={KO.emailTemplates.loadTemplate} />
                        </SelectTrigger>
                        <SelectContent>
                          {emailTemplates.map((tmpl: any) => (
                            <SelectItem key={tmpl.id} value={tmpl.id.toString()}>
                              <span className="flex items-center gap-2">
                                {tmpl.isDefault && <Star className="w-3 h-3 text-yellow-500 shrink-0" />}
                                {tmpl.name}
                                <span className="text-muted-foreground text-xs">— {tmpl.subject}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{KO.pages.bulkEmail.subject}</Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={KO.pages.bulkEmail.subjectPlaceholder}
                    data-testid="input-subject"
                  />
                  {!subject.includes('{{influencer_name}}') ? (
                    <p className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {KO.pages.bulkEmail.subjectVariableGuide}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Check className="w-3 h-3 shrink-0" />
                      {KO.pages.bulkEmail.variableHint}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{KO.pages.bulkEmail.cc}</Label>
                  <Input
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder={KO.pages.bulkEmail.ccPlaceholder}
                    data-testid="input-cc"
                  />
                </div>

                <div className="space-y-1">
                  <TiptapEditor
                    value={body}
                    onChange={setBody}
                    toolbar="email"
                    data-testid="editor-body"
                  />
                </div>
              </div>
              
              <div className="flex justify-end pt-3 border-t shrink-0">
                <Button onClick={() => setStep('preview')} disabled={!selectedEmailAccountId} data-testid="button-next-preview">
                  {KO.pages.bulkEmail.next}
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="preview" className="absolute inset-0 flex flex-col overflow-hidden p-1 data-[state=inactive]:pointer-events-none">
              <div className="flex-1 overflow-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="block">{KO.pages.bulkEmail.recipientList}</Label>
                      <span className="text-xs text-muted-foreground">{checkedCount}/{lineItemsWithEmail.length}명 선택</span>
                    </div>
                    <ScrollArea className="h-64 border rounded-md">
                      <div className="divide-y">
                        <div
                          className="p-2 flex items-center gap-2 border-b bg-muted/30 sticky top-0 z-10"
                          data-testid="checkbox-select-all"
                        >
                          <Checkbox
                            checked={allChecked ? true : someChecked ? "indeterminate" : false}
                            onCheckedChange={(checked) => toggleAll(!!checked)}
                            data-testid="checkbox-select-all-input"
                          />
                          <span className="text-sm font-medium">전체 선택</span>
                        </div>
                        {lineItemsWithEmail.map(li => (
                          <div
                            key={li.id}
                            className={`p-2 flex items-center gap-2 cursor-pointer hover-elevate ${previewInfluencerId === li.influencer?.id ? 'bg-primary/10' : ''}`}
                            onClick={() => handlePreview(li.influencer!.id)}
                            data-testid={`preview-influencer-${li.id}`}
                          >
                            <Checkbox
                              checked={checkedLineItemIds.has(li.id)}
                              onCheckedChange={(checked) => toggleOne(li.id, !!checked)}
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`checkbox-recipient-${li.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{li.influencer?.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{li.influencer?.email}</div>
                            </div>
                            {li.firstContactCompleted && (
                              <Badge variant="outline" className="text-xs shrink-0">발송완료</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                  
                  <div>
                    <Label className="mb-2 block">{KO.pages.bulkEmail.previewResult}</Label>
                    {previewMutation.isPending ? (
                      <div className="flex items-center justify-center h-64 border rounded-md">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : previewMutation.data ? (
                      <Card className="h-64 overflow-auto">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">{previewMutation.data.renderedSubject}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div 
                            className="prose prose-sm max-w-none dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewMutation.data.renderedBody) }}
                          />
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="flex items-center justify-center h-64 border rounded-md text-muted-foreground">
                        {KO.pages.bulkEmail.selectToPreview}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex justify-between pt-4 border-t mt-2 shrink-0">
                <Button variant="outline" onClick={() => setStep('template')} data-testid="button-back-template">
                  {KO.pages.bulkEmail.back}
                </Button>
                <Button onClick={() => setStep('test')} disabled={checkedCount === 0} data-testid="button-next-test">
                  {KO.pages.bulkEmail.next} ({checkedCount}명)
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="test" className="absolute inset-0 flex flex-col overflow-hidden p-1 data-[state=inactive]:pointer-events-none">
              <div className="flex-1 overflow-auto space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{KO.pages.bulkEmail.testSend}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>{KO.pages.bulkEmail.testEmailAddress}</Label>
                      <Input
                        type="email"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        placeholder="your-email@example.com"
                        data-testid="input-test-email"
                      />
                    </div>
                    <Button
                      onClick={() => testMutation.mutate()}
                      disabled={!testEmail || testMutation.isPending}
                      data-testid="button-send-test"
                    >
                      {testMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      {KO.pages.bulkEmail.sendTest}
                    </Button>
                  </CardContent>
                </Card>
              </div>
              
              <div className="flex justify-between pt-4 border-t mt-2 shrink-0">
                <Button variant="outline" onClick={() => setStep('preview')} data-testid="button-back-preview">
                  {KO.pages.bulkEmail.back}
                </Button>
                <Button onClick={handleGoToConfirm} data-testid="button-next-confirm">
                  {KO.pages.bulkEmail.next}
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="confirm" className="absolute inset-0 flex flex-col overflow-hidden p-1 data-[state=inactive]:pointer-events-none">
              {validateMutation.isPending ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              ) : validation ? (
                <>
                  <div className="flex-1 overflow-auto space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="pt-4 text-center">
                          <div className="text-2xl font-bold">{validation.totalSelected}</div>
                          <div className="text-sm text-muted-foreground">{KO.pages.bulkEmail.totalSelected}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4 text-center">
                          <div className="text-2xl font-bold text-green-600">{validation.eligibleCount}</div>
                          <div className="text-sm text-muted-foreground">{KO.pages.bulkEmail.eligible}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4 text-center">
                          <div className="text-2xl font-bold text-red-600">{validation.excludedCount}</div>
                          <div className="text-sm text-muted-foreground">{KO.pages.bulkEmail.excluded}</div>
                        </CardContent>
                      </Card>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="allowResend"
                        checked={allowResend}
                        onCheckedChange={(checked) => {
                          const newVal = !!checked;
                          setAllowResend(newVal);
                          validateMutation.mutate(newVal);
                        }}
                        data-testid="checkbox-allow-resend"
                      />
                      <label htmlFor="allowResend" className="text-sm cursor-pointer flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                        기존 발송 이력이 있는 인플루언서도 포함
                      </label>
                    </div>
                    
                    {validation.excluded.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2 text-red-600">
                            <AlertCircle className="w-4 h-4" />
                            {KO.pages.bulkEmail.excludedList}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-32">
                            <div className="space-y-1">
                              {validation.excluded.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm py-1">
                                  <span>{item.name} ({item.email || KO.pages.bulkEmail.noEmail})</span>
                                  <Badge variant="outline" className="text-xs">{item.reason}</Badge>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    )}
                    
                    {validation.eligible.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2 text-green-600">
                            <Check className="w-4 h-4" />
                            {KO.pages.bulkEmail.eligibleList}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-32">
                            <div className="space-y-1">
                              {validation.eligible.map((item, idx) => (
                                <div key={idx} className="text-sm py-1">
                                  {item.name} - {item.email}
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                  
                  <div className="flex justify-between pt-4 border-t mt-2 shrink-0">
                    <Button variant="outline" onClick={() => setStep('test')} data-testid="button-back-test">
                      {KO.pages.bulkEmail.back}
                    </Button>
                    <Button
                      onClick={() => startMutation.mutate()}
                      disabled={validation.eligibleCount === 0 || startMutation.isPending}
                      data-testid="button-start-send"
                    >
                      {startMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      {KO.pages.bulkEmail.startSend} ({validation.eligibleCount}{KO.pages.bulkEmail.people})
                    </Button>
                  </div>
                </>
              ) : null}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
