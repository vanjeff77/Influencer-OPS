import Layout from "@/components/layout";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useTrackingJobs, useTrackingMetrics, useCreateTrackingJob, useMockUpdateTracking } from "@/hooks/use-tracking";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useState } from "react";
import { Plus, RefreshCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

export default function Tracking() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  const { data: jobs } = useTrackingJobs(workspaceId || 0);
  const createJob = useCreateTrackingJob(workspaceId || 0);
  
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
      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <div>
             <h1 className="text-3xl font-bold tracking-tight">Tracking & Metrics</h1>
             <p className="text-muted-foreground mt-1">Monitor keywords and account growth over time.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Tracking Job
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Tracking Job</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <label className="text-sm font-medium mb-2 block">Keyword / Account Name</label>
                <Input value={newJobName} onChange={e => setNewJobName(e.target.value)} placeholder="#summercampaign" />
              </div>
              <Button onClick={handleCreate} disabled={createJob.isPending}>
                Create Job
              </Button>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1 h-fit">
            <CardHeader>
              <CardTitle>Active Jobs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {jobs?.map(job => (
                <div 
                  key={job.id} 
                  onClick={() => setSelectedJobId(job.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedJobId === job.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
                >
                  <div className="font-medium">{job.name}</div>
                  <div className="text-xs text-muted-foreground capitalize mt-1">{job.targetType} • {job.status}</div>
                </div>
              ))}
              {!jobs?.length && <div className="text-sm text-muted-foreground">No tracking jobs active.</div>}
            </CardContent>
          </Card>

          <Card className="md:col-span-2 min-h-[400px]">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Metric Performance</CardTitle>
                <CardDescription>Daily Mentions / Growth</CardDescription>
              </div>
              {selectedJobId && (
                <Button variant="outline" size="sm" onClick={() => mockUpdate.mutate()} disabled={mockUpdate.isPending}>
                   <RefreshCcw className={`w-3 h-3 mr-2 ${mockUpdate.isPending ? 'animate-spin' : ''}`} />
                   Update Data
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {selectedJobId ? (
                <div className="h-[300px] w-full">
                  {metrics && metrics.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={metrics}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(str) => format(new Date(str), 'MMM d')}
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                          labelFormatter={(label) => format(new Date(label), 'PPP')}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2} 
                          dot={{ r: 4, fill: "hsl(var(--primary))" }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      No data available yet. Click "Update Data" to fetch latest metrics.
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Select a job to view metrics
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
