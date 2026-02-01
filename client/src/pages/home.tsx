import { useUser } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ArrowRight, 
  Megaphone, 
  MessageSquare, 
  AlertTriangle, 
  Upload, 
  Wallet,
  ChevronRight,
  Clock,
  ExternalLink,
  AlertCircle,
  Eye,
  FileWarning,
  CreditCard
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { KO } from "@/i18n/ko";
import { useState, useEffect } from "react";

interface Task {
  id: string;
  title: string;
  campaignName: string;
  influencerName: string;
  status: string;
  dueIn: number;
  priority: number;
  link: string;
  completed: boolean;
}

interface CommunicationThread {
  id: string;
  influencerName: string;
  campaignName: string;
  lastMessage: string;
  time: string;
  status: "replied" | "noResponse" | "failed";
}

interface RiskItem {
  id: string;
  type: "trackingError" | "contentPrivate" | "contractIncomplete" | "settlementUrgent";
  message: string;
  link: string;
}

const SAMPLE_TASKS: Task[] = [
  { id: "1", title: "초안 검토 및 피드백 전달", campaignName: "서머 런칭 2025", influencerName: "인플루언서 1", status: "피드백 대기", dueIn: 0, priority: 1, link: "/campaigns/1?tab=content", completed: false },
  { id: "2", title: "계약서 서명 요청", campaignName: "서머 런칭 2025", influencerName: "인플루언서 2", status: "계약 대기", dueIn: 1, priority: 2, link: "/campaigns/1?tab=contract", completed: false },
  { id: "3", title: "콘텐츠 업로드 확인", campaignName: "서머 런칭 2025", influencerName: "인플루언서 3", status: "업로드 예정", dueIn: 2, priority: 3, link: "/campaigns/1?tab=content", completed: false },
  { id: "4", title: "미응답 인플루언서 팔로업", campaignName: "가을 캠페인", influencerName: "인플루언서 4", status: "미응답", dueIn: -1, priority: 1, link: "/campaigns/2?tab=communication", completed: false },
  { id: "5", title: "정산 정보 수집", campaignName: "서머 런칭 2025", influencerName: "인플루언서 5", status: "정보 미수집", dueIn: 3, priority: 4, link: "/finance?settlementStatus=정보미수집", completed: false },
  { id: "6", title: "트래킹 지표 확인", campaignName: "가을 캠페인", influencerName: "인플루언서 6", status: "지표 수집 중", dueIn: 0, priority: 2, link: "/tracking", completed: false },
];

const SAMPLE_THREADS: CommunicationThread[] = [
  { id: "1", influencerName: "인플루언서 1", campaignName: "서머 런칭 2025", lastMessage: "안녕하세요, 초안 검토 부탁드립니다.", time: "2시간 전", status: "replied" },
  { id: "2", influencerName: "인플루언서 2", campaignName: "서머 런칭 2025", lastMessage: "계약서 확인 후 서명 부탁드립니다.", time: "1일 전", status: "noResponse" },
  { id: "3", influencerName: "인플루언서 4", campaignName: "가을 캠페인", lastMessage: "협업 제안 드립니다.", time: "3일 전", status: "noResponse" },
  { id: "4", influencerName: "인플루언서 3", campaignName: "서머 런칭 2025", lastMessage: "업로드 일정 확인 부탁드립니다.", time: "5시간 전", status: "replied" },
  { id: "5", influencerName: "인플루언서 5", campaignName: "서머 런칭 2025", lastMessage: "정산 정보 요청드립니다.", time: "1일 전", status: "failed" },
];

const SAMPLE_RISKS: RiskItem[] = [
  { id: "1", type: "trackingError", message: "인플루언서 3의 Instagram 트래킹 수집 실패", link: "/tracking?hasIssue=true" },
  { id: "2", type: "contentPrivate", message: "인플루언서 2의 콘텐츠가 비공개로 전환됨", link: "/tracking?hasIssue=true" },
  { id: "3", type: "contractIncomplete", message: "인플루언서 4 - 계약 미완료 상태에서 콘텐츠 진행 중", link: "/campaigns/2?tab=contract" },
  { id: "4", type: "settlementUrgent", message: "인플루언서 1 - 정산 정보 미수집, 지급일 D-3", link: "/finance?settlementStatus=지급대기" },
];

const STORAGE_KEY = "overview_completed_tasks";

export default function Home() {
  const { data: user } = useUser();
  const [, navigate] = useLocation();
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const savedCompleted = localStorage.getItem(STORAGE_KEY);
    const completedIds = savedCompleted ? JSON.parse(savedCompleted) : [];
    const tasksWithCompleted = SAMPLE_TASKS.map(task => ({
      ...task,
      completed: completedIds.includes(task.id)
    }));
    setTasks(tasksWithCompleted);
  }, []);

  const handleTaskToggle = (taskId: string) => {
    setTasks(prev => {
      const updated = prev.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t);
      const completedIds = updated.filter(t => t.completed).map(t => t.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completedIds));
      return updated;
    });
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.priority - b.priority;
  });

  const kpiData = {
    activeCampaigns: 3,
    pendingResponses: 5,
    issuesCount: 4,
    upcomingContent: 7,
    pendingSettlement: 2500000,
  };

  const contentStats = {
    draftWaiting: 3,
    feedbackWaiting: 2,
    uploadScheduled: 4,
    uploadCompleted: 8,
  };

  const commStats = {
    newReplies: 2,
    noResponse: 3,
  };

  const getDueBadge = (dueIn: number) => {
    if (dueIn < 0) return <Badge variant="destructive" className="text-xs">{KO.pages.home.todaysTasks.delayed}</Badge>;
    if (dueIn === 0) return <Badge variant="destructive" className="text-xs">{KO.pages.home.todaysTasks.dDay}-0</Badge>;
    if (dueIn <= 3) return <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">{KO.pages.home.todaysTasks.dDay}-{dueIn}</Badge>;
    return <Badge variant="secondary" className="text-xs">{KO.pages.home.todaysTasks.dDay}-{dueIn}</Badge>;
  };

  const getStatusBadge = (status: "replied" | "noResponse" | "failed") => {
    switch (status) {
      case "replied": return <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">{KO.pages.communication.replied}</Badge>;
      case "noResponse": return <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">{KO.pages.communication.noResponse}</Badge>;
      case "failed": return <Badge variant="destructive" className="text-xs">{KO.pages.communication.failed}</Badge>;
    }
  };

  const getRiskIcon = (type: RiskItem["type"]) => {
    switch (type) {
      case "trackingError": return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "contentPrivate": return <Eye className="w-4 h-4 text-orange-500" />;
      case "contractIncomplete": return <FileWarning className="w-4 h-4 text-yellow-500" />;
      case "settlementUrgent": return <CreditCard className="w-4 h-4 text-purple-500" />;
    }
  };

  const getRiskBadge = (type: RiskItem["type"]) => {
    const labels: Record<RiskItem["type"], string> = {
      trackingError: KO.pages.home.risks.trackingError,
      contentPrivate: KO.pages.home.risks.contentPrivate,
      contractIncomplete: KO.pages.home.risks.contractIncomplete,
      settlementUrgent: KO.pages.home.risks.settlementUrgent,
    };
    const colors: Record<RiskItem["type"], string> = {
      trackingError: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
      contentPrivate: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
      contractIncomplete: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
      settlementUrgent: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    };
    return <Badge variant="secondary" className={`text-xs ${colors[type]}`}>{labels[type]}</Badge>;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(amount);
  };

  const kpiCards = [
    { label: KO.pages.home.kpi.activeCampaigns, value: kpiData.activeCampaigns, unit: KO.pages.home.kpi.count, icon: Megaphone, color: "text-purple-500", bg: "bg-purple-100 dark:bg-purple-900", href: "/campaigns?campaignStatus=진행중" },
    { label: KO.pages.home.kpi.pendingResponses, value: kpiData.pendingResponses, unit: KO.pages.home.kpi.people, icon: MessageSquare, color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900", href: "/campaigns?commStatus=미응답" },
    { label: KO.pages.home.kpi.issuesCount, value: kpiData.issuesCount, unit: KO.pages.home.kpi.count, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-100 dark:bg-red-900", href: "/tracking?hasIssue=true" },
    { label: KO.pages.home.kpi.upcomingContent, value: kpiData.upcomingContent, unit: KO.pages.home.kpi.count, icon: Upload, color: "text-green-500", bg: "bg-green-100 dark:bg-green-900", href: "/campaigns?contentStatus=업로드예정&dueIn=7" },
    { label: KO.pages.home.kpi.pendingSettlement, value: formatCurrency(kpiData.pendingSettlement), unit: "", icon: Wallet, color: "text-orange-500", bg: "bg-orange-100 dark:bg-orange-900", href: "/finance?settlementStatus=지급대기" },
  ];

  return (
    <Layout>
      <div className="space-y-6 md:space-y-8 max-w-[1400px] mx-auto">
        <div className="relative overflow-hidden rounded-xl md:rounded-2xl bg-gradient-to-r from-primary to-blue-600 p-4 md:p-8 text-white shadow-xl">
          <div className="relative z-10">
            <h1 className="text-xl md:text-3xl font-bold font-display mb-1 md:mb-2" data-testid="text-welcome-title">
              {KO.pages.home.welcomeBack}, {user?.name?.split(' ')[0] || 'User'}!
            </h1>
            <p className="text-blue-100 max-w-xl text-sm md:text-base mb-4" data-testid="text-welcome-subtitle">
              {KO.pages.home.activeCampaigns} {kpiData.activeCampaigns}개 · {KO.pages.home.pendingResponses} {kpiData.pendingResponses}명 · {KO.pages.home.todayTasks} {tasks.filter(t => t.dueIn <= 0 && !t.completed).length}개
            </p>
            <Link href="/campaigns">
              <Button size="sm" variant="secondary" className="font-semibold shadow-lg" data-testid="button-go-campaigns">
                {KO.pages.home.goToCampaigns} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="absolute right-0 top-0 h-full w-1/2 bg-[url('https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=800&q=80')] bg-cover opacity-10 mix-blend-overlay"></div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {kpiCards.map((kpi, index) => (
            <Link key={index} href={kpi.href}>
              <Card className="cursor-pointer hover-elevate h-full" data-testid={`card-kpi-${index}`}>
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                      <p className="text-lg md:text-2xl font-bold mt-1">{kpi.value}<span className="text-xs md:text-sm font-normal text-muted-foreground ml-0.5">{kpi.unit}</span></p>
                    </div>
                    <div className={`p-2 rounded-full ${kpi.bg} shrink-0`}>
                      <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground absolute bottom-2 right-2 opacity-50" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base md:text-lg" data-testid="text-tasks-title">{KO.pages.home.todaysTasks.title}</CardTitle>
                <CardDescription className="text-xs md:text-sm">{KO.pages.home.todaysTasks.subtitle}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {sortedTasks.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">{KO.pages.home.todaysTasks.empty}</p>
                ) : (
                  sortedTasks.map((task) => (
                    <div key={task.id} className={`flex items-start gap-3 p-3 rounded-lg border ${task.completed ? 'bg-muted/50 opacity-60' : 'bg-card'}`} data-testid={`task-item-${task.id}`}>
                      <Checkbox 
                        checked={task.completed} 
                        onCheckedChange={() => handleTaskToggle(task.id)}
                        className="mt-0.5"
                        data-testid={`checkbox-task-${task.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>{task.title}</span>
                          {getDueBadge(task.dueIn)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {task.campaignName} · {task.influencerName} · {task.status}
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="shrink-0"
                        onClick={() => navigate(task.link)}
                        data-testid={`button-task-goto-${task.id}`}
                      >
                        {KO.pages.home.todaysTasks.goTo}
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base md:text-lg">{KO.pages.home.communication.title}</CardTitle>
                  <Link href="/email">
                    <Button variant="ghost" size="sm" data-testid="button-comm-viewall">
                      {KO.pages.home.communication.viewAll}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 mb-4">
                  <div className="flex-1 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{commStats.newReplies}</p>
                    <p className="text-xs text-muted-foreground">{KO.pages.home.communication.newReplies}</p>
                  </div>
                  <div className="flex-1 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-center">
                    <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{commStats.noResponse}</p>
                    <p className="text-xs text-muted-foreground">{KO.pages.home.communication.noResponse}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{KO.pages.home.communication.recentThreads}</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {SAMPLE_THREADS.slice(0, 5).map((thread) => (
                    <Link key={thread.id} href={`/campaigns/1?tab=communication`}>
                      <div className="flex items-center gap-2 p-2 rounded-md hover-elevate cursor-pointer" data-testid={`thread-item-${thread.id}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{thread.influencerName}</p>
                          <p className="text-xs text-muted-foreground truncate">{thread.campaignName} · {thread.time}</p>
                        </div>
                        {getStatusBadge(thread.status)}
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base md:text-lg">{KO.pages.home.content.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/campaigns?contentStatus=초안대기">
                    <div className="p-3 rounded-lg border hover-elevate cursor-pointer text-center" data-testid="content-stat-draft">
                      <p className="text-xl font-bold">{contentStats.draftWaiting}</p>
                      <p className="text-xs text-muted-foreground">{KO.pages.home.content.draftWaiting}</p>
                    </div>
                  </Link>
                  <Link href="/campaigns?contentStatus=피드백대기">
                    <div className="p-3 rounded-lg border hover-elevate cursor-pointer text-center" data-testid="content-stat-feedback">
                      <p className="text-xl font-bold">{contentStats.feedbackWaiting}</p>
                      <p className="text-xs text-muted-foreground">{KO.pages.home.content.feedbackWaiting}</p>
                    </div>
                  </Link>
                  <Link href="/campaigns?contentStatus=업로드예정&dueIn=3">
                    <div className="p-3 rounded-lg border hover-elevate cursor-pointer text-center" data-testid="content-stat-scheduled">
                      <p className="text-xl font-bold">{contentStats.uploadScheduled}</p>
                      <p className="text-xs text-muted-foreground">{KO.pages.home.content.uploadScheduled}</p>
                    </div>
                  </Link>
                  <Link href="/campaigns?contentStatus=업로드완료">
                    <div className="p-3 rounded-lg border hover-elevate cursor-pointer text-center" data-testid="content-stat-completed">
                      <p className="text-xl font-bold">{contentStats.uploadCompleted}</p>
                      <p className="text-xs text-muted-foreground">{KO.pages.home.content.uploadCompleted}</p>
                    </div>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                <CardTitle className="text-base md:text-lg">{KO.pages.home.risks.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {SAMPLE_RISKS.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">{KO.pages.home.risks.noIssues}</p>
              ) : (
                <div className="space-y-2">
                  {SAMPLE_RISKS.map((risk) => (
                    <div key={risk.id} className="flex items-center gap-3 p-3 rounded-lg border" data-testid={`risk-item-${risk.id}`}>
                      {getRiskIcon(risk.type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {getRiskBadge(risk.type)}
                        </div>
                        <p className="text-sm truncate">{risk.message}</p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate(risk.link)}
                        data-testid={`button-risk-open-${risk.id}`}
                      >
                        {KO.pages.home.risks.open}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base md:text-lg">{KO.pages.home.recentActivity}</CardTitle>
                <Button variant="ghost" size="sm" data-testid="button-activity-more">
                  {KO.pages.home.viewMore}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
              <CardDescription className="text-xs">{KO.pages.home.latestUpdates}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { text: "인플루언서 1이 '서머 런칭 2025'에 추가되었습니다", time: "2시간 전", by: "Admin" },
                  { text: "인플루언서 2의 계약서가 서명되었습니다", time: "4시간 전", by: "Manager" },
                  { text: "가을 캠페인이 생성되었습니다", time: "1일 전", by: "Admin" },
                  { text: "인플루언서 3의 콘텐츠가 업로드되었습니다", time: "2일 전", by: "Coordinator" },
                ].map((activity, i) => (
                  <div key={i} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{activity.text}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {activity.time} · {activity.by}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
