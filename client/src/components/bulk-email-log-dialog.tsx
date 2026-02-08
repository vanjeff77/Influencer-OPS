import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, CheckCircle2, XCircle, Clock, AlertCircle, Send, Loader2, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { KO } from '@/i18n/ko';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface BulkEmailJob {
  id: number;
  campaignId: number;
  templateSubject: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

interface BulkEmailQueueItem {
  id: number;
  email: string;
  renderedSubject: string;
  status: string;
  reason: string | null;
  sentAt: string | null;
  createdAt: string;
  variables?: { influencer_name?: string };
}

interface BulkEmailLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: number;
}

export function BulkEmailLogDialog({ open, onOpenChange, campaignId }: BulkEmailLogDialogProps) {
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'failed'>('all');
  const { toast } = useToast();
  
  const retryJob = useMutation({
    mutationFn: async (jobId: number) => {
      const res = await apiRequest('POST', `/api/bulk-email/jobs/${jobId}/retry`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "재발송 시작", description: `${data.retryCount}건의 이메일을 재발송합니다.` });
      queryClient.invalidateQueries({ queryKey: ['/api/bulk-email/jobs', campaignId.toString()] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "재발송 실패", description: err.message });
    }
  });
  
  const { data: jobs, isLoading: isLoadingJobs } = useQuery<BulkEmailJob[]>({
    queryKey: ['/api/bulk-email/jobs', campaignId.toString()],
    queryFn: () => fetch(`/api/bulk-email/jobs/${campaignId}`).then(r => r.json()),
    enabled: open,
    refetchInterval: 5000,
  });
  
  const { data: jobDetail, isLoading: isLoadingDetail } = useQuery<{ job: BulkEmailJob; items: BulkEmailQueueItem[] }>({
    queryKey: ['/api/bulk-email/jobs', campaignId.toString(), selectedJobId?.toString()],
    queryFn: () => fetch(`/api/bulk-email/jobs/${campaignId}/${selectedJobId}`).then(r => r.json()),
    enabled: open && selectedJobId !== null,
    refetchInterval: 3000,
  });
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'queued':
        return <Badge variant="secondary" className="text-xs"><Clock className="w-3 h-3 mr-1" />{KO.pages.bulkEmail.statusQueued}</Badge>;
      case 'sending':
        return <Badge variant="secondary" className="text-xs"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{KO.pages.bulkEmail.statusSending}</Badge>;
      case 'sent':
        return <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />{KO.pages.bulkEmail.statusSent}</Badge>;
      case 'failed':
        return <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" />{KO.pages.bulkEmail.statusFailed}</Badge>;
      case 'skipped':
        return <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200"><AlertCircle className="w-3 h-3 mr-1" />{KO.pages.bulkEmail.statusSkipped}</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{status}</Badge>;
    }
  };
  
  const getJobStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">{KO.common.pending}</Badge>;
      case 'processing':
        return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{KO.common.active}</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{KO.common.completed}</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">실패</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };
  
  const filteredItems = (jobDetail?.items || []).filter(item => {
    if (filter === 'failed') return item.status === 'failed' || item.status === 'skipped';
    return true;
  });
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {KO.pages.bulkEmail.sendLog}
          </DialogTitle>
          <DialogDescription>
            {KO.pages.bulkEmail.viewSendLog}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 overflow-hidden">
          <div className="border rounded-lg overflow-hidden">
            <div className="p-2 border-b bg-muted/30 font-medium text-sm">{KO.pages.bulkEmail.sendLog}</div>
            <ScrollArea className="h-[400px]">
              {isLoadingJobs ? (
                <div className="p-2 space-y-2">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              ) : jobs?.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  {KO.pages.bulkEmail.noSendHistory}
                </div>
              ) : (
                <div className="divide-y">
                  {jobs?.map(job => (
                    <div
                      key={job.id}
                      className={`p-3 cursor-pointer hover:bg-muted/50 ${selectedJobId === job.id ? 'bg-primary/10' : ''}`}
                      onClick={() => setSelectedJobId(job.id)}
                      data-testid={`job-${job.id}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(job.createdAt), 'yyyy-MM-dd HH:mm', { locale: ko })}
                        </span>
                        {getJobStatusBadge(job.status)}
                      </div>
                      <div className="text-sm font-medium truncate">{job.templateSubject}</div>
                      <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                        <span className="text-green-600">{job.sentCount} {KO.pages.bulkEmail.statusSent}</span>
                        <span className="text-red-600">{job.failedCount} {KO.pages.bulkEmail.statusFailed}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
          
          <div className="md:col-span-2 border rounded-lg overflow-hidden">
            {selectedJobId && jobDetail ? (
              <>
                <div className="p-2 border-b bg-muted/30 flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{KO.pages.bulkEmail.sendLog} #{selectedJobId}</span>
                  <div className="flex gap-1">
                    {jobDetail.items.some(i => i.status === 'queued' || i.status === 'failed') && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryJob.mutate(selectedJobId)}
                        disabled={retryJob.isPending}
                        className="h-7 text-xs"
                        data-testid="button-retry-job"
                      >
                        {retryJob.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                        재발송
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={filter === 'all' ? 'default' : 'outline'}
                      onClick={() => setFilter('all')}
                      className="h-7 text-xs"
                      data-testid="filter-all"
                    >
                      {KO.pages.bulkEmail.filterAll}
                    </Button>
                    <Button
                      size="sm"
                      variant={filter === 'failed' ? 'default' : 'outline'}
                      onClick={() => setFilter('failed')}
                      className="h-7 text-xs"
                      data-testid="filter-failed"
                    >
                      {KO.pages.bulkEmail.filterFailed}
                    </Button>
                  </div>
                </div>
                
                <div className="grid grid-cols-4 gap-2 p-2 border-b">
                  <Card className="p-2 text-center">
                    <div className="text-lg font-bold">{jobDetail.job.totalCount}</div>
                    <div className="text-xs text-muted-foreground">{KO.pages.bulkEmail.totalSelected}</div>
                  </Card>
                  <Card className="p-2 text-center">
                    <div className="text-lg font-bold text-green-600">{jobDetail.job.sentCount}</div>
                    <div className="text-xs text-muted-foreground">{KO.pages.bulkEmail.statusSent}</div>
                  </Card>
                  <Card className="p-2 text-center">
                    <div className="text-lg font-bold text-red-600">{jobDetail.job.failedCount}</div>
                    <div className="text-xs text-muted-foreground">{KO.pages.bulkEmail.statusFailed}</div>
                  </Card>
                  <Card className="p-2 text-center">
                    <div className="text-lg font-bold text-yellow-600">{jobDetail.job.skippedCount}</div>
                    <div className="text-xs text-muted-foreground">{KO.pages.bulkEmail.statusSkipped}</div>
                  </Card>
                </div>
                
                <ScrollArea className="h-[300px]">
                  {isLoadingDetail ? (
                    <div className="p-2 space-y-2">
                      <Skeleton className="h-12" />
                      <Skeleton className="h-12" />
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredItems.map(item => (
                        <div key={item.id} className="p-2 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate">
                              {item.variables?.influencer_name || item.email}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{item.email}</div>
                            {item.reason && (
                              <div className="text-xs text-red-600 mt-1">{item.reason}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {item.sentAt && (
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(item.sentAt), 'HH:mm', { locale: ko })}
                              </span>
                            )}
                            {getStatusBadge(item.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center p-6">
                  <Send className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">{KO.pages.bulkEmail.noSendHistory}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
