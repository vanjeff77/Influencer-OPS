import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, ExternalLink, Save, FileText, CheckCircle2, Image,
  Instagram, Youtube, Twitter
} from "lucide-react";
import type { CampaignInfluencer, Influencer, InfluencerAccount, FeedbackNote, User } from "@shared/schema";
import { KO } from "@/i18n/ko";

interface LineItemWithDetails extends CampaignInfluencer {
  influencer?: Influencer & { accounts: InfluencerAccount[] };
  feedbackNotes?: (FeedbackNote & { author?: User })[];
}

interface CampaignContentsProps {
  campaignId: number;
  lineItems: LineItemWithDetails[];
}

const REVIEW_STATUSES = ["초안대기", "검토중", "피드백전달", "승인완료", "업로드완료"] as const;

const getReviewStatusColor = (status: string) => {
  switch(status) {
    case "승인완료": case "업로드완료": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "피드백전달": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "검토중": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
  }
};

const PlatformIcon = ({ p }: { p: string }) => {
  switch(p) {
    case 'IG': return <Instagram className="w-4 h-4 text-pink-600" />;
    case 'YT': return <Youtube className="w-4 h-4 text-red-600" />;
    case 'X': return <Twitter className="w-4 h-4 text-blue-400" />;
    default: return <span className="text-xs font-bold">{p}</span>;
  }
};

export function CampaignContents({ campaignId, lineItems }: CampaignContentsProps) {
  const { toast } = useToast();
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  
  const [draftUrl, setDraftUrl] = useState("");
  const [finalUrl, setFinalUrl] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [internalFeedback, setInternalFeedback] = useState("");

  const selectedItem = useMemo(() => {
    return lineItems.find(item => item.id === selectedItemId);
  }, [lineItems, selectedItemId]);

  const handleItemSelect = (item: LineItemWithDetails) => {
    setSelectedItemId(item.id);
    setDraftUrl(item.draftUrl || "");
    setFinalUrl(item.finalUrl || "");
    setReviewStatus(item.reviewStatus || "초안대기");
    setInternalFeedback(item.feedbackSummary || "");
  };

  const updateContent = useMutation({
    mutationFn: async (data: { id: number; updates: Partial<CampaignInfluencer> }) => {
      return apiRequest('PATCH', `/api/line-items/${data.id}/operations`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId] });
      toast({ title: "저장되었습니다" });
    }
  });

  const handleSave = () => {
    if (!selectedItemId) return;
    updateContent.mutate({
      id: selectedItemId,
      updates: {
        draftUrl,
        finalUrl,
        reviewStatus,
        feedbackSummary: internalFeedback,
        feedbackSummaryUpdatedAt: internalFeedback ? new Date() : null
      }
    });
  };

  const filteredItems = useMemo(() => {
    return lineItems.filter(item => {
      if (search) {
        const searchLower = search.toLowerCase();
        const name = item.influencer?.name?.toLowerCase() || "";
        const email = item.influencer?.email?.toLowerCase() || "";
        if (!name.includes(searchLower) && !email.includes(searchLower)) return false;
      }
      if (reviewFilter !== "all" && item.reviewStatus !== reviewFilter) return false;
      return true;
    });
  }, [lineItems, search, reviewFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    REVIEW_STATUSES.forEach(s => counts[s] = 0);
    lineItems.forEach(item => {
      const status = item.reviewStatus || "초안대기";
      if (counts[status] !== undefined) counts[status]++;
    });
    return counts;
  }, [lineItems]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="인플루언서 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-content-search"
          />
        </div>
        <Select value={reviewFilter} onValueChange={setReviewFilter}>
          <SelectTrigger className="w-32" data-testid="select-content-review-filter">
            <SelectValue placeholder="검토 상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {REVIEW_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{s} ({statusCounts[s]})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        {REVIEW_STATUSES.map(status => (
          <Badge 
            key={status}
            variant="outline" 
            className={`cursor-pointer ${reviewFilter === status ? getReviewStatusColor(status) : ''}`}
            onClick={() => setReviewFilter(reviewFilter === status ? "all" : status)}
            data-testid={`badge-filter-${status}`}
          >
            {status}: {statusCounts[status]}
          </Badge>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">인플루언서</TableHead>
                  <TableHead className="w-24">검토 상태</TableHead>
                  <TableHead className="w-32">초안</TableHead>
                  <TableHead className="w-32">완성본</TableHead>
                  <TableHead className="w-24">피드백</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map(item => (
                  <TableRow 
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleItemSelect(item)}
                    data-testid={`row-content-item-${item.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-gradient-to-br from-purple-100 to-purple-200 text-purple-700">
                            {item.influencer?.name?.substring(0, 2) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.influencer?.name || "Unknown"}</p>
                          <div className="flex items-center gap-1">
                            {item.influencer?.accounts?.slice(0, 2).map((acc, i) => (
                              <PlatformIcon key={i} p={acc.platform} />
                            ))}
                            <span className="text-xs text-muted-foreground truncate">
                              {item.influencer?.accounts?.[0]?.handle}
                            </span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={item.reviewStatus || "초안대기"} 
                        onValueChange={(val) => {
                          updateContent.mutate({ id: item.id, updates: { reviewStatus: val } });
                        }}
                      >
                        <SelectTrigger 
                          className={`w-[100px] h-7 text-xs border-0 ${getReviewStatusColor(item.reviewStatus || "초안대기")}`}
                          onClick={e => e.stopPropagation()}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REVIEW_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {item.draftUrl ? (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(item.draftUrl!, '_blank');
                          }}
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          보기
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.finalUrl ? (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(item.finalUrl!, '_blank');
                          }}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          보기
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.feedbackSummary ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <Image className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p className="text-muted-foreground">등록된 인플루언서가 없습니다</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!selectedItemId} onOpenChange={(open) => !open && setSelectedItemId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Image className="w-5 h-5" />
              콘텐츠 정보
            </SheetTitle>
            <SheetDescription>
              {selectedItem?.influencer?.name || "인플루언서"} - 초안/완성본 관리
            </SheetDescription>
          </SheetHeader>

          {selectedItem && (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-gradient-to-br from-purple-100 to-purple-200 text-purple-700">
                    {selectedItem.influencer?.name?.substring(0, 2) || "?"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{selectedItem.influencer?.name}</p>
                  <div className="flex items-center gap-1">
                    {selectedItem.influencer?.accounts?.map((acc, i) => (
                      <PlatformIcon key={i} p={acc.platform} />
                    ))}
                    <span className="text-xs text-muted-foreground">
                      {selectedItem.influencer?.accounts?.[0]?.handle}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">검토 상태</label>
                  <Select value={reviewStatus} onValueChange={setReviewStatus}>
                    <SelectTrigger className="mt-1" data-testid="select-review-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REVIEW_STATUSES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">초안 링크</label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={draftUrl}
                      onChange={e => setDraftUrl(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      data-testid="input-draft-url"
                    />
                    {draftUrl && (
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => window.open(draftUrl, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">완성본/게시 URL</label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={finalUrl}
                      onChange={e => setFinalUrl(e.target.value)}
                      placeholder="https://instagram.com/p/..."
                      data-testid="input-final-url"
                    />
                    {finalUrl && (
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => window.open(finalUrl, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">내부 피드백</label>
                  <Textarea
                    value={internalFeedback}
                    onChange={e => setInternalFeedback(e.target.value)}
                    placeholder="초안에 대한 내부 피드백을 작성하세요..."
                    className="mt-1 min-h-[120px]"
                    data-testid="textarea-internal-feedback"
                  />
                </div>

                <Button 
                  onClick={handleSave} 
                  disabled={updateContent.isPending}
                  className="w-full"
                  data-testid="button-save-content"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {updateContent.isPending ? "저장 중..." : "저장"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
