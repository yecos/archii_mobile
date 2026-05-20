'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useUIStore } from '@/stores/ui-store';
import { useInventoryContext } from '@/hooks/useInventory';
import KanbanToolbar from '@/components/kanban/KanbanToolbar';
import KanbanBoard from '@/components/kanban/KanbanBoard';
import KanbanCardModal from '@/components/modals/KanbanCardModal';
import type { KanbanEntityType, KanbanCardData, KanbanColumn } from '@/lib/kanban-helpers';
import {
  getEntityCards,
  getCardStatusFromColumn,
  getEntityLabel,
  getDefaultColumns,
  groupCardsByColumn,
  quickCardId,
} from '@/lib/kanban-helpers';
import type { KanbanBoard as KanbanBoardType, KanbanFilters } from '@/lib/types';
import { getFirebase, FieldValue as FV } from '@/lib/firebase-service';
import { Plus, Trash2, Settings, ChevronRight } from 'lucide-react';
import { SkeletonKanbanBoard } from '@/components/ui/SkeletonLoaders';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { toast } from 'sonner';

export default function KanbanBoardScreen() {
  const confirmDialog = useConfirmDialog();
  const {
    tasks,
    projects,
    teamUsers,
    approvals,
    invoices,
    activeTenantId,
    selectedProjectId,
    authUser,
    showToast,
    navigateTo,
    workPhases,
    changeTaskStatus,
    deleteTask,
    getUserName,
    comments,
  } = useApp();
  const { invTransfers } = useInventoryContext();

  const {
    kanbanEntityType,
    kanbanViewMode,
    kanbanBoardId,
    setKanbanBoardId,
    setKanbanViewMode,
  } = useUIStore();

  // Auto-switch to list view on mobile
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    if (mq.matches) setKanbanViewMode('list');
  }, [setKanbanViewMode]);

  // Board state
  const [board, setBoard] = useState<KanbanBoardType | null>(null);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [cards, setCards] = useState<KanbanCardData[]>([]);
  const [groupedCards, setGroupedCards] = useState<Record<string, KanbanCardData[]>>({});
  const [activeFilters, setActiveFilters] = useState<Partial<KanbanFilters>>({});
  const [selectedCard, setSelectedCard] = useState<KanbanCardData | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);

  // Get entity data map for the helpers
  const contextData = useMemo(() => ({
    tasks: tasks || [],
    projects: projects || [],
    approvals: approvals || [],
    invoices: invoices || [],
    transfers: invTransfers || [],
    phases: workPhases || [],
    incidents: [],
  }), [tasks, projects, approvals, invoices, invTransfers, workPhases]);

  // Load or initialize board
  useEffect(() => {
    if (!activeTenantId || !authUser) return;

    // Race-condition guard: prevent stale .then() callbacks from executing after cleanup
    let cancelled = false;
    let snapshotUnsub: (() => void) | null = null;

    // Try to find existing board for this entity type and tenant
    const db = getFirebase().firestore();
    let query = db.collection('kanbanBoards')
      .where('tenantId', '==', activeTenantId)
      .where('data.type', '==', kanbanEntityType)
      .limit(1);

    query.get().then(snap => {
      // Abort if cleanup already ran (StrictMode double-invoke)
      if (cancelled) return;

      if (!snap.empty) {
        const doc = snap.docs[0];
        setKanbanBoardId(doc.id);
        setBoard({ id: doc.id, data: doc.data().data });
        setLoading(false);

        // Subscribe for real-time updates
        snapshotUnsub = (doc as any).ref.onSnapshot((docSnap: any) => {
          if (docSnap.exists) {
            setBoard({ id: docSnap.id, data: docSnap.data().data });
          }
        }, (err: any) => console.error('[Kanban] onSnapshot error:', err));
      } else {
        // No board found — show template selection
        setBoard(null);
        setKanbanBoardId(null);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    // Cleanup: cancel both pending promise and active snapshot
    return () => {
      cancelled = true;
      if (snapshotUnsub) snapshotUnsub();
    };
  }, [activeTenantId, authUser, kanbanEntityType, setKanbanBoardId]);

  // Update columns when board or entity type changes
  useEffect(() => {
    if (board?.data.columns && board.data.columns.length > 0) {
      setColumns(board.data.columns);
    } else {
      setColumns(getDefaultColumns(kanbanEntityType));
    }
  }, [board, kanbanEntityType]);

  // Update cards when data changes
  useEffect(() => {
    const cardPositions = board?.data.cardPositions || {};
    const newCards = getEntityCards(
      kanbanEntityType,
      contextData,
      selectedProjectId,
      cardPositions,
      activeFilters as KanbanFilters
    );
    setCards(newCards);
  }, [kanbanEntityType, contextData, selectedProjectId, board, activeFilters]);

  // Update grouped cards when cards or columns change
  useEffect(() => {
    const grouped = groupCardsByColumn(cards, columns);
    setGroupedCards(grouped);
  }, [cards, columns]);

  // Create a new board from template
  const createBoard = useCallback(async () => {
    if (!activeTenantId || !authUser) return;
    try {
      const db = getFirebase().firestore();
      const ts = FV().serverTimestamp();
      const defaultCols = getDefaultColumns(kanbanEntityType);
      const boardData = {
        tenantId: activeTenantId,
        data: {
          name: `Tablero de ${getEntityLabel(kanbanEntityType)}`,
          type: kanbanEntityType,
          columns: defaultCols,
          swimlanes: [],
          cardPositions: {},
          quickCards: [],
          filters: {
            assigneeId: null,
            priority: null,
            projectIds: null,
            dueDateFrom: null,
            dueDateTo: null,
            tags: null,
            searchQuery: null,
          },
          viewMode: 'board' as const,
          createdAt: ts,
          updatedAt: ts,
          createdBy: authUser.uid,
        },
      };
      const docRef = await db.collection('kanbanBoards').add(boardData);
      setKanbanBoardId(docRef.id);
      setBoard({ id: docRef.id, data: boardData.data });
      setShowTemplates(false);
      showToast(`Tablero de ${getEntityLabel(kanbanEntityType)} creado`);
    } catch (err: any) {
      console.error('[Kanban] Error creating board:', err);
      showToast('Error al crear tablero', 'error');
    }
  }, [activeTenantId, authUser, kanbanEntityType, setKanbanBoardId, showToast]);

  // Handle card move (drag & drop)
  const handleCardMove = useCallback(async (cardId: string, entityId: string, newColumnId: string) => {
    const newStatus = getCardStatusFromColumn(kanbanEntityType, newColumnId);
    if (!newStatus) return;

    try {
      // Update entity status
      const db = getFirebase().firestore();
      const collectionName = kanbanEntityType === 'phases' ? 'projects' : kanbanEntityType;
      
      if (kanbanEntityType === 'tasks') {
        await changeTaskStatus(entityId, newStatus);
      } else if (kanbanEntityType === 'phases' && selectedProjectId) {
        await db.collection('projects').doc(selectedProjectId)
          .collection('workPhases').doc(entityId)
          .update({ status: newStatus, updatedAt: FV().serverTimestamp() });
      } else if (kanbanEntityType === 'transfers') {
        await db.collection('invTransfers').doc(entityId)
          .update({ status: newStatus, updatedAt: FV().serverTimestamp() });
      } else if (kanbanEntityType === 'invoices') {
        await db.collection('invoices').doc(entityId)
          .update({ status: newStatus, updatedAt: FV().serverTimestamp() });
      }

      // Update card positions in board
      if (board && kanbanBoardId) {
        const updatedPositions = {
          ...(board.data.cardPositions || {}),
          [entityId]: { columnId: newColumnId, order: Date.now() },
        };
        await db.collection('kanbanBoards').doc(kanbanBoardId)
          .update({
            'data.cardPositions': updatedPositions,
            'data.updatedAt': FV().serverTimestamp(),
          });
      }

      showToast(`${getEntityLabel(kanbanEntityType)} movido a ${newStatus}`);
    } catch (err: any) {
      console.error('[Kanban] Error moving card:', err);
      showToast('Error al mover tarjeta', 'error');
    }
  }, [kanbanEntityType, changeTaskStatus, selectedProjectId, board, kanbanBoardId, showToast]);

  // Quick add card
  const handleQuickAdd = useCallback(async (columnId: string, title: string) => {
    if (!activeTenantId || !authUser) return;

    const status = getCardStatusFromColumn(kanbanEntityType, columnId);
    if (!status) return;

    try {
      const db = getFirebase().firestore();
      const ts = FV().serverTimestamp();
      const qcId = quickCardId();

      if (kanbanEntityType === 'tasks') {
        const taskData = {
          title,
          description: '',
          projectId: selectedProjectId || '',
          assigneeId: authUser.uid,
          assigneeIds: [authUser.uid],
          priority: 'Media',
          status,
          dueDate: '',
          tenantId: activeTenantId,
          createdAt: ts,
          createdBy: authUser.uid,
          updatedAt: ts,
        };
        await db.collection('tasks').add(taskData);
        showToast('Tarea creada');
      } else {
        // For other entity types, add as a quick card
        if (kanbanBoardId) {
          const quickCard = {
            id: qcId,
            title,
            description: '',
            columnId,
            order: Date.now(),
            color: '#6366f1',
            tags: [],
            createdAt: ts,
            createdBy: authUser.uid,
          };
          const existingQuickCards = board?.data.quickCards || [];
          await db.collection('kanbanBoards').doc(kanbanBoardId)
            .update({
              'data.quickCards': [...existingQuickCards, quickCard],
              'data.updatedAt': ts,
            });
          showToast('Tarjeta creada');
        }
      }
    } catch (err: any) {
      console.error('[Kanban] Error adding card:', err);
      showToast('Error al crear tarjeta', 'error');
    }
  }, [activeTenantId, authUser, kanbanEntityType, selectedProjectId, kanbanBoardId, board, showToast]);

  // Card click
  const handleCardClick = useCallback((card: KanbanCardData) => {
    setSelectedCard(card);
    setShowCardModal(true);
  }, []);

  // Status change from modal
  const handleStatusChange = useCallback(async (entityId: string, newStatus: string) => {
    if (kanbanEntityType === 'tasks') {
      await changeTaskStatus(entityId, newStatus);
    }
    // Update selected card
    if (selectedCard) {
      setSelectedCard({ ...selectedCard, status: newStatus });
    }
  }, [kanbanEntityType, changeTaskStatus, selectedCard]);

  // Delete card
  const handleDeleteCard = useCallback(async (entityId: string) => {
    if (kanbanEntityType === 'tasks') {
      await deleteTask(entityId);
    }
  }, [kanbanEntityType, deleteTask]);

  // Add comment
  const handleAddComment = useCallback(async (text: string) => {
    if (!selectedCard || !authUser || !activeTenantId) return;

    try {
      const db = getFirebase().firestore();
      const ts = FV().serverTimestamp();
      const commentData = {
        taskId: selectedCard.entityId,
        projectId: selectedCard.projectId || selectedProjectId || '',
        userId: authUser.uid,
        userName: authUser.displayName || (authUser.email || '').split('@')[0] || 'Anonimo',
        userPhoto: authUser.photoURL || '',
        text,
        mentions: [],
        createdAt: ts,
      };
      await db.collection('comments').add(commentData);
      showToast('Comentario agregado');
    } catch (err: any) {
      console.error('[Kanban] Error adding comment:', err);
      showToast('Error al agregar comentario', 'error');
    }
  }, [selectedCard, authUser, activeTenantId, selectedProjectId, showToast]);

  // Filter change handler
  const handleFilterChange = useCallback((filters: Record<string, any>) => {
    setActiveFilters(prev => ({ ...prev, ...filters }));
  }, []);

  // Entity type change handler
  const handleEntityTypeChange = useCallback((type: KanbanEntityType) => {
    // Board will be re-fetched in useEffect
  }, []);

  // Get comments for selected card
  const cardComments = useMemo(() => {
    if (!selectedCard) return [];
    return (comments || []).filter((c: any) =>
      (c.data?.taskId === selectedCard.entityId) || (c.taskId === selectedCard.entityId)
    );
  }, [comments, selectedCard]);

  // Loading state — skeleton kanban board
  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-4">
        <SkeletonKanbanBoard cols={4} />
      </div>
    );
  }

  // No board — show creation CTA
  if (!board) {
    return (
      <div className="flex-1 flex flex-col gap-6">
        <KanbanToolbar
          onEntityTypeChange={handleEntityTypeChange}
          onFilterChange={handleFilterChange}
          onNewBoard={() => setShowTemplates(true)}
          hasBoard={false}
          teamUsers={teamUsers || []}
          projects={projects || []}
        />

        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[var(--af-accent)]/20 to-[var(--af-accent)]/5 border border-[var(--af-accent)]/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="var(--af-accent)" strokeWidth="1.5">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">
              Tablero Kanban
            </h2>
            <p className="text-[13px] text-[var(--muted-foreground)] leading-relaxed mb-6">
              Organiza tus {getEntityLabel(kanbanEntityType).toLowerCase()} visualmente con un tablero Kanban interactivo. Arrastra y suelta para cambiar estados.
            </p>

            {/* Template options */}
            <div className="space-y-3">
              <button
                onClick={createBoard}
                className="w-full flex items-center justify-between px-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:border-[var(--af-accent)]/30 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--af-accent)]/10 flex items-center justify-center">
                    <Plus size={18} className="text-[var(--af-accent)]" aria-hidden="true"/>
                  </div>
                  <div className="text-left">
                    <div className="text-[14px] font-medium text-[var(--foreground)]">
                      Tablero basico
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {getDefaultColumns(kanbanEntityType).map(c => c.title).join(' → ')}
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[var(--muted-foreground)] group-hover:text-[var(--af-accent)] transition-colors" aria-hidden="true"/>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main board view
  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      <KanbanToolbar
        onEntityTypeChange={handleEntityTypeChange}
        onFilterChange={handleFilterChange}
        hasBoard={!!board}
        teamUsers={teamUsers || []}
        projects={projects || []}
      />

      {/* Board info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
            {board.data.name}
          </h2>
          <span className="text-[11px] text-[var(--muted-foreground)] px-2 py-0.5 rounded-full bg-[var(--af-bg3)]">
            {cards.length} tarjeta{cards.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={createBoard}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg bg-[var(--af-bg3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--af-accent)]/30 transition-all cursor-pointer"
            title="Recrear tablero"
          >
            <Settings size={13} aria-hidden="true"/>
            Reiniciar
          </button>
          <button
            onClick={async () => {
              if (!kanbanBoardId || !board || !(await confirmDialog.confirm({ title: 'Eliminar tablero', description: '¿Eliminar este tablero?' }))) return;
              try {
                const boardId = kanbanBoardId;
                const boardData = { ...board.data };
                await getFirebase().firestore().collection('kanbanBoards').doc(boardId).delete();
                setKanbanBoardId(null);
                setBoard(null);
                toast.success('Tablero eliminado', {
                  duration: 5000,
                  action: {
                    label: 'Deshacer',
                    onClick: async () => {
                      try {
                        const db = getFirebase().firestore();
                        await db.collection('kanbanBoards').doc(boardId).set({
                          tenantId: activeTenantId,
                          data: boardData,
                        });
                        setKanbanBoardId(boardId);
                        setBoard({ id: boardId, data: boardData });
                        toast.success('Tablero restaurado');
                      } catch (err) { console.error('[Kanban] undo delete:', err); toast.error('Error al restaurar'); }
                    },
                  },
                });
              } catch (err) {
                showToast('Error al eliminar', 'error');
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all cursor-pointer border-none"
            title="Eliminar tablero"
          >
            <Trash2 size={13} aria-hidden="true"/>
            Eliminar
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0">
        <KanbanBoard
          columns={columns}
          cards={cards}
          groupedCards={groupedCards}
          onCardClick={handleCardClick}
          onCardMove={handleCardMove}
          onQuickAdd={handleQuickAdd}
          getUserName={getUserName}
        />
      </div>

      {/* Card detail modal */}
      <KanbanCardModal
        open={showCardModal}
        onClose={() => { setShowCardModal(false); setSelectedCard(null); }}
        card={selectedCard}
        entityType={kanbanEntityType}
        teamUsers={teamUsers || []}
        getUserName={getUserName}
        onStatusChange={handleStatusChange}
        onDelete={handleDeleteCard}
        comments={cardComments}
        onAddComment={kanbanEntityType === 'tasks' ? handleAddComment : undefined}
      />
      <ConfirmDialog {...confirmDialog} />
    </div>
  );
}
