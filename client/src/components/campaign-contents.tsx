import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const [historyItemId, setHistoryItemId] = useState<number | null>(null);
  
  const [draftUrl, setDraftUrl] = useState("");
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
      return true;
    });
  }, [lineItems, search]);

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

      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">인플루언서</TableHead>
                  <TableHead className="w-24">제출내역</TableHead>
                  <TableHead className="w-32">초안</TableHead>
                  <TableHead className="w-24">피드백</TableHead>
                  <TableHead className="min-w-[120px]">최종 게시물 URL</TableHead>
                  <TableHead className="min-w-[120px]">Meta 파트너십코드</TableHead>
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
                      {item.postUrl ? (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(item.postUrl!, '_blank');
                          }}
                          data-testid={`button-post-url-${item.id}`}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          보기
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.metaPartnershipCode ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(item.metaPartnershipCode!);
                            toast({ title: "복사됨", description: "파트너십 코드가 클립보드에 복사되었습니다." });
                          }}
                          data-testid={`button-copy-meta-code-${item.id}`}
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          {item.metaPartnershipCode}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12" data-testid="empty-content-table">
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
                {selectedItem?.influencer?.name || "인플루언서"} - 콘텐츠 관리
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
                  <label className="text-sm font-medium">최종 게시물 URL</label>
                  <div className="flex gap-2">
                    <Input
                      value={selectedItem?.postUrl || ''}
                      disabled
                      placeholder="인플루언서가 입력한 게시물 URL"
                      data-testid="input-post-url-readonly"
                    />
                    {selectedItem?.postUrl && (
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => window.open(selectedItem.postUrl!, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium">Meta 파트너십 코드</label>
                  <div className="flex gap-2">
                    <Input
                      value={selectedItem?.metaPartnershipCode || ''}
                      disabled
                      placeholder="인플루언서가 입력한 코드"
                      data-testid="input-meta-code-readonly"
                    />
                    {selectedItem?.metaPartnershipCode && (
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedItem.metaPartnershipCode!);
                          toast({ title: "복사됨" });
                        }}
                      >
                        <Copy className="w-4 h-4" />
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
