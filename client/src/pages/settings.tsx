import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useUser } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { KO } from "@/i18n/ko";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Building2, Users, Shield, FileText, Star, Settings, RotateCcw, Mail, X, Sparkles, ImageDown, Loader2, CheckCircle, AlertCircle, Bell } from "lucide-react";
import { SiSlack } from "react-icons/si";
import { useResetOnboarding } from "@/hooks/use-auth";


import { TiptapEditor } from '@/components/tiptap-editor';


interface Client {
  id: number;
  workspaceId: number;
  name: string;
  logoUrl?: string | null;
  memo?: string | null;
  status?: string | null;
  createdAt?: string | null;
}

interface WorkspaceUser {
  id: number;
  email: string;
  name: string;
  isActive?: boolean;
  role: string;
  assignedClients?: Client[];
}

interface MyRoleInfo {
  userId: number;
  role: string;
  assignedClientIds: number[];
}

export default function SettingsPage() {
  const { data: workspacesData } = useWorkspaces();
  const workspaces = workspacesData as { id: number; name: string }[] | undefined;
  const workspaceId = workspaces?.[0]?.id || 1;
  const { toast } = useToast();

  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingUser, setEditingUser] = useState<WorkspaceUser | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<WorkspaceUser | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientMemo, setClientMemo] = useState("");
  const [clientStatus, setClientStatus] = useState("active");
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  const [clientSlackChannelId, setClientSlackChannelId] = useState("");

  const [workspaceName, setWorkspaceName] = useState("");
  const [aiDraftEnabled, setAiDraftEnabled] = useState(false);
  const [aiProvider, setAiProvider] = useState("replit");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackBotToken, setSlackBotToken] = useState("");
  const [slackChannelId, setSlackChannelId] = useState("");

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState("WORKSPACE_MEMBER");
  const [selectedClientIds, setSelectedClientIds] = useState<number[]>([]);

  const { data: currentUser } = useUser();
  const resetOnboarding = useResetOnboarding();

  const { data: myRoleData } = useQuery<MyRoleInfo>({
    queryKey: [`/api/workspace-users/me?workspaceId=${workspaceId}`],
    enabled: !!workspaceId,
  });

  const isOwner = myRoleData?.role === 'WORKSPACE_OWNER';
  const isPlatformAdmin = currentUser?.isPlatformAdmin === true;
  const canManageMembers = isOwner || isPlatformAdmin;
  const isMemberOrOwner = myRoleData?.role === 'WORKSPACE_OWNER' || myRoleData?.role === 'WORKSPACE_MEMBER';

  const { data: clients = [], isLoading: loadingClients } = useQuery<Client[]>({
    queryKey: [`/api/clients?workspaceId=${workspaceId}`],
    enabled: !!workspaceId,
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery<WorkspaceUser[]>({
    queryKey: [`/api/workspace-users?workspaceId=${workspaceId}`],
    enabled: !!workspaceId,
  });

  const createClientMutation = useMutation({
    mutationFn: (data: { workspaceId: number; name: string; memo?: string; status?: string; logoUrl?: string | null }) =>
      apiRequest('POST', '/api/clients', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients?workspaceId=${workspaceId}`] });
      toast({ title: KO.settings.clientCreated });
      resetClientForm();
      setClientDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: KO.toast.saveFailed, description: err.message, variant: "destructive" });
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Client> }) =>
      apiRequest('PATCH', `/api/clients/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients?workspaceId=${workspaceId}`] });
      toast({ title: KO.settings.clientUpdated });
      resetClientForm();
      setClientDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: KO.toast.saveFailed, description: err.message, variant: "destructive" });
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest('DELETE', `/api/clients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients?workspaceId=${workspaceId}`] });
      toast({ title: KO.settings.clientDeleted });
    },
    onError: (err: any) => {
      toast({ title: KO.toast.saveFailed, description: err.message, variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: (data: { workspaceId: number; email: string; password: string; name: string; role: string; clientIds?: number[] }) =>
      apiRequest('POST', '/api/workspace-users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspace-users?workspaceId=${workspaceId}`] });
      toast({ title: KO.settings.userCreated });
      resetUserForm();
      setUserDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: KO.toast.saveFailed, description: err.message, variant: "destructive" });
    },
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: number; data: { workspaceId: number; role: string; clientIds?: number[] } }) =>
      apiRequest('PATCH', `/api/workspace-users/${userId}/role`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspace-users?workspaceId=${workspaceId}`] });
      toast({ title: KO.settings.userUpdated });
      resetUserForm();
      setUserDialogOpen(false);
      setEditingUser(null);
    },
    onError: (err: any) => {
      toast({ title: KO.toast.saveFailed, description: err.message, variant: "destructive" });
    },
  });

  const toggleUserStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: number; isActive: boolean }) =>
      apiRequest('PATCH', `/api/workspace-users/${userId}/status`, { workspaceId, isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspace-users?workspaceId=${workspaceId}`] });
      toast({ title: KO.settings.userUpdated });
    },
    onError: (err: any) => {
      toast({ title: KO.toast.saveFailed, description: err.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: ({ userId }: { userId: number }) =>
      apiRequest('DELETE', `/api/workspace-users/${userId}`, { workspaceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspace-users?workspaceId=${workspaceId}`] });
      toast({ title: "사용자가 삭제되었습니다" });
      setDeleteUserTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  const updateWorkspaceNameMutation = useMutation({
    mutationFn: (data: { name: string }) =>
      apiRequest('PATCH', `/api/workspaces/${workspaceId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
      toast({ title: KO.settings.workspaceNameUpdated });
    },
    onError: (err: any) => {
      toast({ title: KO.toast.saveFailed, description: err.message, variant: "destructive" });
    },
  });

  const currentWorkspace = workspaces?.find(w => w.id === workspaceId) as any;

  const { data: fullWorkspace } = useQuery<any>({
    queryKey: ['/api/workspaces'],
    enabled: !!workspaceId,
    select: (data: any[]) => data?.find((w: any) => w.id === workspaceId),
  });

  useEffect(() => {
    if (fullWorkspace) {
      setAiDraftEnabled(fullWorkspace.aiDraftEnabled || false);
      setAiProvider(fullWorkspace.aiProvider || "replit");
      setAiModel(fullWorkspace.aiModel || "");
      setAiApiKey("");
      setSlackEnabled(fullWorkspace.slackEnabled || false);
      setSlackChannelId(fullWorkspace.slackChannelId || "");
      setSlackBotToken("");
    }
  }, [fullWorkspace?.id, fullWorkspace?.aiDraftEnabled, fullWorkspace?.aiProvider, fullWorkspace?.aiModel, fullWorkspace?.slackEnabled, fullWorkspace?.slackChannelId]);

  const { data: frameworkData, isLoading: isLoadingFramework } = useQuery<{ content: string; isCustom: boolean }>({
    queryKey: ['/api/workspaces', workspaceId, 'ai-framework'],
    queryFn: () => apiRequest('GET', `/api/workspaces/${workspaceId}/ai-framework`).then(r => r.json()),
    enabled: !!workspaceId && aiDraftEnabled,
  });

  const { data: recentInbound = [], isLoading: loadingInbound, refetch: refetchInbound } = useQuery<any[]>({
    queryKey: ['/api/workspaces', workspaceId, 'recent-inbound-messages'],
    queryFn: () => apiRequest('GET', `/api/workspaces/${workspaceId}/recent-inbound-messages`).then(r => r.json()),
    enabled: !!workspaceId && isOwner,
  });

  const resendNotificationMutation = useMutation({
    mutationFn: (data: { conversationId: number; messageId: number }) =>
      apiRequest('POST', `/api/workspaces/${workspaceId}/resend-slack-notification`, data),
    onSuccess: () => {
      toast({ title: "Slack 알림이 재발송되었습니다" });
    },
    onError: (err: any) => {
      toast({ title: "재발송 실패", description: err.message, variant: "destructive" });
    },
  });

  const [frameworkContent, setFrameworkContent] = useState("");
  const [frameworkEdited, setFrameworkEdited] = useState(false);

  useEffect(() => {
    if (frameworkData) {
      setFrameworkContent(frameworkData.content);
      setFrameworkEdited(false);
    }
  }, [frameworkData]);

  const saveFrameworkMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest('PUT', `/api/workspaces/${workspaceId}/ai-framework`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces', workspaceId, 'ai-framework'] });
      setFrameworkEdited(false);
      toast({ title: "프레임워크 문서가 저장되었습니다" });
    },
    onError: (err: any) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const resetFrameworkMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/workspaces/${workspaceId}/ai-framework/reset`).then(r => r.json()),
    onSuccess: (data: { content: string }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces', workspaceId, 'ai-framework'] });
      setFrameworkContent(data.content);
      setFrameworkEdited(false);
      toast({ title: "기본 프레임워크 문서로 초기화되었습니다" });
    },
    onError: (err: any) => {
      toast({ title: "초기화 실패", description: err.message, variant: "destructive" });
    },
  });

  const saveAiSettingsMutation = useMutation({
    mutationFn: (data: { aiDraftEnabled?: boolean; aiProvider?: string; aiApiKey?: string; aiModel?: string }) =>
      apiRequest('PATCH', `/api/workspaces/${workspaceId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
      setAiApiKey("");
      toast({ title: "AI 설정이 저장되었습니다" });
    },
    onError: (err: any) => {
      toast({ title: "AI 설정 저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const saveSlackSettingsMutation = useMutation({
    mutationFn: (data: { slackEnabled?: boolean; slackBotToken?: string; slackChannelId?: string }) =>
      apiRequest('PATCH', `/api/workspaces/${workspaceId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
      setSlackBotToken("");
      toast({ title: "Slack 설정이 저장되었습니다" });
    },
    onError: (err: any) => {
      toast({ title: "Slack 설정 저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const [profileRefreshResult, setProfileRefreshResult] = useState<{
    total: number;
    needsFetch: number;
    updated: number;
  } | null>(null);

  const refreshProfileImagesMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/workspaces/${workspaceId}/influencers/refresh-all-profile-images`).then(r => r.json()),
    onSuccess: (data: any) => {
      setProfileRefreshResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({ title: `프로필 이미지 ${data.updated}개 수집 완료` });
    },
    onError: (err: any) => {
      toast({ title: "프로필 수집 실패", description: err.message, variant: "destructive" });
    },
  });

  const [campaignRefreshResult, setCampaignRefreshResult] = useState<{
    total: number;
    needsFetch: number;
    updated: number;
  } | null>(null);

  const refreshCampaignProfileImagesMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/workspaces/${workspaceId}/campaign-influencers/refresh-profile-images`).then(r => r.json()),
    onSuccess: (data: any) => {
      setCampaignRefreshResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({ title: `프로필 이미지 ${data.updated}개 수집 완료` });
    },
    onError: (err: any) => {
      toast({ title: "프로필 수집 실패", description: err.message, variant: "destructive" });
    },
  });

  const resetClientForm = () => {
    setClientName("");
    setClientMemo("");
    setClientStatus("active");
    setClientLogoUrl(null);
    setClientSlackChannelId("");
    setEditingClient(null);
  };

  const resetUserForm = () => {
    setUserName("");
    setUserEmail("");
    setUserPassword("");
    setUserRole("WORKSPACE_MEMBER");
    setSelectedClientIds([]);
    setEditingUser(null);
  };

  const handleEditClient = (client: Client) => {
    setEditingClient(client);
    setClientName(client.name);
    setClientMemo(client.memo || "");
    setClientStatus(client.status || "active");
    setClientLogoUrl(client.logoUrl || null);
    setClientSlackChannelId((client as any).slackChannelId || "");
    setClientDialogOpen(true);
  };

  const handleEditUserRole = (user: WorkspaceUser) => {
    setEditingUser(user);
    setUserRole(user.role);
    setSelectedClientIds(user.assignedClients?.map(c => c.id) || []);
    setUserDialogOpen(true);
  };


  const handleClientSubmit = () => {
    if (!clientName.trim()) return;

    if (editingClient) {
      updateClientMutation.mutate({
        id: editingClient.id,
        data: { name: clientName, memo: clientMemo, status: clientStatus, logoUrl: clientLogoUrl, slackChannelId: clientSlackChannelId || null },
      });
    } else {
      createClientMutation.mutate({
        workspaceId,
        name: clientName,
        memo: clientMemo,
        status: clientStatus,
        logoUrl: clientLogoUrl,
        slackChannelId: clientSlackChannelId || null,
      });
    }
  };

  const handleUserSubmit = () => {
    if (editingUser) {
      updateUserRoleMutation.mutate({
        userId: editingUser.id,
        data: { workspaceId, role: userRole, clientIds: userRole === 'CLIENT' ? selectedClientIds : undefined },
      });
    } else {
      if (!userName.trim() || !userEmail.trim() || !userPassword.trim()) return;
      createUserMutation.mutate({
        workspaceId,
        email: userEmail,
        password: userPassword,
        name: userName,
        role: userRole,
        clientIds: userRole === 'CLIENT' ? selectedClientIds : undefined,
      });
    }
  };

  const getRoleBadge = (role: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      WORKSPACE_OWNER: "default",
      WORKSPACE_MEMBER: "secondary",
      CLIENT: "outline",
    };
    const labels: Record<string, string> = {
      WORKSPACE_OWNER: KO.settings.roleOwner,
      WORKSPACE_MEMBER: KO.settings.roleMember,
      CLIENT: KO.settings.roleClient,
    };
    return <Badge variant={variants[role] || "secondary"}>{labels[role] || role}</Badge>;
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-lg md:text-2xl font-bold tracking-tight" data-testid="text-settings-title">{KO.settings.title}</h1>
          <p className="text-muted-foreground text-xs md:text-sm">{KO.settings.subtitle}</p>
        </div>

      {!canManageMembers && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="py-4">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">{KO.settings.ownerOnly}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={isOwner ? "workspace" : (canManageMembers ? "users" : "clients")}>
        <TabsList className="w-full md:w-auto md:inline-flex flex-wrap">
          {isOwner && (
            <TabsTrigger value="workspace" className="gap-2" data-testid="tab-workspace">
              <Settings className="w-4 h-4" />
              {KO.settings.workspaceTab}
            </TabsTrigger>
          )}
          <TabsTrigger value="clients" className="gap-2" data-testid="tab-clients">
            <Building2 className="w-4 h-4" />
            {KO.settings.clientsTab}
          </TabsTrigger>
          {canManageMembers && (
            <TabsTrigger value="users" className="gap-2" data-testid="tab-users">
              <Users className="w-4 h-4" />
              {KO.settings.usersTab}
            </TabsTrigger>
          )}
          <TabsTrigger value="templates" className="gap-2" data-testid="tab-templates">
            <FileText className="w-4 h-4" />
            {KO.settings.templatesTab}
          </TabsTrigger>
          {isOwner && (
            <TabsTrigger value="sync-logs" className="gap-2" data-testid="tab-sync-logs">
              <RotateCcw className="w-4 h-4" />
              동기화 로그
            </TabsTrigger>
          )}
          {isOwner && (
            <TabsTrigger value="email-mode" className="gap-2" data-testid="tab-email-mode">
              <Mail className="w-4 h-4" />
              이메일 방식
            </TabsTrigger>
          )}
        </TabsList>

        {isOwner && (
          <TabsContent value="workspace" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{KO.settings.workspace}</CardTitle>
                <CardDescription>{KO.settings.workspaceNameDesc}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label>{KO.settings.workspaceName}</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={workspaceName || currentWorkspace?.name || ""}
                        onChange={(e) => setWorkspaceName(e.target.value)}
                        placeholder={currentWorkspace?.name || ""}
                        data-testid="input-workspace-name"
                      />
                      <Button 
                        onClick={() => {
                          if (workspaceName.trim()) {
                            updateWorkspaceNameMutation.mutate({ name: workspaceName.trim() });
                          }
                        }}
                        disabled={updateWorkspaceNameMutation.isPending || !workspaceName.trim() || workspaceName.trim() === currentWorkspace?.name}
                        data-testid="button-save-workspace-name"
                      >
                        {updateWorkspaceNameMutation.isPending ? KO.common.loading : KO.common.save}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">온보딩</CardTitle>
                <CardDescription>플랫폼 사용 안내 투어를 다시 볼 수 있습니다</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="outline"
                  onClick={() => {
                    resetOnboarding.mutate(undefined, {
                      onSuccess: () => {
                        toast({ title: "온보딩이 초기화되었습니다", description: "페이지를 새로고침합니다" });
                        setTimeout(() => window.location.reload(), 500);
                      }
                    });
                  }}
                  disabled={resetOnboarding.isPending}
                  className="gap-2"
                  data-testid="button-reset-onboarding"
                >
                  <RotateCcw className="h-4 w-4" />
                  온보딩 다시 보기
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ImageDown className="h-5 w-5 text-blue-500" />
                  프로필 이미지 수집
                </CardTitle>
                <CardDescription>워크스페이스의 모든 인플루언서에 대해 Instagram/YouTube 프로필 이미지를 자동으로 수집합니다</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => {
                      setProfileRefreshResult(null);
                      refreshProfileImagesMutation.mutate();
                    }}
                    disabled={refreshProfileImagesMutation.isPending}
                    className="gap-2"
                    data-testid="button-refresh-profile-images"
                  >
                    {refreshProfileImagesMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        수집 중...
                      </>
                    ) : (
                      <>
                        <ImageDown className="h-4 w-4" />
                        프로필 이미지 수집하기
                      </>
                    )}
                  </Button>
                </div>
                {refreshProfileImagesMutation.isPending && (
                  <p className="text-xs text-muted-foreground">
                    인플루언서 수에 따라 수 분이 소요될 수 있습니다. 페이지를 닫지 마세요.
                  </p>
                )}
                {profileRefreshResult && (
                  <div className="rounded-md border p-3 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      수집 완료
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>전체 계정: {profileRefreshResult.total}개</p>
                      <p>수집 대상: {profileRefreshResult.needsFetch}개</p>
                      <p>성공: {profileRefreshResult.updated}개</p>
                      {profileRefreshResult.needsFetch > profileRefreshResult.updated && (
                        <p className="flex items-center gap-1 text-yellow-600">
                          <AlertCircle className="h-3 w-3" />
                          일부 계정은 프로필 이미지를 가져올 수 없었습니다
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="border-t pt-4 space-y-3">
                  <div>
                    <Label className="text-sm font-medium">캠페인 등록 인플루언서 수집</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">캠페인에 등록된 인플루언서만 대상으로 프로필 이미지를 수집합니다</p>
                  </div>
                  <Button
                    onClick={() => {
                      setCampaignRefreshResult(null);
                      refreshCampaignProfileImagesMutation.mutate();
                    }}
                    disabled={refreshCampaignProfileImagesMutation.isPending}
                    variant="outline"
                    className="gap-2"
                    data-testid="button-refresh-campaign-profile-images"
                  >
                    {refreshCampaignProfileImagesMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        수집 중...
                      </>
                    ) : (
                      <>
                        <ImageDown className="h-4 w-4" />
                        캠페인 인플루언서 수집하기
                      </>
                    )}
                  </Button>
                  {refreshCampaignProfileImagesMutation.isPending && (
                    <p className="text-xs text-muted-foreground">
                      인플루언서 수에 따라 수 분이 소요될 수 있습니다. 페이지를 닫지 마세요.
                    </p>
                  )}
                  {campaignRefreshResult && (
                    <div className="rounded-md border p-3 space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        수집 완료
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>전체 계정: {campaignRefreshResult.total}개</p>
                        <p>수집 대상: {campaignRefreshResult.needsFetch}개</p>
                        <p>성공: {campaignRefreshResult.updated}개</p>
                        {campaignRefreshResult.needsFetch > campaignRefreshResult.updated && (
                          <p className="flex items-center gap-1 text-yellow-600">
                            <AlertCircle className="h-3 w-3" />
                            일부 계정은 프로필 이미지를 가져올 수 없었습니다
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  AI 자동 답장 초안
                </CardTitle>
                <CardDescription>수신 메일에 대한 AI 답장 초안을 자동으로 생성합니다</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">AI 초안 자동 생성</Label>
                    <p className="text-xs text-muted-foreground mt-1">활성화하면 인바운드 메일 수신 시 자동으로 답장 초안이 생성됩니다</p>
                  </div>
                  <Switch
                    checked={aiDraftEnabled}
                    onCheckedChange={setAiDraftEnabled}
                    data-testid="switch-ai-draft"
                  />
                </div>

                {aiDraftEnabled && (
                  <div className="space-y-4 pt-2 border-t">
                    <div>
                      <Label className="text-sm">LLM 제공자</Label>
                      <Select value={aiProvider} onValueChange={setAiProvider}>
                        <SelectTrigger className="mt-1" data-testid="select-ai-provider">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="replit">Replit AI (기본)</SelectItem>
                          <SelectItem value="openai">OpenAI API</SelectItem>
                          <SelectItem value="anthropic">Anthropic API</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {(aiProvider === 'openai' || aiProvider === 'anthropic') && (
                      <>
                        <div>
                          <Label className="text-sm">API Key</Label>
                          <Input
                            type="password"
                            value={aiApiKey}
                            onChange={(e) => setAiApiKey(e.target.value)}
                            placeholder={fullWorkspace?.aiApiKey ? "••••••••  (변경하려면 새 키를 입력)" : "API Key를 입력하세요"}
                            className="mt-1"
                            data-testid="input-ai-api-key"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">모델명</Label>
                          <Input
                            value={aiModel}
                            onChange={(e) => setAiModel(e.target.value)}
                            placeholder={aiProvider === 'openai' ? "gpt-4o" : "claude-sonnet-4-20250514"}
                            className="mt-1"
                            data-testid="input-ai-model"
                          />
                        </div>
                      </>
                    )}

                    <Button
                      onClick={() => {
                        const data: any = {
                          aiDraftEnabled,
                          aiProvider,
                          aiModel: aiModel || (aiProvider === 'openai' ? 'gpt-4o' : aiProvider === 'anthropic' ? 'claude-sonnet-4-20250514' : ''),
                        };
                        if (aiApiKey) data.aiApiKey = aiApiKey;
                        saveAiSettingsMutation.mutate(data);
                      }}
                      disabled={saveAiSettingsMutation.isPending}
                      data-testid="button-save-ai-settings"
                    >
                      {saveAiSettingsMutation.isPending ? "저장 중..." : "AI 설정 저장"}
                    </Button>
                  </div>
                )}

                {!aiDraftEnabled && fullWorkspace?.aiDraftEnabled && (
                  <Button
                    variant="outline"
                    onClick={() => saveAiSettingsMutation.mutate({ aiDraftEnabled: false })}
                    disabled={saveAiSettingsMutation.isPending}
                    data-testid="button-disable-ai"
                  >
                    AI 초안 비활성화 저장
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <SiSlack className="h-5 w-5 text-[#4A154B]" />
                  Slack 알림 봇
                </CardTitle>
                <CardDescription>인플루언서 메일 수신 시 Slack으로 실시간 알림을 보내고, AI 초안을 통해 바로 답장할 수 있습니다</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Slack 알림 활성화</Label>
                    <p className="text-xs text-muted-foreground mt-1">인바운드 메일 수신 시 Slack 채널에 알림이 전송됩니다</p>
                  </div>
                  <Switch
                    checked={slackEnabled}
                    onCheckedChange={setSlackEnabled}
                    data-testid="switch-slack-enabled"
                  />
                </div>

                {slackEnabled && (
                  <div className="space-y-4 pt-2 border-t">
                    <div>
                      <Label className="text-sm">Bot Token (xoxb-...)</Label>
                      <Input
                        type="password"
                        value={slackBotToken}
                        onChange={(e) => setSlackBotToken(e.target.value)}
                        placeholder={fullWorkspace?.slackBotToken ? "••••••••  (변경하려면 새 토큰 입력)" : "xoxb-로 시작하는 Bot Token"}
                        className="mt-1"
                        data-testid="input-slack-bot-token"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Slack App &gt; OAuth &amp; Permissions에서 Bot User OAuth Token을 복사하세요</p>
                    </div>
                    <div>
                      <Label className="text-sm">채널 ID</Label>
                      <Input
                        value={slackChannelId}
                        onChange={(e) => setSlackChannelId(e.target.value)}
                        placeholder="C01234ABCDE"
                        className="mt-1"
                        data-testid="input-slack-channel-id"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">알림을 보낼 채널의 ID (채널 우클릭 &gt; 채널 세부정보 보기에서 확인)</p>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
                      <p className="font-medium text-sm">Slack App 설정 안내</p>
                      <p>1. <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">api.slack.com/apps</a>에서 새 앱을 만드세요</p>
                      <p>2. OAuth Scopes에 <code className="bg-muted px-1 rounded">chat:write</code>, <code className="bg-muted px-1 rounded">chat:write.public</code> 권한 추가</p>
                      <p>3. Interactivity를 켜고 Request URL을 설정하세요:</p>
                      <code className="block bg-muted px-2 py-1 rounded text-[10px] break-all">{window.location.origin}/api/slack/interactions</code>
                      <p>4. 워크스페이스에 앱을 설치하고 Bot Token을 복사하세요</p>
                    </div>

                    <Button
                      onClick={() => {
                        const data: any = { slackEnabled };
                        if (slackBotToken) data.slackBotToken = slackBotToken;
                        data.slackChannelId = slackChannelId;
                        saveSlackSettingsMutation.mutate(data);
                      }}
                      disabled={saveSlackSettingsMutation.isPending}
                      data-testid="button-save-slack-settings"
                    >
                      {saveSlackSettingsMutation.isPending ? "저장 중..." : "Slack 설정 저장"}
                    </Button>
                  </div>
                )}

                {!slackEnabled && fullWorkspace?.slackEnabled && (
                  <Button
                    variant="outline"
                    onClick={() => saveSlackSettingsMutation.mutate({ slackEnabled: false })}
                    disabled={saveSlackSettingsMutation.isPending}
                    data-testid="button-disable-slack"
                  >
                    Slack 알림 비활성화 저장
                  </Button>
                )}
              </CardContent>
            </Card>

            {isOwner && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Mail className="h-5 w-5 text-blue-500" />
                    최근 수신 메일
                  </CardTitle>
                  <CardDescription>
                    최근 수신된 인바운드 메일 목록입니다.{(fullWorkspace?.slackEnabled || slackEnabled) ? ' 특정 메일의 Slack 알림을 재발송할 수 있습니다.' : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-end mb-2">
                    <Button variant="outline" size="sm" onClick={() => refetchInbound()} disabled={loadingInbound} data-testid="button-refresh-inbound">
                      <RotateCcw className="h-4 w-4 mr-1" />
                      새로고침
                    </Button>
                  </div>
                  {loadingInbound ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      로딩 중...
                    </div>
                  ) : recentInbound.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">최근 수신 메일이 없습니다.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="table-recent-inbound">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-2 px-2 font-medium">수신시각</th>
                            <th className="text-left py-2 px-2 font-medium">캠페인</th>
                            <th className="text-left py-2 px-2 font-medium">클라이언트</th>
                            <th className="text-left py-2 px-2 font-medium">인플루언서</th>
                            <th className="text-left py-2 px-2 font-medium">내용</th>
                            <th className="text-left py-2 px-2 font-medium">AI초안</th>
                            {(fullWorkspace?.slackEnabled || slackEnabled) && <th className="text-left py-2 px-2 font-medium"></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {recentInbound.slice(0, 30).map((msg: any) => (
                            <tr key={msg.messageId} className="border-b hover:bg-muted/50" data-testid={`row-inbound-${msg.messageId}`}>
                              <td className="py-2 px-2 whitespace-nowrap text-xs text-muted-foreground">
                                {msg.receivedAt ? new Date(msg.receivedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : msg.createdAt ? new Date(msg.createdAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                              </td>
                              <td className="py-2 px-2 max-w-[120px] truncate">{msg.campaignName || '-'}</td>
                              <td className="py-2 px-2 max-w-[80px] truncate">{msg.clientName || '-'}</td>
                              <td className="py-2 px-2 max-w-[100px] truncate">{msg.influencerName || msg.senderEmail || '-'}</td>
                              <td className="py-2 px-2 max-w-[200px] truncate text-muted-foreground">{msg.snippet?.substring(0, 50) || '-'}</td>
                              <td className="py-2 px-2">
                                {msg.hasDraft ? (
                                  <Badge variant="outline" className="text-green-600 border-green-300 text-xs">유</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground text-xs">무</Badge>
                                )}
                              </td>
                              {(fullWorkspace?.slackEnabled || slackEnabled) && (
                                <td className="py-2 px-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => resendNotificationMutation.mutate({ conversationId: msg.conversationId, messageId: msg.messageId })}
                                    disabled={resendNotificationMutation.isPending}
                                    data-testid={`button-resend-${msg.messageId}`}
                                  >
                                    <Bell className="h-3 w-3 mr-1" />
                                    재발송
                                  </Button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {aiDraftEnabled && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-purple-500" />
                    이메일 대응 프레임워크
                  </CardTitle>
                  <CardDescription>
                    AI 초안 생성 시 참조하는 이메일 대응 프레임워크 문서입니다. 마크다운 형식으로 작성합니다.
                    {frameworkData?.isCustom && (
                      <Badge variant="outline" className="ml-2 text-purple-600 border-purple-300">커스텀</Badge>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoadingFramework ? (
                    <div className="h-[300px] bg-muted animate-pulse rounded-md" />
                  ) : (
                    <>
                      <Textarea
                        value={frameworkContent}
                        onChange={(e) => {
                          setFrameworkContent(e.target.value);
                          setFrameworkEdited(true);
                        }}
                        className="font-mono text-xs min-h-[300px] leading-relaxed"
                        placeholder="이메일 대응 프레임워크 문서를 작성하세요..."
                        data-testid="textarea-ai-framework"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => saveFrameworkMutation.mutate(frameworkContent)}
                          disabled={saveFrameworkMutation.isPending || !frameworkEdited}
                          data-testid="button-save-framework"
                        >
                          {saveFrameworkMutation.isPending ? "저장 중..." : "프레임워크 저장"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (confirm("기본 프레임워크 문서로 초기화하시겠습니까? 현재 내용이 삭제됩니다.")) {
                              resetFrameworkMutation.mutate();
                            }
                          }}
                          disabled={resetFrameworkMutation.isPending || !frameworkData?.isCustom}
                          data-testid="button-reset-framework"
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          {resetFrameworkMutation.isPending ? "초기화 중..." : "기본값으로 초기화"}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="clients" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{KO.settings.clients}</CardTitle>
                <CardDescription>캠페인을 클라이언트별로 분류합니다.</CardDescription>
              </div>
              {isMemberOrOwner && (
                <Dialog open={clientDialogOpen && !editingClient} onOpenChange={(open) => {
                  setClientDialogOpen(open);
                  if (!open) resetClientForm();
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1" data-testid="button-add-client">
                      <Plus className="w-4 h-4" />
                      {KO.settings.addClient}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{KO.settings.addClient}</DialogTitle>
                      <DialogDescription>새 클라이언트를 등록합니다.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>{KO.settings.clientName}</Label>
                        <Input
                          value={clientName}
                          onChange={(e) => setClientName(e.target.value)}
                          data-testid="input-client-name"
                        />
                      </div>
                      <div>
                        <Label>{KO.settings.clientMemo}</Label>
                        <Textarea
                          value={clientMemo}
                          onChange={(e) => setClientMemo(e.target.value)}
                          rows={3}
                          data-testid="input-client-memo"
                        />
                      </div>
                      <div>
                        <Label>로고 이미지 URL</Label>
                        <div className="flex items-center gap-3 mt-1">
                          {clientLogoUrl && (
                            <div className="relative shrink-0">
                              <img src={clientLogoUrl} alt="logo" className="w-14 h-14 rounded-xl object-cover border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground"
                                onClick={() => setClientLogoUrl(null)}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                          <Input
                            placeholder="https://example.com/logo.png"
                            value={clientLogoUrl || ""}
                            onChange={(e) => setClientLogoUrl(e.target.value || null)}
                            data-testid="input-client-logo-url"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Slack 채널 ID</Label>
                          <Input
                            placeholder="C0123456789"
                            value={clientSlackChannelId}
                            onChange={(e) => setClientSlackChannelId(e.target.value)}
                            data-testid="input-client-slack-channel"
                          />
                          <p className="text-xs text-muted-foreground">이 클라이언트의 캠페인 메일 알림을 받을 Slack 채널 ID (비어있으면 기본 채널로 전송)</p>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setClientDialogOpen(false)}>{KO.common.cancel}</Button>
                        <Button onClick={handleClientSubmit} disabled={createClientMutation.isPending} data-testid="button-submit-client">
                          {KO.common.save}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {loadingClients ? (
                <p className="text-muted-foreground text-sm">{KO.common.loading}</p>
              ) : clients.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">{KO.settings.noClients}</p>
              ) : (
                <div className="space-y-2">
                  {clients.map((client) => (
                    <div
                      key={client.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover-elevate"
                      data-testid={`row-client-${client.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {client.logoUrl ? (
                          <img src={client.logoUrl} alt={client.name} className="w-10 h-10 rounded-xl object-cover border" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                            {client.name.substring(0, 1)}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm">{client.name}</p>
                          {client.memo && <p className="text-xs text-muted-foreground">{client.memo}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                          {client.status === 'active' ? KO.settings.active : KO.settings.inactive}
                        </Badge>
                        {isMemberOrOwner && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEditClient(client)}
                              data-testid={`button-edit-client-${client.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(KO.settings.confirmDelete)) {
                                  deleteClientMutation.mutate(client.id);
                                }
                              }}
                              data-testid={`button-delete-client-${client.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canManageMembers && (
          <TabsContent value="users" className="mt-6">
            <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{KO.settings.users}</CardTitle>
                <CardDescription>워크스페이스 멤버와 권한을 관리합니다.</CardDescription>
              </div>
              {canManageMembers && (
                <Dialog open={userDialogOpen && !editingUser} onOpenChange={(open) => {
                  setUserDialogOpen(open);
                  if (!open) resetUserForm();
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1" data-testid="button-add-user">
                      <Plus className="w-4 h-4" />
                      {KO.settings.addUser}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{KO.settings.addUser}</DialogTitle>
                      <DialogDescription>새 사용자를 워크스페이스에 추가합니다.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>{KO.settings.name}</Label>
                        <Input
                          value={userName}
                          onChange={(e) => setUserName(e.target.value)}
                          data-testid="input-user-name"
                        />
                      </div>
                      <div>
                        <Label>{KO.settings.email}</Label>
                        <Input
                          type="email"
                          value={userEmail}
                          onChange={(e) => setUserEmail(e.target.value)}
                          data-testid="input-user-email"
                        />
                      </div>
                      <div>
                        <Label>{KO.settings.password}</Label>
                        <Input
                          type="password"
                          value={userPassword}
                          onChange={(e) => setUserPassword(e.target.value)}
                          data-testid="input-user-password"
                        />
                      </div>
                      <div>
                        <Label>{KO.settings.role}</Label>
                        <Select value={userRole} onValueChange={setUserRole}>
                          <SelectTrigger data-testid="select-user-role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="WORKSPACE_OWNER">{KO.settings.roleOwner}</SelectItem>
                            <SelectItem value="WORKSPACE_MEMBER">{KO.settings.roleMember}</SelectItem>
                            <SelectItem value="CLIENT">{KO.settings.roleClient}</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          {KO.settings.roleDesc[userRole as keyof typeof KO.settings.roleDesc]}
                        </p>
                      </div>
                      {userRole === 'CLIENT' && (
                        <div>
                          <Label>{KO.settings.assignedClients}</Label>
                          <div className="mt-2 space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                            {clients.map((client) => (
                              <div key={client.id} className="flex items-center gap-2">
                                <Checkbox
                                  id={`client-${client.id}`}
                                  checked={selectedClientIds.includes(client.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedClientIds([...selectedClientIds, client.id]);
                                    } else {
                                      setSelectedClientIds(selectedClientIds.filter(id => id !== client.id));
                                    }
                                  }}
                                />
                                <label htmlFor={`client-${client.id}`} className="text-sm">{client.name}</label>
                              </div>
                            ))}
                            {clients.length === 0 && (
                              <p className="text-xs text-muted-foreground">{KO.settings.noClients}</p>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setUserDialogOpen(false)}>{KO.common.cancel}</Button>
                        <Button onClick={handleUserSubmit} disabled={createUserMutation.isPending} data-testid="button-submit-user">
                          {KO.common.save}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {loadingUsers ? (
                <p className="text-muted-foreground text-sm">{KO.common.loading}</p>
              ) : users.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">{KO.settings.noUsers}</p>
              ) : (
                <div className="space-y-2">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover-elevate"
                      data-testid={`row-user-${user.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {user.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{user.name}</p>
                            {getRoleBadge(user.role)}
                            {user.isActive === false && (
                              <Badge variant="outline" className="text-destructive">{KO.settings.inactive}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                          {user.role === 'CLIENT' && user.assignedClients && user.assignedClients.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {KO.settings.assignedClients}: {user.assignedClients.map(c => c.name).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      {canManageMembers && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEditUserRole(user)}
                            data-testid={`button-edit-user-${user.id}`}
                          >
                            <Shield className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant={user.isActive === false ? "default" : "outline"}
                            onClick={() => toggleUserStatusMutation.mutate({ userId: user.id, isActive: user.isActive === false })}
                            data-testid={`button-toggle-user-${user.id}`}
                          >
                            {user.isActive === false ? KO.settings.activate : KO.settings.deactivate}
                          </Button>
                          {isOwner && user.id !== currentUser?.id && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteUserTarget(user)}
                              data-testid={`button-delete-user-${user.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </TabsContent>
        )}

        <TabsContent value="templates" className="mt-6 space-y-6">
          <EmailTemplatesSection workspaceId={workspaceId} />
          <ContractTemplatesSection workspaceId={workspaceId} />
        </TabsContent>

        {isOwner && (
          <TabsContent value="sync-logs" className="mt-6">
            <SyncLogsSection workspaceId={workspaceId} />
          </TabsContent>
        )}
        {isOwner && (
          <TabsContent value="email-mode" className="mt-6">
            <EmailModeSection workspaceId={workspaceId} />
          </TabsContent>
        )}
      </Tabs>

      {editingClient && (
        <Dialog open={!!editingClient} onOpenChange={(open) => !open && resetClientForm()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{KO.common.edit}</DialogTitle>
              <DialogDescription>클라이언트 정보를 수정합니다.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>{KO.settings.clientName}</Label>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>
              <div>
                <Label>{KO.settings.clientMemo}</Label>
                <Textarea
                  value={clientMemo}
                  onChange={(e) => setClientMemo(e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <Label>{KO.settings.clientStatus}</Label>
                <Select value={clientStatus} onValueChange={setClientStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{KO.settings.active}</SelectItem>
                    <SelectItem value="inactive">{KO.settings.inactive}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>로고 이미지 URL</Label>
                <div className="flex items-center gap-3 mt-1">
                  {clientLogoUrl && (
                    <div className="relative shrink-0">
                      <img src={clientLogoUrl} alt="logo" className="w-14 h-14 rounded-xl object-cover border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground"
                        onClick={() => setClientLogoUrl(null)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                  <Input
                    placeholder="https://example.com/logo.png"
                    value={clientLogoUrl || ""}
                    onChange={(e) => setClientLogoUrl(e.target.value || null)}
                    data-testid="input-edit-client-logo-url"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Slack 채널 ID</Label>
                  <Input
                    placeholder="C0123456789"
                    value={clientSlackChannelId}
                    onChange={(e) => setClientSlackChannelId(e.target.value)}
                    data-testid="input-edit-client-slack-channel"
                  />
                  <p className="text-xs text-muted-foreground">이 클라이언트의 캠페인 메일 알림을 받을 Slack 채널 ID (비어있으면 기본 채널로 전송)</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetClientForm}>{KO.common.cancel}</Button>
                <Button onClick={handleClientSubmit} disabled={updateClientMutation.isPending}>
                  {KO.common.save}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {editingUser && (
        <Dialog open={!!editingUser} onOpenChange={(open) => {
          if (!open) {
            setEditingUser(null);
            resetUserForm();
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{KO.settings.role} 변경</DialogTitle>
              <DialogDescription>{editingUser.name}님의 역할을 변경합니다.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>{KO.settings.role}</Label>
                <Select value={userRole} onValueChange={setUserRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WORKSPACE_OWNER">{KO.settings.roleOwner}</SelectItem>
                    <SelectItem value="WORKSPACE_MEMBER">{KO.settings.roleMember}</SelectItem>
                    <SelectItem value="CLIENT">{KO.settings.roleClient}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {KO.settings.roleDesc[userRole as keyof typeof KO.settings.roleDesc]}
                </p>
              </div>
              {userRole === 'CLIENT' && (
                <div>
                  <Label>{KO.settings.assignedClients}</Label>
                  <div className="mt-2 space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                    {clients.map((client) => (
                      <div key={client.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`edit-client-${client.id}`}
                          checked={selectedClientIds.includes(client.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedClientIds([...selectedClientIds, client.id]);
                            } else {
                              setSelectedClientIds(selectedClientIds.filter(id => id !== client.id));
                            }
                          }}
                        />
                        <label htmlFor={`edit-client-${client.id}`} className="text-sm">{client.name}</label>
                      </div>
                    ))}
                    {clients.length === 0 && (
                      <p className="text-xs text-muted-foreground">{KO.settings.noClients}</p>
                    )}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setEditingUser(null); resetUserForm(); }}>{KO.common.cancel}</Button>
                <Button onClick={handleUserSubmit} disabled={updateUserRoleMutation.isPending}>
                  {KO.common.save}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {deleteUserTarget && (
        <Dialog open={!!deleteUserTarget} onOpenChange={(open) => !open && setDeleteUserTarget(null)}>
          <DialogContent className="max-w-[90vw] md:max-w-sm">
            <DialogHeader>
              <DialogTitle>사용자 삭제</DialogTitle>
              <DialogDescription>
                "{deleteUserTarget.name}" 사용자를 이 워크스페이스에서 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setDeleteUserTarget(null)} data-testid="button-cancel-delete-user">
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteUserMutation.mutate({ userId: deleteUserTarget.id })}
                disabled={deleteUserMutation.isPending}
                data-testid="button-confirm-delete-user"
              >
                {deleteUserMutation.isPending ? "삭제 중..." : "삭제"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      </div>
    </Layout>
  );
}

// Contract Templates Section Component
interface EmailTemplate {
  id: number;
  workspaceId: number;
  name: string;
  description: string | null;
  type: string;
  subject: string;
  bodyHtml: string;
  variables: string[] | null;
  isDefault: boolean | null;
  createdAt?: string | null;
}

const EMAIL_TEMPLATE_TYPES = [
  { value: 'first_contact', label: KO.emailTemplates.typeOptions.first_contact },
  { value: 'followup', label: KO.emailTemplates.typeOptions.followup },
  { value: 'contract_request', label: KO.emailTemplates.typeOptions.contract_request },
  { value: 'settlement_request', label: KO.emailTemplates.typeOptions.settlement_request },
  { value: 'general', label: KO.emailTemplates.typeOptions.general },
];

function EmailTemplatesSection({ workspaceId }: { workspaceId: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("general");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const { data: templates = [], isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ['/api/workspaces', workspaceId, 'email-templates'],
    queryFn: () => fetch(`/api/workspaces/${workspaceId}/email-templates`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; type: string; subject: string; bodyHtml: string; isDefault?: boolean }) =>
      apiRequest('POST', `/api/workspaces/${workspaceId}/email-templates`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces', workspaceId, 'email-templates'] });
      toast({ title: KO.emailTemplates.created });
      resetForm();
      setDialogOpen(false);
    },
    onError: () => toast({ title: KO.toast.saveFailed, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<EmailTemplate> }) =>
      apiRequest('PATCH', `/api/workspaces/${workspaceId}/email-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces', workspaceId, 'email-templates'] });
      toast({ title: KO.emailTemplates.updated });
      resetForm();
      setEditingTemplate(null);
    },
    onError: () => toast({ title: KO.toast.saveFailed, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest('DELETE', `/api/workspaces/${workspaceId}/email-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces', workspaceId, 'email-templates'] });
      toast({ title: KO.emailTemplates.deleted });
    },
    onError: () => toast({ title: KO.toast.deleteFailed, variant: "destructive" }),
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setType("general");
    setSubject("");
    setBodyHtml("");
    setIsDefault(false);
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setName(template.name);
    setDescription(template.description || "");
    setType(template.type);
    setSubject(template.subject);
    setBodyHtml(template.bodyHtml);
    setIsDefault(template.isDefault || false);
  };

  const handleSubmit = () => {
    if (!name.trim() || !subject.trim() || !bodyHtml.trim()) {
      toast({ title: "이름, 제목, 본문은 필수입니다.", variant: "destructive" });
      return;
    }
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: { name, description, type, subject, bodyHtml, isDefault } });
    } else {
      createMutation.mutate({ name, description, type, subject, bodyHtml, isDefault });
    }
  };

  const getTypeLabel = (typeValue: string) => {
    return EMAIL_TEMPLATE_TYPES.find(t => t.value === typeValue)?.label || typeValue;
  };

  const formContent = (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>{KO.emailTemplates.name}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-email-template-name" />
        </div>
        <div>
          <Label>{KO.emailTemplates.descriptionLabel}</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} data-testid="input-email-template-description" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>{KO.emailTemplates.type}</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger data-testid="select-email-template-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMAIL_TEMPLATE_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{KO.emailTemplates.subject}</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="[캠페인명] 협업 제안 드립니다" data-testid="input-email-template-subject" />
        </div>
      </div>
      <div>
        <Label>{KO.emailTemplates.body}</Label>
        <TiptapEditor
          value={bodyHtml}
          onChange={setBodyHtml}
          toolbar="email"
          data-testid="editor-email-template-body"
        />
      </div>
      <p className="text-xs text-muted-foreground">{KO.emailTemplates.variableHint}</p>
      <div className="flex items-center gap-2 pt-2">
        <Checkbox id={editingTemplate ? "edit-email-default" : "email-default"} checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} data-testid="checkbox-email-template-default" />
        <label htmlFor={editingTemplate ? "edit-email-default" : "email-default"} className="text-sm">{KO.emailTemplates.setAsDefault}</label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => { editingTemplate ? setEditingTemplate(null) : setDialogOpen(false); resetForm(); }}>{KO.common.cancel}</Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>{KO.common.save}</Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="w-5 h-5" />
            {KO.emailTemplates.title}
          </CardTitle>
          <CardDescription>{KO.emailTemplates.description}</CardDescription>
        </div>
        <Dialog open={dialogOpen && !editingTemplate} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" data-testid="button-add-email-template">
              <Plus className="w-4 h-4" />
              {KO.emailTemplates.add}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{KO.emailTemplates.add}</DialogTitle>
              <DialogDescription>{KO.emailTemplates.variableHint}</DialogDescription>
            </DialogHeader>
            {formContent}
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">로딩 중...</p>
        ) : templates.length === 0 ? (
          <p className="text-muted-foreground text-sm">{KO.emailTemplates.noTemplates}</p>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div key={template.id} className="flex items-center justify-between p-4 border rounded-md" data-testid={`email-template-item-${template.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{template.name}</span>
                    <Badge variant="outline">{getTypeLabel(template.type)}</Badge>
                    {template.isDefault && (
                      <Badge variant="secondary" className="gap-1">
                        <Star className="w-3 h-3" /> 기본
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-1">{template.subject}</p>
                  {template.description && <p className="text-xs text-muted-foreground">{template.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(template)} data-testid={`button-edit-email-template-${template.id}`}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(KO.settings.confirmDelete)) {
                        deleteMutation.mutate(template.id);
                      }
                    }}
                    data-testid={`button-delete-email-template-${template.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {editingTemplate && (
        <Dialog open={!!editingTemplate} onOpenChange={(open) => {
          if (!open) {
            setEditingTemplate(null);
            resetForm();
          }
        }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{KO.common.edit}</DialogTitle>
              <DialogDescription>{KO.emailTemplates.variableHint}</DialogDescription>
            </DialogHeader>
            {formContent}
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

interface ContractTemplate {
  id: number;
  workspaceId: number;
  name: string;
  description: string | null;
  content: string;
  variables: string[] | null;
  isDefault: boolean | null;
  createdAt?: string | null;
}

function ContractTemplatesSection({ workspaceId }: { workspaceId: number }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const { data: templates = [], isLoading } = useQuery<ContractTemplate[]>({
    queryKey: ['/api/workspaces', workspaceId, 'contract-templates'],
    queryFn: () => fetch(`/api/workspaces/${workspaceId}/contract-templates`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; content: string; isDefault?: boolean }) =>
      apiRequest('POST', `/api/workspaces/${workspaceId}/contract-templates`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces', workspaceId, 'contract-templates'] });
      toast({ title: KO.contractTemplates.created });
      resetForm();
      setDialogOpen(false);
    },
    onError: () => toast({ title: KO.toast.saveFailed, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ContractTemplate> }) =>
      apiRequest('PATCH', `/api/workspaces/${workspaceId}/contract-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces', workspaceId, 'contract-templates'] });
      toast({ title: KO.contractTemplates.updated });
      resetForm();
      setEditingTemplate(null);
    },
    onError: () => toast({ title: KO.toast.saveFailed, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest('DELETE', `/api/workspaces/${workspaceId}/contract-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces', workspaceId, 'contract-templates'] });
      toast({ title: KO.contractTemplates.deleted });
    },
    onError: () => toast({ title: KO.toast.deleteFailed, variant: "destructive" }),
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setContent("");
    setIsDefault(false);
  };

  const handleEdit = (template: ContractTemplate) => {
    setEditingTemplate(template);
    setName(template.name);
    setDescription(template.description || "");
    setContent(template.content);
    setIsDefault(template.isDefault || false);
  };

  const handleSubmit = () => {
    if (!name.trim() || !content.trim()) {
      toast({ title: "이름과 내용은 필수입니다.", variant: "destructive" });
      return;
    }
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: { name, description, content, isDefault } });
    } else {
      createMutation.mutate({ name, description, content, isDefault });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg">{KO.contractTemplates.title}</CardTitle>
          <CardDescription>{KO.contractTemplates.description}</CardDescription>
        </div>
        <Dialog open={dialogOpen && !editingTemplate} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" data-testid="button-add-template">
              <Plus className="w-4 h-4" />
              {KO.contractTemplates.add}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{KO.contractTemplates.add}</DialogTitle>
              <DialogDescription>{KO.contractTemplates.variableHint}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{KO.contractTemplates.name}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-template-name" />
                </div>
                <div>
                  <Label>{KO.contractTemplates.descriptionLabel}</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} data-testid="input-template-description" />
                </div>
              </div>
              <div>
                <Label>{KO.contractTemplates.content}</Label>
                <TiptapEditor
                  value={content}
                  onChange={setContent}
                  toolbar="full"
                  data-testid="editor-template-content"
                />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <Checkbox id="is-default" checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} data-testid="checkbox-template-default" />
                <label htmlFor="is-default" className="text-sm">{KO.contractTemplates.setAsDefault}</label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>{KO.common.cancel}</Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending}>{KO.common.save}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">로딩 중...</p>
        ) : templates.length === 0 ? (
          <p className="text-muted-foreground text-sm">{KO.contractTemplates.noTemplates}</p>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div key={template.id} className="flex items-center justify-between p-4 border rounded-md">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{template.name}</span>
                    {template.isDefault && (
                      <Badge variant="secondary" className="gap-1">
                        <Star className="w-3 h-3" /> 기본
                      </Badge>
                    )}
                  </div>
                  {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(template)} data-testid={`button-edit-template-${template.id}`}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(KO.settings.confirmDelete)) {
                        deleteMutation.mutate(template.id);
                      }
                    }}
                    data-testid={`button-delete-template-${template.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {editingTemplate && (
        <Dialog open={!!editingTemplate} onOpenChange={(open) => {
          if (!open) {
            setEditingTemplate(null);
            resetForm();
          }
        }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{KO.common.edit}</DialogTitle>
              <DialogDescription>{KO.contractTemplates.variableHint}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{KO.contractTemplates.name}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-edit-template-name" />
                </div>
                <div>
                  <Label>{KO.contractTemplates.descriptionLabel}</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} data-testid="input-edit-template-description" />
                </div>
              </div>
              <div>
                <Label>{KO.contractTemplates.content}</Label>
                <TiptapEditor
                  value={content}
                  onChange={setContent}
                  toolbar="full"
                  data-testid="editor-edit-template-content"
                />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <Checkbox id="edit-is-default" checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} data-testid="checkbox-edit-template-default" />
                <label htmlFor="edit-is-default" className="text-sm">{KO.contractTemplates.setAsDefault}</label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setEditingTemplate(null); resetForm(); }}>{KO.common.cancel}</Button>
                <Button onClick={handleSubmit} disabled={updateMutation.isPending}>{KO.common.save}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

interface SyncLogEntry {
  id: number;
  workspaceId: number;
  emailAccountId: number | null;
  accountEmail: string | null;
  provider: string;
  status: string;
  totalSynced: number | null;
  syncedMessages: SyncedMessageDetail[] | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface SyncedMessageDetail {
  conversationId: number;
  direction: string;
  senderEmail: string | null;
  recipientEmail: string | null;
  snippet: string | null;
  subject: string | null;
  receivedAt: string;
}

function EmailModeSection({ workspaceId }: { workspaceId: number }) {
  const { toast } = useToast();

  const { data: allAccounts = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/workspaces', workspaceId, 'all-email-accounts'],
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/all-email-accounts`);
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
  });

  const { data: workspaceUsers = [] } = useQuery<any[]>({
    queryKey: [`/api/workspaces/${workspaceId}/users`],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ accountId, useGmailApi }: { accountId: number; useGmailApi: boolean }) => {
      const res = await apiRequest('PATCH', `/api/email/accounts/${accountId}/gmail-mode`, { useGmailApi });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces', workspaceId, 'all-email-accounts'] });
      toast({ title: "이메일 방식이 변경되었습니다" });
    },
    onError: (err: any) => {
      toast({ title: "변경 실패", description: err.message, variant: "destructive" });
    },
  });

  const getUserName = (userId: number) => {
    const user = workspaceUsers.find((u: any) => u.id === userId);
    return user?.name || user?.email || `사용자 #${userId}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="w-5 h-5" />
          이메일 방식 관리
        </CardTitle>
        <CardDescription>
          각 이메일 계정의 발송/동기화 방식을 설정합니다. Gmail API는 Google OAuth 인증이 필요하며, IMAP/SMTP는 별도 서버 설정이 필요합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : allAccounts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            등록된 이메일 계정이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {allAccounts.map((account: any) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card"
                data-testid={`email-mode-account-${account.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{account.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {getUserName(account.userId)} · {account.provider === 'gmail' ? 'Gmail' : 'IMAP'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {account.provider === 'gmail' && !account.hasRefreshToken && account.useGmailApi && (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      재인증 필요
                    </Badge>
                  )}
                  {account.provider === 'gmail' && account.hasRefreshToken && account.useGmailApi && (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Gmail API 연결됨
                    </Badge>
                  )}
                  {account.provider === 'imap' && (
                    <Badge variant="outline" className="text-xs">
                      IMAP/SMTP
                    </Badge>
                  )}

                  {account.provider === 'gmail' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {account.useGmailApi ? 'Gmail API' : 'IMAP/SMTP'}
                      </span>
                      <Switch
                        checked={account.useGmailApi ?? true}
                        onCheckedChange={(checked) => {
                          toggleMutation.mutate({ accountId: account.id, useGmailApi: checked });
                        }}
                        disabled={toggleMutation.isPending}
                        data-testid={`toggle-gmail-mode-${account.id}`}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SyncLogsSection({ workspaceId }: { workspaceId: number }) {
  const [page, setPage] = useState(0);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const pageSize = 30;

  const { data, isLoading } = useQuery<{ logs: SyncLogEntry[]; total: number }>({
    queryKey: ['/api/workspaces', workspaceId, 'email-sync-logs', page],
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/email-sync-logs?limit=${pageSize}&offset=${page * pageSize}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"><CheckCircle className="w-3 h-3 mr-1" />새 메일</Badge>;
      case 'no_new':
        return <Badge variant="secondary"><Mail className="w-3 h-3 mr-1" />변화없음</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />오류</Badge>;
      case 'running':
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"><Loader2 className="w-3 h-3 mr-1 animate-spin" />진행중</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '방금 전';
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}시간 전`;
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start || !end) return '-';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <RotateCcw className="w-5 h-5" />
          메일 동기화 로그
        </CardTitle>
        <CardDescription>자동 이메일 동기화 실행 기록을 확인합니다. 각 행을 클릭하면 동기화된 메일 상세 내역을 볼 수 있습니다.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            동기화 로그가 아직 없습니다. 자동 동기화가 실행되면 여기에 기록됩니다.
          </div>
        ) : (
          <>
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id}>
                  <button
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors hover:bg-accent/50 ${
                      expandedLogId === log.id ? 'bg-accent border-primary/30' : 'bg-card border-border'
                    } ${log.totalSynced && log.totalSynced > 0 ? 'border-l-4 border-l-green-500' : ''}`}
                    onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                    data-testid={`sync-log-row-${log.id}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {getStatusBadge(log.status)}
                        <span className="text-sm font-medium truncate">{log.accountEmail || '-'}</span>
                        <Badge variant="outline" className="text-xs uppercase">{log.provider}</Badge>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {log.totalSynced && log.totalSynced > 0 ? (
                          <span className="text-sm font-semibold text-green-600 dark:text-green-400">+{log.totalSynced}건</span>
                        ) : null}
                        <span className="text-xs text-muted-foreground">{formatDuration(log.startedAt, log.completedAt)}</span>
                        <span className="text-xs text-muted-foreground w-20 text-right">{formatTime(log.startedAt)}</span>
                      </div>
                    </div>
                    {log.errorMessage && (
                      <div className="mt-2 text-xs text-destructive bg-destructive/10 rounded px-2 py-1 truncate">
                        {log.errorMessage}
                      </div>
                    )}
                  </button>

                  {expandedLogId === log.id && (
                    <div className="ml-4 mt-1 mb-2 border-l-2 border-primary/20 pl-4">
                      {log.syncedMessages && log.syncedMessages.length > 0 ? (
                        <div className="space-y-2 py-2">
                          <div className="text-xs font-medium text-muted-foreground mb-2">
                            동기화된 메일 {log.syncedMessages.length}건
                          </div>
                          {log.syncedMessages.map((msg, idx) => (
                            <div
                              key={idx}
                              className="bg-muted/50 rounded-lg px-3 py-2 text-sm space-y-1"
                              data-testid={`synced-message-${log.id}-${idx}`}
                            >
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={msg.direction === 'inbound' ? 'default' : 'outline'}
                                  className={`text-xs ${msg.direction === 'inbound' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : ''}`}
                                >
                                  {msg.direction === 'inbound' ? '수신' : '발신'}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  대화 #{msg.conversationId}
                                </span>
                                <span className="text-xs text-muted-foreground ml-auto">
                                  {new Date(msg.receivedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {msg.subject && (
                                <div className="text-xs font-medium truncate">
                                  {msg.subject}
                                </div>
                              )}
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <span>{msg.direction === 'inbound' ? '보낸 사람' : '받는 사람'}:</span>
                                <span className="font-mono truncate">
                                  {msg.direction === 'inbound' ? msg.senderEmail : msg.recipientEmail}
                                </span>
                              </div>
                              {msg.snippet && (
                                <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                  {msg.snippet}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-3 text-sm text-muted-foreground">
                          {log.status === 'no_new' ? '새로 동기화된 메일이 없습니다.' : 
                           log.status === 'error' ? '오류로 인해 동기화가 실패했습니다.' :
                           log.status === 'running' ? '동기화가 진행 중입니다...' :
                           '동기화된 메일 상세 정보가 없습니다.'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <span className="text-sm text-muted-foreground">
                  총 {total}건 중 {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    data-testid="sync-logs-prev"
                  >
                    이전
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= totalPages - 1}
                    data-testid="sync-logs-next"
                  >
                    다음
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
