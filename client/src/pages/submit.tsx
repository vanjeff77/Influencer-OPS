import { useState, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, CheckCircle, Loader2, FileVideo, FileImage, File, AlertCircle } from "lucide-react";

type Step = 'email' | 'settlement' | 'upload' | 'complete';

interface SettlementInfo {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  settlementType: string;
  businessName: string;
  businessRegNo: string;
  freelancerId: string;
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
  
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [verifiedData, setVerifiedData] = useState<{ influencerId: number; influencerName: string; lineItemId: number; settlementInfo: SettlementInfo; hasSettlementInfo: boolean } | null>(null);
  const [submissionType, setSubmissionType] = useState<'draft' | 'final'>('draft');
  const [memo, setMemo] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const [settlement, setSettlement] = useState<SettlementInfo>({
    bankName: '', accountHolder: '', accountNumber: '',
    settlementType: '', businessName: '', businessRegNo: '', freelancerId: ''
  });

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

  const verifyEmail = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch(`/api/submit/${campaignId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || '이메일 인증 실패');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setVerifiedData(data);
      const info = data.settlementInfo;
      setSettlement({
        bankName: info.bankName,
        accountHolder: info.accountHolder,
        accountNumber: data.hasSettlementInfo ? '' : info.accountNumber,
        settlementType: info.settlementType,
        businessName: info.businessName,
        businessRegNo: '',
        freelancerId: '',
      });
      setStep('settlement');
    },
    onError: (error: Error) => {
      toast({ title: "인증 실패", description: error.message, variant: "destructive" });
    }
  });

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
      setStep('upload');
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
    if (file) {
      setSelectedFile(file);
    }
  }, []);

  const handleUpload = async () => {
    if (!selectedFile || !verifiedData) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const sessionRes = await fetch(`/api/submit/${campaignId}/upload-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          fileName: selectedFile.name,
          submissionType
        })
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

        if (!uploadRes.ok && uploadRes.status !== 202) {
          throw new Error('파일 업로드 실패');
        }

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
          submissionType,
          fileName: session.finalFileName,
          fileSize: selectedFile.size,
          folderId: session.folderId,
          fileId: uploadedFileId,
          memo
        })
      });

      if (!completeRes.ok) {
        throw new Error('제출 기록 저장 실패');
      }

      setStep('complete');
      toast({ title: "업로드 완료", description: "파일이 성공적으로 제출되었습니다." });

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

  const stepIndex = step === 'email' ? 1 : step === 'settlement' ? 2 : step === 'upload' ? 3 : 3;
  const totalSteps = 3;

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
          <h1 className="text-2xl font-bold mb-1">콘텐츠 제출</h1>
          <p className="text-muted-foreground">{campaignInfo.name}</p>
        </div>

        {step !== 'complete' && (
          <div className="flex items-center gap-2 mb-6 px-4" data-testid="step-indicator">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex-1">
                <div className={`h-1.5 rounded-full transition-colors ${s < stepIndex ? 'bg-primary' : s === stepIndex ? 'bg-primary/50' : 'bg-muted'}`} />
              </div>
            ))}
            <span className="text-xs text-muted-foreground ml-1">{stepIndex}/{totalSteps}</span>
          </div>
        )}

        {step === 'email' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">이메일 확인</CardTitle>
              <CardDescription>
                등록된 이메일 주소를 입력해주세요
              </CardDescription>
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

        {step === 'settlement' && verifiedData && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">정산 정보 확인</CardTitle>
              <CardDescription>
                {verifiedData.influencerName}님, 정산에 필요한 정보를 {verifiedData.hasSettlementInfo ? '확인해주세요. 보안을 위해 계좌번호와 등록번호는 다시 입력해주세요.' : '입력해주세요'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                확인 후 다음
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'upload' && verifiedData && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">파일 업로드</CardTitle>
              <CardDescription>
                안녕하세요, {verifiedData.influencerName}님!
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>제출 유형</Label>
                <RadioGroup value={submissionType} onValueChange={(v) => setSubmissionType(v as 'draft' | 'final')}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="draft" id="draft" data-testid="radio-draft" />
                    <Label htmlFor="draft" className="font-normal">초안</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="final" id="final" data-testid="radio-final" />
                    <Label htmlFor="final" className="font-normal">완성본</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>파일 선택</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                    accept="video/*,image/*,.pdf,.doc,.docx"
                    data-testid="input-file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
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
                onClick={handleUpload}
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
            </CardContent>
          </Card>
        )}

        {step === 'complete' && (
          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">제출 완료!</h2>
              <p className="text-muted-foreground mb-4">
                파일이 성공적으로 업로드되었습니다.<br />
                담당자가 확인 후 연락드리겠습니다.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setStep('upload');
                  setSelectedFile(null);
                  setMemo('');
                  setUploadProgress(0);
                }}
                data-testid="button-upload-another"
              >
                추가 파일 업로드
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
