import Layout from "@/components/layout";
import { useCampaign, useUpdateCampaignItem } from "@/hooks/use-campaigns";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, CheckCircle2, CircleDollarSign, FileText } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { KO } from "@/i18n/ko";

export default function CampaignDetail() {
  const [, params] = useRoute("/campaigns/:id");
  const id = Number(params?.id);
  const { data: campaign, isLoading } = useCampaign(id);
  const updateItem = useUpdateCampaignItem();

  if (isLoading) return <Layout><div>{KO.common.loading}</div></Layout>;
  if (!campaign) return <Layout><div>캠페인을 찾을 수 없습니다</div></Layout>;

  const totalSpend = campaign.items?.reduce((acc, item) => acc + (item.payAmount || 0), 0) || 0;
  const budgetUtilization = campaign.budget ? Math.round((totalSpend / campaign.budget) * 100) : 0;

  const handleStatusUpdate = (itemId: number, field: string, value: string) => {
    updateItem.mutate({ id: itemId, updates: { [field]: value } });
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'contacted': return '연락 완료';
      case 'negotiated': return '협상 중';
      case 'contracted': return '계약 완료';
      case 'posted': return '게시 완료';
      default: return status;
    }
  };

  const getContractLabel = (status: string) => {
    switch(status) {
      case 'pending': return '대기 중';
      case 'sent': return '발송됨';
      case 'signed': return '서명 완료';
      default: return status;
    }
  };

  const getPaymentLabel = (status: string) => {
    switch(status) {
      case 'pending': return '대기 중';
      case 'invoiced': return '청구됨';
      case 'paid': return '지급 완료';
      default: return status;
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <Link href="/campaigns" className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors w-fit" data-testid="link-back">
          <ArrowLeft className="w-4 h-4 mr-1" /> 캠페인 목록으로
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
              <Badge variant="outline" className="text-sm bg-green-50 text-green-700 border-green-200 capitalize">
                {campaign.status === 'active' ? KO.status.active : campaign.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-2 text-lg">클라이언트: {campaign.client}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground mb-1">총 예산</div>
            <div className="text-2xl font-bold font-mono">{campaign.budget?.toLocaleString()}원</div>
            <div className="text-xs text-muted-foreground mt-1">예산 사용률: {budgetUtilization}%</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">인플루언서</CardTitle>
              <UsersIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{campaign.items?.length || 0}명</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">집행 금액</CardTitle>
              <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSpend.toLocaleString()}원</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">진행률</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {campaign.items?.filter(i => i.status === 'posted').length || 0} / {campaign.items?.length || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="influencers" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="influencers">인플루언서</TabsTrigger>
            <TabsTrigger value="content">콘텐츠</TabsTrigger>
            <TabsTrigger value="finance">정산</TabsTrigger>
          </TabsList>
          
          <TabsContent value="influencers">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>참여 인플루언서</CardTitle>
                  <Button size="sm" data-testid="button-add-campaign-influencer">인플루언서 추가</Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>인플루언서</TableHead>
                      <TableHead>진행 상태</TableHead>
                      <TableHead>계약</TableHead>
                      <TableHead>지급</TableHead>
                      <TableHead className="text-right">금액</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaign.items?.map((item: any) => (
                      <TableRow key={item.id} data-testid={`row-campaign-item-${item.id}`}>
                        <TableCell className="font-medium">
                           인플루언서 #{item.influencerId}
                        </TableCell>
                        <TableCell>
                          <Select 
                            defaultValue={item.status} 
                            onValueChange={(val) => handleStatusUpdate(item.id, 'status', val)}
                          >
                            <SelectTrigger className="w-[130px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="contacted">연락 완료</SelectItem>
                              <SelectItem value="negotiated">협상 중</SelectItem>
                              <SelectItem value="contracted">계약 완료</SelectItem>
                              <SelectItem value="posted">게시 완료</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.contractStatus === 'signed' ? 'default' : 'secondary'} className="cursor-pointer">
                            {getContractLabel(item.contractStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.paymentStatus === 'paid' ? 'default' : 'outline'}>
                            {getPaymentLabel(item.paymentStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.payAmount?.toLocaleString()}원
                        </TableCell>
                      </TableRow>
                    ))}
                    {!campaign.items?.length && (
                      <TableRow>
                         <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                           이 캠페인에 아직 인플루언서가 없습니다.
                         </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="content">
            <div className="py-12 text-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
              콘텐츠 갤러리 (준비 중)
            </div>
          </TabsContent>

          <TabsContent value="finance">
            <div className="py-12 text-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
              정산 상세 (준비 중)
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function UsersIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
