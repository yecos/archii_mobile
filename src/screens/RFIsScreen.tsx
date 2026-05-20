'use client';
import React, { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { fmtDate } from '@/lib/helpers';
import { RFI_STATUS_COLORS, RFI_STATUSES } from '@/lib/types';
import { SkeletonCard } from '@/components/ui/SkeletonLoaders';
import * as fbActions from '@/lib/firestore-actions';
import { PRIO_COLORS } from '@/lib/constants/colors';
import { useEntityResolvers } from '@/lib/useEntityResolvers';
import { Pencil, Trash2, MessageCircleQuestion, Plus } from 'lucide-react';
import { OverflowMenu } from '@/components/ui/OverflowMenu';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { showUndoToast } from '@/lib/undo-helpers';
import FilterBar from '@/components/common/FilterBar';
import EmptyState from '@/components/common/EmptyState';

export default function RFIsScreen() {
  const {
    rfis, projects, teamUsers, loading,
    rfiFilterProject, setRfiFilterProject, rfiFilterStatus, setRfiFilterStatus,
    setEditingId, setForms, openModal, showToast, authUser, activeTenantId,
  } = useApp();

  const { getProjectName, getUserName } = useEntityResolvers(projects, teamUsers);
  const confirmDialog = useConfirmDialog();

  const filtered = useMemo(() => {
    return rfis.filter((r: any) => {
      if (rfiFilterProject && r.data.projectId !== rfiFilterProject) return false;
      if (rfiFilterStatus && r.data.status !== rfiFilterStatus) return false;
      return true;
    });
  }, [rfis, rfiFilterProject, rfiFilterStatus]);

  const stats = useMemo(() => ({
    total: rfis.length,
    open: rfis.filter((r: any) => r.data.status === 'Abierto').length,
    inReview: rfis.filter((r: any) => r.data.status === 'En revisión').length,
    responded: rfis.filter((r: any) => r.data.status === 'Respondido').length,
    closed: rfis.filter((r: any) => r.data.status === 'Cerrado').length,
  }), [rfis]);

  const handleStatusChange = async (rfiId: string, newStatus: string) => {
    await fbActions.updateRFIStatus(rfiId, newStatus, '', showToast, authUser, activeTenantId);
  };

  const handleCreate = () => {
    setEditingId(null);
    setForms(p => ({ ...p, rfiSubject: '', rfiQuestion: '', rfiResponse: '', rfiPriority: 'Media', rfiAssignedTo: '', rfiDueDate: '', rfiStatus: 'Abierto', rfiProject: '' }));
    openModal('rfi');
  };

  const handleEdit = (r: any) => {
    setEditingId(r.id);
    setForms(p => ({ ...p, rfiSubject: r.data.subject, rfiQuestion: r.data.question, rfiResponse: r.data.response || '', rfiPriority: r.data.priority || 'Media', rfiAssignedTo: r.data.assignedTo || '', rfiDueDate: r.data.dueDate || '', rfiStatus: r.data.status || 'Abierto', rfiProject: r.data.projectId || '' }));
    openModal('rfi');
  };

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageCircleQuestion size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            RFIs
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{rfis.length} solicitudes de información</p>
        </div>
        <button
          className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors"
          onClick={handleCreate}
        >
          <Plus size={14} aria-hidden="true"/>
          Nuevo RFI
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Total', value: stats.total, color: 'bg-[var(--af-bg4)]' },
          { label: 'Abiertos', value: stats.open, color: 'bg-blue-500/10 text-blue-400' },
          { label: 'En revisión', value: stats.inReview, color: 'bg-amber-500/10 text-amber-400' },
          { label: 'Respondidos', value: stats.responded, color: 'bg-emerald-500/10 text-emerald-400' },
          { label: 'Cerrados', value: stats.closed, color: 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]' },
        ].map((s) => (
          <div key={s.label} className={`${s.color} rounded-xl p-3 text-center`}>
            <div className="text-xl font-bold">{s.value}</div>
            <div className="text-[11px] opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters + Status Tabs (unified) */}
      <FilterBar
        statuses={RFI_STATUSES}
        activeStatus={rfiFilterStatus}
        onStatusChange={setRfiFilterStatus}
        projectFilter={{
          value: rfiFilterProject,
          onChange: setRfiFilterProject,
          projects: projects.filter((p: any) => p.data.status === 'Ejecucion').map((p: any) => ({ id: p.id, name: p.data.name })),
        }}
        className="mb-4"
      />

      {/* List */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          emoji="❓"
          title="Sin RFIs"
          description="Crea tu primer RFI para solicitar información"
          actionLabel="Nuevo RFI"
          onAction={handleCreate}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((r: any) => {
            const statusCls = RFI_STATUS_COLORS[r.data.status] || 'bg-[var(--af-bg4)] text-[var(--muted-foreground)] border-[var(--border)]';
            const prioCls = PRIO_COLORS[r.data.priority] || PRIO_COLORS['Media'];
            return (
              <div key={r.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--input)] transition-all">
                {/* Top row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-[var(--af-accent)]/10 text-[var(--af-accent)] border border-[var(--af-accent)]/20">
                      {r.data.number}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${prioCls}`}>
                      {r.data.priority}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusCls}`}>
                      {r.data.status}
                    </span>
                  </div>
                  <div className="hidden md:flex gap-1.5 flex-shrink-0">
                    <select
                      className="bg-[var(--af-bg3)] border border-[var(--input)] rounded px-1 py-0.5 text-[10px] text-[var(--foreground)] outline-none cursor-pointer"
                      value={r.data.status}
                      onChange={(e) => handleStatusChange(r.id, e.target.value)}
                    >
                      {RFI_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <button aria-label="Editar" className="px-1.5 py-0.5 rounded bg-[var(--af-bg4)] text-xs cursor-pointer" onClick={() => handleEdit(r)}><Pencil size={12} aria-hidden="true"/></button>
                    <button aria-label="Eliminar" className="px-1.5 py-0.5 rounded bg-red-500/10 text-xs cursor-pointer" onClick={async () => {
                      const ok = await confirmDialog.confirm({ title: 'Eliminar RFI', description: '¿Estás seguro de eliminar este RFI?' });
                      if (!ok) return;
                      const snapshot = { ...r.data };
                      await fbActions.deleteRFI(r.id, showToast, activeTenantId);
                      showUndoToast({ collection: 'rfis', docId: r.id, snapshot, label: 'RFI' });
                    }}><Trash2 size={12} aria-hidden="true"/></button>
                  </div>
                  <div className="md:hidden flex-shrink-0">
                    <OverflowMenu
                      actions={[
                        { label: 'Editar RFI', icon: <Pencil size={14} aria-hidden="true"/>, onClick: () => handleEdit(r) },
                        { label: 'Eliminar RFI', icon: <Trash2 size={14} aria-hidden="true"/>, variant: 'danger', separator: true, onClick: async () => {
                          const ok = await confirmDialog.confirm({ title: 'Eliminar RFI', description: '¿Estás seguro de eliminar este RFI?' });
                          if (!ok) return;
                          const snapshot = { ...r.data };
                          await fbActions.deleteRFI(r.id, showToast, activeTenantId);
                          showUndoToast({ collection: 'rfis', docId: r.id, snapshot, label: 'RFI' });
                        }},
                      ]}
                    />
                  </div>
                </div>

                {/* Subject */}
                <div className="text-[14px] font-semibold mb-1">{r.data.subject}</div>
                <div className="text-[12px] text-[var(--muted-foreground)] mb-2 line-clamp-2">{r.data.question}</div>

                {/* Response inline */}
                {r.data.response && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 mb-2">
                    <div className="text-[10px] font-semibold text-emerald-400 mb-1">RESPUESTA</div>
                    <div className="text-[12px] text-[var(--foreground)]">{r.data.response}</div>
                  </div>
                )}

                {/* Meta */}
                <div className="flex flex-wrap gap-3 text-[11px] text-[var(--af-text3)]">
                  <span>📁 {getProjectName(r.data.projectId)}</span>
                  {r.data.assignedTo && <span>👤 {getUserName(r.data.assignedTo)}</span>}
                  {r.data.dueDate && <span>📅 {fmtDate(r.data.dueDate)}</span>}
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
