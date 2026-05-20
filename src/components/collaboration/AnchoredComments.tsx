'use client';

/**
 * AnchoredComments.tsx
 * Right-side slide-in panel for location-aware anchored comments
 * on collaborative documents.
 *
 * Features:
 *   - Slide-in panel from the right
 *   - Shows comments anchored to the current document location
 *   - Each comment: avatar, name, timestamp, text
 *   - Reply threading (1 level deep)
 *   - Reply input at the bottom
 *   - Badge count on the trigger button
 *   - "Jump to" when clicking a comment (via onJumpTo callback)
 *   - Markdown-lite rendering (bold, italic, code, links)
 *   - Resolve/archive comments
 *
 * Props:
 *   documentId  – ID of the collaborative document
 *   tenantId    – Tenant ID for scoping
 *   isOpen      – Whether the panel is open
 *   onClose     – Callback when panel is closed
 *   location    – Optional current location for filtering
 *   onJumpTo    – Optional callback to jump to a comment's anchor
 *   className   – Optional CSS class
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROLE_COLORS } from '@/lib/types';
import {
  getCollaborationService,
  type AnchoredComment,
  type CursorPosition,
} from '@/lib/collaboration-service';

/* ---- Types ---- */

interface AnchoredCommentsProps {
  documentId: string;
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Current cursor position to filter nearby comments */
  location?: CursorPosition;
  /** Callback to scroll/jump to a comment's anchor position */
  onJumpTo?: (location: CursorPosition) => void;
  className?: string;
}

/* ---- Helpers ---- */

/** Format a timestamp into relative time string */
function formatRelativeTime(date: any): string {
  if (!date) return '';
  const d = date?.toDate?.() || new Date(date);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin}m`;
  if (diffHour < 24) return `hace ${diffHour}h`;
  if (diffDay < 7) return `hace ${diffDay}d`;
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

/** Render markdown-lite text: **bold**, *italic*, `code`, [links](url) */
function renderMarkdownLite(text: string): React.ReactNode {
  // Split by code blocks first to avoid processing markdown inside them
  const parts = text.split(/(`[^`]+`)/g);

  return parts.map((part, i) => {
    // Code span
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Process markdown patterns within regular text
    const segments = part.split(
      /(\*\*[^*]+\*\*|\*[^*]+\*|\[([^\]]+)\]\(([^)]+)\))/g
    );

    return segments.map((seg, j) => {
      // Bold
      if (seg.startsWith('**') && seg.endsWith('**')) {
        return (
          <strong key={`${i}-${j}`}>{seg.slice(2, -2)}</strong>
        );
      }
      // Italic
      if (seg.startsWith('*') && seg.endsWith('*') && !seg.startsWith('**')) {
        return <em key={`${i}-${j}`}>{seg.slice(1, -1)}</em>;
      }
      // Links [text](url)
      const linkMatch = seg.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return (
          <a
            key={`${i}-${j}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline hover:text-blue-300"
          >
            {linkMatch[1]}
          </a>
        );
      }
      return <React.Fragment key={`${i}-${j}`}>{seg}</React.Fragment>;
    });
  });
}

/** Get initials from a name */
function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/* ---- Sub-components ---- */

/** Single comment display */
function CommentItem({
  comment,
  onReply,
  onResolve,
  onJumpTo,
}: {
  comment: AnchoredComment;
  onReply: (parentId: string) => void;
  onResolve: (commentId: string) => void;
  onJumpTo?: (location: CursorPosition) => void;
}) {
  const isResolved = comment.status === 'resolved';
  const roleColor =
    ROLE_COLORS[comment.userRole || 'Miembro'] || ROLE_COLORS.Miembro;

  return (
    <div
      className={cn(
        'group rounded-lg border p-3 transition-colors',
        isResolved
          ? 'border-border/50 bg-muted/30 opacity-60'
          : 'border-border bg-card hover:border-border/80'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1.5">
        {/* Avatar */}
        <div className="size-6 rounded-full overflow-hidden shrink-0">
          {comment.userPhoto ? (
            <img
              src={comment.userPhoto}
              alt={comment.userName}
              className="size-full object-cover"
            />
          ) : (
            <div className="size-full flex items-center justify-center bg-muted text-[9px] font-semibold text-muted-foreground">
              {getInitials(comment.userName)}
            </div>
          )}
        </div>

        {/* Name + role badge */}
        <span className="text-xs font-medium text-foreground truncate">
          {comment.userName}
        </span>
        {comment.userRole && (
          <span
            className={cn(
              'text-[9px] px-1.5 py-0 rounded-full border hidden sm:inline-block',
              roleColor
            )}
          >
            {comment.userRole}
          </span>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
          {formatRelativeTime(comment.createdAt)}
        </span>
      </div>

      {/* Comment text */}
      <div className="text-sm text-foreground/90 leading-relaxed mb-2 break-words">
        {renderMarkdownLite(comment.text)}
      </div>

      {/* Location indicator + actions */}
      <div className="flex items-center gap-2">
        {comment.location && onJumpTo && !comment.parentId && (
          <button
            onClick={() => onJumpTo(comment.location)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            title={`Ir a línea ${comment.location.line + 1}, col ${comment.location.column + 1}`}
          >
            L{comment.location.line + 1}:{comment.location.column + 1}
          </button>
        )}

        {!isResolved && !comment.parentId && (
          <>
            <button
              onClick={() => onReply(comment.id)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              Responder
            </button>
            <button
              onClick={() => onResolve(comment.id)}
              className="text-[10px] text-emerald-500/70 hover:text-emerald-500 transition-colors"
            >
              Resolver
            </button>
          </>
        )}

        {isResolved && (
          <Badge variant="secondary" className="text-[9px] h-4 ml-auto">
            Resuelto
          </Badge>
        )}
      </div>

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2 ml-3 pl-3 border-l border-border/50 space-y-2">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              onReply={onReply}
              onResolve={onResolve}
              onJumpTo={onJumpTo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Main Component ---- */

export default function AnchoredComments({
  documentId,
  tenantId,
  isOpen,
  onClose,
  location,
  onJumpTo,
  className,
}: AnchoredCommentsProps) {
  const [comments, setComments] = useState<AnchoredComment[]>([]);
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const mountedRef = useRef(true);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  // Subscribe to comments
  useEffect(() => {
    mountedRef.current = true;

    const collab = getCollaborationService();
    const unsub = collab.subscribeToComments((updated) => {
      if (mountedRef.current) {
        setComments(updated);
        setTotalCount(updated.length);
      }
    });

    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, [documentId, tenantId]);

  // Focus reply input when replying
  useEffect(() => {
    if (replyingTo && replyInputRef.current) {
      replyInputRef.current.focus();
    }
  }, [replyingTo]);

  /** Handle replying to a comment */
  const handleReply = useCallback(
    async (parentId: string) => {
      setReplyingTo(replyingTo === parentId ? null : parentId);
    },
    [replyingTo]
  );

  /** Submit a reply */
  const handleSubmitReply = useCallback(async () => {
    if (!replyText.trim() || !replyingTo) return;

    try {
      const collab = getCollaborationService();
      // userName and userRole should come from context — placeholder for now
      await collab.replyToComment(replyingTo, {
        text: replyText.trim(),
        userName: 'Usuario',
      });
      setReplyText('');
      setReplyingTo(null);
    } catch (err) {
      console.error('[AnchoredComments] Error submitting reply:', err);
    }
  }, [replyText, replyingTo]);

  /** Resolve a comment */
  const handleResolve = useCallback(async (commentId: string) => {
    try {
      const collab = getCollaborationService();
      await collab.resolveComment(commentId);
    } catch (err) {
      console.error('[AnchoredComments] Error resolving comment:', err);
    }
  }, []);

  /** Filter comments by location proximity (within 5 lines if location provided) */
  const filteredComments = location
    ? comments.filter(
        (c) =>
          !c.parentId &&
          Math.abs(c.location.line - location.line) <= 5
      )
    : comments.filter((c) => !c.parentId);

  return (
    <>
      {/* Badge count trigger — only shown when panel is closed */}
      {!isOpen && totalCount > 0 && (
        <button
          onClick={onClose}
          className="fixed top-4 right-4 z-40"
          title={`${totalCount} comentario(s)`}
        >
          <Badge variant="secondary" className="text-xs px-2 py-1 cursor-pointer">
            💬 {totalCount}
          </Badge>
        </button>
      )}

      {/* Slide-in panel */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-80 z-50 bg-background border-l border-border shadow-xl',
          'transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            Comentarios
            {location && (
              <span className="text-muted-foreground font-normal ml-1">
                (L{location.line + 1})
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            {totalCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5">
                {totalCount}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="size-7"
            >
              ✕
            </Button>
          </div>
        </div>

        {/* Comments list */}
        <ScrollArea className="flex-1 h-[calc(100%-140px)]">
          <div className="p-3 space-y-2">
            {filteredComments.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8">
                {location
                  ? 'Sin comentarios cerca de esta ubicación'
                  : 'Sin comentarios en este documento'}
              </div>
            ) : (
              filteredComments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  onReply={handleReply}
                  onResolve={handleResolve}
                  onJumpTo={onJumpTo}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Reply input area */}
        {replyingTo && (
          <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-background p-3">
            <div className="text-[10px] text-muted-foreground mb-1">
              Respondiendo...
            </div>
            <div className="flex gap-2">
              <textarea
                ref={replyInputRef}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSubmitReply();
                  }
                  if (e.key === 'Escape') {
                    setReplyingTo(null);
                    setReplyText('');
                  }
                }}
                placeholder="Escribe una respuesta..."
                className="flex-1 min-h-[36px] max-h-[80px] resize-none rounded-md border border-border bg-transparent px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                rows={2}
              />
              <div className="flex flex-col gap-1">
                <Button
                  size="sm"
                  onClick={handleSubmitReply}
                  disabled={!replyText.trim()}
                  className="h-7 px-2 text-[10px]"
                >
                  Enviar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setReplyingTo(null);
                    setReplyText('');
                  }}
                  className="h-7 px-2 text-[10px]"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
