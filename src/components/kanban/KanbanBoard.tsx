'use client';
import React, { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { KanbanColumn as KanbanColumnType, KanbanCardData } from '@/lib/kanban-helpers';
import { getCardStatusFromColumn, isOverdue } from '@/lib/kanban-helpers';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import { useUIStore } from '@/stores/ui-store';
import { Columns3, CircleDot } from 'lucide-react';

interface KanbanBoardProps {
  columns: KanbanColumnType[];
  cards: KanbanCardData[];
  groupedCards: Record<string, KanbanCardData[]>;
  swimlanes?: any[];
  onCardClick: (card: KanbanCardData) => void;
  onCardMove: (cardId: string, entityId: string, newColumnId: string) => void;
  onQuickAdd: (columnId: string, title: string) => void;
  getUserName: (uid: string) => string;
  onToggleSwimlane?: (swimlaneId: string) => void;
}

export default function KanbanBoard({
  columns,
  cards,
  groupedCards,
  swimlanes,
  onCardClick,
  onCardMove,
  onQuickAdd,
  getUserName,
  onToggleSwimlane,
}: KanbanBoardProps) {
  const [activeCard, setActiveCard] = useState<KanbanCardData | null>(null);
  const viewMode = useUIStore(s => s.kanbanViewMode);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const cardData = cards.find(c => c.id === active.id);
    if (cardData) setActiveCard(cardData);
  }, [cards]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return;

    const cardData = cards.find(c => c.id === active.id);
    if (!cardData) return;

    // Determine target column
    let targetColumnId = cardData.columnId;

    // Check if dropped on a column droppable
    if (over.id.toString().startsWith('column-')) {
      targetColumnId = over.id.toString().replace('column-', '');
    } else {
      // Dropped on another card — find that card's column
      const targetCard = cards.find(c => c.id === over.id);
      if (targetCard) {
        targetColumnId = targetCard.columnId;
      }
    }

    // If column changed, move the card
    if (targetColumnId !== cardData.columnId) {
      onCardMove(cardData.id, cardData.entityId, targetColumnId);
    }
  }, [cards, onCardMove]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    // This could be used for visual feedback during drag
  }, []);

  // List view rendering
  if (viewMode === 'list') {
    const sortedCards = useMemo(() =>
      [...cards].sort((a, b) => {
        const colOrder = columns.findIndex(c => c.id === a.columnId) - columns.findIndex(c => c.id === b.columnId);
        if (colOrder !== 0) return colOrder;
        return a.order - b.order;
      }),
      [cards, columns]
    );

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
          {/* List header — hidden on mobile */}
          <div className="hidden sm:grid grid-cols-[1fr_120px_100px_120px_80px] gap-2 px-4 py-2.5 bg-[var(--af-bg3)] border-b border-[var(--border)] text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
            <span>Titulo</span>
            <span>Estado</span>
            <span>Prioridad</span>
            <span>Responsable</span>
            <span>Vencimiento</span>
          </div>

          {sortedCards.map(card => {
            const column = columns.find(c => c.id === card.columnId);
            const userName = getUserName(card.assigneeId);
            return (
              <div
                key={card.id}
                onClick={() => onCardClick(card)}
                className="border-b border-[var(--border)] last:border-0 cursor-pointer hover:bg-[var(--af-bg3)] transition-colors"
              >
                {/* Desktop row — table grid */}
                <div className="hidden sm:grid grid-cols-[1fr_120px_100px_120px_80px] gap-2 px-4 py-3">
                  <span className="text-[13px] font-medium text-[var(--foreground)] truncate">{card.title}</span>
                  <span className="text-[12px] text-[var(--muted-foreground)] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: column?.color || '#6b7280' }} />
                    {column?.title || ''}
                  </span>
                  <span className={`text-[12px] px-2 py-0.5 rounded-md w-fit ${
                    card.priority === 'Alta' ? 'bg-red-500/10 text-red-400' :
                    card.priority === 'Media' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-emerald-500/10 text-emerald-400'
                  }`}>
                    {card.priority}
                  </span>
                  <span className="text-[12px] text-[var(--muted-foreground)] truncate">{userName}</span>
                  <span className={`text-[12px] ${
                    card.dueDate && isOverdue(card.dueDate)
                      ? 'text-red-400'
                      : 'text-[var(--muted-foreground)]'
                  }`}>
                    {card.dueDate ? new Date(card.dueDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '—'}
                  </span>
                </div>

                {/* Mobile card layout */}
                <div className="sm:hidden px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-medium text-[var(--foreground)] line-clamp-2 flex-1">{card.title}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                      card.priority === 'Alta' ? 'bg-red-500/10 text-red-400' :
                      card.priority === 'Media' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {card.priority}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[12px] text-[var(--muted-foreground)] flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: column?.color || '#6b7280' }} />
                      {column?.title || ''}
                    </span>
                    <span className="text-[var(--border)]">·</span>
                    <span className="text-[12px] text-[var(--muted-foreground)] truncate max-w-[120px]">{userName}</span>
                    {card.dueDate && (
                      <>
                        <span className="text-[var(--border)]">·</span>
                        <span className={`text-[12px] ${
                          isOverdue(card.dueDate)
                            ? 'text-red-400'
                            : 'text-[var(--muted-foreground)]'
                        }`}>
                          {new Date(card.dueDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {sortedCards.length === 0 && (
            <div className="px-4 py-12 text-center text-[13px] text-[var(--muted-foreground)]">
              No hay tarjetas que mostrar
            </div>
          )}
        </div>
      </div>
    );
  }

  // Board view
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
    >
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4" style={{ scrollbarWidth: 'thin' }}>
        <div className="flex gap-4 h-full min-h-[calc(100vh-280px)]">
          {columns.map(column => (
            <div
              key={column.id}
              className="bg-[var(--af-bg3)]/50 border border-[var(--border)] rounded-2xl flex flex-col h-full overflow-hidden"
            >
              <KanbanColumn
                column={column}
                cards={groupedCards[column.id] || []}
                onCardClick={onCardClick}
                getUserName={getUserName}
                onQuickAdd={onQuickAdd}
              />
            </div>
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeCard ? (
          <div className="w-[268px] opacity-90 rotate-3 scale-105 shadow-2xl">
            <KanbanCard
              card={activeCard}
              onClick={() => {}}
              getUserName={getUserName}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
