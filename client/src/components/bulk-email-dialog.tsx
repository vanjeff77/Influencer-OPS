import { useState, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Mail, Send, Eye, AlertCircle, Check, X, Loader2, FileText, Users, TestTube, RotateCcw } from 'lucide-react';
import DOMPurify from 'dompurify';
import { KO } from '@/i18n/ko';

const ReactQuill = lazy(() => import('react-quill-new'));
import 'react-quill-new/dist/quill.snow.css';

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
  const bodyRef = useRef(body);
  const isComposing = useRef(false);
  const quillRef = useRef<any>(null);
  const compositionSetup = useRef(false);

  const handleBodyChange = useCallback((value: string) => {
    bodyRef.current = value;
    if (!isComposing.current) {
      setBody(value);
    }
  }, []);

  const setupCompositionHandlers = useCallback((ref: any) => {
    quillRef.current = ref;
    if (ref && !compositionSetup.current) {
      const editor = ref.getEditor?.();
      if (editor?.root) {
        editor.root.addEventListener('compositionstart', () => { isComposing.current = true; });
        editor.root.addEventListener('compositionend', () => {
          isComposing.current = false;
          setTimeout(() => setBody(bodyRef.current), 0);
        });
        
        editor.root.addEventListener('paste', (e: ClipboardEvent) => {
          const clipboardHtml = e.clipboardData?.getData('text/html');
          if (clipboardHtml && clipboardHtml.includes('<img')) {
            e.preventDefault();
            e.stopPropagation();
            
            let cleanedHtml = clipboardHtml;
            cleanedHtml = cleanedHtml.replace(/<!--StartFragment-->/gi, '');
            cleanedHtml = cleanedHtml.replace(/<!--EndFragment-->/gi, '');
            
            const bodyMatch = cleanedHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch) {
              cleanedHtml = bodyMatch[1];
            }
            
            const metaIndex = cleanedHtml.indexOf('<meta');
            if (metaIndex === -1 || cleanedHtml.indexOf('<') < metaIndex) {
              // no meta to strip
            } else {
              cleanedHtml = cleanedHtml.replace(/<meta[^>]*>/gi, '');
            }
            
            cleanedHtml = cleanedHtml.replace(/<img([^>]*)src="data:image\/[^"]*"([^>]*)>/gi, '');
            
            const range = editor.getSelection(true);
            editor.clipboard.dangerouslyPasteHTML(range.index, cleanedHtml, 'user');
          }
        });
        
        compositionSetup.current = true;
      }
    }
  }, []);
  
  
  const { data: emailAccounts, isLoading: isLoadingAccounts } = useQuery<any[]>({
    queryKey: ['/api/workspaces', workspaceId.toString(), 'email-accounts'],
    queryFn: () => fetch(`/api/workspaces/${workspaceId}/email-accounts`).then(r => r.json()),
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
  
  const validateMutation = useMutation({
    mutationFn: async (resend?: boolean) => {
      const res = await apiRequest('POST', '/api/bulk-email/validate', {
        subject,
        body,
        campaignId,
        allowResend: resend ?? allowResend,
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
        campaignId,
        emailAccountId: parseInt(selectedEmailAccountId),
        eligible: validation?.eligible || [],
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: KO.pages.bulkEmail.sendStarted, description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/bulk-email/jobs', campaignId.toString()] });
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
    compositionSetup.current = false;
  };
  
  const handlePreview = (influencerId: number) => {
    setPreviewInfluencerId(influencerId);
    previewMutation.mutate(influencerId);
  };
  
  const handleGoToConfirm = () => {
    validateMutation.mutate(allowResend);
    setStep('confirm');
  };
  
  const quillModules = {
    table: true,
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      ['link', 'image'],
      ['clean'],
    ],
    history: {
      delay: 500,
      maxStack: 100,
      userOnly: true
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetState(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            {KO.pages.bulkEmail.title}
          </DialogTitle>
          <DialogDescription>
            {campaignName} - {lineItems.length}{KO.pages.bulkEmail.recipientCount}
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={step} onValueChange={(v) => setStep(v as Step)} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-4 w-full">
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
          
          <div className="flex-1 overflow-hidden">
            <TabsContent value="template" className="h-full flex flex-col overflow-hidden p-1">
              <div className="flex-1 overflow-auto space-y-4">
                <div>
                  <Label>{KO.pages.bulkEmail.selectAccount}</Label>
                  {isLoadingAccounts ? (
                    <Skeleton className="h-10 w-full" />
                  ) : availableAccounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-1">{KO.pages.bulkEmail.noImapAccount}</p>
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
                
                <div>
                  <Label>{KO.pages.bulkEmail.subject}</Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={KO.pages.bulkEmail.subjectPlaceholder}
                    data-testid="input-subject"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{KO.pages.bulkEmail.variableHint}</p>
                </div>
                
                <div>
                  <Label>참조 (CC)</Label>
                  <Input
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="참조할 이메일 주소 (쉼표로 구분, 모든 수신자에게 동일하게 적용)"
                    data-testid="input-cc"
                  />
                  <p className="text-xs text-muted-foreground mt-1">모든 이메일에 동일하게 적용됩니다</p>
                </div>
                
                <div>
                  <Label>{KO.pages.bulkEmail.body}</Label>
                  <Suspense fallback={<Skeleton className="h-64" />}>
                    <ReactQuill
                      ref={setupCompositionHandlers}
                      theme="snow"
                      defaultValue={body}
                      onChange={handleBodyChange}
                      modules={quillModules}
                      className="h-64"
                      data-testid="editor-body"
                    />
                  </Suspense>
                </div>
                
                {selectedAccount?.useSignature && selectedAccount?.signature && (
                  <div className="mt-12">
                    <Label className="text-muted-foreground text-xs">서명 미리보기</Label>
                    <div className="border rounded-md p-3 mt-1 bg-muted/30">
                      <div className="text-xs text-muted-foreground mb-2">--</div>
                      <div
                        className="prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedAccount.signature) }}
                      />
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end pt-4 border-t mt-2 shrink-0">
                <Button onClick={() => setStep('preview')} disabled={!selectedEmailAccountId} data-testid="button-next-preview">
                  {KO.pages.bulkEmail.next}
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="preview" className="h-full flex flex-col overflow-hidden p-1">
              <div className="flex-1 overflow-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-2 block">{KO.pages.bulkEmail.selectInfluencer}</Label>
                    <ScrollArea className="h-64 border rounded-md">
                      <div className="divide-y">
                        {lineItems.filter(li => li.influencer?.email).map(li => (
                          <div
                            key={li.id}
                            className={`p-2 cursor-pointer hover:bg-muted/50 ${previewInfluencerId === li.influencer?.id ? 'bg-primary/10' : ''}`}
                            onClick={() => handlePreview(li.influencer!.id)}
                            data-testid={`preview-influencer-${li.id}`}
                          >
                            <div className="font-medium text-sm">{li.influencer?.name}</div>
                            <div className="text-xs text-muted-foreground">{li.influencer?.email}</div>
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
                <Button onClick={() => setStep('test')} data-testid="button-next-test">
                  {KO.pages.bulkEmail.next}
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="test" className="h-full flex flex-col overflow-hidden p-1">
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
            
            <TabsContent value="confirm" className="h-full flex flex-col overflow-hidden p-1">
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
