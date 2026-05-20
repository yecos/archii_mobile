'use client';
import React from 'react';
import { INV_WAREHOUSES } from '@/lib/types';
import { Plus, Trash2 } from 'lucide-react';
import { OverflowMenu } from '@/components/ui/OverflowMenu';

interface InventoryMovementsProps {
  invMovements: any[];
  invMovFilterType: string;
  invWarehouseFilter: string;
  getInvProductName: (id: string) => string;
  deleteInvMovement: (id: string) => void;
  confirm: (opts: { title: string; description?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; }) => Promise<boolean>;
  setEditingId: (id: string | null) => void;
  setForms: (updater: any) => void;
  openModal: (modal: string) => void;
  setInvMovFilterType: (v: string) => void;
  setInvWarehouseFilter: (v: string) => void;
}

export default function InventoryMovements({
  invMovements, invMovFilterType, invWarehouseFilter, getInvProductName,
  deleteInvMovement, confirm,
  setEditingId, setForms, openModal, setInvMovFilterType, setInvWarehouseFilter,
}: InventoryMovementsProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">📋 Movimientos ({invMovements.length})</h3>
        <button className="px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer bg-emerald-600 text-white border-none hover:bg-emerald-700 transition-colors flex items-center gap-2 self-start" onClick={() => { setEditingId(null); setForms((p: any) => ({ ...p, invMovProduct: '', invMovType: 'Entrada', invMovWarehouse: 'Almacén Principal', invMovQty: '', invMovReason: '', invMovRef: '', invMovDate: '' })); openModal('invMovement'); }}><Plus size={16} className="stroke-current" aria-hidden="true"/>Registrar movimiento</button>
      </div>
      <div className="flex gap-2">
        <select className="flex-1 bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" value={invMovFilterType} onChange={e => setInvMovFilterType(e.target.value)}><option value="all">Todos</option><option value="Entrada">Entradas</option><option value="Salida">Salidas</option></select>
        <select className="flex-1 bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" value={invWarehouseFilter} onChange={e => setInvWarehouseFilter(e.target.value)}><option value="all">Todos los almacenes</option>{INV_WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}</select>
      </div>
      {invMovements.filter(m => {
        const mt = invMovFilterType === 'all' || m.data.type === invMovFilterType;
        const mw = invWarehouseFilter === 'all' || m.data.warehouse === invWarehouseFilter;
        return mt && mw;
      }).length === 0 ? (<div className="text-center py-12"><div className="text-4xl mb-2">📋</div><div className="text-[var(--muted-foreground)]">Sin movimientos</div></div>) : (
        <div className="space-y-2">
          {invMovements.filter(m => {
            const mt = invMovFilterType === 'all' || m.data.type === invMovFilterType;
            const mw = invWarehouseFilter === 'all' || m.data.warehouse === invWarehouseFilter;
            return mt && mw;
          }).map(m => (
            <div key={m.id} className={`bg-[var(--af-bg3)] rounded-xl p-3 sm:p-4 border ${m.data.type === 'Entrada' ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${m.data.type === 'Entrada' ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}><span className={`text-lg font-bold ${m.data.type === 'Entrada' ? 'text-emerald-400' : 'text-red-400'}`}>{m.data.type === 'Entrada' ? '↓' : '↑'}</span></div>
                  <div>
                    <div className="text-sm font-semibold">{getInvProductName(m.data.productId)}</div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">{m.data.warehouse || '—'} · {m.data.quantity} uds{m.data.reference ? ` · Ref: ${m.data.reference}` : ''}</div>
                    {m.data.reason && <div className="text-[11px] text-[var(--muted-foreground)]">{m.data.reason}</div>}
                  </div>
                </div>
                {/* Desktop: quantity + delete */}
                <div className="hidden md:flex items-center gap-2">
                  <div className="text-right"><div className={`text-sm font-bold ${m.data.type === 'Entrada' ? 'text-emerald-400' : 'text-red-400'}`}>{m.data.type === 'Entrada' ? '+' : '-'}{m.data.quantity}</div><div className="text-[10px] text-[var(--muted-foreground)]">{m.data.date || ''}</div></div>
                  <button aria-label="Eliminar" className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer" onClick={async () => { if (await confirm({ title: 'Eliminar movimiento', description: '¿Estás seguro?' })) deleteInvMovement(m.id); }}><Trash2 size={14} className="stroke-current" aria-hidden="true"/></button>
                </div>
                {/* Mobile: quantity + OverflowMenu */}
                <div className="md:hidden flex items-center gap-2">
                  <div className="text-right"><div className={`text-sm font-bold ${m.data.type === 'Entrada' ? 'text-emerald-400' : 'text-red-400'}`}>{m.data.type === 'Entrada' ? '+' : '-'}{m.data.quantity}</div><div className="text-[10px] text-[var(--muted-foreground)]">{m.data.date || ''}</div></div>
                  <OverflowMenu
                    actions={[
                      { label: 'Eliminar movimiento', icon: <Trash2 size={14} aria-hidden="true"/>, onClick: async () => { if (await confirm({ title: 'Eliminar movimiento', description: '¿Estás seguro?' })) deleteInvMovement(m.id); }, variant: 'danger' },
                    ]}
                    side="left"
                    align="end"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
