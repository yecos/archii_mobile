'use client';
import React, { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { CO_STATUSES, CO_TYPES, CO_STATUS_LABELS, CO_TYPE_LABELS } from '@/lib/types';
import { SkeletonCard } from '@/components/ui/SkeletonLoaders';
import * as fbActions from '@/lib/firestore-actions';
import { FileEdit, Plus } from 'lucide-react';
import { useEntityResolvers } from '@/lib/useEntityResolvers';
import FilterBar from '@/components/common/FilterBar';
import EmptyState from '@/components/common/EmptyState';
import ChangeOrderCard from '@/components/change-orders/ChangeOrderCard';
import CenterModal from '@/components/common/CenterModal';
import ChangeOrderModal from '@/components/modals/ChangeOrderModal';
import ChangeOrderApproval from '@/components/change-orders/ChangeOrderApproval';

export default function ChangeOrdersScreen() {
  const {
    changeOrders, projects, teamUsers, loading,
    coFilterProject, setCoFilterProject, coFilterStatus, setCoFilterStatus, coFilterType, setCoFilterType,
    setEditingId, setForms, openModal, closeModal, modals, showToast, authUser, activeTenantId,
    activeTenantRole,
  } = useApp();

  const { getProjectName, getUserName } = useEntityResolvers(projects, teamUsers);

  // Selected CO for detail view
  const [selectedCO, setSelectedCO] = React.useState<any>(null);

  const filtered = useMemo(() => {
    return changeOrders.filter((co: any) => {
      const d = co.data;
      if (coFilterProject && d?.projectId !== coFilterProject) return false;
      if (coFilterStatus && d?.status !== coFilterStatus) return false;
      if (coFilterType && d?.type !== coFilterType) return false;
      return true;
    });
  }, [changeOrders, coFilterProject, coFilterStatus, coFilterType]);

  const stats = useMemo(() => {
    const total = changeOrders.length;
    const pending = changeOrders.filter((co: any) => co.data?.status === 'pendiente_aprobacion').length;
    const approved = changeOrders.filter((co: any) => co.data?.status === 'aprobada').length;
    const draft = changeOrders.filter((co: any) => co.data?.status === 'borrador').length;
    return { total, pending, approved, draft };
  }, [changeOrders]);

  const canCreate = ['Admin', 'Director', 'Arquitecto'].includes(activeTenantRole);
  const canApprove = ['Interventor', 'Super Admin', 'Admin'].includes(activeTenantRole);

  const handleCreate = () => {
    setEditingId(null);
    setForms(p => ({
      ...p,
      coTitle: '', coType: 'alcance', coDescription: '', coJustification: '',
      coPreviousBudget: '', coNewBudget: '', coDaysExtension: '', coScheduleReason: '', coProject: '',
    }));
    openModal('changeOrder');
  };

  const handleEdit = (co: any) => {
    const d = co.data;
    setEditingId(co.id);
    setForms(f => ({
      ...f,
      coTitle: d?.title || '',
      coType: d?.type || 'alcance',
      coDescription: d?.description || '',
      coJustification: d?.justification || '',
      coPreviousBudget: d?.costImpact?.previousBudget?.toString() || '',
      coNewBudget: d?.costImpact?.newBudget?.toString() || '',
      coDaysExtension: d?.scheduleImpact?.daysExtension?.toString() || '',
      coScheduleReason: d?.scheduleImpact?.reason || '',
      coProject: d?.projectId || '',
    }));
    openModal('changeOrder');
  };

  const handleDelete = async (co: any) => {
    try {
      await fbActions.updateChangeOrder(co.id, { status: 'cancelada' });
      showToast('Orden cancelada');
    } catch (err) {
      console.error('[Archii] Error cancelling CO:', err);
    }
  };

  const handleClick = (co: any) => {
    setSelectedCO(co);
  };

  const handleCloseDetail = () => {
    setSelectedCO(null);
  };

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileEdit size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Órdenes de Cambio
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{changeOrders.length} órdenes</p>
        </div>
        {canCreate && (
          <button
            className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors"
            onClick={handleCreate}
          >
            <Plus size={14} aria-hidden="true"/>
            Nueva orden
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 mb-5">
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-lg font-bold">{stats.total}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">Total</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-gray-400">{stats.draft}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">Borrador</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-amber-400">{stats.pending}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">Pendiente</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-emerald-400">{stats.approved}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">Aprobada</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <FilterBar
        statuses={CO_STATUSES.map(s => CO_STATUS_LABELS[s] || s)}
        activeStatus={coFilterStatus ? (CO_STATUS_LABELS[coFilterStatus] || coFilterStatus) : ''}
        onStatusChange={(label: string) => {
          const key = Object.entries(CO_STATUS_LABELS).find(([, v]) => v === label)?.[0] || '';
          setCoFilterStatus(key);
        }}
        projectFilter={{
          value: coFilterProject,
          onChange: setCoFilterProject,
          projects: projects.filter((p: any) => p.data.status !== 'Terminado').map((p: any) => ({ id: p.id, name: p.data.name })),
        }}
        filters={[{
          key: 'type',
          label: 'Todos los tipos',
          value: coFilterType ? (CO_TYPE_LABELS[coFilterType] || coFilterType) : '',
          options: CO_TYPES.map(t => ({ value: CO_TYPE_LABELS[t] || t, label: CO_TYPE_LABELS[t] || t })),
          onChange: (label: string) => {
            const key = Object.entries(CO_TYPE_LABELS).find(([, v]) => v === label)?.[0] || '';
            setCoFilterType(key);
          },
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
          emoji="📝"
          title="Sin órdenes de cambio"
          description={canCreate ? 'Crea tu primera orden de cambio' : 'No hay órdenes de cambio registradas'}
          actionLabel={canCreate ? 'Nueva orden' : undefined}
          onAction={canCreate ? handleCreate : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((co: any) => (
            <ChangeOrderCard
              key={co.id}
              co={co}
              getProjectName={getProjectName}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onClick={handleClick}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <ChangeOrderModal open={!!modals.changeOrder} onClose={() => closeModal('changeOrder')} />

      {/* Detail / Approval Modal */}
      <CenterModal open={!!selectedCO} onClose={handleCloseDetail} maxWidth={640}>
        {selectedCO && (
          <ChangeOrderApproval
            co={selectedCO}
            getProjectName={getProjectName}
            getUserName={getUserName}
            canApprove={canApprove}
            onClose={handleCloseDetail}
            onEdit={() => {
              handleCloseDetail();
              handleEdit(selectedCO);
            }}
          />
        )}
      </CenterModal>
    </div>
  );
}
