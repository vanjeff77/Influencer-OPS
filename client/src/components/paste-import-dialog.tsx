import { useState, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AlertTriangle, CheckCircle, XCircle, Loader2, Plus, Trash2, ClipboardPaste } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const FIXED_COLUMNS = [
  { key: 'nickname', label: '닉네임', required: true },
  { key: 'handle', label: '플랫폼 계정', required: true },
  { key: 'platform', label: '플랫폼', required: true },
  { key: 'followers', label: '팔로워', required: false },
  { key: 'contactPoint', label: '컨택포인트', required: false },
  { key: 'tag1', label: '태그1', required: false },
  { key: 'tag2', label: '태그2', required: false },
  { key: 'tag3', label: '태그3', required: false },
  { key: 'memo', label: '메모', required: false },
  { key: 'priceMemo', label: '단가 메모', required: false },
];

const ALLOWED_PLATFORMS = ['Instagram', 'YouTube', 'TikTok', 'X', 'Blog'];

interface RowData {
  nickname: string;
  handle: string;
  platform: string;
  followers: string;
  contactPoint: string;
  tag1: string;
  tag2: string;
  tag3: string;
  memo: string;
  priceMemo: string;
}

interface RowError {
  [key: string]: string;
}

interface BatchResult {
  index: number;
  status: 'created' | 'failed';
  reason?: string;
  influencerId?: number;
}

interface PasteImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: number;
  onImportComplete: () => void;
  clients?: { id: number; name: string }[];
}

const createEmptyRow = (): RowData => ({
  nickname: '',
  handle: '',
  platform: '',
  followers: '',
  contactPoint: '',
  tag1: '',
  tag2: '',
  tag3: '',
  memo: '',
  priceMemo: '',
});

export function PasteImportDialog({ open, onOpenChange, workspaceId, onImportComplete }: PasteImportDialogProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<RowData[]>([createEmptyRow()]);
  const [errors, setErrors] = useState<Map<number, RowError>>(new Map());
  const [isValidated, setIsValidated] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setRows([createEmptyRow()]);
      setErrors(new Map());
      setIsValidated(false);
      setResults(null);
    }
  }, [open]);

  const updateCell = (rowIndex: number, key: keyof RowData, value: string) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[rowIndex] = { ...newRows[rowIndex], [key]: value };
      return newRows;
    });
    setIsValidated(false);
    setErrors(prev => {
      const newErrors = new Map(prev);
      const rowErrors = newErrors.get(rowIndex);
      if (rowErrors && rowErrors[key]) {
        const { [key]: _, ...rest } = rowErrors;
        if (Object.keys(rest).length === 0) {
          newErrors.delete(rowIndex);
        } else {
          newErrors.set(rowIndex, rest);
        }
      }
      return newErrors;
    });
  };

  const addRow = () => {
    setRows(prev => [...prev, createEmptyRow()]);
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(prev => prev.filter((_, i) => i !== index));
    setErrors(prev => {
      const newErrors = new Map();
      prev.forEach((err, idx) => {
        if (idx < index) newErrors.set(idx, err);
        else if (idx > index) newErrors.set(idx - 1, err);
      });
      return newErrors;
    });
  };

  const parseFollowers = (value: string): number | null => {
    if (!value.trim()) return null;
    const cleaned = value.replace(/[,\s]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  };

  const normalizePlatform = (value: string): string | null => {
    const lower = value.toLowerCase().trim();
    const mapping: Record<string, string> = {
      'instagram': 'Instagram',
      'insta': 'Instagram',
      '인스타': 'Instagram',
      '인스타그램': 'Instagram',
      'youtube': 'YouTube',
      'yt': 'YouTube',
      '유튜브': 'YouTube',
      'tiktok': 'TikTok',
      '틱톡': 'TikTok',
      'x': 'X',
      'twitter': 'X',
      '트위터': 'X',
      'blog': 'Blog',
      '블로그': 'Blog',
      '네이버블로그': 'Blog',
    };
    return mapping[lower] || (ALLOWED_PLATFORMS.includes(value) ? value : null);
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (!text.trim()) return;

    const lines = text.split(/\r?\n/).filter(line => line.trim());
    const parsedRows: RowData[] = [];

    for (const line of lines) {
      const cells = line.split('\t');
      const row: RowData = {
        nickname: (cells[0] || '').trim(),
        handle: (cells[1] || '').trim(),
        platform: (cells[2] || '').trim(),
        followers: (cells[3] || '').trim(),
        contactPoint: (cells[4] || '').trim(),
        tag1: (cells[5] || '').trim(),
        tag2: (cells[6] || '').trim(),
        tag3: (cells[7] || '').trim(),
        memo: (cells[8] || '').trim(),
        priceMemo: (cells[9] || '').trim(),
      };
      if (row.nickname || row.handle || row.platform) {
        parsedRows.push(row);
      }
    }

    if (parsedRows.length > 0) {
      setRows(parsedRows);
      setIsValidated(false);
      setErrors(new Map());
      setResults(null);
      toast({ title: `${parsedRows.length}개 행이 붙여넣기 되었습니다.` });
    }
  }, [toast]);

  const validate = useCallback(async () => {
    const newErrors = new Map<number, RowError>();
    const seenHandles = new Map<string, number>();

    rows.forEach((row, index) => {
      const rowError: RowError = {};

      if (!row.nickname.trim()) {
        rowError.nickname = '닉네임은 필수입니다';
      }
      if (!row.handle.trim()) {
        rowError.handle = '플랫폼 계정은 필수입니다';
      }
      if (!row.platform.trim()) {
        rowError.platform = '플랫폼은 필수입니다';
      } else {
        const normalized = normalizePlatform(row.platform);
        if (!normalized) {
          rowError.platform = `허용된 플랫폼: ${ALLOWED_PLATFORMS.join(', ')}`;
        }
      }

      if (row.followers.trim()) {
        const parsed = parseFollowers(row.followers);
        if (parsed === null) {
          rowError.followers = '숫자만 입력 가능합니다';
        }
      }

      const handleKey = `${normalizePlatform(row.platform) || row.platform}:${row.handle.toLowerCase().trim()}`;
      if (row.platform && row.handle) {
        if (seenHandles.has(handleKey)) {
          rowError.handle = `${seenHandles.get(handleKey)! + 1}번 행과 중복됩니다`;
        } else {
          seenHandles.set(handleKey, index);
        }
      }

      if (Object.keys(rowError).length > 0) {
        newErrors.set(index, rowError);
      }
    });

    setErrors(newErrors);
    setIsValidated(true);

    if (newErrors.size === 0) {
      toast({ title: '유효성 검사 통과', description: `${rows.length}개 행이 준비되었습니다.` });
    } else {
      toast({ title: '유효성 검사 실패', description: `${newErrors.size}개 행에 오류가 있습니다.`, variant: 'destructive' });
    }
  }, [rows, toast]);

  const handleImport = useCallback(async () => {
    if (errors.size > 0) {
      toast({ title: '오류를 먼저 수정해주세요', variant: 'destructive' });
      return;
    }

    setIsImporting(true);
    try {
      const items = rows.map(row => ({
        nickname: row.nickname.trim(),
        handle: row.handle.trim(),
        platform: normalizePlatform(row.platform) || row.platform,
        followers: parseFollowers(row.followers),
        contactPoint: row.contactPoint.trim() || null,
        tag1: row.tag1.trim() || null,
        tag2: row.tag2.trim() || null,
        tag3: row.tag3.trim() || null,
        memo: row.memo.trim() || null,
        priceMemo: row.priceMemo.trim() || null,
      }));

      const response = await apiRequest('POST', `/api/workspaces/${workspaceId}/influencers/batch`, { items });
      const result = await response.json() as { createdCount: number; failedCount: number; results: BatchResult[] };

      setResults(result.results);

      if (result.createdCount > 0) {
        toast({ title: `${result.createdCount}명 생성 완료`, description: result.failedCount > 0 ? `${result.failedCount}명 실패` : undefined });
        onImportComplete();
      } else {
        toast({ title: '생성 실패', description: '모든 항목이 실패했습니다.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: '일괄 추가 실패', description: err.message || '오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
  }, [rows, errors, workspaceId, toast, onImportComplete]);

  const keepFailedRows = () => {
    if (!results) return;
    const failedIndices = results.filter(r => r.status === 'failed').map(r => r.index);
    const failedRows = rows.filter((_, i) => failedIndices.includes(i));
    if (failedRows.length > 0) {
      setRows(failedRows);
      setResults(null);
      setIsValidated(false);
      setErrors(new Map());
    }
  };

  const getRowStatus = (index: number): 'error' | 'success' | 'failed' | null => {
    if (results) {
      const result = results.find(r => r.index === index);
      if (result) return result.status === 'created' ? 'success' : 'failed';
    }
    if (errors.has(index)) return 'error';
    return null;
  };

  const createdCount = results?.filter(r => r.status === 'created').length || 0;
  const failedCount = results?.filter(r => r.status === 'failed').length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>인플루언서 일괄 추가</DialogTitle>
          <DialogDescription>
            엑셀에서 복사한 데이터를 그대로 붙여넣으면 여러 인플루언서를 한 번에 추가할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-3 text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2">
          <ClipboardPaste className="w-4 h-4 mt-0.5 shrink-0" />
          <span>테이블 아무 곳에서나 Ctrl+V (Cmd+V)로 붙여넣기하세요. 열 순서: 닉네임, 플랫폼 계정, 플랫폼, 팔로워, 컨택포인트, 태그1, 태그2, 태그3, 메모, 단가 메모</span>
        </div>

        {results && (
          <div className="flex items-center gap-4 p-3 bg-muted rounded-md">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="font-medium">성공: {createdCount}건</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="font-medium">실패: {failedCount}건</span>
            </div>
            {failedCount > 0 && (
              <Button variant="outline" size="sm" onClick={keepFailedRows}>
                실패한 행만 남기기
              </Button>
            )}
          </div>
        )}

        <div 
          ref={gridRef}
          className="flex-1 min-h-0 border rounded-md overflow-hidden"
          onPaste={handlePaste}
          tabIndex={0}
        >
          <ScrollArea className="h-[400px]">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-muted sticky top-0 z-10">
                <tr>
                  <th className="w-10 px-2 py-2 text-center font-medium border-b border-r">#</th>
                  {FIXED_COLUMNS.map(col => (
                    <th key={col.key} className="px-2 py-2 text-left font-medium border-b border-r whitespace-nowrap">
                      {col.label}
                      {col.required && <span className="text-red-500 ml-0.5">*</span>}
                    </th>
                  ))}
                  <th className="w-10 px-2 py-2 text-center border-b">삭제</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => {
                  const rowStatus = getRowStatus(rowIndex);
                  const rowResult = results?.find(r => r.index === rowIndex);
                  const rowErrors = errors.get(rowIndex) || {};

                  return (
                    <tr 
                      key={rowIndex} 
                      className={`border-b ${
                        rowStatus === 'success' ? 'bg-green-50 dark:bg-green-950' :
                        rowStatus === 'failed' ? 'bg-red-50 dark:bg-red-950' :
                        rowStatus === 'error' ? 'bg-red-50/50 dark:bg-red-950/50' : ''
                      }`}
                    >
                      <td className="px-2 py-1 text-center text-muted-foreground border-r">
                        {rowIndex + 1}
                        {rowStatus === 'success' && <CheckCircle className="w-3 h-3 text-green-500 inline ml-1" />}
                        {rowStatus === 'failed' && (
                          <Tooltip>
                            <TooltipTrigger>
                              <XCircle className="w-3 h-3 text-red-500 inline ml-1" />
                            </TooltipTrigger>
                            <TooltipContent>{rowResult?.reason}</TooltipContent>
                          </Tooltip>
                        )}
                      </td>

                      {FIXED_COLUMNS.map(col => {
                        const cellError = rowErrors[col.key];
                        const value = row[col.key as keyof RowData];

                        if (col.key === 'platform') {
                          return (
                            <td key={col.key} className="px-1 py-1 border-r">
                              <Tooltip open={!!cellError}>
                                <TooltipTrigger asChild>
                                  <div>
                                    <Select
                                      value={normalizePlatform(value) || ''}
                                      onValueChange={(v) => updateCell(rowIndex, 'platform', v)}
                                    >
                                      <SelectTrigger 
                                        className={`h-8 text-xs ${cellError ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''}`}
                                        data-testid={`select-platform-${rowIndex}`}
                                      >
                                        <SelectValue placeholder="선택" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {ALLOWED_PLATFORMS.map(p => (
                                          <SelectItem key={p} value={p}>{p}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </TooltipTrigger>
                                {cellError && (
                                  <TooltipContent side="bottom" className="bg-red-500 text-white">
                                    {cellError}
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </td>
                          );
                        }

                        return (
                          <td key={col.key} className="px-1 py-1 border-r">
                            <Tooltip open={!!cellError}>
                              <TooltipTrigger asChild>
                                <Input
                                  value={value}
                                  onChange={(e) => updateCell(rowIndex, col.key as keyof RowData, e.target.value)}
                                  className={`h-8 text-xs ${cellError ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''}`}
                                  placeholder={col.label}
                                  data-testid={`input-${col.key}-${rowIndex}`}
                                />
                              </TooltipTrigger>
                              {cellError && (
                                <TooltipContent side="bottom" className="bg-red-500 text-white">
                                  {cellError}
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </td>
                        );
                      })}

                      <td className="px-1 py-1 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(rowIndex)}
                          disabled={rows.length === 1}
                          data-testid={`button-remove-row-${rowIndex}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={addRow} className="gap-1" data-testid="button-add-row">
            <Plus className="w-4 h-4" />
            행 추가
          </Button>

          <div className="flex items-center gap-2">
            {errors.size > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" />
                {errors.size}개 오류
              </Badge>
            )}
            <Button variant="outline" onClick={validate} disabled={isImporting} data-testid="button-validate">
              유효성 검사
            </Button>
            <Button 
              onClick={handleImport} 
              disabled={isImporting || !isValidated || errors.size > 0}
              data-testid="button-batch-import"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  처리 중...
                </>
              ) : (
                '일괄 추가'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
