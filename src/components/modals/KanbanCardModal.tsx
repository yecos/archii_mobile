'use client';
import React, { useState, useCallback, useMemo } from 'react';
import CenterModal from '@/components/common/CenterModal';
import { getInitials, avatarColor, prioColor, fmtDate } from '@/lib/helpers';
import type { KanbanCardData, KanbanEntityType } from '@/lib/kanban-helpers';
import { getEntityLabel, getColumnFromStatus, getDefaultColumns, formatDateShort, isOverdue } from '@/lib/kanban-helpers';
import { X, Trash2, MessageSquare, Send, Tag } from 'lucide-react';

interface KanbanCardModalProps {
  open: boolean;
  onClose: () => void;
  card: KanbanCardData | null;
  entityType: KanbanEntityType;
  teamUsers: any[];
  getUserName: (uid: string) => string;
  onStatusChange: (entityId: string, newStatus: string) => void;
  onDelete?: (entityId: string) => void;
  comments?: any[];
  onAddComment?: (text: string) => void;
}

export default function KanbanCardModal({
  open,
  onClose,
  card,
  entityType,
  teamUsers,
  getUserName,
  onStatusChange,
  onDelete,
  comments = [],
  onAddComment,
}: KanbanCardModalProps) {
  const [commentText, setCommentText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newTag, setNewTag] = useState('');

  const columns = useMemo(() => getDefaultColumns(entityType), [entityType]);
  const overdue = card ? isOverdue(card.dueDate) : false;

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!card) return;
    const newStatus = e.target.value;
    if (newStatus !== card.status) {
      onStatusChange(card.entityId, newStatus);
    }
  }, [card, onStatusChange]);

  const handleDelete = useCallback(() => {
    if (!card || !onDelete) return;
    onDelete(card.entityId);
    onClose();
  }, [card, onDelete, onClose]);

  const handleAddComment = useCallback(() => {
    if (!commentText.trim() || !onAddComment) return;
    onAddComment(commentText.trim());
    setCommentText('');
  }, [commentText, onAddComment]);

  const handleCommentKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddComment();
    }
  }, [handleAddComment]);

  if (!card) return null;

  return (
    <CenterModal open={open} onClose={onClose} maxWidth={540}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--af-accent)]/15 text-[var(--af-accent)]">
              {getEntityLabel(entityType)}
            </span>
            {overdue && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                Vencida
              </span>
            )}
          </div>
          <h2 className="text-[17px] font-semibold text-[var(--foreground)] leading-snug">
            {card.title}
          </h2>
        </div>
        <button
          aria-label="Cerrar"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[var(--af-bg3)] text-[var(--muted-foreground)] transition-colors bg-transparent border-none cursor-pointer flex-shrink-0 ml-3"
        >
          <X size={18} aria-hidden="true"/>
        </button>
      </div>

      {/* Description */}
      {card.description && (
        <div className="mb-4 p-3 bg-[var(--af-bg3)] rounded-xl border border-[var(--border)]">
          <p className="text-[13px] text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
            {card.description}
          </p>
        </div>
      )}

      {/* Tags */}
      {card.tags.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
            <Tag size={12} aria-hidden="true"/>
            Etiquetas
          </div>
          <div className="flex flex-wrap gap-1.5">
            {card.tags.map((tag, i) => (
              <span
                key={i}
                className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md bg-[var(--af-bg3)] text-[var(--muted-foreground)] border border-[var(--border)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Status */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
            Estado
          </label>
          <select
            value={card.status}
            onChange={handleStatusChange}
            className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--foreground)] outline-none cursor-pointer"
          >
            {columns.map(col => (
              <option key={col.id} value={col.title}>
                {col.title}
              </option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
            Prioridad
          </label>
          <div className={`px-3 py-2 rounded-lg text-[13px] font-medium ${prioColor(card.priority)}`}>
            {card.priority}
          </div>
        </div>

        {/* Assignee */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
            Responsable
          </label>
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--af-bg3)] rounded-lg">
            {card.assigneeId ? (
              <>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold border flex-shrink-0 ${avatarColor(card.assigneeId)}`}>
                  {getInitials(getUserName(card.assigneeId))}
                </div>
                <span className="text-[13px] text-[var(--foreground)] truncate">{getUserName(card.assigneeId)}</span>
              </>
            ) : (
              <span className="text-[13px] text-[var(--muted-foreground)]">Sin asignar</span>
            )}
          </div>
        </div>

        {/* Due date */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
            Fecha limite
          </label>
          <div className={`px-3 py-2 rounded-lg text-[13px] ${
            overdue ? 'bg-red-500/10 text-red-400' : 'bg-[var(--af-bg3)] text-[var(--foreground)]'
          }`}>
            {card.dueDate
              ? new Date(card.dueDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
              : 'Sin fecha'
            }
          </div>
        </div>
      </div>

      {/* Comments */}
      {onAddComment && (
        <div className="border-t border-[var(--border)] pt-4">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">
            <MessageSquare size={12} aria-hidden="true"/>
            Comentarios ({comments.length})
          </div>

          {/* Comment input */}
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={handleCommentKeyDown}
              placeholder="Agregar comentario..."
              className="flex-1 bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none"
            />
            <button
              onClick={handleAddComment}
              disabled={!commentText.trim()}
              className="p-2 rounded-lg bg-[var(--af-accent)] text-background hover:bg-[var(--af-accent2)] transition-colors border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={14} aria-hidden="true"/>
            </button>
          </div>

          {/* Comments list */}
          <div className="max-h-[200px] overflow-y-auto space-y-2" style={{ scrollbarWidth: 'thin' }}>
            {comments.map((comment: any) => (
              <div key={comment.id} className="flex items-start gap-2.5 p-2.5 bg-[var(--af-bg3)] rounded-lg">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold border flex-shrink-0 ${avatarColor(comment.userId || comment.data?.userId)}`}>
                  {getInitials(comment.userName || comment.data?.userName || '?')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-[var(--foreground)]">
                      {comment.userName || comment.data?.userName || 'Anonimo'}
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {fmtDate(comment.createdAt || comment.data?.createdAt)}
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--muted-foreground)] mt-0.5">
                    {comment.text || comment.data?.text}
                  </p>
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-[12px] text-[var(--muted-foreground)] text-center py-4">
                Sin comentarios
              </p>
            )}
          </div>
        </div>
      )}

      {/* Delete button */}
      {onDelete && !card.isQuickCard && (
        <div className="border-t border-[var(--border)] pt-3 mt-4">
          {showDeleteConfirm ? (
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-red-400">Confirmar eliminacion?</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-[12px] rounded-lg bg-[var(--af-bg3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors border-none cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 text-[12px] rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors border-none cursor-pointer"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 text-[12px] text-red-400 hover:text-red-300 transition-colors bg-transparent border-none cursor-pointer"
            >
              <Trash2 size={14} aria-hidden="true"/>
              Eliminar
            </button>
          )}
        </div>
      )}
    </CenterModal>
  );
}
