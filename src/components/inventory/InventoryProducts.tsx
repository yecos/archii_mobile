'use client';
import React from 'react';
import { fmtCOP } from '@/lib/helpers';
import { INV_WAREHOUSES } from '@/lib/types';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { OverflowMenu } from '@/components/ui/OverflowMenu';

interface InventoryProductsProps {
  invProducts: any[];
  invCategories: any[];
  invSearch: string;
  invFilterCat: string;
  getInvCategoryColor: (id: string) => string;
  getInvCategoryName: (id: string) => string;
  getTotalStock: (p: any) => number;
  getWarehouseStock: (p: any, wh: string) => number;
  deleteInvProduct: (id: string) => void;
  openEditInvProduct: (p: any) => void;
  confirm: (opts: { title: string; description?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; }) => Promise<boolean>;
  setEditingId: (id: string | null) => void;
  setForms: (updater: any) => void;
  setInvSearch: (v: string) => void;
  setInvFilterCat: (v: string) => void;
  openModal: (modal: string) => void;
}

export default function InventoryProducts({
  invProducts, invCategories, invSearch, invFilterCat,
  getInvCategoryColor, getInvCategoryName, getTotalStock, getWarehouseStock,
  deleteInvProduct, openEditInvProduct, confirm,
  setEditingId, setForms, setInvSearch, setInvFilterCat, openModal,
}: InventoryProductsProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">📦 Productos ({invProducts.length})</h3>
        <button className="px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer bg-[var(--af-accent)] text-background border-none hover:bg-[var(--af-accent2)] transition-colors flex items-center gap-2 self-start" onClick={() => { setEditingId(null); const rf: Record<string,any> = { invProdName: '', invProdSku: '', invProdCat: '', invProdUnit: 'Unidad', invProdPrice: '', invProdMinStock: '5', invProdDesc: '', invProdImage: '', invProdWarehouse: 'Almacén Principal' }; INV_WAREHOUSES.forEach(w => { rf[`invProdWS_${w.replace(/\s/g,'_')}`] = '0'; }); setForms((p: any) => ({ ...p, ...rf })); openModal('invProduct'); }}>
          <Plus size={16} className="stroke-current" aria-hidden="true"/>
          Nuevo producto
        </button>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true"/>
          <input className="w-full bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg pl-9 pr-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]" placeholder="Buscar producto..." value={invSearch} onChange={e => setInvSearch(e.target.value)} />
        </div>
        <select className="bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" value={invFilterCat} onChange={e => setInvFilterCat(e.target.value)}>
          <option value="all">Todas las categorías</option>
          {invCategories.map(c => <option key={c.id} value={c.id}>{c.data.name}</option>)}
        </select>
      </div>
      {invProducts.filter(p => {
        const ms = !invSearch || p.data.name.toLowerCase().includes(invSearch.toLowerCase()) || (p.data.sku || '').toLowerCase().includes(invSearch.toLowerCase());
        const mc = invFilterCat === 'all' || p.data.categoryId === invFilterCat;
        return ms && mc;
      }).length === 0 ? (
        <div className="text-center py-12"><div className="text-4xl mb-2">📦</div><div className="text-[var(--muted-foreground)]">No hay productos</div></div>
      ) : (
        <div className="space-y-2">
          {invProducts.filter(p => {
            const ms = !invSearch || p.data.name.toLowerCase().includes(invSearch.toLowerCase()) || (p.data.sku || '').toLowerCase().includes(invSearch.toLowerCase());
            const mc = invFilterCat === 'all' || p.data.categoryId === invFilterCat;
            return ms && mc;
          }).map(p => {
            const totalSt = getTotalStock(p);
            const isLow = totalSt <= (Number(p.data.minStock) || 0);
            const isOut = totalSt === 0;
            return (
              <div key={p.id} className={`bg-[var(--af-bg3)] rounded-xl p-3 sm:p-4 border ${isOut ? 'border-red-500/40' : isLow ? 'border-amber-500/30' : 'border-[var(--border)]'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    {p.data.imageData ? <img src={p.data.imageData} alt={p.data.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 mt-0.5" /> : <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: (getInvCategoryColor(p.data.categoryId) || '#6b7280') + '20' }}><div className="w-4 h-4 rounded-sm" style={{ backgroundColor: getInvCategoryColor(p.data.categoryId) }} /></div>}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold truncate">{p.data.name}</span>
                        {p.data.sku && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--card)] text-[var(--muted-foreground)]">{p.data.sku}</span>}
                        {isOut && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">AGOTADO</span>}
                        {isLow && !isOut && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">⚠ Bajo</span>}
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{getInvCategoryName(p.data.categoryId)} · {p.data.unit}</div>
                    </div>
                  </div>
                  {/* Desktop: edit/delete buttons */}
                  <div className="hidden md:flex items-center gap-2 flex-shrink-0">
                    <button aria-label="Editar" className="w-8 h-8 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer" onClick={() => openEditInvProduct(p)}><Pencil size={14} className="stroke-current" aria-hidden="true"/></button>
                    <button aria-label="Eliminar" className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer" onClick={async () => { if (await confirm({ title: 'Eliminar producto', description: '¿Estás seguro? El producto será eliminado permanentemente.' })) deleteInvProduct(p.id); }}><Trash2 size={14} className="stroke-current" aria-hidden="true"/></button>
                  </div>
                  {/* Mobile: OverflowMenu */}
                  <div className="md:hidden flex-shrink-0">
                    <OverflowMenu
                      actions={[
                        { label: 'Editar producto', icon: <Pencil size={14} aria-hidden="true"/>, onClick: () => openEditInvProduct(p) },
                        { label: 'Eliminar producto', icon: <Trash2 size={14} aria-hidden="true"/>, onClick: async () => { if (await confirm({ title: 'Eliminar producto', description: '¿Estás seguro? El producto será eliminado permanentemente.' })) deleteInvProduct(p.id); }, variant: 'danger', separator: true },
                      ]}
                      side="left"
                      align="end"
                    />
                  </div>
                </div>
                {/* Per-warehouse stock breakdown */}
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {INV_WAREHOUSES.map(wh => {
                      const ws = getWarehouseStock(p, wh);
                      return (
                        <div key={wh} className="text-center">
                          <div className="text-[10px] text-[var(--muted-foreground)] truncate">{wh}</div>
                          <div className={`text-sm font-bold ${ws === 0 ? 'text-red-400' : ws <= (Number(p.data.minStock) || 0) ? 'text-amber-400' : 'text-[var(--foreground)]'}`}>{ws}</div>
                        </div>
                      );
                    })}
                    <div className="text-center">
                      <div className="text-[10px] text-[var(--muted-foreground)]">Total</div>
                      <div className="text-sm font-bold text-[var(--af-accent)]">{totalSt}</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div><div className="text-[10px] text-[var(--muted-foreground)]">Precio unit.</div><div className="text-sm font-medium">{fmtCOP(Number(p.data.price) || 0)}</div></div>
                  <div><div className="text-[10px] text-[var(--muted-foreground)]">Valor total</div><div className="text-sm font-medium">{fmtCOP((Number(p.data.price) || 0) * totalSt)}</div></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
