import { useState } from "react";
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
import { Plus, Pencil, Trash2, Building2, Users, Shield, FileText, Star, Settings, RotateCcw, Mail, X } from "lucide-react";
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
  const [logoUploading, setLogoUploading] = useState(false);

  const [workspaceName, setWorkspaceName] = useState("");

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

  const currentWorkspace = workspaces?.find(w => w.id === workspaceId);

  const resetClientForm = () => {
    setClientName("");
    setClientMemo("");
    setClientStatus("active");
    setClientLogoUrl(null);
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
    setClientDialogOpen(true);
  };

  const handleEditUserRole = (user: WorkspaceUser) => {
    setEditingUser(user);
    setUserRole(user.role);
    setSelectedClientIds(user.assignedClients?.map(c => c.id) || []);
    setUserDialogOpen(true);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setClientLogoUrl(data.url);
    } catch {
      toast({ title: "이미지 업로드 실패", variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  };

  const handleClientSubmit = () => {
    if (!clientName.trim()) return;

    if (editingClient) {
      updateClientMutation.mutate({
        id: editingClient.id,
        data: { name: clientName, memo: clientMemo, status: clientStatus, logoUrl: clientLogoUrl },
      });
    } else {
      createClientMutation.mutate({
        workspaceId,
        name: clientName,
        memo: clientMemo,
        status: clientStatus,
        logoUrl: clientLogoUrl,
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
        <TabsList className={`grid w-full ${isOwner ? 'grid-cols-4' : (canManageMembers ? 'grid-cols-3' : 'grid-cols-2')} md:w-auto md:inline-flex`}>
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
                        <Label>로고</Label>
                        <div className="flex items-center gap-3 mt-1">
                          {clientLogoUrl ? (
                            <div className="relative">
                              <img src={clientLogoUrl} alt="logo" className="w-14 h-14 rounded-xl object-cover border" />
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
                          ) : (
                            <label className="w-14 h-14 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={logoUploading} />
                              {logoUploading ? <span className="text-xs text-muted-foreground">...</span> : <Plus className="w-5 h-5 text-muted-foreground" />}
                            </label>
                          )}
                          <span className="text-xs text-muted-foreground">정방형 이미지 권장 (5MB 이하)</span>
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
                <Label>로고</Label>
                <div className="flex items-center gap-3 mt-1">
                  {clientLogoUrl ? (
                    <div className="relative">
                      <img src={clientLogoUrl} alt="logo" className="w-14 h-14 rounded-xl object-cover border" />
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
                  ) : (
                    <label className="w-14 h-14 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={logoUploading} />
                      {logoUploading ? <span className="text-xs text-muted-foreground">...</span> : <Plus className="w-5 h-5 text-muted-foreground" />}
                    </label>
                  )}
                  <span className="text-xs text-muted-foreground">정방형 이미지 권장 (5MB 이하)</span>
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
