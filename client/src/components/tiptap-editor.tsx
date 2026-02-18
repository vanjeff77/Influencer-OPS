import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Link as LinkIcon, Image as ImageIcon, Palette, Eraser,
  Heading1, Heading2, Heading3, Type, Highlighter
} from 'lucide-react';

const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6',
  '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1', '#a855f7',
];

const HIGHLIGHT_COLORS = [
  '#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fde68a',
  '#c4b5fd', '#fed7aa', '#99f6e4', '#fecdd3', '#e9d5ff',
];

interface TiptapEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  'data-testid'?: string;
  toolbar?: 'full' | 'email' | 'minimal';
}

function ToolbarButton({ active, onClick, children, title }: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`p-1.5 rounded-sm transition-colors ${active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
      title={title}
    >
      {children}
    </button>
  );
}

function EditorToolbar({ editor, toolbar = 'full' }: { editor: any; toolbar?: string }) {
  if (!editor) return null;

  const addImage = useCallback(() => {
    const url = window.prompt('이미지 URL을 입력하세요:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const addLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('링크 URL을 입력하세요:', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const setColor = useCallback((color: string) => {
    editor.chain().focus().setColor(color).run();
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b bg-muted/30" data-testid="tiptap-toolbar">
      {toolbar !== 'minimal' && (
        <>
          <Select
            value={
              editor.isActive('heading', { level: 1 }) ? '1' :
              editor.isActive('heading', { level: 2 }) ? '2' :
              editor.isActive('heading', { level: 3 }) ? '3' : '0'
            }
            onValueChange={(val) => {
              if (val === '0') editor.chain().focus().setParagraph().run();
              else editor.chain().focus().toggleHeading({ level: parseInt(val) as 1 | 2 | 3 }).run();
            }}
          >
            <SelectTrigger className="h-7 w-24 text-xs border-0 bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0"><span className="flex items-center gap-1.5"><Type className="w-3 h-3" /> 본문</span></SelectItem>
              <SelectItem value="1"><span className="flex items-center gap-1.5"><Heading1 className="w-3 h-3" /> 제목 1</span></SelectItem>
              <SelectItem value="2"><span className="flex items-center gap-1.5"><Heading2 className="w-3 h-3" /> 제목 2</span></SelectItem>
              <SelectItem value="3"><span className="flex items-center gap-1.5"><Heading3 className="w-3 h-3" /> 제목 3</span></SelectItem>
            </SelectContent>
          </Select>

          <div className="w-px h-5 bg-border mx-0.5" />
        </>
      )}

      <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="굵게">
        <Bold className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="기울임">
        <Italic className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="밑줄">
        <UnderlineIcon className="w-3.5 h-3.5" />
      </ToolbarButton>
      {toolbar !== 'minimal' && (
        <ToolbarButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="취소선">
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolbarButton>
      )}

      <div className="w-px h-5 bg-border mx-0.5" />

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="p-1.5 rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="글자 색상"
          >
            <Palette className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-5 gap-1">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="w-6 h-6 rounded-sm border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: color }}
                onClick={() => setColor(color)}
              />
            ))}
          </div>
          <button
            type="button"
            className="mt-1 text-xs text-muted-foreground hover:text-foreground w-full text-center"
            onClick={() => editor.chain().focus().unsetColor().run()}
          >
            기본 색상
          </button>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`p-1.5 rounded-sm transition-colors ${editor.isActive('highlight') ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            title="형광펜"
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-5 gap-1">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="w-6 h-6 rounded-sm border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: color }}
                onClick={() => editor.chain().focus().toggleHighlight({ color }).run()}
              />
            ))}
          </div>
          <button
            type="button"
            className="mt-1 text-xs text-muted-foreground hover:text-foreground w-full text-center"
            onClick={() => editor.chain().focus().unsetHighlight().run()}
          >
            형광펜 제거
          </button>
        </PopoverContent>
      </Popover>

      <div className="w-px h-5 bg-border mx-0.5" />

      <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="글머리 기호">
        <List className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="번호 매기기">
        <ListOrdered className="w-3.5 h-3.5" />
      </ToolbarButton>

      {toolbar === 'full' && (
        <>
          <div className="w-px h-5 bg-border mx-0.5" />
          <ToolbarButton active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="왼쪽 정렬">
            <AlignLeft className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="가운데 정렬">
            <AlignCenter className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="오른쪽 정렬">
            <AlignRight className="w-3.5 h-3.5" />
          </ToolbarButton>
        </>
      )}

      <div className="w-px h-5 bg-border mx-0.5" />

      <ToolbarButton onClick={addLink} active={editor.isActive('link')} title="링크">
        <LinkIcon className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={addImage} title="이미지">
        <ImageIcon className="w-3.5 h-3.5" />
      </ToolbarButton>

      <div className="w-px h-5 bg-border mx-0.5" />

      <ToolbarButton onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="서식 지우기">
        <Eraser className="w-3.5 h-3.5" />
      </ToolbarButton>
    </div>
  );
}

export function TiptapEditor({
  value,
  onChange,
  className = '',
  placeholder,
  toolbar = 'full',
  ...rest
}: TiptapEditorProps) {
  const isExternalUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: true, allowBase64: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: placeholder || '' }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      if (!isExternalUpdate.current) {
        onChange(editor.getHTML());
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none dark:prose-invert focus:outline-none min-h-[inherit] p-3',
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      isExternalUpdate.current = true;
      editor.commands.setContent(value, { emitUpdate: false });
      isExternalUpdate.current = false;
    }
  }, [value, editor]);

  return (
    <div className={`border rounded-md overflow-hidden bg-background ${className}`} data-testid={rest['data-testid']}>
      <EditorToolbar editor={editor} toolbar={toolbar} />
      <EditorContent
        editor={editor}
        className="min-h-[200px]"
      />
    </div>
  );
}
