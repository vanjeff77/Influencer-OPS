import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useEmailAccounts, useEmailThreads, useSyncEmail, useSendBulkEmail } from "@/hooks/use-email";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, Send, Mail, User, Clock } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
  const [composeData, setComposeData] = useState({ to: "", subject: "", body: "" });

  const handleSync = () => {
    if (!selectedAccountId) return;
    syncEmail.mutate(undefined, {
      onSuccess: (data) => toast({ title: "Sync Complete", description: `Synced ${data.syncedCount} new messages.` })
    });
  };

  const handleSend = () => {
    if (!selectedAccountId) return;
    // Split emails by comma
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
        toast({ title: "Emails Sent", description: "Your bulk campaign has started sending." });
      }
    });
  };

  return (
    <Layout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Email Center</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSync} disabled={!selectedAccountId || syncEmail.isPending}>
              <RefreshCw className={`w-4 h-4 mr-2 ${syncEmail.isPending ? 'animate-spin' : ''}`} />
              Sync
            </Button>
            
            <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
              <DialogTrigger asChild>
                <Button disabled={!selectedAccountId}>
                  <Send className="w-4 h-4 mr-2" />
                  Compose
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Send Email</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <label>To (comma separated)</label>
                    <Input value={composeData.to} onChange={e => setComposeData({...composeData, to: e.target.value})} placeholder="email1@example.com, email2@example.com" />
                  </div>
                  <div className="grid gap-2">
                    <label>Subject</label>
                    <Input value={composeData.subject} onChange={e => setComposeData({...composeData, subject: e.target.value})} placeholder="Campaign Opportunity" />
                  </div>
                  <div className="grid gap-2">
                    <label>Body</label>
                    <Textarea 
                      value={composeData.body} 
                      onChange={e => setComposeData({...composeData, body: e.target.value})} 
                      placeholder="Hi there, ..." 
                      className="min-h-[200px]"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSend} disabled={sendBulk.isPending}>
                    {sendBulk.isPending ? "Sending..." : "Send Emails"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
          {/* Account Selector */}
          <div className="col-span-3 bg-card rounded-xl border border-border p-4 flex flex-col gap-2 overflow-y-auto">
            <h3 className="font-semibold text-sm mb-2 px-2 text-muted-foreground uppercase">Accounts</h3>
            {accounts?.map(acc => (
              <button
                key={acc.id}
                onClick={() => { setSelectedAccountId(acc.id); setSelectedThread(null); }}
                className={`flex items-center gap-3 p-3 rounded-lg text-left transition-all ${selectedAccountId === acc.id ? 'bg-primary text-primary-foreground shadow-md' : 'hover:bg-muted'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${selectedAccountId === acc.id ? 'bg-white/20' : 'bg-primary/10 text-primary'}`}>
                  <Mail className="w-4 h-4" />
                </div>
                <div className="overflow-hidden">
                   <div className="font-medium truncate text-sm">{acc.email}</div>
                   <div className={`text-xs truncate ${selectedAccountId === acc.id ? 'text-white/80' : 'text-muted-foreground'}`}>{acc.provider}</div>
                </div>
              </button>
            ))}
            {!accounts?.length && <div className="text-sm text-muted-foreground p-2">No email accounts connected.</div>}
          </div>

          {/* Thread List */}
          <div className="col-span-4 bg-card rounded-xl border border-border flex flex-col overflow-hidden">
             <div className="p-4 border-b border-border bg-muted/10">
               <h3 className="font-semibold">Inbox</h3>
             </div>
             <ScrollArea className="flex-1">
               <div className="flex flex-col">
                 {threads?.map(thread => (
                   <button
                     key={thread.id}
                     onClick={() => setSelectedThread(thread)}
                     className={`p-4 border-b border-border text-left hover:bg-muted/50 transition-colors ${selectedThread?.id === thread.id ? 'bg-muted' : ''}`}
                   >
                     <div className="flex justify-between mb-1">
                       <span className="font-semibold text-sm truncate max-w-[70%]">{thread.subject || "(No Subject)"}</span>
                       <span className="text-xs text-muted-foreground whitespace-nowrap">
                         {thread.lastMessageDate ? format(new Date(thread.lastMessageDate), 'MMM d') : ''}
                       </span>
                     </div>
                     <p className="text-xs text-muted-foreground line-clamp-2">{thread.snippet}</p>
                   </button>
                 ))}
                 {isLoadingThreads && <div className="p-8 text-center text-sm text-muted-foreground">Loading threads...</div>}
                 {!selectedAccountId && <div className="p-8 text-center text-sm text-muted-foreground">Select an account to view emails.</div>}
               </div>
             </ScrollArea>
          </div>

          {/* Message View */}
          <div className="col-span-5 bg-card rounded-xl border border-border flex flex-col overflow-hidden">
            {selectedThread ? (
              <div className="flex flex-col h-full">
                <div className="p-6 border-b border-border">
                  <h2 className="text-xl font-bold leading-tight mb-2">{selectedThread.subject}</h2>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    {selectedThread.lastMessageDate ? format(new Date(selectedThread.lastMessageDate), 'PPP p') : ''}
                  </div>
                </div>
                <ScrollArea className="flex-1 p-6">
                  {/* Mock message display - in real app would fetch messages for thread */}
                  <div className="space-y-6">
                     <div className="flex gap-4">
                       <Avatar>
                         <AvatarFallback>JD</AvatarFallback>
                       </Avatar>
                       <div className="flex-1 space-y-2">
                         <div className="flex justify-between">
                            <span className="font-semibold">Jane Doe</span>
                            <span className="text-xs text-muted-foreground">Yesterday</span>
                         </div>
                         <div className="text-sm leading-relaxed">
                            {selectedThread.snippet}
                            <br/><br/>
                            Looking forward to hearing from you.
                         </div>
                       </div>
                     </div>
                  </div>
                </ScrollArea>
                <div className="p-4 border-t border-border bg-muted/10">
                  <Button className="w-full">Reply</Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                Select a thread to read
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
