import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function TableStyleToolbar({ content, onChange }: { content: string; onChange: (val: string) => void }) {
  const [tableWidth, setTableWidth] = useState('100');
  const [borderColor, setBorderColor] = useState('#e2e8f0');
  const [borderWidth, setBorderWidth] = useState('1');
  const [showBorder, setShowBorder] = useState(true);

  const applyTableStyles = useCallback(() => {
    if (!content.includes('<table')) return;
    const borderStyle = showBorder 
      ? `border: ${borderWidth}px solid ${borderColor};` 
      : 'border: none;';
    const tdStyle = showBorder 
      ? `border: ${borderWidth}px solid ${borderColor}; padding: 4px 8px;` 
      : 'border: none; padding: 4px 8px;';
    const widthStyle = tableWidth === 'auto' ? '' : `width: ${tableWidth}%;`;
    
    let updated = content.replace(
      /<table[^>]*>/g, 
      `<table style="border-collapse: collapse; ${widthStyle} ${borderStyle}">`
    );
    updated = updated.replace(
      /<td[^>]*?(?:style="[^"]*")?[^>]*>/g,
      (match) => {
        const existingContent = match.replace(/<td/, '').replace(/>$/, '');
        const cleanAttrs = existingContent.replace(/style="[^"]*"/, '').trim();
        return `<td style="${tdStyle}" ${cleanAttrs}>`;
      }
    );
    onChange(updated);
  }, [content, tableWidth, borderColor, borderWidth, showBorder, onChange]);

  if (!content.includes('<table')) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap p-2 bg-muted/50 rounded-md text-xs mt-2">
      <span className="font-medium text-muted-foreground">표 스타일:</span>
      <div className="flex items-center gap-1">
        <label>너비</label>
        <Select value={tableWidth} onValueChange={setTableWidth}>
          <SelectTrigger className="h-7 w-20 text-xs" data-testid="select-table-width">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="100">100%</SelectItem>
            <SelectItem value="75">75%</SelectItem>
            <SelectItem value="50">50%</SelectItem>
            <SelectItem value="auto">자동</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <label>테두리</label>
        <Checkbox checked={showBorder} onCheckedChange={(v) => setShowBorder(!!v)} data-testid="checkbox-table-border" />
      </div>
      {showBorder && (
        <>
          <div className="flex items-center gap-1">
            <label>두께</label>
            <Select value={borderWidth} onValueChange={setBorderWidth}>
              <SelectTrigger className="h-7 w-16 text-xs" data-testid="select-border-width">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1px</SelectItem>
                <SelectItem value="2">2px</SelectItem>
                <SelectItem value="3">3px</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <label>색상</label>
            <input 
              type="color" 
              value={borderColor} 
              onChange={(e) => setBorderColor(e.target.value)} 
              className="w-7 h-7 border rounded cursor-pointer"
              data-testid="input-border-color"
            />
          </div>
        </>
      )}
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={applyTableStyles} data-testid="button-apply-table-style">
        적용
      </Button>
    </div>
  );
}
