import { useState, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { KO } from "@/i18n/ko";
import { apiRequest } from "@/lib/queryClient";
import { AlertTriangle, CheckCircle, XCircle, Loader2 } from "lucide-react";

const ALLOWED_COLUMNS = [
  '닉네임', '플랫폼', '플랫폼 계정', '채널 URL', '팔로워', '컨택포인트',
  '메모', '클라이언트', '세부유형', '컨택여부', '회신 여부', '협업 여부', '콘텐츠 완성본 링크', '단가 메모'
];

interface ClientInfo {
  id: number;
  name: string;
}

interface PasteImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: number;
  onImportComplete: () => void;
  clients?: ClientInfo[];
}

type ImportState = 'paste' | 'validated' | 'importing' | 'completed';

interface ValidationResult {
  totalRows: number;
  validRows: number;
  skippedRows: number;
  errorRows: number;
  excludedColumns: string[];
  invalidClientRows: { row: number; client: string }[];
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

export function PasteImportDialog({ open, onOpenChange, workspaceId, onImportComplete, clients = [] }: PasteImportDialogProps) {
  const { toast } = useToast();
  const [state, setState] = useState<ImportState>('paste');
  const [pastedData, setPastedData] = useState<string>('');
  const [gridData, setGridData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setState('paste');
      setPastedData('');
      setGridData([]);
      setHeaders([]);
      setValidation(null);
      setImportResult(null);
    }
  }, [open]);

  const parseTsvWithQuotes = useCallback((text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentCell += '"';
          i += 2;
        } else if (char === '"') {
          inQuotes = false;
          i++;
        } else {
          currentCell += char;
          i++;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
          i++;
        } else if (char === '\t') {
          currentRow.push(currentCell);
          currentCell = '';
          i++;
        } else if (char === '\r' && nextChar === '\n') {
          currentRow.push(currentCell);
          rows.push(currentRow);
          currentRow = [];
          currentCell = '';
          i += 2;
        } else if (char === '\n') {
          currentRow.push(currentCell);
          rows.push(currentRow);
          currentRow = [];
          currentCell = '';
          i++;
        } else {
          currentCell += char;
          i++;
        }
      }
    }

    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }

    return rows.filter(row => row.some(cell => cell.trim()));
  }, []);

  const parseData = useCallback((text: string) => {
    if (!text.trim()) {
      setGridData([]);
      setHeaders([]);
      return;
    }

    const rows = parseTsvWithQuotes(text);
    if (rows.length === 0) return;

    const headerRow = rows[0] || [];
    const dataRows = rows.slice(1);

    setHeaders(headerRow);
    setGridData(dataRows);
  }, [parseTsvWithQuotes]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    setPastedData(text);
    parseData(text);
  }, [parseData]);

  const handleValidate = useCallback(() => {
    const excludedColumns = headers.filter(h => h.trim() && !ALLOWED_COLUMNS.includes(h.trim()));
    const clientNames = clients.map(c => c.name.toLowerCase().trim());
    
    let validRows = 0;
    let skippedRows = 0;
    let errorRows = 0;
    const invalidClientRows: { row: number; client: string }[] = [];

    const clientIdx = headers.findIndex(h => h.trim() === '클라이언트');

    gridData.forEach((row, index) => {
      if (!row || row.every(cell => !cell || !cell.trim())) {
        skippedRows++;
        return;
      }

      const nicknameIdx = headers.findIndex(h => h.trim() === '닉네임');
      const platformAccountIdx = headers.findIndex(h => h.trim() === '플랫폼 계정');
      const channelUrlIdx = headers.findIndex(h => h.trim() === '채널 URL');

      const nickname = nicknameIdx >= 0 ? (row[nicknameIdx] || '').trim() : '';
      const platformAccount = platformAccountIdx >= 0 ? (row[platformAccountIdx] || '').trim() : '';
      const channelUrl = channelUrlIdx >= 0 ? (row[channelUrlIdx] || '').trim() : '';

      if (!nickname && !platformAccount && !channelUrl) {
        errorRows++;
      } else {
        // Check client validity
        if (clientIdx >= 0) {
          const clientValue = (row[clientIdx] || '').trim();
          if (clientValue && !clientNames.includes(clientValue.toLowerCase())) {
            invalidClientRows.push({ row: index + 2, client: clientValue }); // +2 for 1-indexed + header row
          }
        }
        validRows++;
      }
    });

    setValidation({
      totalRows: gridData.length,
      validRows,
      skippedRows,
      errorRows,
      excludedColumns,
      invalidClientRows
    });
    setState('validated');
  }, [headers, gridData, clients]);

  const handleImport = useCallback(async () => {
    if (!workspaceId) return;

    setIsImporting(true);
    setState('importing');

    try {
      const rows = gridData.map(row => row.map(cell => cell || null));
      const response = await apiRequest(
        'POST',
        `/api/workspaces/${workspaceId}/influencers/import`,
        { headers, rows }
      );
      const result = await response.json() as ImportResult & { excludedColumns: string[] };

      setImportResult({
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors || []
      });
      setState('completed');

      toast({
        title: KO.pages.discover.importSuccess,
        description: KO.pages.discover.importSuccessDesc
      });

      onImportComplete();
    } catch (err: any) {
      let errorMessage = KO.pages.discover.importFailedDesc;
      if (err?.message) {
        errorMessage = err.message;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      toast({
        title: KO.pages.discover.importFailed,
        description: errorMessage,
        variant: "destructive"
      });
      setState('validated');
    } finally {
      setIsImporting(false);
    }
  }, [workspaceId, headers, gridData, toast, onImportComplete]);

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{KO.pages.discover.importTitle}</DialogTitle>
          <DialogDescription>{KO.pages.discover.importDesc}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {state === 'paste' && (
            <>
              <textarea
                ref={textareaRef}
                className="w-full h-32 p-3 border rounded-md font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="엑셀이나 구글시트에서 표를 복사한 후 여기에 붙여넣기 (Ctrl+V)..."
                value={pastedData}
                onChange={(e) => {
                  setPastedData(e.target.value);
                  parseData(e.target.value);
                }}
                onPaste={handlePaste}
                data-testid="textarea-paste-data"
              />

              {gridData.length > 0 && (
                <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
                  <ScrollArea className="h-64">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="px-2 py-1 text-left font-medium border-r bg-muted">#</th>
                            {headers.map((h, i) => (
                              <th key={i} className="px-2 py-1 text-left font-medium border-r whitespace-nowrap">
                                {h}
                                {!ALLOWED_COLUMNS.includes(h.trim()) && (
                                  <Badge variant="outline" className="ml-1 text-orange-500 border-orange-300">{KO.pages.discover.excludedBadge}</Badge>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {gridData.slice(0, 50).map((row, rowIdx) => (
                            <tr key={rowIdx} className="border-b hover:bg-muted/50">
                              <td className="px-2 py-1 text-muted-foreground border-r">{rowIdx + 1}</td>
                              {row.map((cell, cellIdx) => (
                                <td key={cellIdx} className="px-2 py-1 border-r max-w-[200px] align-top">
                                  <div className="whitespace-pre-wrap break-words line-clamp-3" title={cell || ''}>
                                    {cell || '-'}
                                  </div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {gridData.length > 50 && (
                        <div className="p-2 text-center text-xs text-muted-foreground">
                          ...외 {gridData.length - 50}행 더 있음
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </>
          )}

          {(state === 'validated' || state === 'importing') && validation && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 bg-muted rounded-md text-center">
                  <div className="text-2xl font-bold">{validation.totalRows}</div>
                  <div className="text-xs text-muted-foreground">{KO.pages.discover.totalRows}</div>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-md text-center">
                  <div className="text-2xl font-bold text-green-600">{validation.validRows}</div>
                  <div className="text-xs text-muted-foreground">{KO.pages.discover.validRows}</div>
                </div>
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md text-center">
                  <div className="text-2xl font-bold text-yellow-600">{validation.skippedRows}</div>
                  <div className="text-xs text-muted-foreground">{KO.pages.discover.skippedRows}</div>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-md text-center">
                  <div className="text-2xl font-bold text-red-600">{validation.errorRows}</div>
                  <div className="text-xs text-muted-foreground">{KO.pages.discover.errorRows}</div>
                </div>
              </div>

              {validation.excludedColumns.length > 0 && (
                <Alert className="border-orange-300 bg-orange-50 dark:bg-orange-900/20">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  <AlertDescription className="text-sm">
                    <span className="font-medium">
                      {KO.pages.discover.excludedColumnsWarning.replace('{n}', validation.excludedColumns.length.toString())}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {validation.excludedColumns.map((col, i) => (
                        <Badge key={i} variant="outline" className="text-orange-600">{col}</Badge>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {validation.invalidClientRows.length > 0 && (
                <Alert className="border-red-300 bg-red-50 dark:bg-red-900/20">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <AlertDescription className="text-sm">
                    <span className="font-medium text-red-700 dark:text-red-400">
                      존재하지 않는 클라이언트가 {validation.invalidClientRows.length}개 행에서 발견되었습니다.
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">
                      설정 → 클라이언트에 등록된 클라이언트만 사용할 수 있습니다. 아래 클라이언트를 수정하거나 설정에서 먼저 등록하세요.
                    </p>
                    <div className="mt-2 max-h-[100px] overflow-y-auto">
                      {validation.invalidClientRows.slice(0, 10).map((item, i) => (
                        <div key={i} className="text-xs text-red-600 dark:text-red-400">
                          행 {item.row}: "<span className="font-medium">{item.client}</span>"
                        </div>
                      ))}
                      {validation.invalidClientRows.length > 10 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          ... 그 외 {validation.invalidClientRows.length - 10}개 더
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {state === 'completed' && importResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">{KO.pages.discover.importResults}</span>
              </div>
              
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-md text-center">
                  <div className="text-2xl font-bold text-green-600">{importResult.created}</div>
                  <div className="text-xs text-muted-foreground">{KO.pages.discover.created}</div>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md text-center">
                  <div className="text-2xl font-bold text-blue-600">{importResult.updated}</div>
                  <div className="text-xs text-muted-foreground">{KO.pages.discover.updated}</div>
                </div>
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md text-center">
                  <div className="text-2xl font-bold text-yellow-600">{importResult.skipped}</div>
                  <div className="text-xs text-muted-foreground">{KO.pages.discover.skipped}</div>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-md text-center">
                  <div className="text-2xl font-bold text-red-600">{importResult.errors.length}</div>
                  <div className="text-xs text-muted-foreground">{KO.pages.discover.errors}</div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <ScrollArea className="h-32 border rounded-md p-2">
                  {importResult.errors.map((err, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-red-600 py-1">
                      <XCircle className="w-3 h-3" />
                      <span>행 {err.row}: {err.reason}</span>
                    </div>
                  ))}
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-import">
            {state === 'completed' ? KO.common.close : KO.common.cancel}
          </Button>
          
          {state === 'paste' && (
            <Button 
              onClick={handleValidate} 
              disabled={gridData.length === 0}
              data-testid="button-validate-import"
            >
              {KO.pages.discover.validate}
            </Button>
          )}
          
          {state === 'validated' && (
            <>
              <Button 
                variant="outline" 
                onClick={() => setState('paste')}
                data-testid="button-back-to-paste"
              >
                {KO.common.back}
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={validation?.validRows === 0 || (validation?.invalidClientRows?.length ?? 0) > 0}
                data-testid="button-execute-import"
              >
                {KO.pages.discover.executeImport}
              </Button>
            </>
          )}
          
          {state === 'importing' && (
            <Button disabled>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {KO.pages.discover.importing}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
