'use client';
import React, { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { fmtCOP } from '@/lib/helpers';
import { EXPENSE_CATS, Expense, Project } from '@/lib/types';
import { DollarSign, Download, Plus, TrendingDown, TrendingUp, Receipt, Trash2, FileText, Search, Filter, Edit3, AlertTriangle, Calendar, BarChart3 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { OverflowMenu } from '@/components/ui/OverflowMenu';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { exportBudgetPDF } from '@/lib/export-pdf';
import { exportExpensesExcel } from '@/lib/export-excel';

const CAT_COLORS: Record<string, string> = {
  'Materiales': '#c8a96e',
  'Mano de obra': '#3a7cc4',
  'Mobiliario': '#7b5bbf',
  'Acabados': '#10b981',
  'Imprevistos': '#ef4444',
  'Transporte': '#f59e0b',
  'Equipos': '#6366f1',
  'Servicios': '#ec4899',
  'Otro': '#9a9b9e',
};

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function ChartTooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ name?: string; dataKey?: string; value: number | string }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-lg text-[12px]">
      <div className="font-semibold">{payload[0].name || payload[0].dataKey}</div>
      <div className="text-[var(--af-accent)]">{fmtCOP(Number(payload[0].value))}</div>
    </div>
  );
}

export default function BudgetScreen() {
  const {
    deleteExpense, expenses, openEditExpense, openModal, projects, setForms, showToast, setEditingId,
  } = useApp();

  const confirmDialog = useConfirmDialog();

  // --- Filters state ---
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // --- Filtered expenses ---
  const filtered = useMemo(() => {
    return expenses.filter((e: Expense) => {
      if (search && !e.data.concept?.toLowerCase().includes(search.toLowerCase()) && !e.data.vendor?.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterProject && e.data.projectId !== filterProject) return false;
      if (filterCategory && e.data.category !== filterCategory) return false;
      if (filterDateFrom && e.data.date && e.data.date < filterDateFrom) return false;
      if (filterDateTo && e.data.date && e.data.date > filterDateTo) return false;
      return true;
    });
  }, [expenses, search, filterProject, filterCategory, filterDateFrom, filterDateTo]);

  const totalExpenses = useMemo(() => filtered.reduce((s: number, e: Expense) => s + (Number(e.data.amount) || 0), 0), [filtered]);

  // --- Category aggregation ---
  const byCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    filtered.forEach((e: Expense) => {
      const cat = e.data.category || 'Otro';
      cats[cat] = (cats[cat] || 0) + (Number(e.data.amount) || 0);
    });
    return Object.entries(cats)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value, color: CAT_COLORS[name] || '#9a9b9e' }));
  }, [filtered]);

  // --- Monthly trend (last 6 months from ALL expenses, not just filtered) ---
  const monthlyTrend = useMemo(() => {
    const data: { name: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthTotal = expenses
        .filter((e: Expense) => e.data.date && e.data.date.startsWith(key))
        .reduce((s: number, e: Expense) => s + (Number(e.data.amount) || 0), 0);
      data.push({ name: MONTHS[d.getMonth()], total: monthTotal });
    }
    return data;
  }, [expenses]);

  // --- Project budget cards ---
  const projectBudgetData = useMemo(() => {
    return projects
      .map((p: Project) => {
        const budget = p.data.budget || 0;
        const spent = expenses
          .filter((e: Expense) => e.data.projectId === p.id)
          .reduce((s: number, e: Expense) => s + (Number(e.data.amount) || 0), 0);
        return { id: p.id, name: p.data.name, budget, spent, pct: budget > 0 ? Math.round((spent / budget) * 100) : 0 };
      })
      .filter(p => p.budget > 0 || p.spent > 0)
      .sort((a, b) => b.spent - a.spent);
  }, [projects, expenses]);

  const projectsOverBudget = projectBudgetData.filter(p => p.pct > 100).length;
  const projectsNearLimit = projectBudgetData.filter(p => p.pct >= 80 && p.pct <= 100).length;

  // --- Expenses grouped by project ---
  const byProject = useMemo(() => {
    const map: Record<string, Expense[]> = {};
    filtered.forEach((e: Expense) => {
      const k = e.data.projectId || '_none';
      if (!map[k]) map[k] = [];
      map[k].push(e);
    });
    // Sort each group by date desc
    Object.values(map).forEach(arr => arr.sort((a: Expense, b: Expense) => (b.data.date || '').localeCompare(a.data.date || '')));
    return map;
  }, [filtered]);

  const avgExpense = filtered.length > 0 ? totalExpenses / filtered.length : 0;
  const topCategory = byCategory.length > 0 ? byCategory[0] : null;

  // --- Month-over-month change ---
  const momChange = useMemo(() => {
    if (monthlyTrend.length < 2) return null;
    const last = monthlyTrend[monthlyTrend.length - 1].total;
    const prev = monthlyTrend[monthlyTrend.length - 2].total;
    if (prev === 0 && last === 0) return null;
    return prev === 0 ? 100 : Math.round(((last - prev) / prev) * 100);
  }, [monthlyTrend]);

  const clearFilters = () => {
    setSearch('');
    setFilterProject('');
    setFilterCategory('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const hasActiveFilters = search || filterProject || filterCategory || filterDateFrom || filterDateTo;

  const exportCSV = () => {
    const q = '"';
    const dq = '""';
    const headers = ['Concepto', 'Proyecto', 'Categoría', 'Monto', 'Fecha', 'Método de pago', 'Proveedor'];
    const esc = (v: string | number) => q + String(v).split(q).join(dq) + q;
    const rows = filtered.map((e: Expense) => [
      e.data.concept,
      projects.find((p: Project) => p.id === e.data.projectId)?.data?.name || '—',
      e.data.category,
      e.data.amount,
      e.data.date,
      e.data.paymentMethod || '',
      e.data.vendor || '',
    ]);
    const csv = [headers, ...rows].map((r: (string | number)[]) => r.map(esc).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'presupuesto_' + new Date().toISOString().split('T')[0] + '.csv'; a.click(); URL.revokeObjectURL(url);
    showToast('Presupuesto exportado a CSV');
  };

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Presupuesto
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{expenses.length} gastos registrados{filtered.length !== expenses.length ? ` · ${filtered.length} filtrados` : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            className="flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-colors"
            onClick={() => { try { exportBudgetPDF({ expenses: filtered, projects }); showToast('Presupuesto PDF descargado'); } catch { showToast('Error al generar PDF', 'error'); } }}
          >
            <FileText size={14} aria-hidden="true"/> PDF
          </button>
          <button
            className="flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-colors"
            onClick={() => { try { exportExpensesExcel(filtered, projects); showToast('Presupuesto Excel descargado'); } catch { showToast('Error al generar Excel', 'error'); } }}
          >
            <Download size={14} aria-hidden="true"/> Excel
          </button>
          <button
            className="flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-colors"
            onClick={exportCSV}
          >
            <Download size={14} aria-hidden="true"/> CSV
          </button>
          <button
            className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors"
            onClick={() => { setEditingId(null); setForms((p: Record<string, any>) => ({ ...p, expConcept: '', expProject: '', expAmount: '', expDate: new Date().toISOString().split('T')[0], expCategory: 'Materiales', expPaymentMethod: 'Efectivo', expVendor: '', expNotes: '' })); openModal('expense'); }}
          >
            <Plus size={15} aria-hidden="true"/> Registrar gasto
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true"/>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por concepto o proveedor..."
              className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] transition-colors"
            />
          </div>
          <button
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium cursor-pointer border transition-colors ${showFilters || hasActiveFilters ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30' : 'bg-[var(--card)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--af-bg3)]'}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={14} aria-hidden="true"/>
            Filtros
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-[var(--af-accent)]" />}
          </button>
        </div>

        {showFilters && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 animate-fadeIn">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">Proyecto</label>
                <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer">
                  <option value="">Todos los proyectos</option>
                  {projects.map((p: Project) => <option key={p.id} value={p.id}>{p.data?.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">Categoría</label>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer">
                  <option value="">Todas las categorías</option>
                  {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">Desde</label>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">Hasta</label>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer" />
              </div>
            </div>
            {hasActiveFilters && (
              <button className="mt-3 text-[11px] text-[var(--af-accent)] cursor-pointer hover:underline" onClick={clearFilters}>Limpiar filtros</button>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-[11px] text-[var(--muted-foreground)] mb-1">Total gastado</div>
          <div className="text-lg font-bold text-[var(--af-accent)]">{fmtCOP(totalExpenses)}</div>
          <div className="text-[10px] text-[var(--muted-foreground)]">{filtered.length} registros</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-[11px] text-[var(--muted-foreground)] mb-1">Promedio por gasto</div>
          <div className="text-lg font-bold">{fmtCOP(avgExpense)}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-[11px] text-[var(--muted-foreground)] mb-1">Mayor categoría</div>
          <div className="text-lg font-bold">{topCategory ? topCategory.name : '—'}</div>
          <div className="text-[10px] text-[var(--muted-foreground)]">{topCategory ? fmtCOP(topCategory.value) : ''}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">Mes anterior</div>
          <div className="text-lg font-bold flex items-center gap-1">
            {momChange !== null ? (
              <>
                {momChange >= 0 ? <TrendingUp size={14} className="text-red-400" aria-hidden="true"/> : <TrendingDown size={14} className="text-emerald-400" aria-hidden="true"/>}
                <span className={momChange >= 0 ? 'text-red-400' : 'text-emerald-400'}>{Math.abs(momChange)}%</span>
              </>
            ) : '—'}
          </div>
          <div className="text-[10px] text-[var(--muted-foreground)]">{momChange !== null ? 'vs mes anterior' : ''}</div>
        </div>
        <div className={`bg-[var(--card)] border rounded-xl p-4 ${projectsOverBudget > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-[var(--border)]'}`}>
          <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
            {projectsOverBudget > 0 && <AlertTriangle size={10} className="text-red-400" aria-hidden="true"/>}
            Sobrepasados
          </div>
          <div className={`text-lg font-bold ${projectsOverBudget > 0 ? 'text-red-400' : ''}`}>{projectsOverBudget}</div>
          <div className="text-[10px] text-[var(--muted-foreground)]">{projectBudgetData.length} proyectos con presupuesto</div>
        </div>
        <div className={`bg-[var(--card)] border rounded-xl p-4 ${projectsNearLimit > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-[var(--border)]'}`}>
          <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
            <AlertTriangle size={10} className="text-amber-400" aria-hidden="true"/>
            Cerca del límite
          </div>
          <div className={`text-lg font-bold ${projectsNearLimit > 0 ? 'text-amber-400' : ''}`}>{projectsNearLimit}</div>
          <div className="text-[10px] text-[var(--muted-foreground)]">80-100% del presupuesto</div>
        </div>
      </div>

      {/* Charts Row: Pie + Monthly Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie chart */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
          <div className="text-[15px] font-semibold mb-3">Distribución por Categoría</div>
          {byCategory.length === 0 ? (
            <div className="text-center py-10 text-[var(--af-text3)] text-sm">Sin datos</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={byCategory} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2} dataKey="value" stroke="none">
                    {byCategory.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
                {byCategory.map((d: any, i: number) => (
                  <div key={i} className="flex items-center gap-1 text-[10px]">
                    <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                    <span className="text-[var(--muted-foreground)]">{d.name}</span>
                    <span className="font-semibold">{Math.round((d.value / totalExpenses) * 100)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Monthly Trend */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[15px] font-semibold flex items-center gap-2">
              <BarChart3 size={16} className="text-[var(--af-accent)]" aria-hidden="true"/>
              Tendencia Mensual
            </div>
            <span className="text-[10px] text-[var(--muted-foreground)] px-2 py-0.5 rounded-full bg-[var(--af-bg4)]">6 meses</span>
          </div>
          {monthlyTrend.every(d => d.total === 0) ? (
            <div className="text-center py-10 text-[var(--af-text3)] text-sm">Sin datos en los últimos 6 meses</div>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={monthlyTrend} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--af-bg4)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v)} />
                <Tooltip content={<ChartTooltipContent />} cursor={{ fill: 'rgba(200,169,110,0.06)' }} />
                <Bar dataKey="total" name="Gasto" fill="#c8a96e" radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Project Budget Cards */}
      {projectBudgetData.length > 0 && (
        <div>
          <div className="text-[15px] font-semibold mb-3 flex items-center gap-2">
            <Receipt size={16} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Presupuesto por Proyecto
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projectBudgetData.map((p) => (
              <div key={p.id} className={`bg-[var(--card)] border rounded-xl p-4 transition-all ${p.pct > 100 ? 'border-red-500/30 bg-red-500/5' : p.pct >= 80 ? 'border-amber-500/30 bg-amber-500/5' : 'border-[var(--border)]'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-semibold truncate flex-1 mr-2">{p.name}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${p.pct > 100 ? 'bg-red-500/15 text-red-400' : p.pct >= 80 ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                    {p.pct}%
                  </span>
                </div>
                <div className="h-2 bg-[var(--af-bg4)] rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${p.pct > 100 ? 'bg-red-500' : p.pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, p.pct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                  <span>Gastado: <span className="text-[var(--foreground)] font-medium">{fmtCOP(p.spent)}</span></span>
                  <span>Presupuesto: <span className="text-[var(--foreground)] font-medium">{fmtCOP(p.budget)}</span></span>
                </div>
                {p.pct > 100 && (
                  <div className="mt-2 text-[10px] text-red-400 flex items-center gap-1">
                    <AlertTriangle size={10} aria-hidden="true"/> Excedido por {fmtCOP(p.spent - p.budget)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {byCategory.length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
          <div className="text-[15px] font-semibold mb-3">Detalle por Categoría</div>
          <div className="space-y-3">
            {byCategory.map((cat: any, i: number) => {
              const pct = totalExpenses > 0 ? (cat.value / totalExpenses) * 100 : 0;
              const count = filtered.filter((e: Expense) => (e.data.category || 'Otro') === cat.name).length;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                      <span className="text-[13px] font-medium">{cat.name}</span>
                      <span className="text-[10px] text-[var(--af-text3)]">{count} registro{count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--muted-foreground)]">{pct.toFixed(1)}%</span>
                      <span className="text-[13px] font-semibold">{fmtCOP(cat.value)}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: pct + '%', background: cat.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expenses by Project */}
      {Object.keys(byProject).length > 0 && (
        <div className="space-y-3">
          {Object.entries(byProject).map(([pid, exps]: [string, Expense[]]) => {
            const proj = projects.find((p: Project) => p.id === pid);
            const total = exps.reduce((s: number, e: Expense) => s + (Number(e.data.amount) || 0), 0);
            return (
              <div key={pid} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <Receipt size={16} className="text-[var(--af-accent)]" aria-hidden="true"/>
                    <span className="text-[15px] font-semibold">{proj?.data.name || 'Sin proyecto'}</span>
                    <span className="text-[10px] text-[var(--muted-foreground)] px-1.5 py-0.5 rounded-full bg-[var(--af-bg4)]">{exps.length} gasto{exps.length !== 1 ? 's' : ''}</span>
                  </div>
                  <span className="text-[14px] font-semibold text-[var(--af-accent)]">{fmtCOP(total)}</span>
                </div>
                {exps.map((e: Expense) => (
                  <div key={e.id} className="flex items-center gap-3 py-2.5 border-b border-[var(--border)] last:border-0 group">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CAT_COLORS[e.data.category] || '#9a9b9e' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{e.data.concept}</div>
                      <div className="text-[11px] text-[var(--af-text3)] flex items-center gap-1 flex-wrap">
                        <span>{e.data.category}</span>
                        {e.data.date && <span> · {e.data.date}</span>}
                        {e.data.vendor && <span> · {e.data.vendor}</span>}
                        {e.data.paymentMethod && e.data.paymentMethod !== 'Efectivo' && <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--af-bg4)]">{e.data.paymentMethod}</span>}
                      </div>
                    </div>
                    <div className="text-sm font-semibold">{fmtCOP(Number(e.data.amount))}</div>
                    {/* Desktop: action buttons */}
                    <div className="hidden md:flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button className="text-xs px-1.5 py-1 rounded bg-[var(--af-accent)]/10 text-[var(--af-accent)] cursor-pointer hover:bg-[var(--af-accent)]/20" onClick={() => openEditExpense(e)}>✎</button>
                      <button className="text-xs px-1.5 py-1 rounded bg-red-500/10 text-red-400 cursor-pointer hover:bg-red-500/20" onClick={async () => { if (await confirmDialog.confirm({ title: 'Eliminar gasto', description: '¿Estás seguro? El gasto será eliminado permanentemente.' })) deleteExpense(e.id); }}>✕</button>
                    </div>
                    {/* Mobile: OverflowMenu */}
                    <div className="md:hidden flex-shrink-0">
                      <OverflowMenu
                        actions={[
                          {
                            label: 'Editar gasto',
                            icon: <Edit3 size={14} aria-hidden="true"/>,
                            onClick: () => openEditExpense(e),
                          },
                          {
                            label: 'Eliminar gasto',
                            icon: <Trash2 size={14} aria-hidden="true"/>,
                            onClick: async () => { if (await confirmDialog.confirm({ title: 'Eliminar gasto', description: '¿Estás seguro? El gasto será eliminado permanentemente.' })) deleteExpense(e.id); },
                            variant: 'danger',
                          },
                        ]}
                        side="left"
                        align="end"
                      />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {expenses.length === 0 && (
        <div className="text-center py-16 text-[var(--af-text3)]">
          <div className="w-14 h-14 rounded-2xl bg-[var(--af-bg3)] flex items-center justify-center mx-auto mb-3">
            <DollarSign size={24} className="text-[var(--af-text3)]" aria-hidden="true"/>
          </div>
          <div className="text-[15px] font-medium text-[var(--muted-foreground)]">Sin gastos</div>
          <div className="text-xs mt-1">Registra tu primer gasto para empezar a llevar control</div>
        </div>
      )}
      <ConfirmDialog {...confirmDialog} />
    </div>
  );
}
