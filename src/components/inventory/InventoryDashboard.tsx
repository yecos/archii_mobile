'use client';
import React from 'react';
import { fmtCOP } from '@/lib/helpers';
import { INV_WAREHOUSES } from '@/lib/types';

interface InventoryDashboardProps {
  invProducts: any[];
  invTotalValue: number;
  invTotalStock: number;
  invAlerts: any[];
  invMovements: any[];
  invCategories: any[];
  getWarehouseStock: (p: any, wh: string) => number;
  getTotalStock: (p: any) => number;
  getInvProductName: (id: string) => string;
}

export default function InventoryDashboard({
  invProducts, invTotalValue, invTotalStock, invAlerts, invMovements, invCategories,
  getWarehouseStock, getTotalStock, getInvProductName,
}: InventoryDashboardProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">📊 Panel de Inventario</h3>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
          <div className="text-2xl font-bold text-[var(--af-accent)]">{invProducts.length}</div>
          <div className="text-xs text-[var(--muted-foreground)] mt-1">Productos totales</div>
        </div>
        <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
          <div className="text-2xl font-bold text-blue-400">{fmtCOP(invTotalValue)}</div>
          <div className="text-xs text-[var(--muted-foreground)] mt-1">Valor total</div>
        </div>
        <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
          <div className="text-2xl font-bold text-emerald-400">{invTotalStock.toLocaleString('es-CO')}</div>
          <div className="text-xs text-[var(--muted-foreground)] mt-1">Unidades en stock</div>
        </div>
        <div className={`rounded-xl p-4 border ${invAlerts.length > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-[var(--af-bg3)] border-[var(--border)]'}`}>
          <div className={`text-2xl font-bold ${invAlerts.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{invAlerts.length}</div>
          <div className="text-xs text-[var(--muted-foreground)] mt-1">Alertas activas</div>
        </div>
      </div>
      {/* Alerts Section */}
      {invAlerts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-red-400">⚠️ Alertas activas</h4>
          {invAlerts.map((alert: any, i: any) => (
            <div key={i} className={`rounded-lg px-3 py-2.5 border flex items-center gap-2 ${alert.severity === 'critical' ? 'bg-red-500/15 border-red-500/30' : alert.severity === 'high' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${alert.severity === 'critical' ? 'bg-red-500/20 text-red-400' : alert.severity === 'high' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>{alert.severity === 'critical' ? 'CRÍTICO' : alert.severity === 'high' ? 'ALTO' : 'MEDIO'}</span>
              <span className="text-sm">{alert.msg}</span>
            </div>
          ))}
        </div>
      )}
      {/* Warehouse Overview */}
      <div>
        <h4 className="text-sm font-semibold mb-2">🏢 Stock por almacén</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {INV_WAREHOUSES.map(wh => {
            const whStock = invProducts.reduce((s, p) => s + getWarehouseStock(p, wh), 0);
            const whValue = invProducts.reduce((s, p) => s + getWarehouseStock(p, wh) * (Number(p.data.price) || 0), 0);
            const whProducts = invProducts.filter(p => getWarehouseStock(p, wh) > 0).length;
            return (
              <div key={wh} className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]">
                <div className="text-sm font-semibold">{wh}</div>
                <div className="text-xl font-bold text-[var(--af-accent)] mt-1">{whStock.toLocaleString('es-CO')}</div>
                <div className="text-[10px] text-[var(--muted-foreground)]">{whProducts} productos · {fmtCOP(whValue)}</div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Recent Movements */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Últimos movimientos</h4>
        {invMovements.length === 0 ? (
          <div className="text-center py-6 text-[var(--muted-foreground)] text-sm">Sin movimientos</div>
        ) : (
          <div className="space-y-1.5">
            {invMovements.slice(0, 6).map(m => (
              <div key={m.id} className="flex items-center justify-between bg-[var(--af-bg3)] rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`text-lg ${m.data.type === 'Entrada' ? 'text-emerald-400' : 'text-red-400'}`}>{m.data.type === 'Entrada' ? '↓' : '↑'}</span>
                  <div>
                    <div className="text-sm font-medium">{getInvProductName(m.data.productId)}</div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">{m.data.warehouse || '—'}{m.data.reason ? ` · ${m.data.reason}` : ''}</div>
                  </div>
                </div>
                <span className={`text-sm font-semibold ${m.data.type === 'Entrada' ? 'text-emerald-400' : 'text-red-400'}`}>{m.data.type === 'Entrada' ? '+' : '-'}{m.data.quantity}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Categories */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Por categoría</h4>
        {invCategories.length === 0 ? (
          <div className="text-center py-4 text-[var(--muted-foreground)] text-sm">Sin categorías</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {invCategories.map(c => {
              const cp = invProducts.filter(p => p.data.categoryId === c.id);
              const cv = cp.reduce((s, p) => s + (Number(p.data.price) || 0) * getTotalStock(p), 0);
              return (
                <div key={c.id} className="bg-[var(--af-bg3)] rounded-lg p-3 border border-[var(--border)]">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.data.color }} />
                    <span className="text-xs font-medium truncate">{c.data.name}</span>
                  </div>
                  <div className="text-lg font-bold">{cp.length}</div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">{fmtCOP(cv)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
