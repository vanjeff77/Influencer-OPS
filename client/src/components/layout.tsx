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
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  Search,
  Menu,
  X
} from "lucide-react";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { KO } from "@/i18n/ko";

interface Workspace {
  id: number;
  name: string;
  logo?: string | null;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading } = useUser();
  const logout = useLogout();
  const { data: workspacesData } = useWorkspaces();
  const workspaces = workspacesData as Workspace[] | undefined;
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
        toast({ title: KO.nav.workspaceCreated, description: KO.nav.workspaceCreatedDesc });
      }
    });
  };

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const NavItem = ({ href, icon: Icon, label, onClick }: { href: string; icon: any; label: string; onClick?: () => void }) => {
    const isActive = location === href;
    return (
      <Link 
        href={href} 
        onClick={onClick}
        className={`flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2 rounded-md transition-all duration-200 group ${isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
      >
        <Icon className={`w-4 h-4 md:w-5 md:h-5 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
        <span className="text-sm md:text-base">{label}</span>
      </Link>
    );
  };

  const SidebarContent = ({ onNavClick }: { onNavClick?: () => void }) => (
    <>
      <div className="p-3 md:p-4 border-b border-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between px-2 md:px-3 h-10 md:h-12 border-border/60 hover:border-primary/20 hover:bg-muted/50 transition-all">
              <div className="flex items-center gap-2 md:gap-3 overflow-hidden">
                <div className="w-5 h-5 md:w-6 md:h-6 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-[10px] md:text-xs shrink-0">
                  {currentWorkspace?.name.substring(0, 1) || "W"}
                </div>
                <span className="truncate font-medium text-sm md:text-base">{currentWorkspace?.name || KO.nav.selectWorkspace}</span>
              </div>
              <ChevronsUpDown className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuLabel className="text-xs md:text-sm">{KO.nav.myWorkspaces}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {workspaces?.map(w => (
              <DropdownMenuItem key={w.id} onClick={() => setActiveWorkspaceId(w.id)} className="text-sm">
                {w.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-primary cursor-pointer text-sm">
                  <Plus className="w-3 h-3 md:w-4 md:h-4 mr-2" />
                  {KO.nav.createWorkspace}
                </DropdownMenuItem>
              </DialogTrigger>
              <DialogContent className="max-w-[90vw] md:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base md:text-lg">{KO.nav.createWorkspace}</DialogTitle>
                </DialogHeader>
                <div className="py-3 md:py-4">
                  <Input 
                    placeholder={KO.nav.workspaceName} 
                    value={newWorkspaceName} 
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    className="text-sm md:text-base h-9 md:h-10"
                  />
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleCreateWorkspace} disabled={createWorkspace.isPending}>
                    {createWorkspace.isPending ? KO.nav.creating : KO.nav.create}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto py-4 md:py-6 px-2 md:px-3 space-y-0.5 md:space-y-1">
        <div className="px-2 md:px-3 mb-1.5 md:mb-2 text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wider">{KO.nav.platform}</div>
        <NavItem href="/" icon={LayoutDashboard} label={KO.nav.overview} onClick={onNavClick} />
        <NavItem href="/discover" icon={Search} label={KO.nav.discover} onClick={onNavClick} />
        <NavItem href="/campaigns" icon={Megaphone} label={KO.nav.campaigns} onClick={onNavClick} />
        <NavItem href="/groups" icon={Users} label={KO.nav.groups} onClick={onNavClick} />
        
        <div className="px-2 md:px-3 mt-6 md:mt-8 mb-1.5 md:mb-2 text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wider">{KO.nav.operations}</div>
        <NavItem href="/email" icon={Mail} label={KO.nav.emailCenter} onClick={onNavClick} />
        <NavItem href="/finance" icon={Briefcase} label={KO.nav.finance} onClick={onNavClick} />
        <NavItem href="/tracking" icon={LineChart} label={KO.nav.tracking} onClick={onNavClick} />
      </div>

      <div className="p-3 md:p-4 border-t border-border">
        <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4 px-1 md:px-2">
          <Avatar className="h-7 w-7 md:h-9 md:w-9 border border-border">
            <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs md:text-sm">{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col overflow-hidden">
            <span className="text-xs md:text-sm font-medium truncate">{user.name}</span>
            <span className="text-[10px] md:text-xs text-muted-foreground truncate">{user.email}</span>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs md:text-sm"
          onClick={() => logout.mutate()}
        >
          <LogOut className="w-3 h-3 md:w-4 md:h-4 mr-2" />
          {KO.nav.signOut}
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-56 lg:w-64 border-r border-border bg-card flex-col shadow-sm z-10">
        <SidebarContent />
      </aside>

      {/* Mobile Header & Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-3 py-2 border-b border-border bg-card">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-mobile-menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 flex flex-col">
              <SidebarContent onNavClick={() => setMobileMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-[10px]">
              {currentWorkspace?.name.substring(0, 1) || "W"}
            </div>
            <span className="text-sm font-medium truncate max-w-[150px]">{currentWorkspace?.name || KO.nav.selectWorkspace}</span>
          </div>
          <Avatar className="h-7 w-7 border border-border">
            <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </header>

        <main className="flex-1 overflow-auto bg-muted/20 relative">
          <div className="max-w-[1600px] mx-auto p-3 md:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export { useWorkspaces };
