'use client';
import React from 'react';
import { fmtCOP } from '@/lib/helpers';
import { INV_WAREHOUSES } from '@/lib/types';

interface InventoryWarehouseProps {
  invProducts: any[];
  invWarehouseFilter: string;
  getWarehouseStock: (p: any, wh: string) => number;
  getInvCategoryColor: (id: string) => string;
  setInvWarehouseFilter: (v: string) => void;
  setEditingId: (id: string | null) => void;
  setForms: (updater: any) => void;
  openModal: (modal: string) => void;
}

export default function InventoryWarehouse({
  invProducts, invWarehouseFilter, getWarehouseStock, getInvCategoryColor,
  setInvWarehouseFilter, setEditingId, setForms, openModal,
}: InventoryWarehouseProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">🏢 Almacenes</h3>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all bg-emerald-600 text-white border-none hover:bg-emerald-700" onClick={() => { setEditingId(null); setForms((p: any) => ({ ...p, invMovProduct: '', invMovType: 'Entrada', invMovWarehouse: 'Almacén Principal', invMovQty: '', invMovReason: '', invMovRef: '', invMovDate: '' })); openModal('invMovement'); }}>+ Entrada</button>
          <button className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all bg-red-500 text-white border-none hover:bg-red-600" onClick={() => { setEditingId(null); setForms((p: any) => ({ ...p, invMovProduct: '', invMovType: 'Salida', invMovWarehouse: 'Almacén Principal', invMovQty: '', invMovReason: '', invMovRef: '', invMovDate: '' })); openModal('invMovement'); }}>- Salida</button>
          <button className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all bg-blue-600 text-white border-none hover:bg-blue-700" onClick={() => { setEditingId(null); setForms((p: any) => ({ ...p, invTrProduct: '', invTrFrom: '', invTrTo: '', invTrQty: '', invTrDate: '', invTrNotes: '' })); openModal('invTransfer'); }}>🔄 Transferir</button>
        </div>
      </div>
      {/* Warehouse filter */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        <button className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-all ${invWarehouseFilter === 'all' ? 'bg-[var(--af-accent)] text-background' : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)]'}`} onClick={() => setInvWarehouseFilter('all')}>Todos</button>
        {INV_WAREHOUSES.map(wh => <button key={wh} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-all ${invWarehouseFilter === wh ? 'bg-[var(--af-accent)] text-background' : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)]'}`} onClick={() => setInvWarehouseFilter(wh)}>{wh}</button>)}
      </div>
      {/* Warehouse cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {INV_WAREHOUSES.map(wh => {
          if (invWarehouseFilter !== 'all' && invWarehouseFilter !== wh) return null;
          const ws = invProducts.reduce((s, p) => s + getWarehouseStock(p, wh), 0);
          const wv = invProducts.reduce((s, p) => s + getWarehouseStock(p, wh) * (Number(p.data.price) || 0), 0);
          const wp = invProducts.filter(p => getWarehouseStock(p, wh) > 0).length;
          return (
            <div key={wh} className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
              <div className="text-sm font-semibold">{wh}</div>
              <div className="text-2xl font-bold text-[var(--af-accent)] mt-1">{ws.toLocaleString('es-CO')}</div>
              <div className="text-xs text-[var(--muted-foreground)]">{wp} productos · {fmtCOP(wv)}</div>
            </div>
          );
        })}
      </div>
      {/* Product stock by warehouse */}
      {(invWarehouseFilter === 'all' ? INV_WAREHOUSES : [invWarehouseFilter]).map(wh => (
        <div key={wh}>
          <h4 className="text-sm font-semibold mb-2 mt-2">{wh}</h4>
          <div className="space-y-1.5">
            {invProducts.filter(p => getWarehouseStock(p, wh) > 0).sort((a, b) => getWarehouseStock(b, wh) - getWarehouseStock(a, wh)).map(p => {
              const maxS = Math.max(...invProducts.map(x => getWarehouseStock(x, wh)), 1);
              const pct = (getWarehouseStock(p, wh) / maxS) * 100;
              return (
                <div key={p.id} className="bg-[var(--af-bg3)] rounded-lg px-3 py-2.5 border border-[var(--border)]">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getInvCategoryColor(p.data.categoryId) }} />
                      <span className="text-sm">{p.data.name}</span>
                    </div>
                    <span className="text-sm font-bold">{getWarehouseStock(p, wh)} {p.data.unit}</span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--border)] rounded-full overflow-hidden"><div className="h-full rounded-full bg-[var(--af-accent)]" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
            {invProducts.filter(p => getWarehouseStock(p, wh) > 0).length === 0 && <div className="text-center py-4 text-sm text-[var(--muted-foreground)]">Sin stock en este almacén</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
