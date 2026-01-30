import { Link, useLocation } from "wouter";
import { useUser, useLogout } from "@/hooks/use-auth";
import { useWorkspaces, useCreateWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Briefcase,
  Mail,
  LineChart,
  LogOut,
  Plus,
  ChevronsUpDown,
  Search
} from "lucide-react";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading } = useUser();
  const logout = useLogout();
  const { data: workspaces } = useWorkspaces();
  const createWorkspace = useCreateWorkspace();
  const { toast } = useToast();

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  useEffect(() => {
    if (workspaces && workspaces.length > 0 && !activeWorkspaceId) {
      setActiveWorkspaceId(workspaces[0].id);
    }
  }, [workspaces, activeWorkspaceId]);

  if (isLoading || !user) return null;

  const currentWorkspace = workspaces?.find(w => w.id === activeWorkspaceId);

  const handleCreateWorkspace = () => {
    if (!newWorkspaceName.trim()) return;
    createWorkspace.mutate({ name: newWorkspaceName }, {
      onSuccess: (data) => {
        setIsCreateOpen(false);
        setNewWorkspaceName("");
        setActiveWorkspaceId(data.id);
        toast({ title: "Workspace created", description: "You are now in your new workspace." });
      }
    });
  };

  const NavItem = ({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => {
    const isActive = location === href;
    return (
      <Link href={href} className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 group ${isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
        <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col shadow-sm z-10">
        <div className="p-4 border-b border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between px-3 h-12 border-border/60 hover:border-primary/20 hover:bg-muted/50 transition-all">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0">
                    {currentWorkspace?.name.substring(0, 1) || "W"}
                  </div>
                  <span className="truncate font-medium">{currentWorkspace?.name || "Select Workspace"}</span>
                </div>
                <ChevronsUpDown className="w-4 h-4 text-muted-foreground opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuLabel>My Workspaces</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {workspaces?.map(w => (
                <DropdownMenuItem key={w.id} onClick={() => setActiveWorkspaceId(w.id)}>
                  {w.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-primary cursor-pointer">
                    <Plus className="w-4 h-4 mr-2" />
                    Create New Workspace
                  </DropdownMenuItem>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Workspace</DialogTitle>
                  </DialogHeader>
                  <div className="py-4">
                    <Input 
                      placeholder="Workspace Name" 
                      value={newWorkspaceName} 
                      onChange={(e) => setNewWorkspaceName(e.target.value)} 
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleCreateWorkspace} disabled={createWorkspace.isPending}>
                      {createWorkspace.isPending ? "Creating..." : "Create"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          <div className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Platform</div>
          <NavItem href="/" icon={LayoutDashboard} label="Overview" />
          <NavItem href="/discover" icon={Search} label="Discover" />
          <NavItem href="/campaigns" icon={Megaphone} label="Campaigns" />
          <NavItem href="/groups" icon={Users} label="Groups" />
          
          <div className="px-3 mt-8 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Operations</div>
          <NavItem href="/email" icon={Mail} label="Email Center" />
          <NavItem href="/finance" icon={Briefcase} label="Finance" />
          <NavItem href="/tracking" icon={LineChart} label="Tracking" />
        </div>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-4 px-2">
            <Avatar className="h-9 w-9 border border-border">
              <AvatarFallback className="bg-primary/10 text-primary font-medium">{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate">{user.name}</span>
              <span className="text-xs text-muted-foreground truncate">{user.email}</span>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => logout.mutate()}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-muted/20 relative">
        <div className="max-w-[1600px] mx-auto p-4 md:p-8">
           {children}
        </div>
      </main>
    </div>
  );
}

export { useWorkspaces }; // Re-export for convenience
