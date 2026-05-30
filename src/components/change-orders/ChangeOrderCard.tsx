'use client';
import React from 'react';
import { fmtCOP } from '@/lib/helpers';
import { CO_STATUS_COLORS, CO_TYPE_COLORS, CO_STATUS_LABELS, CO_TYPE_LABELS, toDate } from '@/lib/types';
import { Pencil, Trash2 } from 'lucide-react';
import { OverflowMenu } from '@/components/ui/OverflowMenu';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useConfirmDialog } from '@/lib/useConfirmDialog';

interface ChangeOrderCardProps {
  co: any;
  getProjectName: (id: string) => string;
  onEdit: (co: any) => void;
  onDelete: (co: any) => void;
  onClick: (co: any) => void;
}

export default function ChangeOrderCard({ co, getProjectName, onEdit, onDelete, onClick }: ChangeOrderCardProps) {
  const confirmDialog = useConfirmDialog();
  const d = co.data;
  const statusCls = CO_STATUS_COLORS[d?.status] || 'bg-gray-500/10 text-gray-400 border-gray-500/30';
  const typeCls = CO_TYPE_COLORS[d?.type] || 'bg-gray-500/10 text-gray-400 border-gray-500/30';
  const statusLabel = CO_STATUS_LABELS[d?.status] || d?.status || '';
  const typeLabel = CO_TYPE_LABELS[d?.type] || d?.type || '';
  const projName = getProjectName(d?.projectId);

  const costDiff = d?.costImpact?.difference;
  const costDiffCls = costDiff !== undefined
    ? costDiff >= 0 ? 'text-amber-400' : 'text-emerald-400'
    : '';

  const createdDate = d?.createdAt ? toDate(d.createdAt) : null;

  return (
    <>
      <div
        className={`bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--input)] transition-all cursor-pointer ${d?.status === 'rechazada' || d?.status === 'cancelada' ? 'opacity-70' : ''}`}
        onClick={() => onClick(co)}
      >
        {/* Order number + badges */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--af-accent)]/15 text-[var(--af-accent)] border border-[var(--af-accent)]/30">
            {d?.orderNumber || 'CO-???'}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusCls}`}>
            {statusLabel}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${typeCls}`}>
            {typeLabel}
          </span>
        </div>

        {/* Title */}
        <div className="text-[14px] font-semibold mb-1 line-clamp-2">{d?.title || ''}</div>

        {/* Description */}
        {d?.description && (
          <div className="text-[12px] text-[var(--muted-foreground)] mb-3 line-clamp-2">{d.description}</div>
        )}

        {/* Cost impact */}
        {d?.costImpact && costDiff !== undefined && costDiff !== 0 && (
          <div className="flex items-center gap-1.5 mb-2 text-[11px]">
            <span className="text-[var(--muted-foreground)]">Impacto costo:</span>
            <span className={`font-semibold ${costDiffCls}`}>
              {costDiff >= 0 ? '+' : ''}{fmtCOP(costDiff)}
            </span>
          </div>
        )}

        {/* Schedule impact */}
        {d?.scheduleImpact && d.scheduleImpact.daysExtension > 0 && (
          <div className="flex items-center gap-1.5 mb-2 text-[11px]">
            <span className="text-[var(--muted-foreground)]">Extensión:</span>
            <span className="font-semibold text-blue-400">{d.scheduleImpact.daysExtension} días</span>
          </div>
        )}

        {/* Meta */}
        <div className="flex flex-wrap gap-2 text-[11px] text-[var(--af-text3)] mb-3">
          {projName && <span>📁 {projName}</span>}
          {createdDate && <span>📅 {createdDate.toLocaleDateString('es-CO')}</span>}
          {d?.createdByName && <span>👤 {d.createdByName}</span>}
        </div>

        {/* Actions */}
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {(d?.status === 'borrador') && (
            <button
              className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 cursor-pointer hover:bg-amber-500/20 transition-colors"
              onClick={() => onEdit(co)}
            >
              ✏️ Editar
            </button>
          )}
          <button aria-label="Editar" className="hidden md:block px-1.5 py-1.5 rounded bg-[var(--af-bg4)] text-xs cursor-pointer" onClick={() => onEdit(co)}>
            <Pencil size={12} aria-hidden="true"/>
          </button>
          <button aria-label="Eliminar" className="hidden md:block px-1.5 py-1.5 rounded bg-red-500/10 text-xs cursor-pointer" onClick={async () => {
            const ok = await confirmDialog.confirm({ title: 'Eliminar orden', description: '¿Estás seguro de eliminar esta orden de cambio?' });
            if (!ok) return;
            onDelete(co);
          }}>
            <Trash2 size={12} aria-hidden="true"/>
          </button>
          <div className="md:hidden">
            <OverflowMenu
              actions={[
                { label: 'Editar', icon: <Pencil size={14} aria-hidden="true"/>, onClick: () => onEdit(co) },
                { label: 'Eliminar', icon: <Trash2 size={14} aria-hidden="true"/>, variant: 'danger' as const, separator: true, onClick: async () => {
                  const ok = await confirmDialog.confirm({ title: 'Eliminar orden', description: '¿Estás seguro de eliminar esta orden de cambio?' });
                  if (!ok) return;
                  onDelete(co);
                }},
              ]}
            />
          </div>
        </div>
      </div>
      <ConfirmDialog {...confirmDialog} />
    </>
  );
}
