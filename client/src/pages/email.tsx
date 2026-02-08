import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useEmailAccounts, useEmailThreads, useSyncEmail, useSendBulkEmail } from "@/hooks/use-email";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, Send, Mail, User, Clock, Plus, Loader2, Trash2, Settings, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import ReactQuill from 'react-quill-new';
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { KO } from "@/i18n/ko";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FeatureHint } from "@/components/onboarding";
import { TableStyleToolbar } from "@/components/table-style-toolbar";

const EMAIL_PRESETS: Record<string, { imapServer: string; imapPort: string; smtpServer: string; smtpPort: string }> = {
  naver: { imapServer: "imap.naver.com", imapPort: "993", smtpServer: "smtp.naver.com", smtpPort: "587" },
  google: { imapServer: "imap.gmail.com", imapPort: "993", smtpServer: "smtp.gmail.com", smtpPort: "587" },
};

export default function EmailCenter() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  const { data: accounts } = useEmailAccounts(workspaceId || 0);
  
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const { data: threads, isLoading: isLoadingThreads } = useEmailThreads(selectedAccountId || 0);
  const syncEmail = useSyncEmail(selectedAccountId || 0);
  const sendBulk = useSendBulkEmail();
  const { toast } = useToast();

  const [selectedThread, setSelectedThread] = useState<any>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [composeData, setComposeData] = useState({ to: "", subject: "", body: "" });
  const [emailPreset, setEmailPreset] = useState<string>("");
  const [imapData, setImapData] = useState({ email: "", password: "", imapServer: "", imapPort: "993", smtpServer: "", smtpPort: "587" });
  const [deleteAccountId, setDeleteAccountId] = useState<number | null>(null);
  const [signatureAccountId, setSignatureAccountId] = useState<number | null>(null);
  const [signatureContent, setSignatureContent] = useState<string>("");
  const [useSignature, setUseSignature] = useState<boolean>(true);

  const handlePresetChange = (preset: string) => {
    setEmailPreset(preset);
    if (preset && EMAIL_PRESETS[preset]) {
      setImapData(prev => ({ ...prev, ...EMAIL_PRESETS[preset] }));
    }
  };

  const registerImap = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/email/imap/register', { workspaceId, ...data });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces/:workspaceId/email-accounts', workspaceId] });
      setIsConnectOpen(false);
      setImapData({ email: "", password: "", imapServer: "", imapPort: "993", smtpServer: "", smtpPort: "587" });
      setEmailPreset("");
      toast({ title: "이메일 연결 완료", description: `${data.account?.email || ''} 계정이 추가되었습니다.` });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: KO.pages.email.connectionFailed, description: err.message });
    }
  });

  const deleteAccount = useMutation({
    mutationFn: async (accountId: number) => {
      const res = await apiRequest('DELETE', `/api/email/accounts/${accountId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces/:workspaceId/email-accounts', workspaceId] });
      if (selectedAccountId === deleteAccountId) {
        setSelectedAccountId(null);
        setSelectedThread(null);
      }
      setDeleteAccountId(null);
      toast({ title: KO.pages.email.deleteAccount, description: KO.pages.email.deleteAccountSuccess });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: KO.pages.email.deleteAccountFailed, description: err.message });
    }
  });

  const updateSignature = useMutation({
    mutationFn: async ({ accountId, signature, useSignature }: { accountId: number; signature: string | null; useSignature: boolean }) => {
      const res = await apiRequest('PATCH', `/api/email/accounts/${accountId}/signature`, { signature, useSignature });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces/:workspaceId/email-accounts', workspaceId] });
      setSignatureAccountId(null);
      toast({ title: "서명이 저장되었습니다" });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "서명 저장 실패", description: err.message });
    }
  });

  const handleOpenSignatureSettings = (account: any) => {
    setSignatureAccountId(account.id);
    setSignatureContent(account.signature || "");
    setUseSignature(account.useSignature ?? true);
  };

  const handleSaveSignature = () => {
    if (!signatureAccountId) return;
    updateSignature.mutate({
      accountId: signatureAccountId,
      signature: signatureContent || null,
      useSignature
    });
  };

  const handleSync = () => {
    if (!selectedAccountId) return;
    syncEmail.mutate(undefined, {
      onSuccess: (data) => toast({ title: KO.pages.email.syncComplete, description: `${data.syncedCount}${KO.pages.email.syncCompleteDesc}` })
    });
  };

  const handleSend = () => {
    if (!selectedAccountId) return;
    const recipients = composeData.to.split(',').map(e => e.trim());
    sendBulk.mutate({
      accountId: selectedAccountId,
      to: recipients,
      subject: composeData.subject,
      bodyTemplate: composeData.body
    }, {
      onSuccess: () => {
        setIsComposeOpen(false);
        setComposeData({ to: "", subject: "", body: "" });
        toast({ title: KO.pages.email.emailsSent, description: KO.pages.email.emailsSentDesc });
      }
    });
  };

  const handleConnectImap = () => {
    if (!imapData.email || !imapData.password) {
      toast({ variant: "destructive", title: "필수 정보 누락", description: "이메일과 비밀번호를 입력하세요." });
      return;
    }
    if (!imapData.imapServer || !imapData.smtpServer) {
      toast({ variant: "destructive", title: "서버 정보 누락", description: KO.pages.email.missingServerInfo });
      return;
    }
    registerImap.mutate(imapData);
  };

  return (
    <Layout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <FeatureHint
          hintId="email-intro"
          title="이메일 계정 연동하기"
          description="Gmail 계정을 연동하면 인플루언서와 이메일로 소통하고, 캠페인 상세 페이지에서 대량 이메일을 발송할 수 있습니다."
          className="mb-4"
        />
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{KO.pages.email.title}</h1>
            <p className="text-muted-foreground mt-1">{KO.pages.email.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSync} disabled={!selectedAccountId || syncEmail.isPending}>
              <RefreshCw className={`w-4 h-4 mr-2 ${syncEmail.isPending ? 'animate-spin' : ''}`} />
              {KO.common.sync}
            </Button>
            
            <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
              <DialogTrigger asChild>
                <Button disabled={!selectedAccountId}>
                  <Send className="w-4 h-4 mr-2" />
                  {KO.common.compose}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>{KO.pages.email.sendEmail}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <label>{KO.pages.email.to}</label>
                    <Input value={composeData.to} onChange={e => setComposeData({...composeData, to: e.target.value})} placeholder="email1@example.com, email2@example.com" />
                  </div>
                  <div className="grid gap-2">
                    <label>{KO.pages.email.subject}</label>
                    <Input value={composeData.subject} onChange={e => setComposeData({...composeData, subject: e.target.value})} placeholder="협업 제안" />
                  </div>
                  <div className="grid gap-2">
                    <label>{KO.pages.email.body}</label>
                    <Textarea 
                      value={composeData.body} 
                      onChange={e => setComposeData({...composeData, body: e.target.value})} 
                      placeholder="안녕하세요, ..." 
                      className="min-h-[200px]"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSend} disabled={sendBulk.isPending}>
                    {sendBulk.isPending ? KO.pages.email.sending : KO.pages.email.sendEmails}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
          <div className="col-span-3 bg-card rounded-xl border border-border p-4 flex flex-col gap-2 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm px-2 text-muted-foreground uppercase">{KO.pages.email.accounts}</h3>
              <Dialog open={isConnectOpen} onOpenChange={setIsConnectOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <Plus className="w-3 h-3 mr-1" />
                    {KO.pages.email.addAccount}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>{KO.pages.email.connectAccount}</DialogTitle>
                  </DialogHeader>
                  
                  <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">이메일 서비스 선택</label>
                        <Select value={emailPreset} onValueChange={handlePresetChange}>
                          <SelectTrigger data-testid="select-email-preset">
                            <SelectValue placeholder="이메일 서비스를 선택하세요" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="naver">네이버 메일</SelectItem>
                            <SelectItem value="google">Gmail (앱 비밀번호 사용)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">{KO.pages.email.emailAddress}</label>
                        <Input value={imapData.email} onChange={e => setImapData({...imapData, email: e.target.value})} placeholder="you@company.com" data-testid="input-imap-email" />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">{KO.pages.email.password}</label>
                        <Input type="password" value={imapData.password} onChange={e => setImapData({...imapData, password: e.target.value})} placeholder="앱 비밀번호를 입력하세요" data-testid="input-imap-password" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <label className="text-sm font-medium">{KO.pages.email.imapServer}</label>
                          <Input value={imapData.imapServer} onChange={e => setImapData({...imapData, imapServer: e.target.value})} placeholder="imap.naver.com" data-testid="input-imap-server" readOnly={!!emailPreset} className={emailPreset ? "bg-muted" : ""} />
                        </div>
                        <div className="grid gap-2">
                          <label className="text-sm font-medium">{KO.pages.email.imapPort}</label>
                          <Input value={imapData.imapPort} onChange={e => setImapData({...imapData, imapPort: e.target.value})} data-testid="input-imap-port" readOnly={!!emailPreset} className={emailPreset ? "bg-muted" : ""} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <label className="text-sm font-medium">{KO.pages.email.smtpServer}</label>
                          <Input value={imapData.smtpServer} onChange={e => setImapData({...imapData, smtpServer: e.target.value})} placeholder="smtp.naver.com" data-testid="input-smtp-server" readOnly={!!emailPreset} className={emailPreset ? "bg-muted" : ""} />
                        </div>
                        <div className="grid gap-2">
                          <label className="text-sm font-medium">{KO.pages.email.smtpPort}</label>
                          <Input value={imapData.smtpPort} onChange={e => setImapData({...imapData, smtpPort: e.target.value})} data-testid="input-smtp-port" readOnly={!!emailPreset} className={emailPreset ? "bg-muted" : ""} />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setIsConnectOpen(false)}>{KO.common.cancel}</Button>
                        <Button onClick={handleConnectImap} disabled={registerImap.isPending} data-testid="button-connect-imap">
                          {registerImap.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          {KO.pages.email.connect}
                        </Button>
                      </div>
                    </div>
                </DialogContent>
              </Dialog>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {accounts?.map(acc => (
                <button
                  key={acc.id}
                  onClick={() => { setSelectedAccountId(acc.id); setSelectedThread(null); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${selectedAccountId === acc.id ? 'bg-primary text-primary-foreground shadow-md' : 'hover:bg-muted'}`}
                  data-testid={`button-account-${acc.id}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${selectedAccountId === acc.id ? 'bg-white/20' : 'bg-primary/10 text-primary'}`}>
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="overflow-hidden min-w-0">
                     <div className="font-medium truncate text-sm">{acc.email}</div>
                     <div className={`text-xs truncate ${selectedAccountId === acc.id ? 'text-white/80' : 'text-muted-foreground'}`}>{acc.provider}</div>
                  </div>
                </button>
              ))}
              {!accounts?.length && (
                <div className="text-sm text-muted-foreground p-2 text-center py-8">
                  <Mail className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {KO.pages.email.noAccounts}
                </div>
              )}
            </div>
            
            {/* Account Actions - Bottom Section */}
            {selectedAccountId && accounts?.find(a => a.id === selectedAccountId) && (
              <div className="border-t border-border pt-3 mt-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => handleOpenSignatureSettings(accounts.find(a => a.id === selectedAccountId)!)}
                  data-testid="button-account-settings"
                >
                  <Settings className="w-4 h-4" />
                  서명 설정
                </Button>
                <AlertDialog open={deleteAccountId === selectedAccountId} onOpenChange={(open) => !open && setDeleteAccountId(null)}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-destructive"
                      onClick={() => setDeleteAccountId(selectedAccountId)}
                      data-testid="button-delete-account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle data-testid="text-delete-account-title">{KO.pages.email.deleteAccount}</AlertDialogTitle>
                      <AlertDialogDescription data-testid="text-delete-account-desc">
                        {KO.pages.email.deleteAccountConfirm}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-delete-account">{KO.common.cancel}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground"
                        onClick={() => deleteAccount.mutate(selectedAccountId)}
                        disabled={deleteAccount.isPending}
                        data-testid="button-confirm-delete-account"
                      >
                        {deleteAccount.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        {KO.common.delete}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>

          <div className="col-span-9 bg-card rounded-xl border border-border flex flex-col overflow-hidden">
             <div className="p-4 border-b border-border bg-muted/10">
               <Tabs defaultValue="inbox">
                 <TabsList className="grid w-full grid-cols-3">
                   <TabsTrigger value="inbox">{KO.pages.email.inbox}</TabsTrigger>
                   <TabsTrigger value="sent">{KO.pages.email.sent}</TabsTrigger>
                   <TabsTrigger value="drafts">{KO.pages.email.drafts}</TabsTrigger>
                 </TabsList>
               </Tabs>
             </div>
             <ScrollArea className="flex-1">
               <div className="flex flex-col">
                 {threads?.map(thread => (
                   <button
                     key={thread.id}
                     onClick={() => setSelectedThread(thread)}
                     className={`p-4 border-b border-border text-left hover:bg-muted/50 transition-colors ${selectedThread?.id === thread.id ? 'bg-muted' : ''}`}
                     data-testid={`button-thread-${thread.id}`}
                   >
                     <div className="flex justify-between mb-1">
                       <span className="font-semibold text-sm truncate max-w-[70%]">{thread.subject || KO.pages.email.noSubject}</span>
                       <span className="text-xs text-muted-foreground whitespace-nowrap">
                         {thread.lastMessageDate ? format(new Date(thread.lastMessageDate), 'MMM d') : ''}
                       </span>
                     </div>
                     <p className="text-xs text-muted-foreground line-clamp-2">{thread.snippet}</p>
                   </button>
                 ))}
                 {isLoadingThreads && <div className="p-8 text-center text-sm text-muted-foreground">{KO.pages.email.loadingThreads}</div>}
                 {!selectedAccountId && (
                   <div className="p-8 text-center text-sm text-muted-foreground">
                     <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
                     {KO.pages.email.selectAccount}
                   </div>
                 )}
               </div>
             </ScrollArea>
          </div>

        </div>
      </div>

      {/* Email Thread Detail Dialog */}
      <Dialog open={!!selectedThread} onOpenChange={(open) => !open && setSelectedThread(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold leading-tight pr-8">
              {selectedThread?.subject || KO.pages.email.noSubject}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              {selectedThread?.lastMessageDate ? format(new Date(selectedThread.lastMessageDate), 'PPP p') : ''}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 min-h-[300px] max-h-[50vh]">
            <div className="space-y-6 p-2">
              <div className="flex gap-4">
                <Avatar>
                  <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <span className="font-semibold">Jane Doe</span>
                    <span className="text-xs text-muted-foreground">{KO.pages.email.yesterday}</span>
                  </div>
                  <div className="text-sm leading-relaxed">
                    {selectedThread?.snippet}
                    <br/><br/>
                    감사합니다.
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
          
          <div className="pt-4 border-t border-border flex gap-2">
            <Button className="flex-1">{KO.common.reply}</Button>
            <Button variant="outline" onClick={() => setSelectedThread(null)}>
              닫기
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Signature Settings Dialog */}
      <Dialog open={!!signatureAccountId} onOpenChange={(open) => !open && setSignatureAccountId(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>이메일 서명 설정</DialogTitle>
            <DialogDescription>
              이메일 발송 시 자동으로 추가될 서명을 설정합니다. 이미지를 포함한 리치 텍스트 형식을 지원합니다.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="use-signature">서명 사용</Label>
                <p className="text-xs text-muted-foreground">이메일 발송 시 서명을 자동으로 추가합니다</p>
              </div>
              <Switch
                id="use-signature"
                checked={useSignature}
                onCheckedChange={setUseSignature}
                data-testid="switch-use-signature"
              />
            </div>
            
            <div className="space-y-2">
              <Label>서명 내용</Label>
              <div className="border rounded-md overflow-hidden">
                <ReactQuill
                  theme="snow"
                  value={signatureContent}
                  onChange={setSignatureContent}
                  modules={{
                    table: true,
                    toolbar: [
                      [{ 'header': [1, 2, 3, false] }],
                      ['bold', 'italic', 'underline', 'strike'],
                      [{ 'color': [] }, { 'background': [] }],
                      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                      ['link', 'image'],
                      ['clean']
                    ],
                    history: {
                      delay: 500,
                      maxStack: 100,
                      userOnly: true
                    }
                  }}
                  className="bg-background min-h-[200px]"
                  placeholder="서명을 입력하세요..."
                />
              </div>
              <TableStyleToolbar content={signatureContent} onChange={setSignatureContent} />
              <p className="text-xs text-muted-foreground">
                이미지는 URL 링크로 삽입하거나 직접 붙여넣기 할 수 있습니다.
              </p>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSignatureAccountId(null)}>
              취소
            </Button>
            <Button onClick={handleSaveSignature} disabled={updateSignature.isPending} data-testid="button-save-signature">
              {updateSignature.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              저장
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
