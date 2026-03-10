import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWorkspaces } from "@/hooks/use-workspaces";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Sparkles,
  X,
  Plus,
  UserPlus,
  Ban,
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Users,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileText,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AiSearchJob = {
  id: number;
  workspaceId: number;
  status: string;
  seedHandles: string[];
  criteria: string | null;
  platform: string;
  followerMin: number | null;
  followerMax: number | null;
  maxResults: number;
  progress: any;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

type AiSearchCandidate = {
  id: number;
  jobId: number;
  handle: string;
  platform: string;
  profileData: any;
  sourceSeeds: string[];
  aiScore: number | null;
  aiReason: string | null;
  status: string;
  addedInfluencerId: number | null;
};

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "대기중", variant: "secondary" },
    fetching_followings: { label: "팔로잉 수집중", variant: "default" },
    fetching_profiles: { label: "프로필 조회중", variant: "default" },
    analyzing: { label: "AI 분석중", variant: "default" },
    completed: { label: "완료", variant: "outline" },
    failed: { label: "실패", variant: "destructive" },
  };
  const info = map[status] || { label: status, variant: "secondary" as const };
  return <Badge variant={info.variant} data-testid={`badge-status-${status}`}>{info.label}</Badge>;
}

function getProgressPercent(job: AiSearchJob): number {
  if (job.status === "completed") return 100;
  if (job.status === "failed") return 0;
  if (!job.progress) return 5;

  const step = job.progress.currentStep;
  if (step === "fetching_followings") {
    const seedProg = (job.progress.seedsProcessed || 0) / (job.progress.seedsTotal || 1);
    return 5 + seedProg * 30;
  }
  if (step === "fetching_profiles") {
    const profProg = (job.progress.profilesFetched || 0) / (job.progress.profilesTotal || 1);
    return 35 + profProg * 35;
  }
  if (step === "analyzing") {
    const anProg = (job.progress.analyzedCount || 0) / (job.progress.totalToAnalyze || 1);
    return 70 + anProg * 25;
  }
  return 5;
}

function getProgressText(job: AiSearchJob): string {
  if (!job.progress) return "";
  const p = job.progress;
  if (p.currentStep === "fetching_followings") {
    return `시드 ${p.seedsProcessed || 0}/${p.seedsTotal || 0} 처리중 · 후보 ${p.candidatesFound || 0}명 발견`;
  }
  if (p.currentStep === "fetching_profiles") {
    return `프로필 ${p.profilesFetched || 0}/${p.profilesTotal || 0} 조회중`;
  }
  if (p.currentStep === "analyzing") {
    return `AI 분석 ${p.analyzedCount || 0}/${p.totalToAnalyze || 0}`;
  }
  return "";
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}초`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return sec > 0 ? `${min}분 ${sec}초` : `${min}분`;
}

function getTimeDisplay(job: AiSearchJob): string | null {
  if (!job.progress?.startedAt) return null;
  const elapsed = (Date.now() - new Date(job.progress.startedAt).getTime()) / 1000;
  const remaining = job.progress.estimatedSeconds;
  const parts: string[] = [];
  parts.push(`경과: ${formatDuration(elapsed)}`);
  if (remaining != null && remaining > 0) {
    parts.push(`남은 시간: ~${formatDuration(remaining)}`);
  }
  return parts.join(' / ');
}

function CreateJobForm({ workspaceId, onCreated }: { workspaceId: number; onCreated: () => void }) {
  const [handles, setHandles] = useState<string[]>([]);
  const [handleInput, setHandleInput] = useState("");
  const [criteria, setCriteria] = useState("");
  const [followerMin, setFollowerMin] = useState("");
  const [followerMax, setFollowerMax] = useState("");
  const [maxResults, setMaxResults] = useState("50");
  const { toast } = useToast();

  const createJob = useMutation({
    mutationFn: async () => {
      const body: any = {
        seedHandles: handles,
        platform: "instagram",
        maxResults: parseInt(maxResults) || 50,
      };
      if (criteria.trim()) body.criteria = criteria.trim();
      if (followerMin) body.followerMin = parseInt(followerMin);
      if (followerMax) body.followerMax = parseInt(followerMax);

      const res = await apiRequest("POST", `/api/workspaces/${workspaceId}/ai-search`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "AI 서칭이 시작되었습니다", description: "백그라운드에서 인플루언서를 찾고 있습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "ai-search"] });
      setHandles([]);
      setHandleInput("");
      setCriteria("");
      setFollowerMin("");
      setFollowerMax("");
      onCreated();
    },
    onError: (err: any) => {
      toast({ title: "서칭 시작 실패", description: err.message, variant: "destructive" });
    },
  });

  const addHandle = () => {
    const h = handleInput.trim().replace(/^@/, "");
    if (h && !handles.includes(h) && handles.length < 10) {
      setHandles([...handles, h]);
      setHandleInput("");
    }
  };

  const removeHandle = (h: string) => setHandles(handles.filter((x) => x !== h));

  return (
    <Card data-testid="card-create-job">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          새 AI 서칭
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">시드 인플루언서</label>
          <p className="text-xs text-muted-foreground mb-2">비슷한 인플루언서를 찾고 싶은 기준 계정을 입력하세요 (3~10개 권장)</p>
          <div className="flex gap-2">
            <Input
              placeholder="@handle"
              value={handleInput}
              onChange={(e) => setHandleInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addHandle(); } }}
              data-testid="input-seed-handle"
            />
            <Button type="button" variant="outline" size="sm" onClick={addHandle} data-testid="button-add-handle">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {handles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {handles.map((h) => (
                <Badge key={h} variant="secondary" className="gap-1 pr-1">
                  @{h}
                  <button onClick={() => removeHandle(h)} className="hover:text-destructive" data-testid={`button-remove-handle-${h}`}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">찾고 싶은 인플루언서 조건</label>
          <Textarea
            placeholder={"뷰티/스킨케어 카테고리의 한국 여성 크리에이터.\n20~30대 타겟, 깔끔하고 감성적인 피드 분위기.\n릴스 콘텐츠를 활발하게 올리는 분 선호.\n광고 비율이 과하지 않은 계정."}
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            rows={4}
            data-testid="input-criteria"
          />
          <p className="text-xs text-muted-foreground mt-1">비워두면 시드 인플루언서들의 공통 특성을 기준으로 추천합니다</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium mb-1.5 block">최소 팔로워</label>
            <Input
              type="number"
              placeholder="예: 10000"
              value={followerMin}
              onChange={(e) => setFollowerMin(e.target.value)}
              data-testid="input-follower-min"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">최대 팔로워</label>
            <Input
              type="number"
              placeholder="예: 100000"
              value={followerMax}
              onChange={(e) => setFollowerMax(e.target.value)}
              data-testid="input-follower-max"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">최대 결과 수</label>
          <Select value={maxResults} onValueChange={setMaxResults}>
            <SelectTrigger data-testid="select-max-results">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30명</SelectItem>
              <SelectItem value="50">50명</SelectItem>
              <SelectItem value="100">100명</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() => createJob.mutate()}
          disabled={handles.length < 1 || createJob.isPending}
          className="w-full"
          data-testid="button-start-search"
        >
          {createJob.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          AI 서칭 시작
        </Button>
      </CardContent>
    </Card>
  );
}

function JobListItem({ job, onClick }: { job: AiSearchJob; onClick: () => void }) {
  const isRunning = ["pending", "fetching_followings", "fetching_profiles", "analyzing"].includes(job.status);

  return (
    <Card
      className="cursor-pointer hover:border-primary/30 transition-colors"
      onClick={onClick}
      data-testid={`card-job-${job.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {getStatusBadge(job.status)}
              {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {job.seedHandles.slice(0, 4).map((h) => (
                <span key={h} className="text-xs text-muted-foreground">@{h}</span>
              ))}
              {job.seedHandles.length > 4 && (
                <span className="text-xs text-muted-foreground">+{job.seedHandles.length - 4}</span>
              )}
            </div>
            {job.criteria && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{job.criteria}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-muted-foreground">
              <Clock className="h-3 w-3 inline mr-1" />
              {new Date(job.createdAt).toLocaleDateString("ko-KR")}
            </div>
          </div>
        </div>
        {isRunning && (
          <div className="mt-3">
            <Progress value={getProgressPercent(job)} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">{getProgressText(job)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CandidateCard({
  candidate,
  workspaceId,
  jobId,
}: {
  candidate: AiSearchCandidate;
  workspaceId: number;
  jobId: number;
}) {
  const { toast } = useToast();
  const profile = candidate.profileData || {};

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/workspaces/${workspaceId}/ai-search/${jobId}/candidates/${candidate.id}/add`
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "인플루언서 추가됨", description: `@${candidate.handle}이(가) 워크스페이스에 추가되었습니다.` });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "ai-search", jobId, "candidates"] });
    },
    onError: (err: any) => toast({ title: "추가 실패", description: err.message, variant: "destructive" }),
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "PATCH",
        `/api/workspaces/${workspaceId}/ai-search/${jobId}/candidates/${candidate.id}`,
        { status: "dismissed" }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "ai-search", jobId, "candidates"] });
    },
  });

  const isDismissed = candidate.status === "dismissed";
  const isAdded = candidate.status === "added";

  return (
    <Card className={`${isDismissed ? "opacity-50" : ""}`} data-testid={`card-candidate-${candidate.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {(profile.profilePicUrl || profile.profileImageUrl) ? (
            <img
              src={profile.profilePicUrl || profile.profileImageUrl}
              alt={candidate.handle}
              className="w-12 h-12 rounded-full object-cover border border-border shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <a
                href={`https://instagram.com/${candidate.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-sm hover:text-primary flex items-center gap-1"
                data-testid={`link-handle-${candidate.id}`}
              >
                @{candidate.handle}
                <ExternalLink className="h-3 w-3" />
              </a>
              {(profile.isVerified || profile.verified) && <Badge variant="secondary" className="text-[10px] px-1 py-0">✓</Badge>}
              {isAdded && <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-600">추가됨</Badge>}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              {profile.followers != null && <span>팔로워 {formatNumber(profile.followers)}</span>}
              {profile.category && <span>· {profile.category}</span>}
            </div>
            {profile.bio && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{profile.bio}</p>
            )}
          </div>
        </div>

        {candidate.aiScore != null && (
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium">AI 점수</span>
              <span className="text-xs font-bold text-primary">{Math.round(candidate.aiScore)}</span>
              <div className="flex-1">
                <Progress value={candidate.aiScore} className="h-1.5" />
              </div>
            </div>
            {candidate.aiReason && (
              <p className="text-xs text-muted-foreground">{candidate.aiReason}</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1">
            {candidate.sourceSeeds.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                공통 시드: {candidate.sourceSeeds.map((s) => `@${s}`).join(", ")}
              </span>
            )}
          </div>
          {!isAdded && !isDismissed && (
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dismissMutation.mutate()}
                disabled={dismissMutation.isPending}
                data-testid={`button-dismiss-${candidate.id}`}
              >
                <Ban className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending}
                data-testid={`button-add-${candidate.id}`}
              >
                {addMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1" />}
                추가
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ExecutionLog({ logs, defaultOpen = false }: { logs?: any[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  if (!logs || logs.length === 0) return null;

  const logIcon = (type: string) => {
    if (type === 'success') return <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    if (type === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
    return <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
  };

  const hasWarningsOrErrors = logs.some((l: any) => l.type === 'warning' || l.type === 'error');

  return (
    <Card data-testid="card-execution-log">
      <CardContent className="p-0">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
          data-testid="button-toggle-log"
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">실행 로그</span>
            <span className="text-xs text-muted-foreground">({logs.length}건)</span>
            {hasWarningsOrErrors && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {open && (
          <div className="border-t px-3 pb-3 space-y-1.5 max-h-60 overflow-y-auto">
            {logs.map((log: any, i: number) => (
              <div key={i} className="flex items-start gap-2 py-1" data-testid={`log-entry-${i}`}>
                {logIcon(log.type)}
                <span className="text-xs text-muted-foreground flex-1">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JobDetail({
  workspaceId,
  jobId,
  onBack,
}: {
  workspaceId: number;
  jobId: number;
  onBack: () => void;
}) {
  const [sortBy, setSortBy] = useState("score");

  const { data: job } = useQuery<AiSearchJob>({
    queryKey: ["/api/workspaces", workspaceId, "ai-search", jobId],
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 5000;
      return ["pending", "fetching_followings", "fetching_profiles", "analyzing"].includes(data.status) ? 5000 : false;
    },
  });

  const { data: candidates } = useQuery<AiSearchCandidate[]>({
    queryKey: ["/api/workspaces", workspaceId, "ai-search", jobId, "candidates"],
    enabled: !!job && job.status === "completed",
  });

  if (!job) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const isRunning = ["pending", "fetching_followings", "fetching_profiles", "analyzing"].includes(job.status);

  const sortedCandidates = [...(candidates || [])].sort((a, b) => {
    if (sortBy === "score") return (b.aiScore || 0) - (a.aiScore || 0);
    if (sortBy === "followers") return ((b.profileData?.followers || 0) - (a.profileData?.followers || 0));
    if (sortBy === "seeds") return (b.sourceSeeds?.length || 0) - (a.sourceSeeds?.length || 0);
    return 0;
  });

  const recommendedCount = sortedCandidates.filter((c) => c.status === "recommended").length;
  const addedCount = sortedCandidates.filter((c) => c.status === "added").length;

  return (
    <div className="space-y-4" data-testid="job-detail">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-1" /> 목록
        </Button>
        {getStatusBadge(job.status)}
        {isRunning && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {job.seedHandles.map((h) => (
              <Badge key={h} variant="secondary">@{h}</Badge>
            ))}
          </div>
          {job.criteria && <p className="text-sm text-muted-foreground mb-2">{job.criteria}</p>}
          <div className="flex gap-4 text-xs text-muted-foreground">
            {job.followerMin && <span>최소 {formatNumber(job.followerMin)}</span>}
            {job.followerMax && <span>최대 {formatNumber(job.followerMax)}</span>}
            <span>최대 결과: {job.maxResults}명</span>
          </div>
        </CardContent>
      </Card>

      {isRunning && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium">서칭 진행중...</span>
            </div>
            <Progress value={getProgressPercent(job)} className="h-2 mb-2" />
            <p className="text-xs text-muted-foreground">{getProgressText(job)}</p>
            {getTimeDisplay(job) && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1" data-testid="text-time-display">
                <Clock className="h-3 w-3" />
                {getTimeDisplay(job)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {job.status === "failed" && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">서칭 실패</p>
              <p className="text-xs text-muted-foreground mt-1">{job.errorMessage || "알 수 없는 오류"}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <ExecutionLog logs={job.progress?.logs} defaultOpen={job.status === "failed" || (job.status === "completed" && (!candidates || candidates.length === 0))} />

      {job.status === "completed" && candidates && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium">추천 결과</h3>
              <span className="text-xs text-muted-foreground">
                {recommendedCount}명 추천 · {addedCount}명 추가됨 · 전체 {sortedCandidates.length}명
              </span>
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">AI 점수순</SelectItem>
                <SelectItem value="followers">팔로워순</SelectItem>
                <SelectItem value="seeds">공통 시드순</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sortedCandidates.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                workspaceId={job.workspaceId}
                jobId={job.id}
              />
            ))}
          </div>

          {sortedCandidates.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">조건에 맞는 후보를 찾지 못했습니다</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AiSearch() {
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: jobs, isLoading } = useQuery<AiSearchJob[]>({
    queryKey: ["/api/workspaces", workspaceId, "ai-search"],
    enabled: !!workspaceId,
    refetchInterval: 10000,
  });

  if (!workspaceId) return <Layout><div className="p-6">로딩중...</div></Layout>;

  if (selectedJobId) {
    return (
      <Layout>
        <div className="p-4 md:p-6 max-w-5xl mx-auto">
          <JobDetail
            workspaceId={workspaceId}
            jobId={selectedJobId}
            onBack={() => setSelectedJobId(null)}
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Sparkles className="h-6 w-6 text-primary" />
              AI 인플루언서 서칭
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              시드 인플루언서의 팔로잉을 탐색하고 AI가 최적의 후보를 추천합니다
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)} data-testid="button-new-search">
            {showForm ? "닫기" : (<><Plus className="h-4 w-4 mr-1" /> 새 서칭</>)}
          </Button>
        </div>

        {showForm && (
          <div className="mb-6">
            <CreateJobForm
              workspaceId={workspaceId}
              onCreated={() => setShowForm(false)}
            />
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">이전 서칭</h2>
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {jobs && jobs.length === 0 && !showForm && (
            <div className="text-center py-16">
              <Sparkles className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground mb-4">아직 AI 서칭 기록이 없습니다</p>
              <Button onClick={() => setShowForm(true)} data-testid="button-first-search">
                <Plus className="h-4 w-4 mr-1" /> 첫 서칭 시작하기
              </Button>
            </div>
          )}
          {jobs?.map((job) => (
            <JobListItem key={job.id} job={job} onClick={() => setSelectedJobId(job.id)} />
          ))}
        </div>
      </div>
    </Layout>
  );
}
