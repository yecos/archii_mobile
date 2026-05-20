'use client';
import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { FileText, FileSpreadsheet } from 'lucide-react';
import { exportBudgetPDF } from '@/lib/export-pdf';
import { exportExpensesExcel } from '@/lib/export-excel';
import { fmtCOP } from '@/lib/helpers';
import { COLORS, ChartTooltip, ChartLegend } from './ChartComponents';
import type { ReportsTabProps } from './types';

export default function ReportsFinanciero({ projects, expenses, invoices, timeEntries, dateLabel, showToast }: ReportsTabProps) {
  const categoryData = useMemo(() => {
    const catSpend: Record<string, number> = {};
    expenses.forEach(e => { const c = e.data.category || 'Otro'; catSpend[c] = (catSpend[c] || 0) + e.data.amount; });
    return Object.entries(catSpend).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [expenses]);

  const budgetVsRealData = useMemo(() => {
    return projects.filter(p => p.data.budget > 0).sort((a, b) => b.data.budget - a.data.budget).slice(0, 6).map(p => {
      const spent = expenses.filter(e => e.data.projectId === p.id).reduce((s, e) => s + e.data.amount, 0);
      const name = p.data.name.length > 12 ? p.data.name.slice(0, 12) + '...' : p.data.name;
      return { name, presupuesto: p.data.budget, gastado: spent };
    });
  }, [projects, expenses]);

  const totalBudget = projects.reduce((s, p) => s + (p.data.budget || 0), 0);
  const totalSpent = expenses.reduce((s, e) => s + (e.data.amount || 0), 0);
  const totalInvoiced = invoices.filter(i => i.data.status !== 'Cancelada').reduce((s, i) => s + (i.data.total || 0), 0);
  const totalPaid = invoices.filter(i => i.data.status === 'Pagada').reduce((s, i) => s + (i.data.total || 0), 0);
  const totalPending = invoices.filter(i => i.data.status === 'Enviada' || i.data.status === 'Borrador').reduce((s, i) => s + (i.data.total || 0), 0);
  const totalOverdue = invoices.filter(i => i.data.status === 'Vencida').reduce((s, i) => s + (i.data.total || 0), 0);
  const totalBillable = timeEntries.filter(e => e.data.billable).reduce((s, e) => s + (e.data.duration || 0) * (e.data.rate || 0) / 60, 0);
  const budgetPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  return (<>
    <div className="lg:col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-semibold">Resumen Financiero</h3>
        <span className="text-[11px] text-[var(--af-text3)]">{dateLabel}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[{ lbl: 'Presupuesto', val: fmtCOP(totalBudget), c: 'text-[var(--af-accent)]' }, { lbl: 'Gastado', val: fmtCOP(totalSpent), c: 'text-[var(--foreground)]' }, { lbl: 'Facturado', val: fmtCOP(totalInvoiced), c: 'text-blue-400' }, { lbl: 'Cobrado', val: fmtCOP(totalPaid), c: 'text-emerald-400' }, { lbl: 'Por cobrar', val: fmtCOP(totalPending + totalOverdue), c: totalOverdue > 0 ? 'text-red-400' : 'text-amber-400' }].map((m, i) => (
          <div key={i} className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className={`text-xl font-bold ${m.c}`}>{m.val}</div><div className="text-[11px] text-[var(--muted-foreground)]">{m.lbl}</div></div>
        ))}
      </div>
    </div>
    {/* Alerts */}
    {(totalOverdue > 0 || (totalBudget > 0 && totalSpent > totalBudget * 0.9)) && <div className="lg:col-span-2 space-y-2">
      {totalOverdue > 0 && <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 flex items-center gap-2"><span className="text-red-400 text-lg">⚠️</span><span className="text-sm text-red-400 font-medium">Facturas vencidas por {fmtCOP(totalOverdue)}</span></div>}
      {totalBudget > 0 && totalSpent > totalBudget * 0.9 && <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 flex items-center gap-2"><span className="text-amber-400 text-lg">⚠️</span><span className="text-sm text-amber-400 font-medium">Gasto al {Math.round(totalSpent / totalBudget * 100)}% del presupuesto</span></div>}
    </div>}
    {/* Budget vs Real */}
    <div className="lg:col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-semibold">Presupuesto vs Real por Proyecto</h3>
        <button className="text-xs text-[var(--af-accent)] cursor-pointer hover:underline" onClick={() => {
          try { exportBudgetPDF({ expenses, projects }); showToast('PDF descargado'); } catch { showToast('Error', 'error'); }
        }}><FileText size={12} className="inline mr-1" aria-hidden="true"/>PDF</button>
      </div>
      {budgetVsRealData.length === 0 ? <div className="text-sm text-[var(--muted-foreground)]">Sin proyectos con presupuesto</div> : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={budgetVsRealData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--af-bg4)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000000 ? `${(v/1000000).toFixed(0)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(200,169,110,0.06)' }} />
            <Legend content={<ChartLegend />} />
            <Bar dataKey="presupuesto" name="Presupuesto" fill="#c8a96e" radius={[4, 4, 0, 0]} barSize={18} />
            <Bar dataKey="gastado" name="Gastado" fill={budgetPct > 90 ? '#ef4444' : '#10b981'} radius={[4, 4, 0, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
    {/* Gastos por categoria */}
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-semibold">Gastos por Categoria</h3>
        <button className="text-xs text-[var(--af-accent)] cursor-pointer hover:underline" onClick={() => {
          try { exportExpensesExcel(expenses, projects); showToast('Excel descargado'); } catch { showToast('Error', 'error'); }
        }}><FileSpreadsheet size={12} className="inline mr-1" aria-hidden="true"/>Excel</button>
      </div>
      {categoryData.length === 0 ? <div className="text-sm text-[var(--muted-foreground)]">Sin gastos</div> : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={categoryData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
              {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend content={<ChartLegend />} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
    {/* Rentabilidad */}
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="text-[15px] font-semibold mb-4">Metricas de Rentabilidad</h3>
      <div className="grid grid-cols-2 gap-3">
        {(() => {
          const margin = totalInvoiced > 0 ? Math.round(((totalInvoiced - totalSpent) / totalInvoiced) * 100) : 0;
          const collectionRate = totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0;
          const avgProject = projects.length > 0 ? totalBudget / projects.length : 0;
          const timeRevenue = totalBillable;
          return [
            { lbl: 'Margen', val: `${margin}%`, c: margin > 20 ? 'text-emerald-400' : margin > 0 ? 'text-amber-400' : 'text-red-400' },
            { lbl: 'Tasa de cobro', val: `${collectionRate}%`, c: collectionRate > 80 ? 'text-emerald-400' : 'text-amber-400' },
            { lbl: 'Promedio proyecto', val: fmtCOP(avgProject), c: 'text-[var(--af-accent)]' },
            { lbl: 'Horas facturables', val: fmtCOP(timeRevenue), c: 'text-blue-400' },
          ].map((m, i) => (<div key={i} className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className={`text-lg font-bold ${m.c}`}>{m.val}</div><div className="text-[11px] text-[var(--muted-foreground)]">{m.lbl}</div></div>));
        })()}
      </div>
    </div>
  </>);
}
