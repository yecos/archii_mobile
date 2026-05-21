'use client';
import React, { useState, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { KanbanCardData } from '@/lib/kanban-helpers';
import { getPriorityColor, isOverdue, formatDateShort } from '@/lib/kanban-helpers';
import { getInitials, avatarColor, prioColor } from '@/lib/helpers';
import { Calendar, MessageSquare, GripVertical, Tag, Clock } from 'lucide-react';

interface KanbanCardProps {
  card: KanbanCardData;
  onClick: (card: KanbanCardData) => void;
  getUserName: (uid: string) => string;
  commentCount?: number;
}

export default function KanbanCard({ card, onClick, getUserName, commentCount = 0 }: KanbanCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const overdue = isOverdue(card.dueDate);
  const prioBarColor = getPriorityColor(card.priority);
  const userName = getUserName(card.assigneeId);
  const initials = getInitials(userName);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { card },
    transition: {
      duration: 200,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto' as any,
  };

  const handleClick = useCallback(() => {
    if (!isDragging) {
      onClick(card);
    }
  }, [card, onClick, isDragging]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className="group relative bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 cursor-pointer transition-all duration-150 hover:border-[var(--af-accent)]/30 hover:shadow-lg hover:shadow-black/5"
    >
      {/* Priority color bar */}
      <div className="absolute top-0 left-3 right-3 h-[3px] rounded-full" style={{ background: prioBarColor }} />

      {/* Drag handle */}
      <div
        {...listeners}
        className={`absolute top-2 right-2 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing ${isDragging ? '!opacity-100' : ''}`}
      >
        <GripVertical size={14} aria-hidden="true"/>
      </div>

      {/* Title */}
      <h4 className="text-[13px] font-medium text-[var(--foreground)] leading-snug pr-6 mt-1 mb-2 line-clamp-2">
        {card.title}
      </h4>

      {/* Tags */}
      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {card.tags.slice(0, 3).map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--af-bg3)] text-[var(--muted-foreground)]"
            >
              <Tag size={8} aria-hidden="true"/>
              {tag}
            </span>
          ))}
          {card.tags.length > 3 && (
            <span className="text-[10px] text-[var(--muted-foreground)] px-1">+{card.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer: assignee + due date */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-2 min-w-0">
          {card.assigneeId && (
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold border flex-shrink-0 ${avatarColor(card.assigneeId)}`}
              title={userName}
            >
              {initials}
            </div>
          )}
          {card.dueDate && (
            <div className={`flex items-center gap-1 text-[11px] ${overdue ? 'text-red-400' : 'text-[var(--muted-foreground)]'}`}>
              {overdue ? (
                <Clock size={10} className="stroke-red-400" aria-hidden="true"/>
              ) : (
                <Calendar size={10} aria-hidden="true"/>
              )}
              <span>{formatDateShort(card.dueDate)}</span>
            </div>
          )}
        </div>

        {commentCount > 0 && (
          <div className="flex items-center gap-0.5 text-[11px] text-[var(--muted-foreground)]">
            <MessageSquare size={10} aria-hidden="true"/>
            <span>{commentCount}</span>
          </div>
        )}
      </div>

      {/* Overdue pulse indicator */}
      {overdue && (
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[var(--card)] animate-pulse" />
      )}

      {/* Quick card indicator */}
      {card.isQuickCard && card.color && (
        <div className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full" style={{ background: card.color }} />
      )}
    </div>
  );
}
