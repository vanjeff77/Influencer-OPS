import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { KO } from "@/i18n/ko";
import { Plus, Pencil, Trash2, Building2, Users, Shield } from "lucide-react";

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

  const [clientName, setClientName] = useState("");
  const [clientMemo, setClientMemo] = useState("");
  const [clientStatus, setClientStatus] = useState("active");

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState("WORKSPACE_MEMBER");
  const [selectedClientIds, setSelectedClientIds] = useState<number[]>([]);

  const { data: myRoleData } = useQuery<MyRoleInfo>({
    queryKey: [`/api/workspace-users/me?workspaceId=${workspaceId}`],
    enabled: !!workspaceId,
  });

  const isOwner = myRoleData?.role === 'WORKSPACE_OWNER';

  const { data: clients = [], isLoading: loadingClients } = useQuery<Client[]>({
    queryKey: [`/api/clients?workspaceId=${workspaceId}`],
    enabled: !!workspaceId,
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery<WorkspaceUser[]>({
    queryKey: [`/api/workspace-users?workspaceId=${workspaceId}`],
    enabled: !!workspaceId,
  });

  const createClientMutation = useMutation({
    mutationFn: (data: { workspaceId: number; name: string; memo?: string; status?: string }) =>
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

  const resetClientForm = () => {
    setClientName("");
    setClientMemo("");
    setClientStatus("active");
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
        data: { name: clientName, memo: clientMemo, status: clientStatus },
      });
    } else {
      createClientMutation.mutate({
        workspaceId,
        name: clientName,
        memo: clientMemo,
        status: clientStatus,
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-settings-title">{KO.settings.title}</h1>
        <p className="text-muted-foreground text-sm">{KO.settings.subtitle}</p>
      </div>

      {!isOwner && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="py-4">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">{KO.settings.ownerOnly}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="clients">
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-flex">
          <TabsTrigger value="clients" className="gap-2" data-testid="tab-clients">
            <Building2 className="w-4 h-4" />
            {KO.settings.clientsTab}
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2" data-testid="tab-users">
            <Users className="w-4 h-4" />
            {KO.settings.usersTab}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{KO.settings.clients}</CardTitle>
                <CardDescription>캠페인을 클라이언트별로 분류합니다.</CardDescription>
              </div>
              {isOwner && (
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
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {client.name.substring(0, 1)}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{client.name}</p>
                          {client.memo && <p className="text-xs text-muted-foreground">{client.memo}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                          {client.status === 'active' ? KO.settings.active : KO.settings.inactive}
                        </Badge>
                        {isOwner && (
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

        <TabsContent value="users" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{KO.settings.users}</CardTitle>
                <CardDescription>워크스페이스 멤버와 권한을 관리합니다.</CardDescription>
              </div>
              {isOwner && (
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
                      {isOwner && (
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
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
        <Dialog open={!!editingUser} onOpenChange={(open) => !open && resetUserForm()}>
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
                <Button variant="outline" onClick={resetUserForm}>{KO.common.cancel}</Button>
                <Button onClick={handleUserSubmit} disabled={updateUserRoleMutation.isPending}>
                  {KO.common.save}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
