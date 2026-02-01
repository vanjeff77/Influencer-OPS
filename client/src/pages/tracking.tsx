import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useTrackingJobs, useTrackingMetrics, useCreateTrackingJob, useMockUpdateTracking } from "@/hooks/use-tracking";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useState } from "react";
import { Plus, RefreshCcw, Download, X, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { KO } from "@/i18n/ko";
import { useLocation, useSearch } from "wouter";

export default function Tracking() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  const { data: jobs } = useTrackingJobs(workspaceId || 0);
  const createJob = useCreateTrackingJob(workspaceId || 0);
  const [, navigate] = useLocation();
  const searchString = useSearch();
  
  const searchParams = new URLSearchParams(searchString);
  const hasIssueParam = searchParams.get("hasIssue");
  
  const activeFilters = [
    hasIssueParam && { key: "hasIssue", label: "이슈있음" },
  ].filter(Boolean) as { key: string; label: string }[];

  const clearAllFilters = () => {
    navigate("/tracking");
  };
  
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const { data: metrics } = useTrackingMetrics(selectedJobId || 0);
  const mockUpdate = useMockUpdateTracking(selectedJobId || 0);

  const [newJobName, setNewJobName] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleCreate = () => {
    createJob.mutate({
      name: newJobName,
      targetType: "keyword",
      keywords: { include: [newJobName], exclude: [] },
      status: "active"
    }, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setNewJobName("");
      }
    });
  };

  return (
    <Layout>
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4">
          <div>
             <h1 className="text-xl md:text-3xl font-bold tracking-tight">{KO.pages.tracking.title}</h1>
             <p className="text-muted-foreground text-xs md:text-base mt-0.5 md:mt-1">{KO.pages.tracking.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {hasIssueParam && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" />
                {KO.pages.filter.hasIssue}
                <span onClick={clearAllFilters} className="cursor-pointer ml-1 text-destructive-foreground" data-testid="button-clear-issue-filter">
                  <X className="w-3 h-3" />
                </span>
              </Badge>
            )}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-tracking">
                  <Plus className="w-4 h-4 mr-2" />
                  {KO.pages.tracking.addTrackingJob}
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-[90vw] md:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base md:text-lg">{KO.pages.tracking.newTrackingJob}</DialogTitle>
              </DialogHeader>
              <div className="py-3 md:py-4">
                <label className="text-xs md:text-sm font-medium mb-1.5 md:mb-2 block">{KO.pages.tracking.keywordOrAccount}</label>
                <Input className="h-8 md:h-10 text-sm" value={newJobName} onChange={e => setNewJobName(e.target.value)} placeholder="#서머캠페인" />
              </div>
              <Button size="sm" onClick={handleCreate} disabled={createJob.isPending} data-testid="button-submit-tracking">
                {KO.pages.tracking.createJob}
              </Button>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
          <Card className="md:col-span-1 h-fit">
            <CardHeader className="p-3 md:p-6">
              <CardTitle className="text-base md:text-xl">{KO.pages.tracking.activeJobs}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0 space-y-1.5 md:space-y-2">
              {jobs?.map(job => (
                <div 
                  key={job.id} 
                  onClick={() => setSelectedJobId(job.id)}
                  className={`p-2 md:p-3 rounded-lg border cursor-pointer transition-colors ${selectedJobId === job.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
                  data-testid={`button-job-${job.id}`}
                >
                  <div className="font-medium text-sm md:text-base">{job.name}</div>
                  <div className="text-[10px] md:text-xs text-muted-foreground capitalize mt-0.5 md:mt-1">{job.targetType} • {job.status === 'active' ? KO.status.active : job.status}</div>
                </div>
              ))}
              {!jobs?.length && <div className="text-xs md:text-sm text-muted-foreground">{KO.pages.tracking.noActiveJobs}</div>}
            </CardContent>
          </Card>

          <Card className="md:col-span-2 min-h-[280px] md:min-h-[400px]">
            <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between p-3 md:p-6 gap-2">
              <div>
                <CardTitle className="text-base md:text-xl">{KO.pages.tracking.metricPerformance}</CardTitle>
                <CardDescription className="text-xs md:text-sm">{KO.pages.tracking.dailyMentions}</CardDescription>
              </div>
              {selectedJobId && (
                <div className="flex items-center gap-1.5 md:gap-2 w-full md:w-auto">
                  <Button variant="outline" size="sm" onClick={() => mockUpdate.mutate()} disabled={mockUpdate.isPending} data-testid="button-update-data">
                     <RefreshCcw className={`w-3 h-3 mr-2 ${mockUpdate.isPending ? 'animate-spin' : ''}`} />
                     <span className="hidden sm:inline">{KO.common.updateData}</span>
                     <span className="sm:hidden">{KO.pages.filter.update}</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      if (!metrics || metrics.length === 0) return;
                      const selectedJob = jobs?.find(j => j.id === selectedJobId);
                      const headers = ['날짜', '값', 'Job 이름'];
                      const rows = metrics.map(m => [
                        format(new Date(m.date), 'yyyy-MM-dd'),
                        String(m.value),
                        selectedJob?.name || ''
                      ]);
                      const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
                      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `tracking_${selectedJob?.name || 'data'}_${format(new Date(), 'yyyyMMdd')}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    disabled={!metrics || metrics.length === 0}
                    data-testid="button-export-csv"
                  >
                    <Download className="w-3 h-3 mr-2" />
                    <span className="hidden sm:inline">{KO.pages.filter.exportCsv}</span>
                    <span className="sm:hidden">CSV</span>
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0">
              {selectedJobId ? (
                <div className="h-[200px] md:h-[300px] w-full">
                  {metrics && metrics.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={metrics}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(str) => format(new Date(str), 'MM.dd')}
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          width={30}
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', fontSize: '12px' }}
                          labelFormatter={(label) => format(new Date(label), 'yyyy.MM.dd')}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2} 
                          dot={{ r: 3, fill: "hsl(var(--primary))" }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      {KO.pages.tracking.noDataYet}
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-[200px] md:h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                  {KO.pages.tracking.selectJobToView}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
