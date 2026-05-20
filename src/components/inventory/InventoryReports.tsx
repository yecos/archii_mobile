'use client';
import React from 'react';
import { fmtCOP } from '@/lib/helpers';
import { INV_WAREHOUSES } from '@/lib/types';
import { exportInventoryExcel } from '@/lib/export-excel';

interface InventoryReportsProps {
  invProducts: any[];
  invCategories: any[];
  invMovements: any[];
  invTransfers: any[];
  invTotalValue: number;
  invTotalStock: number;
  getInvCategoryName: (id: string) => string;
  getInvCategoryColor: (id: string) => string;
  getInvProductName: (id: string) => string;
  getTotalStock: (p: any) => number;
  getWarehouseStock: (p: any, wh: string) => number;
  showToast: (msg: string, type?: string) => void;
}

export default function InventoryReports({
  invProducts, invCategories, invMovements, invTransfers,
  invTotalValue, invTotalStock,
  getInvCategoryName, getInvCategoryColor, getInvProductName, getTotalStock, getWarehouseStock,
  showToast,
}: InventoryReportsProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">📊 Reportes</h3>
        <div className="flex gap-2 flex-wrap">
          <button className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all bg-[var(--af-accent)] text-background border-none hover:bg-[var(--af-accent2)]" onClick={() => {
            try { exportInventoryExcel(invProducts, invCategories, invMovements); showToast('Excel de inventario exportado'); } catch { showToast('Error al generar Excel', 'error'); }
          }}>📥 Exportar Excel</button>
          <button className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all bg-[var(--af-bg3)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--af-bg4)]" onClick={() => {
            // Export products CSV
            const headers = ['Nombre', 'SKU', 'Categoría', 'Unidad', 'Precio', 'Stock Total', 'Mín Stock', 'Valor Total'];
            const rows = invProducts.map(p => [p.data.name, p.data.sku || '', getInvCategoryName(p.data.categoryId), p.data.unit, Number(p.data.price) || 0, getTotalStock(p), Number(p.data.minStock) || 0, (Number(p.data.price) || 0) * getTotalStock(p)]);
            const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `inventario_productos_${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
            showToast('CSV de productos exportado');
          }}>📥 Exportar productos CSV</button>
          <button className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all bg-blue-600 text-white border-none hover:bg-blue-700" onClick={() => {
            // Export movements CSV
            const headers = ['Fecha', 'Tipo', 'Producto', 'Almacén', 'Cantidad', 'Motivo', 'Referencia'];
            const rows = invMovements.map(m => [m.data.date || '', m.data.type, getInvProductName(m.data.productId), m.data.warehouse || '', m.data.quantity, m.data.reason || '', m.data.reference || '']);
            const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `movimientos_${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
            showToast('CSV de movimientos exportado');
          }}>📥 Exportar movimientos CSV</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
          <div className="text-xs text-[var(--muted-foreground)]">Valor total inventario</div>
          <div className="text-xl font-bold text-[var(--af-accent)] mt-1">{fmtCOP(invTotalValue)}</div>
        </div>
        <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
          <div className="text-xs text-[var(--muted-foreground)]">Productos con stock</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">{invProducts.filter(p => getTotalStock(p) > 0).length}</div>
        </div>
        <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
          <div className="text-xs text-[var(--muted-foreground)]">Agotados</div>
          <div className="text-xl font-bold text-red-400 mt-1">{invProducts.filter(p => getTotalStock(p) === 0).length}</div>
        </div>
        <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
          <div className="text-xs text-[var(--muted-foreground)]">Total movimientos</div>
          <div className="text-xl font-bold text-blue-400 mt-1">{invMovements.length}</div>
        </div>
      </div>

      {/* Stock by Category - horizontal bar chart */}
      <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
        <h4 className="text-sm font-semibold mb-3">📦 Stock por categoría</h4>
        {invCategories.length === 0 ? (<div className="text-center py-6 text-sm text-[var(--muted-foreground)]">Sin categorías</div>) : (
          <div className="space-y-2.5">
            {invCategories.map(c => {
              const catProducts = invProducts.filter(p => p.data.categoryId === c.id);
              const catStock = catProducts.reduce((s, p) => s + getTotalStock(p), 0);
              const catValue = catProducts.reduce((s, p) => s + (Number(p.data.price) || 0) * getTotalStock(p), 0);
              const maxStock = Math.max(...invCategories.map(cc => invProducts.filter(pp => pp.data.categoryId === cc.id).reduce((s, p) => s + getTotalStock(p), 0)), 1);
              const pct = (catStock / maxStock) * 100;
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.data.color }} />
                      <span className="text-sm font-medium">{c.data.name}</span>
                      <span className="text-[10px] text-[var(--muted-foreground)]">{catProducts.length} prod.</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold">{catStock.toLocaleString('es-CO')} uds</span>
                      <span className="text-[10px] text-[var(--muted-foreground)] ml-2">{fmtCOP(catValue)}</span>
                    </div>
                  </div>
                  <div className="w-full h-3 bg-[var(--border)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: c.data.color }} />
                  </div>
                </div>
              );
            })}
            {invProducts.filter(p => !p.data.categoryId).length > 0 && (() => {
              const uncat = invProducts.filter(p => !p.data.categoryId);
              const stock = uncat.reduce((s, p) => s + getTotalStock(p), 0);
              return (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gray-400" />
                      <span className="text-sm font-medium">Sin categoría</span>
                      <span className="text-[10px] text-[var(--muted-foreground)]">{uncat.length} prod.</span>
                    </div>
                    <span className="text-sm font-bold">{stock.toLocaleString('es-CO')} uds</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Stock by Warehouse */}
      <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
        <h4 className="text-sm font-semibold mb-3">🏢 Stock por almacén</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {INV_WAREHOUSES.map(wh => {
            const whStock = invProducts.reduce((s, p) => s + getWarehouseStock(p, wh), 0);
            const whValue = invProducts.reduce((s, p) => s + getWarehouseStock(p, wh) * (Number(p.data.price) || 0), 0);
            const maxWh = Math.max(...INV_WAREHOUSES.map(w => invProducts.reduce((s, p) => s + getWarehouseStock(p, w), 0)), 1);
            return (
              <div key={wh} className="bg-[var(--card)] rounded-lg p-3 border border-[var(--border)]">
                <div className="text-xs font-medium mb-1">{wh}</div>
                <div className="text-lg font-bold text-[var(--af-accent)]">{whStock.toLocaleString('es-CO')}</div>
                <div className="text-[10px] text-[var(--muted-foreground)] mb-2">{fmtCOP(whValue)}</div>
                <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--af-accent)]" style={{ width: `${(whStock / maxWh) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top products by value */}
      <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
        <h4 className="text-sm font-semibold mb-3">💎 Top 10 productos por valor</h4>
        {invProducts.length === 0 ? (<div className="text-center py-6 text-sm text-[var(--muted-foreground)]">Sin productos</div>) : (
          <div className="space-y-2">
            {[...invProducts].sort((a, b) => ((Number(b.data.price) || 0) * getTotalStock(b)) - ((Number(a.data.price) || 0) * getTotalStock(a))).slice(0, 10).map((p, i) => {
              const val = (Number(p.data.price) || 0) * getTotalStock(p);
              const maxVal = Math.max((Number(invProducts[0]?.data.price) || 0) * getTotalStock(invProducts[0]), 1);
              return (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-[var(--muted-foreground)] w-5 text-right">{i + 1}</span>
                  {p.data.imageData ? <img src={p.data.imageData} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" /> : <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: (getInvCategoryColor(p.data.categoryId) || '#6b7280') + '20' }}><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getInvCategoryColor(p.data.categoryId) }} /></div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.data.name}</div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">{getTotalStock(p)} {p.data.unit} × {fmtCOP(Number(p.data.price) || 0)}</div>
                  </div>
                  <span className="text-sm font-bold text-[var(--af-accent)] whitespace-nowrap">{fmtCOP(val)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Movements summary */}
      <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
        <h4 className="text-sm font-semibold mb-3">📈 Resumen de movimientos</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="text-center">
            <div className="text-lg font-bold text-emerald-400">{invMovements.filter(m => m.data.type === 'Entrada').length}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">Entradas</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-400">{invMovements.filter(m => m.data.type === 'Salida').length}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">Salidas</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-400">{invTransfers.length}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">Transferencias</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-[var(--foreground)]">{invTotalStock.toLocaleString('es-CO')}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">Stock actual</div>
          </div>
        </div>
        {/* Movement by warehouse bars */}
        <div className="space-y-2">
          {INV_WAREHOUSES.map(wh => {
            const entries = invMovements.filter(m => m.data.warehouse === wh && m.data.type === 'Entrada').reduce((s, m) => s + m.data.quantity, 0);
            const exits = invMovements.filter(m => m.data.warehouse === wh && m.data.type === 'Salida').reduce((s, m) => s + m.data.quantity, 0);
            return (
              <div key={wh} className="flex items-center gap-2">
                <span className="text-xs text-[var(--muted-foreground)] w-36 truncate">{wh}</span>
                <div className="flex-1 flex items-center gap-1">
                  <div className="flex-1 h-5 bg-[var(--border)] rounded-l-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500/70 flex items-center justify-center" style={{ width: entries + exits > 0 ? `${(entries / (entries + exits)) * 100}%` : '50%' }}>
                      {entries > 0 && <span className="text-[9px] text-white font-medium px-1">+{entries}</span>}
                    </div>
                    <div className="h-full bg-red-500/70 flex items-center justify-center" style={{ width: entries + exits > 0 ? `${(exits / (entries + exits)) * 100}%` : '50%' }}>
                      {exits > 0 && <span className="text-[9px] text-white font-medium px-1">-{exits}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Products table (detailed) */}
      <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
        <h4 className="text-sm font-semibold mb-3">📋 Tabla detallada de productos</h4>
        {/* Mobile card view */}
        <div className="md:hidden space-y-3">
          {invProducts.map(p => {
            const ts = getTotalStock(p);
            const isOut = ts === 0;
            const isLow = ts > 0 && ts <= (Number(p.data.minStock) || 0);
            return (
              <div key={p.id} className="bg-[var(--card)] rounded-lg p-3 border border-[var(--border)]">
                <div className="flex items-start gap-3">
                  {p.data.imageData ? <img src={p.data.imageData} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" /> : <div className="w-10 h-10 rounded-lg bg-[var(--af-bg4)] flex items-center justify-center flex-shrink-0">📦</div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{p.data.name}</div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">{getInvCategoryName(p.data.categoryId)}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-sm font-bold ${isOut ? 'text-red-400' : isLow ? 'text-amber-400' : ''}`}>{ts}</div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">uds</div>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-[var(--border)]">
                  <span className="text-xs text-[var(--muted-foreground)]">Precio: {fmtCOP(Number(p.data.price) || 0)}</span>
                  <span className="text-xs font-medium text-[var(--af-accent)]">Valor: {fmtCOP((Number(p.data.price) || 0) * ts)}</span>
                </div>
              </div>
            );
          })}
        </div>
        {/* Desktop table view */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-2 px-2 text-[var(--muted-foreground)] font-medium">Producto</th>
                <th className="text-left py-2 px-2 text-[var(--muted-foreground)] font-medium">Categoría</th>
                <th className="text-right py-2 px-2 text-[var(--muted-foreground)] font-medium">Precio</th>
                {INV_WAREHOUSES.map(wh => <th key={wh} className="text-right py-2 px-2 text-[var(--muted-foreground)] font-medium whitespace-nowrap">{wh.split(' ')[0]}</th>)}
                <th className="text-right py-2 px-2 text-[var(--muted-foreground)] font-medium">Total</th>
                <th className="text-right py-2 px-2 text-[var(--muted-foreground)] font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {invProducts.map(p => {
                const ts = getTotalStock(p);
                return (
                  <tr key={p.id} className="border-b border-[var(--border)]/50">
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        {p.data.imageData ? <img src={p.data.imageData} alt="" className="w-6 h-6 rounded object-cover" /> : null}
                        <div>
                          <div className="font-medium">{p.data.name}</div>
                          {p.data.sku && <div className="text-[10px] text-[var(--muted-foreground)]">{p.data.sku}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2"><div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: getInvCategoryColor(p.data.categoryId) }} /><span>{getInvCategoryName(p.data.categoryId)}</span></div></td>
                    <td className="py-2 px-2 text-right">{fmtCOP(Number(p.data.price) || 0)}</td>
                    {INV_WAREHOUSES.map(wh => { const ws = getWarehouseStock(p, wh); return <td key={wh} className={`py-2 px-2 text-right ${ws === 0 ? 'text-red-400' : ''}`}>{ws}</td>; })}
                    <td className="py-2 px-2 text-right font-bold">{ts}</td>
                    <td className="py-2 px-2 text-right font-medium text-[var(--af-accent)]">{fmtCOP((Number(p.data.price) || 0) * ts)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--border)] font-bold">
                <td className="py-2 px-2" colSpan={2}>{invProducts.length} productos</td>
                <td className="py-2 px-2"></td>
                {INV_WAREHOUSES.map(wh => <td key={wh} className="py-2 px-2 text-right">{invProducts.reduce((s, p) => s + getWarehouseStock(p, wh), 0).toLocaleString('es-CO')}</td>)}
                <td className="py-2 px-2 text-right">{invTotalStock.toLocaleString('es-CO')}</td>
                <td className="py-2 px-2 text-right text-[var(--af-accent)]">{fmtCOP(invTotalValue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
