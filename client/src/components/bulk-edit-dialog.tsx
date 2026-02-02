import { useState, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertTriangle, CheckCircle, XCircle, Loader2, Save } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Influencer, InfluencerAccount } from "@shared/schema";

const EDIT_COLUMNS = [
  { key: 'name', label: '닉네임', required: true, width: 'w-28' },
  { key: 'platform', label: '플랫폼', required: false, width: 'w-24' },
  { key: 'handle', label: '플랫폼 계정', required: false, width: 'w-28' },
  { key: 'followers', label: '팔로워', required: false, width: 'w-20' },
  { key: 'email', label: '이메일', required: false, width: 'w-36' },
  { key: 'contactPoint', label: '컨택포인트', required: false, width: 'w-32' },
  { key: 'memo', label: '메모', required: false, width: 'w-36' },
  { key: 'priceMemo', label: '단가 메모', required: false, width: 'w-28' },
];

const ALLOWED_PLATFORMS = ['IG', 'YT', 'TikTok', 'X', 'Blog'];

interface InfluencerWithAccounts extends Influencer {
  accounts?: InfluencerAccount[];
}

interface RowData {
  id: number;
  name: string;
  platform: string;
  handle: string;
  followers: string;
  email: string;
  contactPoint: string;
  memo: string;
  priceMemo: string;
  originalData: InfluencerWithAccounts;
}

interface RowError {
  [key: string]: string;
}

interface BulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: number;
  selectedIds: number[];
  influencers: InfluencerWithAccounts[];
  onEditComplete: () => void;
}

export function BulkEditDialog({ open, onOpenChange, workspaceId, selectedIds, influencers, onEditComplete }: BulkEditDialogProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<RowData[]>([]);
  const [errors, setErrors] = useState<Map<number, RowError>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && selectedIds.length > 0) {
      const selectedInfluencers = influencers.filter(inf => selectedIds.includes(inf.id));
      const initialRows: RowData[] = selectedInfluencers.map(inf => {
        const primaryAccount = inf.accounts?.[0];
        return {
          id: inf.id,
          name: inf.name || '',
          platform: primaryAccount?.platform || '',
          handle: primaryAccount?.handle || '',
          followers: primaryAccount?.followers?.toString() || '',
          email: inf.email || '',
          contactPoint: inf.contactPoint || '',
          memo: inf.memo || '',
          priceMemo: inf.priceMemo || '',
          originalData: inf,
        };
      });
      setRows(initialRows);
      setErrors(new Map());
      setSavedCount(0);
    }
  }, [open, selectedIds, influencers]);

  const updateCell = (rowIndex: number, key: keyof RowData, value: string) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[rowIndex] = { ...newRows[rowIndex], [key]: value };
      return newRows;
    });
    setErrors(prev => {
      const newErrors = new Map(prev);
      const rowErrors = newErrors.get(rowIndex);
      if (rowErrors && rowErrors[key as string]) {
        const { [key as string]: _, ...rest } = rowErrors;
        if (Object.keys(rest).length === 0) {
          newErrors.delete(rowIndex);
        } else {
          newErrors.set(rowIndex, rest);
        }
      }
      return newErrors;
    });
  };

  const normalizePlatform = (input: string): string => {
    const normalized = input.trim().toLowerCase();
    const platformMap: Record<string, string> = {
      'instagram': 'IG', 'ig': 'IG', '인스타': 'IG', '인스타그램': 'IG',
      'youtube': 'YT', 'yt': 'YT', '유튜브': 'YT',
      'tiktok': 'TikTok', '틱톡': 'TikTok',
      'x': 'X', 'twitter': 'X', '트위터': 'X', '엑스': 'X',
      'blog': 'Blog', '블로그': 'Blog', '네이버블로그': 'Blog', '네이버 블로그': 'Blog',
    };
    return platformMap[normalized] || input;
  };

  const validateRows = useCallback(() => {
    const newErrors = new Map<number, RowError>();
    
    rows.forEach((row, index) => {
      const rowErrors: RowError = {};
      
      if (!row.name.trim()) {
        rowErrors.name = '닉네임 필수';
      }
      
      if (row.platform && !ALLOWED_PLATFORMS.includes(normalizePlatform(row.platform))) {
        rowErrors.platform = '유효하지 않은 플랫폼';
      }
      
      if (row.followers && isNaN(parseInt(row.followers.replace(/,/g, '')))) {
        rowErrors.followers = '숫자만 입력';
      }
      
      if (Object.keys(rowErrors).length > 0) {
        newErrors.set(index, rowErrors);
      }
    });
    
    setErrors(newErrors);
    return newErrors.size === 0;
  }, [rows]);

  const handleSave = async () => {
    if (!validateRows()) {
      toast({ title: '입력 오류를 확인해주세요.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    setSavedCount(0);

    try {
      let successCount = 0;
      
      for (const row of rows) {
        const originalAccount = row.originalData.accounts?.[0];
        const followers = row.followers ? parseInt(row.followers.replace(/,/g, '')) : null;
        const platform = normalizePlatform(row.platform);
        
        const updates: any = {
          name: row.name,
          email: row.email || null,
          contactPoint: row.contactPoint || null,
          memo: row.memo || null,
          priceMemo: row.priceMemo || null,
        };

        if (row.handle || row.platform || row.followers) {
          updates.accounts = [{
            id: originalAccount?.id,
            platform: platform || originalAccount?.platform || 'IG',
            handle: row.handle || originalAccount?.handle || '',
            followers: followers ?? originalAccount?.followers ?? null,
            url: originalAccount?.url || null,
          }];
        }

        await apiRequest('PATCH', `/api/influencers/${row.id}`, updates);
        successCount++;
        setSavedCount(successCount);
      }

      toast({ title: `${successCount}명의 인플루언서 정보가 수정되었습니다.` });
      queryClient.invalidateQueries({ queryKey: ['/api/influencers'] });
      onEditComplete();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: '수정 중 오류가 발생했습니다.', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData.getData('text');
    if (!clipboardData) return;

    const lines = clipboardData.split('\n').filter(line => line.trim());
    if (lines.length === 0) return;

    e.preventDefault();

    const target = e.target as HTMLInputElement;
    const cellElement = target.closest('[data-row-index]');
    if (!cellElement) return;

    const startRowIndex = parseInt(cellElement.getAttribute('data-row-index') || '0');
    const startColKey = cellElement.getAttribute('data-col-key') as keyof RowData;
    
    const colKeys = EDIT_COLUMNS.map(c => c.key) as (keyof RowData)[];
    const startColIndex = colKeys.indexOf(startColKey);
    if (startColIndex === -1) return;

    setRows(prev => {
      const newRows = [...prev];
      
      lines.forEach((line, lineIdx) => {
        const rowIdx = startRowIndex + lineIdx;
        if (rowIdx >= newRows.length) return;

        const cells = line.split('\t');
        cells.forEach((cellValue, cellIdx) => {
          const colIdx = startColIndex + cellIdx;
          if (colIdx >= colKeys.length) return;

          const key = colKeys[colIdx];
          if (key === 'id' || key === 'originalData') return;

          newRows[rowIdx] = { ...newRows[rowIdx], [key]: cellValue.trim() };
        });
      });

      return newRows;
    });
  }, []);

  const getCellClass = (rowIndex: number, key: string) => {
    const rowErrors = errors.get(rowIndex);
    if (rowErrors && rowErrors[key]) {
      return 'border-red-500 bg-red-50';
    }
    return '';
  };

  const hasErrors = errors.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1200px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            일괄 수정
            <Badge variant="secondary">{rows.length}명</Badge>
          </DialogTitle>
          <DialogDescription>
            선택한 인플루언서들의 정보를 엑셀처럼 편집할 수 있습니다. 셀에 붙여넣기(Ctrl+V)도 가능합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-[60vh]">
            <div ref={gridRef} className="overflow-x-auto" onPaste={handlePaste}>
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    <th className="p-2 text-left font-medium text-xs border-b w-8">#</th>
                    {EDIT_COLUMNS.map(col => (
                      <th key={col.key} className={`p-2 text-left font-medium text-xs border-b ${col.width}`}>
                        {col.label}
                        {col.required && <span className="text-red-500 ml-0.5">*</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={row.id} className="hover:bg-muted/50">
                      <td className="p-1 border-b text-xs text-muted-foreground">{rowIndex + 1}</td>
                      {EDIT_COLUMNS.map(col => (
                        <td 
                          key={col.key} 
                          className="p-1 border-b"
                          data-row-index={rowIndex}
                          data-col-key={col.key}
                        >
                          {col.key === 'platform' ? (
                            <Select
                              value={normalizePlatform(row.platform) || ''}
                              onValueChange={(val) => updateCell(rowIndex, 'platform', val)}
                            >
                              <SelectTrigger className={`h-7 text-xs ${getCellClass(rowIndex, col.key)}`}>
                                <SelectValue placeholder="선택" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="IG">Instagram</SelectItem>
                                <SelectItem value="YT">YouTube</SelectItem>
                                <SelectItem value="TikTok">TikTok</SelectItem>
                                <SelectItem value="X">X</SelectItem>
                                <SelectItem value="Blog">Blog</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Input
                                  className={`h-7 text-xs ${getCellClass(rowIndex, col.key)}`}
                                  value={(row as any)[col.key] || ''}
                                  onChange={(e) => updateCell(rowIndex, col.key as keyof RowData, e.target.value)}
                                  data-testid={`cell-${rowIndex}-${col.key}`}
                                />
                              </TooltipTrigger>
                              {errors.get(rowIndex)?.[col.key] && (
                                <TooltipContent side="top" className="bg-red-500 text-white">
                                  {errors.get(rowIndex)?.[col.key]}
                                </TooltipContent>
                              )}
                            </Tooltip>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-2">
            {hasErrors && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" />
                {errors.size}개 오류
              </Badge>
            )}
            {isSaving && (
              <span className="text-sm text-muted-foreground">
                저장 중... ({savedCount}/{rows.length})
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={isSaving || hasErrors}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  저장
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
