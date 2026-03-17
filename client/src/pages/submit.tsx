import { useState, useCallback, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, CheckCircle, Loader2, FileVideo, FileImage, File, AlertCircle, Clock, FileText, ExternalLink, Link2, ArrowLeft, Wallet, FileSignature, FolderUp, Info } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Section = 'email' | 'menu' | 'settlement' | 'contract' | 'content' | 'postinfo';

interface SubmissionHistoryItem {
  id: number;
  submissionType: string;
  fileName: string;
  fileSize: number;
  memo: string | null;
  submittedAt: string;
  oneDriveLink: string | null;
}

interface VerifiedData {
  influencerId: number;
  influencerName: string;
  lineItemId: number;
  hasSettlementInfo: boolean;
  settlementConfirmed: boolean;
  hasContractFile: boolean;
  submissionCount: number;
  hasPostInfo: boolean;
  postUrl: string;
  metaPartnershipCode: string;
}

const BANK_LIST = [
  "KB국민은행", "신한은행", "하나은행", "우리은행", "NH농협은행",
  "IBK기업은행", "카카오뱅크", "토스뱅크", "케이뱅크",
  "SC제일은행", "씨티은행", "DGB대구은행", "BNK부산은행",
  "광주은행", "제주은행", "전북은행", "경남은행",
  "수협은행", "신협", "새마을금고", "우체국",
  "산업은행", "저축은행"
];

export default function SubmitPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { toast } = useToast();

  const [section, setSection] = useState<Section>('email');
  const [email, setEmail] = useState('');
  const [verifiedData, setVerifiedData] = useState<VerifiedData | null>(null);

  const [settlement, setSettlement] = useState({
    bankName: '', accountHolder: '', accountNumber: '',
    settlementType: '', businessName: '', businessRegNo: '', freelancerId: ''
  });

  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractUploading, setContractUploading] = useState(false);
  const [contractProgress, setContractProgress] = useState(0);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [memo, setMemo] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [submissionHistory, setSubmissionHistory] = useState<SubmissionHistoryItem[]>([]);

  const [postUrl, setPostUrl] = useState('');
  const [metaPartnershipCode, setMetaPartnershipCode] = useState('');

  const { data: campaignInfo, isLoading: isLoadingCampaign, error: campaignError } = useQuery<{
    id: number;
    name: string;
    clientName: string;
    status: string;
  }>({
    queryKey: ['/api/submit', campaignId, 'info'],
    queryFn: async () => {
      const res = await fetch(`/api/submit/${campaignId}/info`);
      if (!res.ok) throw new Error('캠페인을 찾을 수 없습니다');
      return res.json();
    },
    enabled: !!campaignId
  });

  const fetchHistory = useCallback(async () => {
    if (!email || !campaignId) return;
    try {
      const res = await fetch(`/api/submit/${campaignId}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        const data = await res.json();
        setSubmissionHistory(data);
      }
    } catch (e) {
      console.error('Failed to fetch history:', e);
    }
  }, [email, campaignId]);

  const refreshVerifiedData = useCallback(async () => {
    if (!email || !campaignId) return;
    try {
      const res = await fetch(`/api/submit/${campaignId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        const data = await res.json();
        setVerifiedData(data);
      }
    } catch (e) {
      console.error('Failed to refresh verified data:', e);
    }
  }, [email, campaignId]);

  const verifyEmail = useMutation({
    mutationFn: async (emailVal: string) => {
      const res = await fetch(`/api/submit/${campaignId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailVal })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || '이메일 인증 실패');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setVerifiedData(data);
      setPostUrl(data.postUrl || '');
      setMetaPartnershipCode(data.metaPartnershipCode || '');
      setSection('menu');
    },
    onError: (error: Error) => {
      toast({ title: "인증 실패", description: error.message, variant: "destructive" });
    }
  });

  useEffect(() => {
    if (verifiedData && email) {
      fetchHistory();
    }
  }, [verifiedData, email, fetchHistory]);

  const saveSettlement = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/submit/${campaignId}/settlement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, ...settlement })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || '정산정보 저장 실패');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "저장 완료", description: "정산정보가 등록되었습니다." });
      refreshVerifiedData();
      setSection('menu');
    },
    onError: (error: Error) => {
      toast({ title: "저장 실패", description: error.message, variant: "destructive" });
    }
  });

  const savePostInfo = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/submit/${campaignId}/post-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, postUrl, metaPartnershipCode })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || '저장 실패');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "저장 완료", description: "업로드 정보가 저장되었습니다." });
      refreshVerifiedData();
      setSection('menu');
    },
    onError: (error: Error) => {
      toast({ title: "저장 실패", description: error.message, variant: "destructive" });
    }
  });

  const handleAccountNumberChange = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    setSettlement(prev => ({ ...prev, accountNumber: cleaned }));
  };

  const formatResidentId = (value: string) => {
    const nums = value.replace(/[^0-9]/g, '');
    if (nums.length <= 6) return nums;
    return nums.slice(0, 6) + '-' + nums.slice(6, 13);
  };

  const formatBusinessRegNo = (value: string) => {
    const nums = value.replace(/[^0-9]/g, '');
    if (nums.length <= 3) return nums;
    if (nums.length <= 5) return nums.slice(0, 3) + '-' + nums.slice(3);
    return nums.slice(0, 3) + '-' + nums.slice(3, 5) + '-' + nums.slice(5, 10);
  };

  const isSettlementValid = () => {
    if (!settlement.bankName || !settlement.accountHolder || !settlement.accountNumber || !settlement.settlementType || !settlement.businessName) return false;
    if (settlement.settlementType === '프리랜서' && !settlement.freelancerId) return false;
    if (settlement.settlementType === '사업자' && !settlement.businessRegNo) return false;
    return true;
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  }, []);

  const handleContractFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setContractFile(file);
  }, []);

  const handleContractUpload = async () => {
    if (!contractFile || !verifiedData) return;
    setContractUploading(true);
    setContractProgress(0);

    try {
      const sessionRes = await fetch(`/api/submit/${campaignId}/contract-upload-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fileName: contractFile.name })
      });
      if (!sessionRes.ok) {
        const data = await sessionRes.json();
        throw new Error(data.message || '업로드 세션 생성 실패');
      }
      const session = await sessionRes.json();

      const CHUNK_SIZE = 10 * 1024 * 1024;
      const totalChunks = Math.ceil(contractFile.size / CHUNK_SIZE);
      let uploadedFileId: string | null = null;

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, contractFile.size);
        const chunk = contractFile.slice(start, end);

        const uploadRes = await fetch(session.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Length': String(chunk.size),
            'Content-Range': `bytes ${start}-${end - 1}/${contractFile.size}`
          },
          body: chunk
        });

        if (!uploadRes.ok && uploadRes.status !== 202) throw new Error('파일 업로드 실패');
        if (uploadRes.status === 200 || uploadRes.status === 201) {
          try {
            const uploadedFile = await uploadRes.json();
            uploadedFileId = uploadedFile.id;
          } catch (e) {
            console.error('Failed to parse upload response:', e);
          }
        }
        setContractProgress(Math.round(((i + 1) / totalChunks) * 100));
      }

      const completeRes = await fetch(`/api/submit/${campaignId}/contract-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          fileName: session.finalFileName,
          fileSize: contractFile.size,
          folderId: session.folderId,
          fileId: uploadedFileId
        })
      });
      if (!completeRes.ok) throw new Error('제출 기록 저장 실패');

      toast({ title: "제출 완료", description: "계약서 서명본이 제출되었습니다." });
      setContractFile(null);
      refreshVerifiedData();
      setSection('menu');
    } catch (error: any) {
      toast({ title: "업로드 실패", description: error.message, variant: "destructive" });
    } finally {
      setContractUploading(false);
    }
  };

  const handleContentUpload = async () => {
    if (!selectedFile || !verifiedData) return;
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const sessionRes = await fetch(`/api/submit/${campaignId}/upload-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fileName: selectedFile.name, submissionType: 'file' })
      });
      if (!sessionRes.ok) {
        const data = await sessionRes.json();
        throw new Error(data.message || '업로드 세션 생성 실패');
      }
      const session = await sessionRes.json();

      const CHUNK_SIZE = 10 * 1024 * 1024;
      const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);
      let uploadedFileId: string | null = null;

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, selectedFile.size);
        const chunk = selectedFile.slice(start, end);

        const uploadRes = await fetch(session.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Length': String(chunk.size),
            'Content-Range': `bytes ${start}-${end - 1}/${selectedFile.size}`
          },
          body: chunk
        });

        if (!uploadRes.ok && uploadRes.status !== 202) throw new Error('파일 업로드 실패');
        if (uploadRes.status === 200 || uploadRes.status === 201) {
          try {
            const uploadedFile = await uploadRes.json();
            uploadedFileId = uploadedFile.id;
          } catch (e) {
            console.error('Failed to parse upload response:', e);
          }
        }
        setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
      }

      const completeRes = await fetch(`/api/submit/${campaignId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          submissionType: 'file',
          fileName: session.finalFileName,
          fileSize: selectedFile.size,
          folderId: session.folderId,
          fileId: uploadedFileId,
          memo
        })
      });
      if (!completeRes.ok) throw new Error('제출 기록 저장 실패');

      toast({ title: "업로드 완료", description: "파일이 성공적으로 제출되었습니다." });
      setSelectedFile(null);
      setMemo('');
      fetchHistory();
      refreshVerifiedData();
    } catch (error: any) {
      toast({ title: "업로드 실패", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('video/')) return <FileVideo className="h-8 w-8 text-blue-500" />;
    if (file.type.startsWith('image/')) return <FileImage className="h-8 w-8 text-green-500" />;
    return <File className="h-8 w-8 text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const goToMenu = () => {
    setSection('menu');
  };

  if (isLoadingCampaign) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (campaignError || !campaignInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">캠페인을 찾을 수 없습니다</h2>
            <p className="text-muted-foreground text-sm">링크가 올바른지 확인해주세요.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-8">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-1">인플루언서 포탈</h1>
          <p className="text-muted-foreground">{campaignInfo.name}</p>
        </div>

        {section === 'email' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">이메일 확인</CardTitle>
              <CardDescription>등록된 이메일 주소를 입력해주세요</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && verifyEmail.mutate(email)}
                  data-testid="input-submit-email"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => verifyEmail.mutate(email)}
                disabled={!email || verifyEmail.isPending}
                data-testid="button-verify-email"
              >
                {verifyEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                확인
              </Button>
            </CardContent>
          </Card>
        )}

        {section === 'menu' && verifiedData && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-sm text-muted-foreground mb-1">
                  안녕하세요, <span className="font-semibold text-foreground">{verifiedData.influencerName}</span>님!
                </p>
                <p className="text-center text-xs text-muted-foreground">
                  아래 메뉴에서 필요한 항목을 선택해주세요.
                </p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setSettlement({ bankName: '', accountHolder: '', accountNumber: '', settlementType: '', businessName: '', businessRegNo: '', freelancerId: '' });
                  setSection('settlement');
                }}
                className="relative flex flex-col items-center gap-3 p-5 rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all text-center"
                data-testid="menu-settlement"
              >
                {verifiedData.hasSettlementInfo && (
                  <Badge className="absolute top-2 right-2 bg-green-500 hover:bg-green-500 text-white text-[10px] px-1.5 py-0.5">
                    <CheckCircle className="w-3 h-3 mr-0.5" />
                    완료
                  </Badge>
                )}
                <Wallet className="h-8 w-8 text-blue-500" />
                <span className="text-sm font-medium">정산정보 입력</span>
              </button>

              <button
                onClick={() => {
                  setContractFile(null);
                  setContractProgress(0);
                  setSection('contract');
                }}
                className="relative flex flex-col items-center gap-3 p-5 rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all text-center"
                data-testid="menu-contract"
              >
                {verifiedData.hasContractFile && (
                  <Badge className="absolute top-2 right-2 bg-green-500 hover:bg-green-500 text-white text-[10px] px-1.5 py-0.5">
                    <CheckCircle className="w-3 h-3 mr-0.5" />
                    완료
                  </Badge>
                )}
                <FileSignature className="h-8 w-8 text-purple-500" />
                <span className="text-sm font-medium">계약서 서명본 제출</span>
              </button>

              <button
                onClick={() => {
                  setSelectedFile(null);
                  setMemo('');
                  setUploadProgress(0);
                  setSection('content');
                }}
                className="relative flex flex-col items-center gap-3 p-5 rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all text-center"
                data-testid="menu-content"
              >
                {verifiedData.submissionCount > 0 && (
                  <Badge className="absolute top-2 right-2 bg-blue-500 hover:bg-blue-500 text-white text-[10px] px-1.5 py-0.5">
                    {verifiedData.submissionCount}건
                  </Badge>
                )}
                <FolderUp className="h-8 w-8 text-orange-500" />
                <span className="text-sm font-medium">콘텐츠 제출</span>
              </button>

              <button
                onClick={() => setSection('postinfo')}
                className="relative flex flex-col items-center gap-3 p-5 rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all text-center"
                data-testid="menu-postinfo"
              >
                {verifiedData.hasPostInfo && (
                  <Badge className="absolute top-2 right-2 bg-green-500 hover:bg-green-500 text-white text-[10px] px-1.5 py-0.5">
                    <CheckCircle className="w-3 h-3 mr-0.5" />
                    완료
                  </Badge>
                )}
                <Info className="h-8 w-8 text-teal-500" />
                <span className="text-sm font-medium">업로드 정보 기입</span>
              </button>
            </div>
          </div>
        )}

        {section === 'settlement' && verifiedData && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToMenu} data-testid="button-back-menu">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <CardTitle className="text-lg">정산정보 입력</CardTitle>
                  <CardDescription>정산에 필요한 정보를 입력해주세요</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {verifiedData.hasSettlementInfo && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <p className="text-xs text-green-700 dark:text-green-400">이미 등록된 정산정보가 있습니다. 수정이 필요한 경우 아래에 새로 입력해주세요.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>은행명 <span className="text-destructive">*</span></Label>
                <Select
                  value={settlement.bankName}
                  onValueChange={(v) => setSettlement(prev => ({ ...prev, bankName: v }))}
                >
                  <SelectTrigger data-testid="select-bank">
                    <SelectValue placeholder="은행을 선택해주세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {BANK_LIST.map(bank => (
                      <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accountHolder">예금주명 <span className="text-destructive">*</span></Label>
                <Input
                  id="accountHolder"
                  placeholder="예금주명을 입력해주세요"
                  value={settlement.accountHolder}
                  onChange={(e) => setSettlement(prev => ({ ...prev, accountHolder: e.target.value }))}
                  data-testid="input-account-holder"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accountNumber">계좌번호 <span className="text-destructive">*</span></Label>
                <Input
                  id="accountNumber"
                  placeholder="숫자만 입력 (하이픈, 공백 없이)"
                  value={settlement.accountNumber}
                  onChange={(e) => handleAccountNumberChange(e.target.value)}
                  inputMode="numeric"
                  data-testid="input-account-number"
                />
              </div>

              <div className="space-y-2">
                <Label>정산유형 <span className="text-destructive">*</span></Label>
                <Select
                  value={settlement.settlementType}
                  onValueChange={(v) => setSettlement(prev => ({ ...prev, settlementType: v, businessRegNo: '', freelancerId: '' }))}
                >
                  <SelectTrigger data-testid="select-settlement-type">
                    <SelectValue placeholder="정산유형을 선택해주세요" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="사업자">사업자</SelectItem>
                    <SelectItem value="프리랜서">프리랜서</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessName">
                  {settlement.settlementType === '사업자' ? '사업자명' : '성명'} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="businessName"
                  placeholder={settlement.settlementType === '사업자' ? '사업자명을 입력해주세요' : '성명을 입력해주세요'}
                  value={settlement.businessName}
                  onChange={(e) => setSettlement(prev => ({ ...prev, businessName: e.target.value }))}
                  data-testid="input-business-name"
                />
              </div>

              {settlement.settlementType === '사업자' && (
                <div className="space-y-2">
                  <Label htmlFor="businessRegNo">사업자등록번호 <span className="text-destructive">*</span></Label>
                  <Input
                    id="businessRegNo"
                    placeholder="000-00-00000"
                    value={settlement.businessRegNo}
                    onChange={(e) => setSettlement(prev => ({ ...prev, businessRegNo: formatBusinessRegNo(e.target.value) }))}
                    inputMode="numeric"
                    maxLength={12}
                    data-testid="input-business-reg-no"
                  />
                </div>
              )}

              {settlement.settlementType === '프리랜서' && (
                <div className="space-y-2">
                  <Label htmlFor="freelancerId">주민등록번호 <span className="text-destructive">*</span></Label>
                  <Input
                    id="freelancerId"
                    placeholder="000000-0000000"
                    value={settlement.freelancerId}
                    onChange={(e) => setSettlement(prev => ({ ...prev, freelancerId: formatResidentId(e.target.value) }))}
                    inputMode="numeric"
                    maxLength={14}
                    data-testid="input-freelancer-id"
                  />
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => saveSettlement.mutate()}
                disabled={!isSettlementValid() || saveSettlement.isPending}
                data-testid="button-save-settlement"
              >
                {saveSettlement.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                등록하기
              </Button>
            </CardContent>
          </Card>
        )}

        {section === 'contract' && verifiedData && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToMenu} data-testid="button-back-menu-contract">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <CardTitle className="text-lg">계약서 서명본 제출</CardTitle>
                  <CardDescription>서명된 계약서를 업로드해주세요</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {verifiedData.hasContractFile && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <p className="text-xs text-green-700 dark:text-green-400">이미 계약서가 제출되었습니다. 다시 제출하면 기존 파일이 교체됩니다.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>서명된 계약서 파일</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    onChange={handleContractFileSelect}
                    className="hidden"
                    id="contract-upload"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    data-testid="input-contract-file"
                  />
                  <label htmlFor="contract-upload" className="cursor-pointer">
                    {contractFile ? (
                      <div className="flex items-center justify-center gap-3">
                        {getFileIcon(contractFile)}
                        <div className="text-left">
                          <p className="font-medium text-sm">{contractFile.name}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(contractFile.size)}</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <FileSignature className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">클릭하여 파일 선택</p>
                        <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, DOC 지원</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {contractUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>업로드 중...</span>
                    <span>{contractProgress}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${contractProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleContractUpload}
                disabled={!contractFile || contractUploading}
                data-testid="button-upload-contract"
              >
                {contractUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    업로드 중...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    제출하기
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {section === 'content' && verifiedData && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToMenu} data-testid="button-back-menu-content">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <CardTitle className="text-lg">콘텐츠 제출</CardTitle>
                  <CardDescription>초안 또는 완성본 파일을 업로드해주세요</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>파일 선택</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="content-upload"
                    accept="video/*,image/*,.pdf,.doc,.docx"
                    data-testid="input-file-upload"
                  />
                  <label htmlFor="content-upload" className="cursor-pointer">
                    {selectedFile ? (
                      <div className="flex items-center justify-center gap-3">
                        {getFileIcon(selectedFile)}
                        <div className="text-left">
                          <p className="font-medium text-sm">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">클릭하여 파일 선택</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="memo">메모 (선택)</Label>
                <Textarea
                  id="memo"
                  placeholder="담당자에게 전할 메시지가 있으면 작성해주세요"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={3}
                  data-testid="textarea-memo"
                />
              </div>

              {isUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>업로드 중...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleContentUpload}
                disabled={!selectedFile || isUploading}
                data-testid="button-upload"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    업로드 중...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    업로드
                  </>
                )}
              </Button>

              {submissionHistory.length > 0 && (
                <div className="pt-4 border-t">
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4" />
                    제출 내역 ({submissionHistory.length}건)
                  </h3>
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>파일명</TableHead>
                          <TableHead>크기</TableHead>
                          <TableHead>제출일시</TableHead>
                          <TableHead>파일</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {submissionHistory.map((sub) => (
                          <TableRow key={sub.id} data-testid={`row-history-${sub.id}`}>
                            <TableCell className="max-w-[200px] truncate">
                              <div className="flex items-center gap-1">
                                <FileText className="w-3 h-3 flex-shrink-0" />
                                {sub.fileName}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{formatFileSize(sub.fileSize)}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('ko-KR') : '-'}
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
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {section === 'postinfo' && verifiedData && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToMenu} data-testid="button-back-menu-postinfo">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <CardTitle className="text-lg">업로드 정보 기입</CardTitle>
                  <CardDescription>콘텐츠 게시 후 아래 정보를 입력해주세요</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {verifiedData.hasPostInfo && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <p className="text-xs text-green-700 dark:text-green-400">이미 정보가 등록되었습니다. 수정이 필요한 경우 아래에 다시 입력해주세요.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="postUrl">게시물 URL</Label>
                <Input
                  id="postUrl"
                  placeholder="https://instagram.com/p/... 또는 https://youtube.com/..."
                  value={postUrl}
                  onChange={(e) => setPostUrl(e.target.value)}
                  data-testid="input-post-url"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="metaPartnershipCode">Meta 파트너십 코드</Label>
                <Input
                  id="metaPartnershipCode"
                  placeholder="파트너십 코드를 입력해주세요"
                  value={metaPartnershipCode}
                  onChange={(e) => setMetaPartnershipCode(e.target.value)}
                  data-testid="input-meta-partnership-code"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => savePostInfo.mutate()}
                disabled={savePostInfo.isPending || (!postUrl && !metaPartnershipCode)}
                data-testid="button-save-post-info"
              >
                {savePostInfo.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                저장하기
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
