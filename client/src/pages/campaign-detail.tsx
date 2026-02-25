import Layout from "@/components/layout";
import {
  useCampaign,
  useUpdateCampaign,
  useUpdateCampaignItem,
  useDeleteCampaignItem,
  useAddInfluencersToCampaign,
  useCampaignContents,
  useCreateCampaignContent,
  useUpdateCampaignContent,
  useDeleteCampaignContent,
  useDeleteCampaign,
} from "@/hooks/use-campaigns";
import { useInfluencers } from "@/hooks/use-influencers";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  CircleDot,
  CircleDollarSign,
  FileText,
  Plus,
  Search,
  Users,
  Instagram,
  Youtube,
  Twitter,
  Save,
  MessageCircle,
  ExternalLink,
  Eye,
  Heart,
  MessageSquare,
  Share2,
  Trash2,
  Edit3,
  Image,
  Pencil,
  Calendar,
  Copy,
  Upload,
  Settings,
  UserCheck,
  FileSignature,
  Film,
  Wallet,
  AlertCircle,
  PauseCircle,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Link } from "wouter";
import { format } from "date-fns";
import { KO } from "@/i18n/ko";
import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type {
  CampaignLineItem,
  CampaignContentWithInfluencer,
} from "@/hooks/use-campaigns";
import { CampaignCommunication } from "@/components/campaign-communication";
import { CampaignOperations } from "@/components/campaign-operations";
import { CampaignContents } from "@/components/campaign-contents";
import type { CampaignContent } from "@shared/schema";
import { Settings2 } from "lucide-react";

interface Client {
  id: number;
  workspaceId: number;
  name: string;
  logoUrl?: string | null;
}

const STEPS = [
  { key: "waiting", label: "대기" },
  { key: "contacted", label: "컨택" },
  { key: "confirmed", label: "확정" },
  { key: "contracted", label: "계약" },
] as const;

function StepProgressBar({
  status,
  itemId,
  item,
  onStatusChange,
  campaignId,
}: {
  status: string;
  itemId: number;
  item: any;
  onStatusChange: (newStatus: string) => void;
  campaignId: number;
}) {
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    targetStatus: string;
    type: "contact_no_thread" | "confirm_missing" | null;
  }>({ open: false, targetStatus: "", type: null });
  const { toast } = useToast();

  const isOnHold = status === "on_hold";
  const currentIndex = STEPS.findIndex((s) => s.key === status);

  const handleStepClick = async (stepKey: string) => {
    if (stepKey === status) return;

    if (stepKey === "on_hold") {
      onStatusChange(stepKey);
      return;
    }

    const targetIndex = STEPS.findIndex((s) => s.key === stepKey);

    if (isOnHold || targetIndex < currentIndex) {
      onStatusChange(stepKey);
      return;
    }

    if (targetIndex >= 1 && currentIndex < 1) {
      try {
        const res = await fetch(
          `/api/campaigns/${campaignId}/line-items/${itemId}/has-thread`,
        );
        const data = await res.json();
        if (!data.hasThread) {
          setConfirmDialog({
            open: true,
            targetStatus: stepKey,
            type: "contact_no_thread",
          });
          return;
        }
      } catch {
        setConfirmDialog({
          open: true,
          targetStatus: stepKey,
          type: "contact_no_thread",
        });
        return;
      }
    }

    if (targetIndex >= 2) {
      const hasFee = item.offerFee && item.offerFee > 0;
      const hasUploadDate = !!item.uploadDueAt;
      if (!hasFee || !hasUploadDate) {
        setConfirmDialog({
          open: true,
          targetStatus: stepKey,
          type: "confirm_missing",
        });
        return;
      }
    }

    onStatusChange(stepKey);
  };

  return (
    <>
      <div
        className="inline-flex items-center gap-0.5 rounded-md bg-muted dark:bg-muted/60 p-0.5"
        data-testid={`progress-bar-${itemId}`}
      >
        {STEPS.map((step, idx) => {
          const isCurrent = !isOnHold && step.key === status;
          const isCompleted = !isOnHold && idx < currentIndex;

          return (
            <Button
              key={step.key}
              variant={isCurrent ? "default" : "ghost"}
              size="sm"
              onClick={() => handleStepClick(step.key)}
              className={`gap-1 ${isCompleted ? "text-primary font-medium" : ""} ${isOnHold ? "opacity-40" : ""}`}
              data-testid={`step-${step.key}-${itemId}`}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : isCurrent ? (
                <CircleDot className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 shrink-0" />
              )}
              {step.label}
            </Button>
          );
        })}
        <div className="w-px h-5 bg-border mx-0.5" />
        <Button
          variant={isOnHold ? "default" : "ghost"}
          size="sm"
          onClick={() => handleStepClick("on_hold")}
          className={`gap-1 ${isOnHold ? "bg-gray-500 hover:bg-gray-600 text-white" : "text-gray-400 hover:text-gray-600"}`}
          data-testid={`step-on_hold-${itemId}`}
        >
          <PauseCircle className="w-3.5 h-3.5 shrink-0" />
          보류
        </Button>
      </div>

      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) =>
          !open &&
          setConfirmDialog({ open: false, targetStatus: "", type: null })
        }
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.type === "contact_no_thread"
                ? "컨택 확인"
                : "확정 불가"}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.type === "contact_no_thread"
                ? "메일에 컨택내역이 없습니다. 컨택으로 기록할까요?"
                : "확정 처리 전 광고비와 업로드 일정을 입력해주세요"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            {confirmDialog.type === "contact_no_thread" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() =>
                    setConfirmDialog({
                      open: false,
                      targetStatus: "",
                      type: null,
                    })
                  }
                  data-testid="button-cancel-contact"
                >
                  취소
                </Button>
                <Button
                  onClick={() => {
                    onStatusChange(confirmDialog.targetStatus);
                    setConfirmDialog({
                      open: false,
                      targetStatus: "",
                      type: null,
                    });
                  }}
                  data-testid="button-confirm-contact"
                >
                  확인
                </Button>
              </>
            ) : (
              <Button
                onClick={() =>
                  setConfirmDialog({
                    open: false,
                    targetStatus: "",
                    type: null,
                  })
                }
                data-testid="button-ok-confirm"
              >
                확인
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CampaignDetail() {
  const [, params] = useRoute("/campaigns/:id");
  const id = Number(params?.id);
  const { data: campaign, isLoading } = useCampaign(id);
  const { data: workspaces } = useWorkspaces();
  const workspaceId = workspaces?.[0]?.id;
  const updateItem = useUpdateCampaignItem(id);
  const updateCampaign = useUpdateCampaign();
  const { toast } = useToast();

  const { data: clients } = useQuery<Client[]>({
    queryKey: [`/api/clients?workspaceId=${workspaceId}`],
    enabled: !!workspaceId,
  });

  const [, navigate] = useLocation();
  const deleteCampaign = useDeleteCampaign();
  const deleteItem = useDeleteCampaignItem(id);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedLineItem, setSelectedLineItem] =
    useState<CampaignLineItem | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [isDeleteCampaignOpen, setIsDeleteCampaignOpen] = useState(false);
  const [editingCampaignName, setEditingCampaignName] = useState("");
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [isDeleteInfluencerOpen, setIsDeleteInfluencerOpen] = useState(false);
  const [selectedInfluencerIds, setSelectedInfluencerIds] = useState<
    Set<number>
  >(new Set());
  const [activeTab, setActiveTab] = useState("influencers");
  const [editingTabDesc, setEditingTabDesc] = useState<string | null>(null);
  const [editingTabDescValue, setEditingTabDescValue] = useState("");

  const { data: myRoleData } = useQuery<{
    userId: number;
    role: string;
    assignedClientIds: number[];
  }>({
    queryKey: [`/api/workspace-users/me?workspaceId=${workspaceId}`],
    enabled: !!workspaceId,
  });
  const isOwner = myRoleData?.role === "WORKSPACE_OWNER";

  const defaultTabDescriptions: Record<string, string> = {
    influencers:
      "캠페인에 딱 맞는 인플루언서를 고르고, 단가 / 업로드 일정 / 진행단계를 한눈에 확인하세요!",
    communication:
      "한 번에 단체 이메일 보내고, 답장 확인하고, 일정 및 단가 등록까지. 커뮤니케이션을 여기서 한 번에 해결하세요.",
    operations:
      "계약서 작성부터, 자동 메일 전달까지. 복잡한 서류관련 작업을 한 번에 편리하게 해요.",
    content:
      "<제출 링크>를 인플루언서가 공유받고, 그 링크에 콘텐츠를 올리면 (1) 자동으로 Onedrive에 콘텐츠가 인플루언서별 폴더에 저장되고 (2) 우리는 대시보드에서 한 눈에 제출현황과 파일을 확인할 수 있어요. 초안 확인, 업로드 일정, 검수까지 한 곳에서.",
    finance:
      "누구에게 얼마를 지급해야 하는지, 한눈에 파악하세요. 정산 정보와 사업자 여부, 입금여부 등 빠짐없이 관리할 수 있어요.",
  };

  const campaignWorkspaceId = (campaign as any)?.workspaceId || workspaceId;
  const currentWorkspace = workspaces?.find(
    (w) => w.id === campaignWorkspaceId,
  );

  const getTabDescription = (tab: string) => {
    const custom = (currentWorkspace as any)?.tabDescriptions;
    if (custom && typeof custom === "object" && custom[tab])
      return custom[tab] as string;
    return defaultTabDescriptions[tab] || "";
  };

  const handleSaveTabDescription = async (tab: string, value: string) => {
    if (!campaignWorkspaceId) return;
    const current = (currentWorkspace as any)?.tabDescriptions || {};
    const updated = { ...current, [tab]: value || undefined };
    if (!value) delete updated[tab];
    try {
      const res = await fetch(`/api/workspaces/${campaignWorkspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabDescriptions: updated }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      toast({ title: "탭 설명이 저장되었습니다." });
      setEditingTabDesc(null);
    } catch {
      toast({ variant: "destructive", title: "저장 실패" });
    }
  };

  const handleClientChange = () => {
    if (!selectedClientId) return;
    const selectedClient = clients?.find(
      (c) => c.id === parseInt(selectedClientId),
    );
    updateCampaign.mutate(
      {
        id,
        data: {
          clientId: parseInt(selectedClientId),
          client: selectedClient?.name || "",
        },
      },
      {
        onSuccess: () => {
          toast({ title: "클라이언트가 변경되었습니다." });
          setSelectedClientId("");
        },
        onError: () => {
          toast({ variant: "destructive", title: "변경 실패" });
        },
      },
    );
  };

  const handleStatusChange = (newStatus: string) => {
    updateCampaign.mutate(
      {
        id,
        data: { status: newStatus },
      },
      {
        onSuccess: () => {
          toast({ title: "캠페인 상태가 변경되었습니다." });
        },
        onError: () => {
          toast({ variant: "destructive", title: "변경 실패" });
        },
      },
    );
  };

  const handleDeleteCampaign = () => {
    deleteCampaign.mutate(id, {
      onSuccess: () => {
        toast({ title: "캠페인이 삭제되었습니다." });
        navigate("/campaigns");
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "삭제 실패",
          description: "캠페인 삭제 중 오류가 발생했습니다.",
        });
      },
    });
  };

  const handleDeleteSelectedInfluencers = async () => {
    const itemsToDelete =
      campaign?.items?.filter((item) => selectedInfluencerIds.has(item.id)) ||
      [];
    let successCount = 0;
    for (const item of itemsToDelete) {
      try {
        await new Promise<void>((resolve, reject) => {
          deleteItem.mutate(item.id, {
            onSuccess: () => {
              successCount++;
              resolve();
            },
            onError: (err) => reject(err),
          });
        });
      } catch (e) {
        // continue with others
      }
    }
    setSelectedInfluencerIds(new Set());
    setIsDeleteInfluencerOpen(false);
    toast({
      title: `${successCount}명의 인플루언서가 캠페인에서 제외되었습니다.`,
    });
  };

  const toggleInfluencerSelection = (itemId: number) => {
    const newSelected = new Set(selectedInfluencerIds);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedInfluencerIds(newSelected);
  };

  const selectAllInfluencers = () => {
    if (!campaign?.items) return;
    if (selectedInfluencerIds.size === campaign.items.length) {
      setSelectedInfluencerIds(new Set());
    } else {
      setSelectedInfluencerIds(new Set(campaign.items.map((i) => i.id)));
    }
  };

  // Content tab state
  const { data: contents, isLoading: contentsLoading } =
    useCampaignContents(id);
  const createContent = useCreateCampaignContent(id);
  const updateContent = useUpdateCampaignContent(id);
  const deleteContent = useDeleteCampaignContent(id);
  const [isContentModalOpen, setIsContentModalOpen] = useState(false);
  const [editingContent, setEditingContent] =
    useState<CampaignContentWithInfluencer | null>(null);
  const [contentForm, setContentForm] = useState({
    lineItemId: 0,
    influencerId: 0,
    platform: "IG",
    contentUrl: "",
    thumbnailUrl: "",
    publishedAt: "",
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    engagementRate: "",
    memo: "",
  });

  if (isLoading)
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          {KO.common.loading}
        </div>
      </Layout>
    );
  if (!campaign)
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          캠페인을 찾을 수 없습니다
        </div>
      </Layout>
    );

  const totalSpend =
    campaign.items?.reduce((acc, item) => acc + (item.offerFee || 0), 0) || 0;
  const budgetUtilization = campaign.budget
    ? Math.round((totalSpend / campaign.budget) * 100)
    : 0;
  const contractedCount =
    campaign.items?.filter((i) => i.contractStatus === "signed").length || 0;
  const paidCount =
    campaign.items?.filter((i) => i.paymentStatus === "paid").length || 0;

  const STATUS_PRIORITY: Record<string, number> = {
    contracted: 0,
    confirmed: 1,
    contacted: 2,
    waiting: 3,
  };
  const sortedItems = [...(campaign.items || [])].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status || "waiting"] ?? 99;
    const pb = STATUS_PRIORITY[b.status || "waiting"] ?? 99;
    return pa - pb;
  });
  const confirmedItems = (campaign.items || []).filter(
    (i) => i.status === "confirmed" || i.status === "contracted",
  );

  const handleStatusUpdate = (
    itemId: number,
    field: string,
    value: string | number | boolean | Date | null,
  ) => {
    const item = campaign.items?.find((i) => i.id === itemId);
    const updates: Record<string, any> = { [field]: value };

    if (field === "payoutAmountSupply" || field === "payoutVat") {
      const supply =
        field === "payoutAmountSupply"
          ? (value as number)
          : item?.payoutAmountSupply || 0;
      const vat =
        field === "payoutVat" ? (value as number) : item?.payoutVat || 0;
      updates.payoutTotal = supply + vat;
    }

    updateItem.mutate(
      { id: itemId, updates },
      {
        onSuccess: () => toast({ title: "상태가 업데이트되었습니다." }),
      },
    );
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "waiting":
        return "대기";
      case "contacted":
        return "컨택";
      case "confirmed":
        return "확정";
      case "contracted":
        return "계약";
      default:
        return status;
    }
  };

  const getContractLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "대기 중";
      case "sent":
        return "발송됨";
      case "signed":
        return "서명 완료";
      default:
        return status;
    }
  };

  const getPaymentLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "대기 중";
      case "invoiced":
        return "청구됨";
      case "paid":
        return "지급 완료";
      default:
        return status;
    }
  };

  const PlatformIcon = ({ p }: { p: string }) => {
    switch (p) {
      case "IG":
        return <Instagram className="w-4 h-4 text-pink-600" />;
      case "YT":
        return <Youtube className="w-4 h-4 text-red-600" />;
      case "X":
        return <Twitter className="w-4 h-4 text-blue-400" />;
      default:
        return <span className="text-xs font-bold">{p}</span>;
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-3">
        <Link
          href="/campaigns"
          className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
          data-testid="link-back"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> 캠페인 목록으로
        </Link>

        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              {(() => {
                const client = clients?.find((c) => c.id === campaign.clientId);
                return client?.logoUrl ? (
                  <img
                    src={client.logoUrl}
                    alt={client.name}
                    className="w-12 h-12 rounded-xl object-cover border shrink-0"
                  />
                ) : null;
              })()}
              <h1 className="text-2xl font-bold tracking-tight">
                {campaign.name}
              </h1>
              <Badge
                variant="outline"
                className={`text-sm ${
                  campaign.status === "진행중"
                    ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
                    : campaign.status === "완료"
                      ? "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700"
                      : "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800"
                }`}
                data-testid="badge-campaign-status"
              >
                {campaign.status || "대기중"}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-muted-foreground text-sm">
                클라이언트: {campaign.client || "미설정"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">인플루언서</span>
                <span className="font-semibold">
                  {campaign.items?.length || 0}명
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">계약</span>
                <span className="font-semibold">{contractedCount}건</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">지급</span>
                <span className="font-semibold">{paidCount}건</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CircleDollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">집행</span>
                <span className="font-semibold">
                  {totalSpend.toLocaleString()}원
                </span>
              </div>
            </div>
            <div className="hidden md:block h-8 w-px bg-border" />
            <div className="text-right">
              <div className="text-xs text-muted-foreground">총 예산</div>
              <div className="text-lg font-bold font-mono">
                {campaign.budget?.toLocaleString()}원
              </div>
              <div className="text-xs text-muted-foreground">
                사용률: {budgetUtilization}%
              </div>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-0 flex-wrap gap-1 w-full justify-start">
            <TabsTrigger
              value="influencers"
              className="flex items-center gap-1"
            >
              <UserCheck className="w-4 h-4" />
              선정
            </TabsTrigger>
            <TabsTrigger
              value="communication"
              className="flex items-center gap-1"
            >
              <MessageCircle className="w-4 h-4" />
              컨택
            </TabsTrigger>
            <TabsTrigger value="operations" className="flex items-center gap-1">
              <FileSignature className="w-4 h-4" />
              계약
            </TabsTrigger>
            <TabsTrigger value="content" className="flex items-center gap-1">
              <Film className="w-4 h-4" />
              제작
            </TabsTrigger>
            <TabsTrigger value="finance" className="flex items-center gap-1">
              <Wallet className="w-4 h-4" />
              정산
            </TabsTrigger>
            <div className="flex-1" />
            <TabsTrigger value="settings" className="flex items-center gap-1">
              <Settings className="w-4 h-4" />
              설정
            </TabsTrigger>
          </TabsList>
          {getTabDescription(activeTab) && (
            <div
              className="mb-4 mt-2 px-3 py-2.5 rounded-md border border-border/50 bg-[#fffbed]"
              data-testid="tab-description-banner"
            >
              {editingTabDesc === activeTab ? (
                <div className="space-y-2">
                  <Textarea
                    value={editingTabDescValue}
                    onChange={(e) => setEditingTabDescValue(e.target.value)}
                    className="text-xs min-h-[60px] resize-y"
                    placeholder="탭 설명을 입력하세요..."
                    data-testid="input-tab-description"
                    autoFocus
                  />
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingTabDesc(null)}
                      data-testid="button-cancel-tab-description"
                    >
                      취소
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        handleSaveTabDescription(activeTab, editingTabDescValue)
                      }
                      disabled={updateCampaign.isPending}
                      data-testid="button-save-tab-description"
                    >
                      <Save className="w-3.5 h-3.5 mr-1" />
                      저장
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className={`group flex items-start gap-2 ${isOwner ? "cursor-pointer" : ""}`}
                  onClick={() => {
                    if (!isOwner) return;
                    setEditingTabDesc(activeTab);
                    setEditingTabDescValue(getTabDescription(activeTab));
                  }}
                  data-testid="tab-description-text"
                >
                  <p className="whitespace-pre-line flex-1 text-[13px] text-[#363636] font-medium">
                    {getTabDescription(activeTab)}
                  </p>
                  {isOwner && (
                    <Pencil className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-0.5 invisible group-hover:visible" />
                  )}
                </div>
              )}
            </div>
          )}

          <TabsContent value="influencers">
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center gap-2 px-4 py-2 border-b">
                  <Button
                    size="icon"
                    onClick={() => setIsAddModalOpen(true)}
                    data-testid="button-add-campaign-influencer"
                    aria-label="인플루언서 추가"
                  >
                    <Plus />
                  </Button>
                  {selectedInfluencerIds.size > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/50"
                      onClick={() => setIsDeleteInfluencerOpen(true)}
                      data-testid="button-remove-campaign-influencer"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {selectedInfluencerIds.size}명 제외
                    </Button>
                  )}
                </div>
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={
                              campaign.items &&
                              campaign.items.length > 0 &&
                              selectedInfluencerIds.size ===
                                campaign.items.length
                            }
                            onCheckedChange={selectAllInfluencers}
                            data-testid="checkbox-select-all-influencers"
                          />
                        </TableHead>
                        <TableHead>인플루언서</TableHead>
                        <TableHead className="text-right">팔로워</TableHead>
                        <TableHead>채널</TableHead>
                        <TableHead>메모</TableHead>
                        <TableHead>진행 단계</TableHead>
                        <TableHead className="text-right">
                          광고료(VAT+)
                        </TableHead>
                        <TableHead>초안 예정일</TableHead>
                        <TableHead>업로드 예정일</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedItems.map((item) => (
                        <TableRow
                          key={item.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedLineItem(item)}
                          data-testid={`row-campaign-item-${item.id}`}
                        >
                          <TableCell
                            className="py-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={selectedInfluencerIds.has(item.id)}
                              onCheckedChange={() =>
                                toggleInfluencerSelection(item.id)
                              }
                              data-testid={`checkbox-influencer-${item.id}`}
                            />
                          </TableCell>
                          <TableCell className="py-1.5">
                            <div>
                              <div className="font-medium">
                                {item.influencer?.name ||
                                  `인플루언서 #${item.influencerId}`}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {item.influencer?.email}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                            {(() => {
                              const totalFollowers =
                                item.influencer?.accounts?.reduce(
                                  (sum: number, acc: any) =>
                                    sum + (acc.followers || 0),
                                  0,
                                ) || 0;
                              if (totalFollowers === 0) return "-";
                              if (totalFollowers >= 10000)
                                return `${(totalFollowers / 10000).toFixed(1)}만`;
                              if (totalFollowers >= 1000)
                                return `${(totalFollowers / 1000).toFixed(1)}천`;
                              return totalFollowers.toLocaleString();
                            })()}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1">
                              {item.influencer?.accounts?.map((acc) => (
                                <a
                                  key={acc.id}
                                  href={acc.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  data-testid={`link-channel-${acc.platform}-${item.id}`}
                                >
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                  >
                                    <PlatformIcon p={acc.platform} />
                                  </Button>
                                </a>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div
                              className="max-w-[150px] text-xs text-muted-foreground line-clamp-2"
                              data-testid={`text-memo-${item.id}`}
                            >
                              {item.influencer?.memo || "-"}
                            </div>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <StepProgressBar
                              status={item.status || "waiting"}
                              itemId={item.id}
                              item={item}
                              onStatusChange={(newStatus) =>
                                handleStatusUpdate(item.id, "status", newStatus)
                              }
                              campaignId={id}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {item.offerFee?.toLocaleString() || "-"}원
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.draftDueAt
                              ? new Date(item.draftDueAt).toLocaleDateString(
                                  "ko-KR",
                                  { month: "short", day: "numeric" },
                                )
                              : "-"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.uploadDueAt
                              ? new Date(item.uploadDueAt).toLocaleDateString(
                                  "ko-KR",
                                  { month: "short", day: "numeric" },
                                )
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!campaign.items?.length && (
                        <TableRow>
                          <TableCell
                            colSpan={9}
                            className="text-center py-8 text-muted-foreground"
                          >
                            이 캠페인에 아직 인플루언서가 없습니다.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="communication">
            <CampaignCommunication
              campaignId={id}
              campaignName={campaign.name}
              workspaceId={workspaceId || 1}
              lineItems={
                campaign.items?.map((item) => ({
                  id: item.id,
                  campaignId: item.campaignId,
                  influencerId: item.influencerId,
                  status: item.status,
                  offerFee: item.offerFee,
                  draftDueAt: item.draftDueAt ? new Date(item.draftDueAt).toISOString() : null,
                  uploadDueAt: item.uploadDueAt ? new Date(item.uploadDueAt).toISOString() : null,
                  firstContactCompleted: item.firstContactCompleted,
                  firstContactAt: item.firstContactAt ? new Date(item.firstContactAt).toISOString() : null,
                  firstContactMethod: item.firstContactMethod,
                  offerUsageMonths: item.offerUsageMonths,
                  offerUsageRenewalFee: item.offerUsageRenewalFee,
                  stage: item.stage,
                  influencer: item.influencer,
                })) || []
              }
            />
          </TabsContent>

          <TabsContent value="operations">
            <div
              className="mb-3 px-3 py-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800/50"
              data-testid="confirmed-filter-notice-operations"
            >
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                <AlertCircle className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                진행 단계가 '확정' 이상인 사람들만 목록에 표시합니다. 찾는
                인플루언서가 없을 경우 선정 탭에서 '확정'으로 설정해주세요.
              </p>
            </div>
            <CampaignOperations
              campaignId={id}
              workspaceId={workspaceId || 1}
              lineItems={confirmedItems}
            />
          </TabsContent>

          <TabsContent value="content">
            <div
              className="mb-3 px-3 py-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800/50"
              data-testid="confirmed-filter-notice-content"
            >
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                <AlertCircle className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                진행 단계가 '확정' 이상인 사람들만 목록에 표시합니다. 찾는
                인플루언서가 없을 경우 선정 탭에서 '확정'으로 설정해주세요.
              </p>
            </div>
            <CampaignContents
              campaignId={id}
              lineItems={confirmedItems.map((item) => ({
                ...item,
                firstContactCompleted: item.firstContactCompleted,
                influencer: item.influencer,
              }))}
            />
          </TabsContent>

          <TabsContent value="finance">
            <div
              className="mb-3 px-3 py-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800/50"
              data-testid="confirmed-filter-notice-finance"
            >
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                <AlertCircle className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                진행 단계가 '확정' 이상인 사람들만 목록에 표시합니다. 찾는
                인플루언서가 없을 경우 선정 탭에서 '확정'으로 설정해주세요.
              </p>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>정산 현황</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">
                      총 광고료
                    </div>
                    <div className="text-2xl font-bold">
                      {confirmedItems
                        .reduce((a, b) => a + (b.offerFee || 0), 0)
                        .toLocaleString()}
                      원
                    </div>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">
                      입금 완료
                    </div>
                    <div className="text-2xl font-bold text-green-600">
                      {confirmedItems
                        .filter((i) => i.payoutStatus === "입금완료")
                        .reduce((a, b) => a + (b.offerFee || 0), 0)
                        .toLocaleString()}
                      원
                    </div>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <div className="text-sm text-muted-foreground">
                      입금 대기
                    </div>
                    <div className="text-2xl font-bold text-orange-600">
                      {confirmedItems
                        .filter((i) => i.payoutStatus !== "입금완료")
                        .reduce((a, b) => a + (b.offerFee || 0), 0)
                        .toLocaleString()}
                      원
                    </div>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>인플루언서</TableHead>
                      <TableHead>사업자 유형</TableHead>
                      <TableHead>은행명</TableHead>
                      <TableHead>예금주</TableHead>
                      <TableHead>계좌번호</TableHead>
                      <TableHead className="text-right">광고료(VAT+)</TableHead>
                      <TableHead>지급예정일</TableHead>
                      <TableHead>메모</TableHead>
                      <TableHead>정산 요청</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {confirmedItems.map((item) => (
                      <TableRow
                        key={item.id}
                        data-testid={`row-settlement-${item.id}`}
                      >
                        <TableCell className="py-1.5">
                          <div className="font-medium text-sm">
                            {item.influencer?.name || "-"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.influencer?.settlementType || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.influencer?.bankName || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.influencer?.accountHolder || "-"}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {item.influencer?.accountNumber || "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {(item.offerFee || 0).toLocaleString()}원
                        </TableCell>
                        <TableCell>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-28 h-7 text-xs justify-start font-normal"
                                data-testid={`button-due-date-${item.id}`}
                              >
                                <Calendar className="w-3 h-3 mr-1" />
                                {item.payoutDueAt
                                  ? new Date(
                                      item.payoutDueAt,
                                    ).toLocaleDateString("ko-KR")
                                  : "날짜 선택"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-auto p-0"
                              align="start"
                            >
                              <CalendarComponent
                                mode="single"
                                selected={
                                  item.payoutDueAt
                                    ? new Date(item.payoutDueAt)
                                    : undefined
                                }
                                onSelect={(date) => {
                                  handleStatusUpdate(
                                    item.id,
                                    "payoutDueAt",
                                    date ? date.toISOString() : null,
                                  );
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell>
                          <Input
                            className="w-32 h-7 text-xs"
                            key={`memo-${item.id}-${item.payoutMemo}`}
                            defaultValue={item.payoutMemo || ""}
                            placeholder="메모"
                            onBlur={(e) => {
                              if (e.target.value !== (item.payoutMemo || "")) {
                                handleStatusUpdate(
                                  item.id,
                                  "payoutMemo",
                                  e.target.value,
                                );
                              }
                            }}
                            data-testid={`input-memo-${item.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          {item.settlementRequested ? (
                            <Badge
                              variant="outline"
                              className="h-8 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1 w-[100px] justify-center"
                            >
                              <Check className="w-3 h-3" />
                              정산요청됨
                            </Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-[100px] text-xs"
                              onClick={() => {
                                handleStatusUpdate(
                                  item.id,
                                  "settlementRequested",
                                  true,
                                );
                                handleStatusUpdate(
                                  item.id,
                                  "settlementRequestedAt",
                                  new Date().toISOString(),
                                );
                              }}
                              data-testid={`button-settlement-request-${item.id}`}
                            >
                              정산 요청하기
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {confirmedItems.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="text-center py-8 text-muted-foreground"
                        >
                          확정된 인플루언서가 없습니다. 선정 탭에서 진행 단계를
                          '확정'으로 변경해주세요.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>캠페인 설정</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      캠페인 이름
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={editingCampaignName || campaign.name}
                        onChange={(e) => setEditingCampaignName(e.target.value)}
                        className="max-w-md"
                        data-testid="input-campaign-name"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const newName = editingCampaignName || campaign.name;
                          if (newName && newName !== campaign.name) {
                            updateCampaign.mutate(
                              {
                                id,
                                data: { name: newName },
                              },
                              {
                                onSuccess: () => {
                                  toast({
                                    title: "캠페인 이름이 변경되었습니다.",
                                  });
                                  setEditingCampaignName("");
                                },
                                onError: () => {
                                  toast({
                                    variant: "destructive",
                                    title: "변경 실패",
                                  });
                                },
                              },
                            );
                          }
                        }}
                        disabled={
                          updateCampaign.isPending ||
                          !editingCampaignName ||
                          editingCampaignName === campaign.name
                        }
                        data-testid="button-save-campaign-name"
                      >
                        <Save className="w-3 h-3 mr-1" />
                        저장
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      캠페인 상태
                    </label>
                    <Select
                      value={campaign.status || "대기중"}
                      onValueChange={(v) => handleStatusChange(v)}
                    >
                      <SelectTrigger
                        className="w-[200px]"
                        data-testid="select-campaign-status"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="대기중">대기중</SelectItem>
                        <SelectItem value="진행중">진행중</SelectItem>
                        <SelectItem value="완료">완료</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      클라이언트
                    </label>
                    <div className="flex items-center gap-2">
                      <Select
                        value={
                          selectedClientId ||
                          (campaign.clientId
                            ? campaign.clientId.toString()
                            : "")
                        }
                        onValueChange={setSelectedClientId}
                      >
                        <SelectTrigger
                          className="w-[200px]"
                          data-testid="select-settings-client"
                        >
                          <SelectValue placeholder="클라이언트 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients?.map((client) => (
                            <SelectItem
                              key={client.id}
                              value={client.id.toString()}
                            >
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={handleClientChange}
                        disabled={
                          !selectedClientId ||
                          selectedClientId ===
                            (campaign.clientId?.toString() || "") ||
                          updateCampaign.isPending
                        }
                        data-testid="button-save-client"
                      >
                        <Save className="w-3 h-3 mr-1" />
                        저장
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      캠페인 예산
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={
                          editingBudget !== null
                            ? editingBudget
                            : campaign.budget != null
                              ? campaign.budget.toString()
                              : ""
                        }
                        onChange={(e) => setEditingBudget(e.target.value)}
                        onFocus={() => {
                          if (editingBudget === null) {
                            setEditingBudget(
                              campaign.budget != null
                                ? campaign.budget.toString()
                                : "",
                            );
                          }
                        }}
                        placeholder="예산을 입력하세요"
                        className="max-w-[200px]"
                        data-testid="input-campaign-budget"
                      />
                      <span className="text-sm text-muted-foreground">원</span>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (!editingBudget || isNaN(parseInt(editingBudget)))
                            return;
                          const newBudget = parseInt(editingBudget);
                          if (newBudget === campaign.budget) return;
                          updateCampaign.mutate(
                            {
                              id,
                              data: { budget: newBudget },
                            },
                            {
                              onSuccess: () => {
                                toast({
                                  title: "캠페인 예산이 변경되었습니다.",
                                });
                                setEditingBudget(null);
                              },
                              onError: () => {
                                toast({
                                  variant: "destructive",
                                  title: "변경 실패",
                                });
                              },
                            },
                          );
                        }}
                        disabled={
                          updateCampaign.isPending ||
                          !editingBudget ||
                          isNaN(parseInt(editingBudget)) ||
                          parseInt(editingBudget) === campaign.budget
                        }
                        data-testid="button-save-campaign-budget"
                      >
                        <Save className="w-3 h-3 mr-1" />
                        저장
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="text-sm font-medium text-destructive mb-2">
                    위험 구역
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    캠페인을 삭제하면 포함된 모든 인플루언서 정보도 함께
                    삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsDeleteCampaignOpen(true)}
                    data-testid="button-delete-campaign"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    캠페인 삭제
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      {/* Add Influencer Modal */}
      <AddInfluencerModal
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        campaignId={id}
        workspaceId={workspaceId || 0}
        existingInfluencerIds={campaign.items?.map((i) => i.influencerId) || []}
      />
      {/* Line Item Detail Drawer */}
      <LineItemDetailDrawer
        item={selectedLineItem}
        onClose={() => setSelectedLineItem(null)}
        onUpdate={handleStatusUpdate}
      />
      {/* Delete Campaign Confirmation Dialog */}
      <Dialog
        open={isDeleteCampaignOpen}
        onOpenChange={setIsDeleteCampaignOpen}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>캠페인 삭제</DialogTitle>
            <DialogDescription>
              "{campaign.name}" 캠페인을 삭제하시겠습니까? 이 작업은 되돌릴 수
              없으며 캠페인에 포함된 모든 인플루언서 정보도 함께 삭제됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setIsDeleteCampaignOpen(false)}
              data-testid="button-cancel-delete-campaign"
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCampaign}
              disabled={deleteCampaign.isPending}
              data-testid="button-confirm-delete-campaign"
            >
              {deleteCampaign.isPending ? "삭제 중..." : "삭제"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Delete Influencer from Campaign Confirmation Dialog */}
      <Dialog
        open={isDeleteInfluencerOpen}
        onOpenChange={setIsDeleteInfluencerOpen}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>인플루언서 제외</DialogTitle>
            <DialogDescription>
              선택한 {selectedInfluencerIds.size}명의 인플루언서를 캠페인에서
              제외하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setIsDeleteInfluencerOpen(false)}
              data-testid="button-cancel-remove-influencer"
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSelectedInfluencers}
              disabled={deleteItem.isPending}
              data-testid="button-confirm-remove-influencer"
            >
              {deleteItem.isPending ? "처리 중..." : "제외"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function AddInfluencerModal({
  open,
  onOpenChange,
  campaignId,
  workspaceId,
  existingInfluencerIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: number;
  workspaceId: number;
  existingInfluencerIds: number[];
}) {
  const { data: influencers } = useInfluencers(workspaceId);
  const addInfluencers = useAddInfluencersToCampaign(campaignId);
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const availableInfluencers =
    influencers?.filter((i) => !existingInfluencerIds.includes(i.id)) || [];
  const filteredInfluencers = availableInfluencers.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.email?.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleSelection = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleAdd = () => {
    if (selectedIds.size === 0) return;
    addInfluencers.mutate(Array.from(selectedIds), {
      onSuccess: () => {
        toast({ title: "인플루언서가 추가되었습니다." });
        setSelectedIds(new Set());
        onOpenChange(false);
      },
      onError: () => toast({ variant: "destructive", title: "추가 실패" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>인플루언서 추가</DialogTitle>
          <DialogDescription>
            캠페인에 추가할 인플루언서를 선택하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="검색..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-influencers"
          />
        </div>

        <ScrollArea className="h-[300px] border rounded-lg">
          <div className="p-2 space-y-1">
            {filteredInfluencers.map((inf) => (
              <div
                key={inf.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors flex items-center gap-3 ${selectedIds.has(inf.id) ? "bg-primary/10 border border-primary" : "hover:bg-muted border border-transparent"}`}
                onClick={() => toggleSelection(inf.id)}
                data-testid={`add-influencer-option-${inf.id}`}
              >
                <Checkbox checked={selectedIds.has(inf.id)} />
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {inf.name.substring(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{inf.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {inf.email}
                  </div>
                </div>
              </div>
            ))}
            {filteredInfluencers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {availableInfluencers.length === 0
                  ? "모든 인플루언서가 이미 추가되었습니다."
                  : "검색 결과가 없습니다."}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size}명 선택됨
          </span>
          <Button
            onClick={handleAdd}
            disabled={addInfluencers.isPending || selectedIds.size === 0}
            data-testid="button-confirm-add-influencers"
          >
            {addInfluencers.isPending ? "추가 중..." : "추가"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettlementInfoButton({
  influencer,
  lineItem,
}: {
  influencer?: any;
  lineItem: any;
}) {
  const [open, setOpen] = useState(false);
  const [settlementType, setSettlementType] = useState(
    influencer?.settlementType || "",
  );
  const [bankName, setBankName] = useState(influencer?.bankName || "");
  const [accountHolder, setAccountHolder] = useState(
    influencer?.accountHolder || "",
  );
  const [accountNumber, setAccountNumber] = useState(
    influencer?.accountNumber || "",
  );
  const [businessName, setBusinessName] = useState(
    influencer?.businessName || "",
  );
  const [businessRegNo, setBusinessRegNo] = useState(
    influencer?.businessRegNo || "",
  );
  const [freelancerId, setFreelancerId] = useState(
    influencer?.freelancerId || "",
  );
  const { toast } = useToast();

  const isComplete = () => {
    const hasBank = bankName && accountHolder && accountNumber;
    if (settlementType === "사업자")
      return hasBank && businessName && businessRegNo;
    if (settlementType === "프리랜서") return hasBank && freelancerId;
    return false;
  };

  const handleSave = async () => {
    if (!influencer?.id) return;
    try {
      await apiRequest("PATCH", `/api/influencers/${influencer.id}`, {
        settlementType,
        bankName,
        accountHolder,
        accountNumber,
        businessName,
        businessRegNo,
        freelancerId,
        settlementInfoUpdatedAt: new Date().toISOString(),
      });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return (
            typeof key === "string" &&
            (key.includes("/api/campaigns") || key.includes("/api/influencers"))
          );
        },
      });
      toast({ title: "정산정보가 저장되었습니다." });
      setOpen(false);
    } catch {
      toast({ title: "저장 실패", variant: "destructive" });
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="w-full justify-between"
        onClick={() => setOpen(true)}
        data-testid="button-settlement-info"
      >
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4" />
          <span>정산 정보</span>
        </div>
        {isComplete() ? (
          <Badge
            variant="outline"
            className="text-[10px] bg-green-100 text-green-700 border-0"
          >
            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
            입력완료
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-[10px] bg-orange-100 text-orange-700 border-0"
          >
            미입력
          </Badge>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>정산 정보</DialogTitle>
            <DialogDescription>
              {influencer?.name}의 정산 정보를 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                정산 유형
              </label>
              <Select value={settlementType} onValueChange={setSettlementType}>
                <SelectTrigger
                  className="mt-1"
                  data-testid="select-drawer-settlement-type"
                >
                  <SelectValue placeholder="유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="사업자">사업자</SelectItem>
                  <SelectItem value="프리랜서">프리랜서</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                은행명
              </label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="은행명"
                className="mt-1"
                data-testid="input-drawer-bank-name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                예금주
              </label>
              <Input
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="예금주"
                className="mt-1"
                data-testid="input-drawer-account-holder"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                계좌번호
              </label>
              <Input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="계좌번호"
                className="mt-1"
                data-testid="input-drawer-account-number"
              />
            </div>
            {settlementType === "사업자" && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    상호명
                  </label>
                  <Input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="상호명"
                    className="mt-1"
                    data-testid="input-drawer-business-name"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    사업자번호
                  </label>
                  <Input
                    value={businessRegNo}
                    onChange={(e) => setBusinessRegNo(e.target.value)}
                    placeholder="000-00-00000"
                    className="mt-1"
                    data-testid="input-drawer-business-reg-no"
                  />
                </div>
              </>
            )}
            {settlementType === "프리랜서" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  주민등록번호
                </label>
                <Input
                  value={freelancerId}
                  onChange={(e) => setFreelancerId(e.target.value)}
                  placeholder="000000-0000000"
                  className="mt-1"
                  data-testid="input-drawer-freelancer-id"
                />
              </div>
            )}
            <Button
              onClick={handleSave}
              className="w-full"
              data-testid="button-save-drawer-settlement"
            >
              <Save className="w-4 h-4 mr-2" />
              정산정보 저장
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LineItemDetailDrawer({
  item,
  onClose,
  onUpdate,
}: {
  item: CampaignLineItem | null;
  onClose: () => void;
  onUpdate: (itemId: number, field: string, value: string) => void;
}) {
  const updateItem = useUpdateCampaignItem();
  const { toast } = useToast();

  const [adFee, setAdFee] = useState("");
  const [contentLink, setContentLink] = useState("");

  useEffect(() => {
    if (item) {
      setAdFee(item.offerFee?.toString() || "");
      setContentLink(item.contentLink || "");
    }
  }, [item?.id, item?.offerFee, item?.contentLink]);

  if (!item) return null;

  const handleSaveAmount = () => {
    updateItem.mutate(
      { id: item.id, updates: { offerFee: parseInt(adFee) || null } },
      {
        onSuccess: () => toast({ title: "광고료가 저장되었습니다." }),
      },
    );
  };

  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[500px] sm:max-w-[500px] flex flex-col h-full">
        <SheetHeader className="shrink-0">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback>
                {item.influencer?.name?.substring(0, 2) || "IN"}
              </AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle>
                {item.influencer?.name || `인플루언서 #${item.influencerId}`}
              </SheetTitle>
              <div className="text-sm text-muted-foreground">
                {item.influencer?.email}
              </div>
            </div>
          </div>
        </SheetHeader>

        <Tabs
          defaultValue="overview"
          className="mt-6 flex-1 overflow-hidden flex flex-col"
        >
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="overview">개요</TabsTrigger>
            <TabsTrigger value="contract">계약</TabsTrigger>
            <TabsTrigger value="settlement">정산</TabsTrigger>
            <TabsTrigger value="content">제작</TabsTrigger>
          </TabsList>

          <TabsContent
            value="overview"
            className="space-y-4 mt-4 flex-1 overflow-y-auto pb-4"
          >
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium">진행 상태</label>
                <Select
                  value={item.status || "waiting"}
                  onValueChange={(val) => onUpdate(item.id, "status", val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="waiting">대기</SelectItem>
                    <SelectItem value="contacted">컨택</SelectItem>
                    <SelectItem value="confirmed">확정</SelectItem>
                    <SelectItem value="contracted">계약</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">메모</label>
                <Textarea
                  placeholder="이 라인아이템에 대한 메모..."
                  className="min-h-[100px]"
                  defaultValue={item.influencer?.memo || ""}
                  readOnly
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="contract"
            className="space-y-4 mt-4 flex-1 overflow-y-auto pb-4"
          >
            <div>
              <label className="text-sm font-medium">계약 상태</label>
              <Select
                value={item.contractStatus || "pending"}
                onValueChange={(val) =>
                  onUpdate(item.id, "contractStatus", val)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">대기 중</SelectItem>
                  <SelectItem value="sent">발송됨</SelectItem>
                  <SelectItem value="signed">서명 완료</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">계약서 업로드</label>
              <Input type="file" className="mt-1" />
            </div>
            <div className="pt-2 border-t">
              <SettlementInfoButton
                influencer={item.influencer}
                lineItem={item}
              />
            </div>
          </TabsContent>

          <TabsContent
            value="settlement"
            className="space-y-4 mt-4 flex-1 overflow-y-auto pb-4"
          >
            <div>
              <label className="text-sm font-medium">지급 상태</label>
              <Select
                value={item.paymentStatus || "pending"}
                onValueChange={(val) => onUpdate(item.id, "paymentStatus", val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">대기 중</SelectItem>
                  <SelectItem value="invoiced">청구됨</SelectItem>
                  <SelectItem value="paid">지급 완료</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">광고료(VAT+)</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={adFee}
                  onChange={(e) => setAdFee(e.target.value)}
                  placeholder="500000"
                />
                <Button
                  onClick={handleSaveAmount}
                  disabled={updateItem.isPending}
                >
                  <Save className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">세금계산서 업로드</label>
              <Input type="file" className="mt-1" />
            </div>
          </TabsContent>

          <TabsContent
            value="content"
            className="space-y-4 mt-4 flex-1 overflow-y-auto pb-4"
          >
            <div>
              <label className="text-sm font-medium">콘텐츠 링크</label>
              <Input
                placeholder="https://instagram.com/p/..."
                value={contentLink}
                onChange={(e) => setContentLink(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
