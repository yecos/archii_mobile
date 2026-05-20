'use client';
import React, { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { fmtDate } from '@/lib/helpers';
import { PUNCH_STATUS_COLORS, PUNCH_STATUSES, PUNCH_PRIORITIES, PUNCH_LOCATIONS } from '@/lib/types';
import { SkeletonCard } from '@/components/ui/SkeletonLoaders';
import * as fbActions from '@/lib/firestore-actions';
import { Camera, Pencil, Trash2, ClipboardCheck, Plus } from 'lucide-react';
import { PRIO_COLORS, LOC_COLORS } from '@/lib/constants/colors';
import { useEntityResolvers } from '@/lib/useEntityResolvers';
import { OverflowMenu } from '@/components/ui/OverflowMenu';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { showUndoToast } from '@/lib/undo-helpers';
import FilterBar from '@/components/common/FilterBar';
import EmptyState from '@/components/common/EmptyState';

export default function PunchListScreen() {
  const {
    punchItems, projects, teamUsers, loading,
    punchFilterProject, setPunchFilterProject, punchFilterStatus, setPunchFilterStatus,
    punchFilterLocation, setPunchFilterLocation,
    setEditingId, setForms, openModal, showToast, authUser, activeTenantId,
  } = useApp();

  const { getProjectName, getUserName } = useEntityResolvers(projects, teamUsers);
  const confirmDialog = useConfirmDialog();

  const filtered = useMemo(() => {
    return punchItems.filter((p: any) => {
      if (punchFilterProject && p.data.projectId !== punchFilterProject) return false;
      if (punchFilterStatus && p.data.status !== punchFilterStatus) return false;
      if (punchFilterLocation && p.data.location !== punchFilterLocation) return false;
      return true;
    });
  }, [punchItems, punchFilterProject, punchFilterStatus, punchFilterLocation]);

  const stats = useMemo(() => {
    const total = punchItems.length;
    const pending = punchItems.filter((p: any) => p.data.status === 'Pendiente').length;
    const inProgress = punchItems.filter((p: any) => p.data.status === 'En progreso').length;
    const completed = punchItems.filter((p: any) => p.data.status === 'Completado').length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, pending, inProgress, completed, pct };
  }, [punchItems]);

  const handleStatusChange = async (punchId: string, newStatus: string) => {
    await fbActions.updatePunchItemStatus(punchId, newStatus, showToast, authUser, activeTenantId);
  };

  const handleCreate = () => {
    setEditingId(null);
    setForms(p => ({ ...p, punchTitle: '', punchDescription: '', punchLocation: 'Otro', punchStatus: 'Pendiente', punchPriority: 'Media', punchAssignedTo: '', punchDueDate: '', punchProject: '' }));
    openModal('punchItem');
  };

  const handleEdit = (p: any) => {
    setEditingId(p.id);
    setForms(f => ({ ...f, punchTitle: p.data.title, punchDescription: p.data.description || '', punchLocation: p.data.location || 'Otro', punchStatus: p.data.status || 'Pendiente', punchPriority: p.data.priority || 'Media', punchAssignedTo: p.data.assignedTo || '', punchDueDate: p.data.dueDate || '', punchProject: p.data.projectId || '' }));
    openModal('punchItem');
  };

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardCheck size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Punch List
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{punchItems.length} items</p>
        </div>
        <button
          className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors"
          onClick={handleCreate}
        >
          <Plus size={14} aria-hidden="true"/>
          Nuevo item
        </button>
      </div>

      {/* Stats + progress bar */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 mb-5">
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div className="text-center">
            <div className="text-lg font-bold">{stats.total}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">Total</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-400">{stats.pending}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">Pendiente</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-amber-400">{stats.inProgress}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">En progreso</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-emerald-400">{stats.completed}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">Completado</div>
          </div>
        </div>
        <div className="relative h-2 bg-[var(--af-bg3)] rounded-full overflow-hidden">
          <div
            className="absolute h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
            style={{ width: `${stats.pct}%` }}
          />
        </div>
        <div className="text-[11px] text-[var(--muted-foreground)] mt-1 text-right">{stats.pct}% completado</div>
      </div>

      {/* Filters + Status Tabs (unified) */}
      <FilterBar
        statuses={PUNCH_STATUSES}
        activeStatus={punchFilterStatus}
        onStatusChange={setPunchFilterStatus}
        projectFilter={{
          value: punchFilterProject,
          onChange: setPunchFilterProject,
          projects: projects.filter((p: any) => p.data.status !== 'Terminado').map((p: any) => ({ id: p.id, name: p.data.name })),
        }}
        filters={[{
          key: 'location',
          label: 'Todas las ubicaciones',
          value: punchFilterLocation,
          options: PUNCH_LOCATIONS.map(l => ({ value: l, label: l })),
          onChange: setPunchFilterLocation,
        }]}
        className="mb-4"
      />

      {/* Grid */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          emoji="✅"
          title="Sin items"
          description="Agrega tu primer item a la punch list"
          actionLabel="Nuevo item"
          onAction={handleCreate}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p: any) => {
            const statusCls = PUNCH_STATUS_COLORS[p.data.status] || 'bg-[var(--af-bg4)] text-[var(--muted-foreground)] border-[var(--border)]';
            const prioCls = PRIO_COLORS[p.data.priority] || PRIO_COLORS['Media'];
            const locCls = LOC_COLORS[p.data.location] || LOC_COLORS['Otro'];
            const projName = getProjectName(p.data.projectId);
            return (
              <div key={p.id} className={`bg-[var(--card)] border rounded-xl p-4 hover:border-[var(--input)] transition-all ${p.data.status === 'Completado' ? 'border-emerald-500/20 opacity-80' : 'border-[var(--border)]'}`}>
                {/* Badges row */}
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusCls}`}>
                    {p.data.status}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${prioCls}`}>
                    {p.data.priority}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${locCls}`}>
                    {p.data.location}
                  </span>
                  {p.data.photos && p.data.photos.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--muted-foreground)] flex items-center gap-0.5">
                      <Camera size={10} className="stroke-current" aria-hidden="true"/> {p.data.photos.length}
                    </span>
                  )}
                </div>

                {/* Title */}
                <div className="text-[14px] font-semibold mb-1">{p.data.title}</div>
                {p.data.description && (
                  <div className="text-[12px] text-[var(--muted-foreground)] mb-3 line-clamp-2">{p.data.description}</div>
                )}

                {/* Meta */}
                <div className="flex flex-wrap gap-2 text-[11px] text-[var(--af-text3)] mb-3">
                  {projName && <span>📁 {projName}</span>}
                  {p.data.assignedTo && <span>👤 {getUserName(p.data.assignedTo)}</span>}
                  {p.data.dueDate && <span>📅 {fmtDate(p.data.dueDate)}</span>}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {p.data.status === 'Pendiente' && (
                    <button
                      className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 cursor-pointer hover:bg-amber-500/20 transition-colors"
                      onClick={() => handleStatusChange(p.id, 'En progreso')}
                    >
                      ▶ Iniciar
                    </button>
                  )}
                  {p.data.status === 'En progreso' && (
                    <button
                      className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/20 transition-colors"
                      onClick={() => handleStatusChange(p.id, 'Completado')}
                    >
                      ✓ Completar
                    </button>
                  )}
                  {p.data.status === 'Completado' && (
                    <button
                      className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 cursor-pointer"
                      onClick={() => handleStatusChange(p.id, 'Pendiente')}
                    >
                      ↩ Reabrir
                    </button>
                  )}
                  <button aria-label="Editar" className="hidden md:block px-1.5 py-1.5 rounded bg-[var(--af-bg4)] text-xs cursor-pointer" onClick={() => handleEdit(p)}><Pencil size={12} aria-hidden="true"/></button>
                  <button aria-label="Eliminar" className="hidden md:block px-1.5 py-1.5 rounded bg-red-500/10 text-xs cursor-pointer" onClick={async () => {
                    const ok = await confirmDialog.confirm({ title: 'Eliminar item', description: '¿Estás seguro de eliminar este item?' });
                    if (!ok) return;
                    const snapshot = { ...p.data };
                    await fbActions.deletePunchItem(p.id, showToast, activeTenantId);
                    showUndoToast({ collection: 'punchItems', docId: p.id, snapshot, label: 'Item', gender: 'o' });
                  }}><Trash2 size={12} aria-hidden="true"/></button>
                  <div className="md:hidden">
                    <OverflowMenu
                      actions={[
                        { label: 'Editar item', icon: <Pencil size={14} aria-hidden="true"/>, onClick: () => handleEdit(p) },
                        { label: 'Eliminar item', icon: <Trash2 size={14} aria-hidden="true"/>, variant: 'danger', separator: true, onClick: async () => {
                          const ok = await confirmDialog.confirm({ title: 'Eliminar item', description: '¿Estás seguro de eliminar este item?' });
                          if (!ok) return;
                          const snapshot = { ...p.data };
                          await fbActions.deletePunchItem(p.id, showToast, activeTenantId);
                          showUndoToast({ collection: 'punchItems', docId: p.id, snapshot, label: 'Item', gender: 'o' });
                        }},
                      ]}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog {...confirmDialog} />
    </div>
  );
}
