import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { 
  ExternalLink, Save, FileText, CheckCircle2, Image,
  Instagram, Youtube, Twitter, Copy, Upload, Download, FolderOpen
} from "lucide-react";
import type { CampaignInfluencer, Influencer, InfluencerAccount, FeedbackNote, User } from "@shared/schema";
import { api } from "@shared/routes";
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

interface ContentSubmission {
  id: number;
  campaignId: number;
  lineItemId: number;
  influencerId: number;
  influencerName: string;
  submissionType: string;
  fileName: string;
  fileSize: number;
  oneDriveFileId: string | null;
  oneDriveLink: string | null;
  memo: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedByUserId: number | null;
}

interface SubmissionsResponse {
  submissions: ContentSubmission[];
  unreviewedByLineItem: Record<number, number>;
}

export function CampaignContents({ campaignId, lineItems }: CampaignContentsProps) {
  const { toast } = useToast();
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  const [historyItemId, setHistoryItemId] = useState<number | null>(null);
  
  const [draftUrl, setDraftUrl] = useState("");
  const [finalUrl, setFinalUrl] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [internalFeedback, setInternalFeedback] = useState("");
  
  const { data: submissionsData } = useQuery<SubmissionsResponse>({
    queryKey: ['/api/campaigns', campaignId, 'submissions'],
  });
  const submissions = submissionsData?.submissions || [];
  const unreviewedByLineItem = submissionsData?.unreviewedByLineItem || {};

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
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: [api.campaigns.get.path, campaignId] });
      
      const previousCampaign = queryClient.getQueryData([api.campaigns.get.path, campaignId]);
      
      queryClient.setQueryData([api.campaigns.get.path, campaignId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items?.map((item: any) => 
            item.id === data.id ? { ...item, ...data.updates } : item
          )
        };
      });
      
      return { previousCampaign };
    },
    onError: (err, data, context) => {
      if (context?.previousCampaign) {
        queryClient.setQueryData([api.campaigns.get.path, campaignId], context.previousCampaign);
      }
      toast({ title: "저장 실패", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "저장되었습니다" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [api.campaigns.get.path, campaignId] });
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

  const historyItem = useMemo(() => {
    return lineItems.find(item => item.id === historyItemId);
  }, [lineItems, historyItemId]);

  const historySubmissions = useMemo(() => {
    if (!historyItem) return [];
    return submissions.filter(s => s.lineItemId === historyItem.id);
  }, [submissions, historyItem]);

  const markReviewed = useMutation({
    mutationFn: async (lineItemId: number) => {
      return apiRequest('POST', `/api/campaigns/${campaignId}/submissions/mark-reviewed`, { lineItemId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'submissions'] });
    }
  });

  const handleOpenHistory = (itemId: number) => {
    setHistoryItemId(itemId);
    if (unreviewedByLineItem[itemId]) {
      markReviewed.mutate(itemId);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-center">
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

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            size="sm"
            onClick={() => {
              const submitUrl = `${window.location.origin}/submit/${campaignId}`;
              navigator.clipboard.writeText(submitUrl);
              toast({ title: "링크 복사됨", description: "인플루언서에게 이 링크를 공유하세요." });
            }}
            data-testid="button-copy-submit-link"
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            제출 링크 복사
          </Button>
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
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">인플루언서</TableHead>
                  <TableHead className="w-24">검토 상태</TableHead>
                  <TableHead className="w-24">제출내역</TableHead>
                  <TableHead className="w-32">초안</TableHead>
                  <TableHead className="w-24">피드백</TableHead>
                  <TableHead className="w-32">완성본</TableHead>
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
                    <TableCell className="py-1.5">
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
                      {(() => {
                        const subCount = submissions.filter(s => s.lineItemId === item.id).length;
                        const unreviewed = unreviewedByLineItem[item.id] || 0;
                        return subCount > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 relative"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenHistory(item.id);
                            }}
                            data-testid={`button-submissions-${item.id}`}
                          >
                            <FolderOpen className="w-3 h-3 mr-1" />
                            {subCount}건
                            {unreviewed > 0 && (
                              <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold bg-red-500 text-white rounded-full">
                                N
                              </span>
                            )}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        );
                      })()}
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
                      {item.feedbackSummary ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
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
                  </TableRow>
                ))}
                {filteredItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
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

      <Dialog open={!!selectedItemId} onOpenChange={(open) => !open && setSelectedItemId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Image className="w-5 h-5" />
                콘텐츠 정보
              </DialogTitle>
              <DialogDescription>
                {selectedItem?.influencer?.name || "인플루언서"} - 초안/완성본 관리
              </DialogDescription>
            </div>
          </DialogHeader>

          {selectedItem && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-gradient-to-br from-purple-100 to-purple-200 text-purple-700 text-lg">
                      {selectedItem.influencer?.name?.substring(0, 2) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-base">{selectedItem.influencer?.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {selectedItem.influencer?.accounts?.map((acc, i) => (
                        <PlatformIcon key={i} p={acc.platform} />
                      ))}
                      <span className="text-sm text-muted-foreground">
                        {selectedItem.influencer?.accounts?.[0]?.handle}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedItem.finalUrl && (
                  <Card className="overflow-hidden">
                    <div className="aspect-video bg-muted flex items-center justify-center">
                      <Image className="w-12 h-12 text-muted-foreground/50" />
                    </div>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate flex-1 mr-2">게시 콘텐츠</span>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7"
                            onClick={() => navigator.clipboard.writeText(finalUrl).then(() => toast({ title: "URL이 복사되었습니다" }))}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7"
                            onClick={() => window.open(finalUrl, '_blank')}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div>
                  <label className="text-sm font-medium">내부 피드백</label>
                  <Textarea
                    value={internalFeedback}
                    onChange={e => setInternalFeedback(e.target.value)}
                    placeholder="초안에 대한 내부 피드백을 작성하세요..."
                    className="mt-2 min-h-[140px]"
                    data-testid="textarea-internal-feedback"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-3">
                  <label className="text-sm font-medium">검토 상태</label>
                  <Select value={reviewStatus} onValueChange={setReviewStatus}>
                    <SelectTrigger data-testid="select-review-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REVIEW_STATUSES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium">초안 링크</label>
                  <div className="flex gap-2">
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

                <div className="space-y-3">
                  <label className="text-sm font-medium">완성본/게시 URL</label>
                  <div className="flex gap-2">
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

                <div className="pt-4 border-t">
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
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyItemId} onOpenChange={(open) => !open && setHistoryItemId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              제출 내역
            </DialogTitle>
            <DialogDescription>
              {historyItem?.influencer?.name || "인플루언서"} - 파일 제출 기록
            </DialogDescription>
          </DialogHeader>

          {historySubmissions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              제출된 파일이 없습니다.
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>유형</TableHead>
                    <TableHead>파일명</TableHead>
                    <TableHead>크기</TableHead>
                    <TableHead>메모</TableHead>
                    <TableHead>제출일시</TableHead>
                    <TableHead>파일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historySubmissions.map((sub) => (
                    <TableRow key={sub.id} data-testid={`row-history-submission-${sub.id}`}>
                      <TableCell>
                        <Badge variant={sub.submissionType === 'final' ? 'default' : 'outline'}>
                          {sub.submissionType === 'final' ? '완성본' : '초안'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div className="flex items-center gap-1">
                          <FileText className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{sub.fileName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{formatFileSize(sub.fileSize)}</TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">{sub.memo || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {sub.submittedAt ? format(new Date(sub.submittedAt), 'yyyy-MM-dd HH:mm') : '-'}
                      </TableCell>
                      <TableCell>
                        {sub.oneDriveLink ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => window.open(sub.oneDriveLink!, '_blank')}
                            data-testid={`button-view-file-${sub.id}`}
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            열기
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
