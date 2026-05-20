'use client';
import React, { useState, useRef, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { KanbanColumn as KanbanColumnType, KanbanCardData } from '@/lib/kanban-helpers';
import KanbanCard from './KanbanCard';
import { Plus, MoreHorizontal, X } from 'lucide-react';

interface KanbanColumnProps {
  column: KanbanColumnType;
  cards: KanbanCardData[];
  onCardClick: (card: KanbanCardData) => void;
  getUserName: (uid: string) => string;
  onQuickAdd?: (columnId: string, title: string) => void;
  onDeleteColumn?: (columnId: string) => void;
}

export default function KanbanColumn({
  column,
  cards,
  onCardClick,
  getUserName,
  onQuickAdd,
}: KanbanColumnProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const commentCounts: Record<string, number> = {};

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: { columnId: column.id, type: 'column' },
  });

  const handleQuickAdd = useCallback(() => {
    if (newCardTitle.trim() && onQuickAdd) {
      onQuickAdd(column.id, newCardTitle.trim());
      setNewCardTitle('');
      setIsAdding(false);
    }
  }, [newCardTitle, column.id, onQuickAdd]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleQuickAdd();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewCardTitle('');
    }
  }, [handleQuickAdd]);

  const handleAddClick = useCallback(() => {
    setIsAdding(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const wipExceeded = column.wipLimit !== null && cards.length > column.wipLimit;
  const cardIds = cards.map(c => c.id);

  return (
    <div
      className={`flex flex-col min-w-[200px] w-[280px] max-w-[280px] sm:min-w-[280px] flex-shrink-0 rounded-2xl transition-all duration-200 ${
        isOver ? 'ring-2 ring-[var(--af-accent)]/40' : ''
      }`}
    >
      {/* Column header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: column.color }}
          />
          <h3 className="text-[13px] font-semibold text-[var(--foreground)] flex-1 truncate">
            {column.title}
          </h3>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            wipExceeded
              ? 'bg-red-500/15 text-red-400'
              : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)]'
          }`}>
            {cards.length}
            {column.wipLimit !== null && `/${column.wipLimit}`}
          </span>
        </div>

        {/* WIP indicator bar */}
        {column.wipLimit !== null && (
          <div className="mt-2 h-1 bg-[var(--af-bg3)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                wipExceeded ? 'bg-red-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min((cards.length / column.wipLimit) * 100, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Card list */}
      <div
        ref={setNodeRef}
        className={`flex-1 px-2 pb-2 overflow-y-auto min-h-[100px] max-h-[calc(100vh-280px)] transition-colors duration-200 ${
          isOver ? 'bg-[var(--af-accent)]/5' : ''
        }`}
        style={{ scrollbarWidth: 'thin' }}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {cards.map(card => (
              <KanbanCard
                key={card.id}
                card={card}
                onClick={onCardClick}
                getUserName={getUserName}
                commentCount={commentCounts[card.entityId] || 0}
              />
            ))}
          </div>
        </SortableContext>

        {cards.length === 0 && !isAdding && (
          <div className="py-8 flex items-center justify-center text-[12px] text-[var(--muted-foreground)] opacity-60">
            Sin tarjetas
          </div>
        )}
      </div>

      {/* Quick add input */}
      <div className="px-2 pb-2">
        {isAdding ? (
          <div className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-xl p-2 flex flex-col gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Titulo de la tarjeta..."
              className="w-full bg-transparent text-[13px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none"
            />
            <div className="flex items-center justify-end gap-1">
              <button
                aria-label="Cancelar"
                onClick={() => { setIsAdding(false); setNewCardTitle(''); }}
                className="p-1 rounded-md hover:bg-[var(--af-bg4)] text-[var(--muted-foreground)] transition-colors bg-transparent border-none cursor-pointer"
              >
                <X size={14} aria-hidden="true"/>
              </button>
              <button
                onClick={handleQuickAdd}
                disabled={!newCardTitle.trim()}
                className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-[var(--af-accent)] text-background hover:bg-[var(--af-accent2)] transition-colors border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Agregar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleAddClick}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] text-[var(--muted-foreground)] hover:bg-[var(--af-bg3)] hover:text-[var(--foreground)] transition-all cursor-pointer border-none bg-transparent"
          >
            <Plus size={14} aria-hidden="true"/>
            <span>Agregar tarjeta</span>
          </button>
        )}
      </div>
    </div>
  );
}
