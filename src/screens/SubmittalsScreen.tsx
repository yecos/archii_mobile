'use client';
import React, { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { fmtDate } from '@/lib/helpers';
import { SUBMITTAL_STATUS_COLORS, SUBMITTAL_STATUSES } from '@/lib/types';
import { SkeletonCard } from '@/components/ui/SkeletonLoaders';
import * as fbActions from '@/lib/firestore-actions';
import { useEntityResolvers } from '@/lib/useEntityResolvers';
import { Pencil, Trash2, FileCheck, Plus } from 'lucide-react';
import { OverflowMenu } from '@/components/ui/OverflowMenu';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { showUndoToast } from '@/lib/undo-helpers';
import FilterBar from '@/components/common/FilterBar';
import EmptyState from '@/components/common/EmptyState';

export default function SubmittalsScreen() {
  const {
    submittals, projects, teamUsers, loading,
    subFilterProject, setSubFilterProject, subFilterStatus, setSubFilterStatus,
    setEditingId, setForms, openModal, showToast, authUser, activeTenantId,
  } = useApp();

  const { getProjectName, getUserName } = useEntityResolvers(projects, teamUsers);
  const confirmDialog = useConfirmDialog();

  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [showReviewInput, setShowReviewInput] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return submittals.filter((s: any) => {
      if (subFilterProject && s.data.projectId !== subFilterProject) return false;
      if (subFilterStatus && s.data.status !== subFilterStatus) return false;
      return true;
    });
  }, [submittals, subFilterProject, subFilterStatus]);

  const stats = useMemo(() => ({
    total: submittals.length,
    draft: submittals.filter((s: any) => s.data.status === 'Borrador').length,
    inReview: submittals.filter((s: any) => s.data.status === 'En revisión').length,
    approved: submittals.filter((s: any) => s.data.status === 'Aprobado').length,
    rejected: submittals.filter((s: any) => s.data.status === 'Rechazado').length,
    returned: submittals.filter((s: any) => s.data.status === 'Devuelto').length,
  }), [submittals]);

  const handleStatusChange = async (subId: string, newStatus: string, notes?: string) => {
    await fbActions.updateSubmittalStatus(subId, newStatus, notes || '', showToast, authUser, activeTenantId);
    setShowReviewInput(null);
    setReviewNotes(prev => { const n = { ...prev }; delete n[subId]; return n; });
  };

  const handleCreate = () => {
    setEditingId(null);
    setForms(p => ({ ...p, subTitle: '', subDescription: '', subSpecification: '', subStatus: 'Borrador', subReviewer: '', subDueDate: '', subReviewNotes: '', subProject: '' }));
    openModal('submittal');
  };

  const handleEdit = (s: any) => {
    setEditingId(s.id);
    setForms(f => ({ ...f, subTitle: s.data.title, subDescription: s.data.description || '', subSpecification: s.data.specification || '', subStatus: s.data.status || 'Borrador', subReviewer: s.data.reviewer || '', subDueDate: s.data.dueDate || '', subReviewNotes: s.data.reviewNotes || '', subProject: s.data.projectId || '' }));
    openModal('submittal');
  };

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileCheck size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Submittals
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{submittals.length} submittals</p>
        </div>
        <button
          className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors"
          onClick={handleCreate}
        >
          <Plus size={14} aria-hidden="true"/>
          Nuevo submittal
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-5">
        {[
          { label: 'Total', value: stats.total, color: 'bg-[var(--af-bg4)]' },
          { label: 'Borrador', value: stats.draft, color: 'bg-gray-500/10 text-gray-400' },
          { label: 'En revisión', value: stats.inReview, color: 'bg-amber-500/10 text-amber-400' },
          { label: 'Aprobado', value: stats.approved, color: 'bg-emerald-500/10 text-emerald-400' },
          { label: 'Rechazado', value: stats.rejected, color: 'bg-red-500/10 text-red-400' },
          { label: 'Devuelto', value: stats.returned, color: 'bg-purple-500/10 text-purple-400' },
        ].map((s) => (
          <div key={s.label} className={`${s.color} rounded-xl p-3 text-center`}>
            <div className="text-xl font-bold">{s.value}</div>
            <div className="text-[11px] opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters + Status Tabs (unified) */}
      <FilterBar
        statuses={SUBMITTAL_STATUSES}
        activeStatus={subFilterStatus}
        onStatusChange={setSubFilterStatus}
        projectFilter={{
          value: subFilterProject,
          onChange: setSubFilterProject,
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
          emoji="📋"
          title="Sin submittals"
          description="Crea tu primer submittal para enviar a revisión"
          actionLabel="Nuevo submittal"
          onAction={handleCreate}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((s: any) => {
            const statusCls = SUBMITTAL_STATUS_COLORS[s.data.status] || 'bg-[var(--af-bg4)] text-[var(--muted-foreground)] border-[var(--border)]';
            return (
              <div key={s.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--input)] transition-all">
                {/* Top row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-[var(--af-accent)]/10 text-[var(--af-accent)] border border-[var(--af-accent)]/20">
                      {s.data.number}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusCls}`}>
                      {s.data.status}
                    </span>
                  </div>
                  <div className="hidden md:flex gap-1.5 flex-shrink-0">
                    <button aria-label="Editar" className="px-1.5 py-0.5 rounded bg-[var(--af-bg4)] text-xs cursor-pointer" onClick={() => handleEdit(s)}><Pencil size={12} aria-hidden="true"/></button>
                    <button aria-label="Eliminar" className="px-1.5 py-0.5 rounded bg-red-500/10 text-xs cursor-pointer" onClick={async () => {
                      const ok = await confirmDialog.confirm({ title: 'Eliminar submittal', description: '¿Estás seguro de eliminar este submittal?' });
                      if (!ok) return;
                      const snapshot = { ...s.data };
                      await fbActions.deleteSubmittal(s.id, showToast, activeTenantId);
                      showUndoToast({ collection: 'submittals', docId: s.id, snapshot, label: 'Submittal' });
                    }}><Trash2 size={12} aria-hidden="true"/></button>
                  </div>
                  <div className="md:hidden flex-shrink-0">
                    <OverflowMenu
                      actions={[
                        { label: 'Editar submittal', icon: <Pencil size={14} aria-hidden="true"/>, onClick: () => handleEdit(s) },
                        { label: 'Eliminar submittal', icon: <Trash2 size={14} aria-hidden="true"/>, variant: 'danger', separator: true, onClick: async () => {
                          const ok = await confirmDialog.confirm({ title: 'Eliminar submittal', description: '¿Estás seguro de eliminar este submittal?' });
                          if (!ok) return;
                          const snapshot = { ...s.data };
                          await fbActions.deleteSubmittal(s.id, showToast, activeTenantId);
                          showUndoToast({ collection: 'submittals', docId: s.id, snapshot, label: 'Submittal' });
                        }},
                      ]}
                    />
                  </div>
                </div>

                {/* Title */}
                <div className="text-[14px] font-semibold mb-1">{s.data.title}</div>
                {s.data.description && (
                  <div className="text-[12px] text-[var(--muted-foreground)] mb-2 line-clamp-2">{s.data.description}</div>
                )}

                {/* Spec */}
                {s.data.specification && (
                  <div className="text-[11px] text-[var(--af-text3)] mb-2">📄 Spec: {s.data.specification}</div>
                )}

                {/* Review notes */}
                {(s.data.status === 'Rechazado' || s.data.status === 'Devuelto') && s.data.reviewNotes && (
                  <div className={`${s.data.status === 'Rechazado' ? 'bg-red-500/5 border-red-500/20' : 'bg-purple-500/5 border-purple-500/20'} border rounded-lg p-3 mb-2`}>
                    <div className="text-[10px] font-semibold mb-1">{s.data.status === 'Rechazado' ? 'MOTIVO DE RECHAZO' : 'NOTAS DE DEVOLUCIÓN'}</div>
                    <div className="text-[12px] text-[var(--foreground)]">{s.data.reviewNotes}</div>
                  </div>
                )}

                {/* Quick actions */}
                {s.data.status === 'Borrador' && (
                  <button
                    className="text-[12px] font-semibold text-[var(--af-accent)] hover:underline cursor-pointer bg-transparent border-none p-0 mb-2"
                    onClick={() => handleStatusChange(s.id, 'En revisión')}
                  >
                    → Enviar a revisión
                  </button>
                )}

                {s.data.status === 'En revisión' && (
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {showReviewInput === s.id ? (
                      <div className="flex gap-2 w-full">
                        <input
                          className="flex-1 bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-1.5 text-xs text-[var(--foreground)] outline-none"
                          placeholder="Notas de revisión (opcional)"
                          value={reviewNotes[s.id] || ''}
                          onChange={(e) => setReviewNotes(prev => ({ ...prev, [s.id]: e.target.value }))}
                        />
                        <button className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 cursor-pointer" onClick={() => handleStatusChange(s.id, 'Aprobado', reviewNotes[s.id])}>Aprobar</button>
                        <button className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/30 cursor-pointer" onClick={() => handleStatusChange(s.id, 'Rechazado', reviewNotes[s.id])}>Rechazar</button>
                        <button className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30 cursor-pointer" onClick={() => handleStatusChange(s.id, 'Devuelto', reviewNotes[s.id])}>Devolver</button>
                        <button className="px-2 py-1.5 rounded-lg text-[11px] bg-[var(--af-bg4)] cursor-pointer" onClick={() => setShowReviewInput(null)}>✕</button>
                      </div>
                    ) : (
                      <button
                        className="text-[12px] font-semibold text-amber-400 hover:underline cursor-pointer bg-transparent border-none p-0"
                        onClick={() => setShowReviewInput(s.id)}
                      >
                        ⚖️ Revisar submittal
                      </button>
                    )}
                  </div>
                )}

                {/* Meta */}
                <div className="flex flex-wrap gap-3 text-[11px] text-[var(--af-text3)]">
                  <span>📁 {getProjectName(s.data.projectId)}</span>
                  {s.data.submittedBy && <span>👤 {getUserName(s.data.submittedBy)}</span>}
                  {s.data.reviewer && <span>🔍 {getUserName(s.data.reviewer)}</span>}
                  {s.data.dueDate && <span>📅 {fmtDate(s.data.dueDate)}</span>}
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
