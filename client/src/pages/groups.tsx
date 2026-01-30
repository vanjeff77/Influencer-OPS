import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useGroups, useCreateGroup } from "@/hooks/use-groups";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { KO } from "@/i18n/ko";

export default function Groups() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  const { data: groups, isLoading } = useGroups(workspaceId || 0);
  const createGroup = useCreateGroup(workspaceId || 0);
  const { toast } = useToast();

  const [newGroupName, setNewGroupName] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleCreate = () => {
    if (!newGroupName) return;
    createGroup.mutate({ name: newGroupName, description: "커스텀 그룹" }, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setNewGroupName("");
        toast({ title: KO.pages.groups.groupCreated });
      }
    });
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{KO.pages.groups.title}</h1>
            <p className="text-muted-foreground mt-1">{KO.pages.groups.subtitle}</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-group">
                <Plus className="w-4 h-4 mr-2" />
                {KO.pages.groups.createGroup}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{KO.pages.groups.newGroup}</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <label className="text-sm font-medium mb-2 block">{KO.pages.groups.groupName}</label>
                <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="예: 뷰티 블로거 2024" />
              </div>
              <Button onClick={handleCreate} disabled={createGroup.isPending} data-testid="button-submit-group">
                {createGroup.isPending ? KO.nav.creating : KO.common.create}
              </Button>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups?.map(group => (
            <Card key={group.id} className="hover:shadow-md transition-shadow cursor-pointer" data-testid={`card-group-${group.id}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-lg font-medium">{group.name}</CardTitle>
                <Users className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{group.description}</p>
                <div className="mt-4 text-xs text-muted-foreground">
                  {KO.common.recentlyCreated}
                </div>
              </CardContent>
            </Card>
          ))}
          {!groups?.length && !isLoading && (
            <div className="col-span-full text-center py-20 text-muted-foreground border border-dashed rounded-xl">
              {KO.pages.groups.noGroups}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
