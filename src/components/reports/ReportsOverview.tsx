'use client';
import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, LineChart, Line, CartesianGrid, XAxis, YAxis } from 'recharts';
import { FileText } from 'lucide-react';
import { exportBudgetPDF } from '@/lib/export-pdf';
import { fmtCOP, getInitials, avatarColor } from '@/lib/helpers';
import { isOverdue as checkOverdue } from '@/lib/kanban-helpers';
import { COLORS, ChartTooltip, ChartLegend } from './ChartComponents';
import type { ReportsTabProps } from './types';

export default function ReportsOverview({ projects, tasks, expenses, timeEntries, teamUsers, dateLabel, showToast }: ReportsTabProps) {
  const taskStatusData = useMemo(() => {
    const statuses: Record<string, number> = {};
    tasks.forEach(t => { statuses[t.data.status || 'Sin estado'] = (statuses[t.data.status || 'Sin estado'] || 0) + 1; });
    return Object.entries(statuses).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  const taskPriorityData = useMemo(() => {
    const prios: Record<string, number> = {};
    tasks.forEach(t => { const p = t.data.priority || 'Otro'; prios[p] = (prios[p] || 0) + 1; });
    return Object.entries(prios).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  const roleDistData = useMemo(() => {
    const roles: Record<string, number> = {};
    teamUsers.forEach(u => { const r = u.data.role || 'Miembro'; roles[r] = (roles[r] || 0) + 1; });
    return Object.entries(roles).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [teamUsers]);

  const monthlyExpenseTrend = useMemo(() => {
    const months: Record<string, number> = {};
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = 0;
    }
    expenses.forEach(e => {
      if (!e.data.date) return;
      const d = new Date(e.data.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (months[key] !== undefined) months[key] += e.data.amount;
    });
    return Object.entries(months).map(([key, value]) => {
      const [y, m] = key.split('-');
      return { name: monthNames[parseInt(m) - 1], gastos: value };
    });
  }, [expenses]);

  const totalBudget = projects.reduce((s, p) => s + (p.data.budget || 0), 0);
  const totalSpent = expenses.reduce((s, e) => s + (e.data.amount || 0), 0);
  const taskCompleted = tasks.filter(t => t.data.status === 'Completado').length;
  const taskInProgress = tasks.filter(t => t.data.status === 'En progreso').length;
  const taskPending = tasks.filter(t => t.data.status === 'Pendiente' || t.data.status === 'Por hacer').length;
  const taskOverdue = tasks.filter(t => t.data.status !== 'Completado' && t.data.dueDate && checkOverdue(t.data.dueDate)).length;
  const budgetPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const membersByRole: Record<string, number> = {};
  teamUsers.forEach(u => { const r = u.data.role || 'Miembro'; membersByRole[r] = (membersByRole[r] || 0) + 1; });
  const tasksPerMember: Record<string, number> = {};
  tasks.forEach(t => { if (t.data.assigneeId) { tasksPerMember[t.data.assigneeId] = (tasksPerMember[t.data.assigneeId] || 0) + 1; } });

  return (
    <div className="contents">
      {/* Card 1: Estado de Proyectos */}
      <div className="bg-[var(--af-bg2)] border border-[var(--border)] rounded-xl p-5">
        <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">Estado de Proyectos</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-[var(--af-accent)]">{projects.length}</div><div className="text-xs text-[var(--muted-foreground)] mt-1">Total Proyectos</div></div>
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-[var(--foreground)]">{fmtCOP(totalBudget)}</div><div className="text-xs text-[var(--muted-foreground)] mt-1">Presupuesto Total</div></div>
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-[var(--foreground)]">{fmtCOP(totalSpent)}</div><div className="text-xs text-[var(--muted-foreground)] mt-1">Gastado ({dateLabel})</div></div>
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className={`text-2xl font-bold ${budgetPct > 90 ? 'text-red-400' : budgetPct > 70 ? 'text-amber-400' : 'text-emerald-400'}`}>{budgetPct}%</div><div className="text-xs text-[var(--muted-foreground)] mt-1">Utilizacion</div></div>
        </div>
        {taskStatusData.length > 0 && <div className="mb-4">
          <div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide mb-2">Distribucion de Tareas</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={taskStatusData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value" stroke="none">
                {taskStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend content={<ChartLegend />} />
            </PieChart>
          </ResponsiveContainer>
        </div>}
        {projects.length > 0 && <div className="space-y-2"><div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide">Progreso por proyecto</div>{projects.slice(0, 5).map(p => (<div key={p.id}><div className="flex justify-between text-xs mb-1"><span className="text-[var(--foreground)] truncate mr-2">{p.data.name}</span><span className="text-[var(--muted-foreground)]">{p.data.progress || 0}%</span></div><div className="w-full bg-[var(--af-bg3)] rounded-full h-2"><div className="bg-[var(--af-accent)] rounded-full h-2 transition-all" style={{ width: `${p.data.progress || 0}%` }} /></div></div>))}{projects.length > 5 && <div className="text-xs text-[var(--muted-foreground)]">+{projects.length - 5} proyectos mas</div>}</div>}
      </div>
      {/* Card 2: Tareas y Productividad */}
      <div className="bg-[var(--af-bg2)] border border-[var(--border)] rounded-xl p-5">
        <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">Tareas y Productividad</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-[var(--af-accent)]">{tasks.length}</div><div className="text-xs text-[var(--muted-foreground)] mt-1">Total Tareas</div></div>
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-emerald-400">{taskCompleted}</div><div className="text-xs text-[var(--muted-foreground)] mt-1">Completadas</div></div>
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-blue-400">{taskInProgress}</div><div className="text-xs text-[var(--muted-foreground)] mt-1">En Progreso</div></div>
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className={`text-2xl font-bold ${taskOverdue > 0 ? 'text-red-400' : 'text-[var(--foreground)]'}`}>{taskPending}</div><div className="text-xs text-[var(--muted-foreground)] mt-1">Pendientes</div></div>
        </div>
        {taskOverdue > 0 && <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4 flex items-center gap-2"><span className="text-red-400">⚠️</span><span className="text-sm text-red-400 font-medium">{taskOverdue} tarea{taskOverdue !== 1 ? 's' : ''} vencida{taskOverdue !== 1 ? 's' : ''}</span></div>}
        {tasks.length > 0 && <div className="bg-[var(--af-bg3)] rounded-lg p-3 mb-3"><div className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Completitud general</div><div className="flex justify-between text-xs mb-1"><span className="text-[var(--foreground)]">Progreso</span><span className="text-[var(--muted-foreground)]">{tasks.length > 0 ? Math.round((taskCompleted / tasks.length) * 100) : 0}%</span></div><div className="w-full bg-[var(--af-bg2)] rounded-full h-2.5"><div className="bg-emerald-400 rounded-full h-2.5 transition-all" style={{ width: `${tasks.length > 0 ? (taskCompleted / tasks.length) * 100 : 0}%` }} /></div></div>}
        {taskPriorityData.length > 0 && <div>
          <div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide mb-2">Por prioridad</div>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={taskPriorityData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3} dataKey="value" stroke="none">
                {taskPriorityData.map((_, i) => <Cell key={i} fill={['#ef4444', '#f59e0b', '#10b981', '#6366f1'][i % 4]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend content={<ChartLegend />} />
            </PieChart>
          </ResponsiveContainer>
        </div>}
      </div>
      {/* Card 3: Presupuesto */}
      <div className="bg-[var(--af-bg2)] border border-[var(--border)] rounded-xl p-5">
        <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">Presupuesto</h3>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-lg font-bold text-[var(--af-accent)]">{fmtCOP(totalBudget)}</div><div className="text-xs text-[var(--muted-foreground)] mt-1">Presupuesto</div></div>
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-lg font-bold text-[var(--foreground)]">{fmtCOP(totalSpent)}</div><div className="text-xs text-[var(--muted-foreground)] mt-1">Gastado</div></div>
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className={`text-lg font-bold ${budgetPct > 90 ? 'text-red-400' : budgetPct > 70 ? 'text-amber-400' : 'text-emerald-400'}`}>{budgetPct}%</div><div className="text-xs text-[var(--muted-foreground)] mt-1">Utilizado</div></div>
        </div>
        <div className="bg-[var(--af-bg3)] rounded-lg p-3 mb-4"><div className="flex justify-between text-xs mb-1"><span className="text-[var(--foreground)]">Utilizacion del presupuesto</span><span className="text-[var(--muted-foreground)]">{fmtCOP(totalBudget - totalSpent)} restante</span></div><div className="w-full bg-[var(--af-bg2)] rounded-full h-3"><div className={`rounded-full h-3 transition-all ${budgetPct > 90 ? 'bg-red-400' : budgetPct > 70 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(budgetPct, 100)}%` }} /></div></div>
        {/* Monthly Expense Trend Line Chart */}
        <div className="mb-4">
          <div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide mb-2">Tendencia de Gastos</div>
          {monthlyExpenseTrend.some(d => d.gastos > 0) ? (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={monthlyExpenseTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--af-bg4)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000000 ? `${(v/1000000).toFixed(0)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="gastos" name="Gastos" stroke="#c8a96e" strokeWidth={2} dot={{ r: 3, fill: '#c8a96e' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-[var(--muted-foreground)]">Sin gastos en el período</div>
          )}
        </div>
        {/* Export budget button */}
        <button className="w-full text-xs text-[var(--af-accent)] cursor-pointer hover:underline text-center bg-[var(--af-accent)]/5 rounded-lg py-2 transition-colors hover:bg-[var(--af-accent)]/10" onClick={() => {
          try { exportBudgetPDF({ expenses, projects }); showToast('Presupuesto PDF descargado'); } catch { showToast('Error', 'error'); }
        }}>
          <FileText size={12} className="inline mr-1" aria-hidden="true"/> Descargar reporte de presupuesto PDF
        </button>
      </div>
      {/* Card 4: Equipo */}
      <div className="bg-[var(--af-bg2)] border border-[var(--border)] rounded-xl p-5">
        <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">Equipo</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-[var(--af-accent)]">{teamUsers.length}</div><div className="text-xs text-[var(--muted-foreground)] mt-1">Miembros</div></div>
          <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-[var(--foreground)]">{Object.keys(membersByRole).length}</div><div className="text-xs text-[var(--muted-foreground)] mt-1">Roles distintos</div></div>
        </div>
        {roleDistData.length > 0 && <div className="mb-4">
          <div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide mb-2">Roles</div>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={roleDistData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} paddingAngle={3} dataKey="value" stroke="none">
                {roleDistData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend content={<ChartLegend />} />
            </PieChart>
          </ResponsiveContainer>
        </div>}
        {Object.keys(tasksPerMember).length > 0 && <div className="space-y-2"><div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide">Tareas asignadas por miembro</div>{Object.entries(tasksPerMember).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([uid, cnt]) => {const member = teamUsers.find(u => u.id === uid); return (<div key={uid} className="flex items-center gap-2"><div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: avatarColor(uid) }}>{member ? getInitials(member.data.name) : '?'}</div><span className="text-sm text-[var(--foreground)] flex-1 truncate">{member ? member.data.name : uid}</span><span className="text-sm font-semibold text-[var(--foreground)]">{cnt}</span></div>);})}</div>}
      </div>
      {/* Burndown Chart */}
      <BurndownChart projects={projects} tasks={tasks} />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   BURNDOWN CHART COMPONENT
   ═══════════════════════════════════════════════ */

function BurndownChart({ projects, tasks }: { projects: any[]; tasks: any[] }) {
  const { data, projectNames } = useMemo(() => {
    if (projects.length === 0) return { data: [], projectNames: [] };
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Build month labels
    const labels: string[] = [];
    const cursor = new Date(startMonth);
    while (cursor <= endMonth) {
      labels.push(`${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Per project: total tasks created by month, total tasks completed by month
    const projData: Record<string, { total: number[]; done: number[] }> = {};
    projects.forEach(p => { projData[p.id] = { total: [], done: [] }; });

    // Also compute overall
    const overallTotal: number[] = [];
    const overallDone: number[] = [];

    labels.forEach((_, mi) => {
      const mStart = new Date(startMonth.getFullYear(), startMonth.getMonth() + mi, 1);
      const mEnd = new Date(startMonth.getFullYear(), startMonth.getMonth() + mi + 1, 1);

      let allCreated = 0;
      let allCompleted = 0;

      projects.forEach(p => {
        const projTasks = tasks.filter(t => t.data.projectId === p.id);
        const created = projTasks.filter(t => {
          const d = t.data.createdAt;
          if (!d) return false;
          const date = d.toDate ? d.toDate() : new Date(d);
          return date >= mStart && date < mEnd;
        }).length;
        const completed = projTasks.filter(t => {
          const d = t.data.updatedAt;
          if (!d) return false;
          const date = d.toDate ? d.toDate() : new Date(d);
          return date >= mStart && date < mEnd && t.data.status === 'Completado';
        }).length;

        projData[p.id].total.push(created);
        projData[p.id].done.push(completed);
        allCreated += created;
        allCompleted += completed;
      });

      overallTotal.push(allCreated);
      overallDone.push(allCompleted);
    });

    return {
      projectNames: projects.slice(0, 6).map(p => ({ id: p.id, name: p.data.name })),
      data: labels.map((label, i) => ({
        name: label,
        Creadas: overallTotal[i],
        Completadas: overallDone[i],
      })),
    };
  }, [projects, tasks]);

  if (data.length === 0 || tasks.length === 0) return null;

  return (
    <div className="bg-[var(--af-bg2)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="text-lg font-semibold text-[var(--foreground)] mb-1 flex items-center gap-2">Burndown</h3>
      <p className="text-xs text-[var(--muted-foreground)] mb-4">Tareas creadas vs completadas por mes (ultimos 6 meses)</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--af-bg4)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Line type="monotone" dataKey="Creadas" name="Creadas" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="Completadas" name="Completadas" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
      {projectNames.length > 0 && (
        <div className="mt-3 text-[10px] text-[var(--muted-foreground)]">
          {projectNames.length < projects.length && `Mostrando ${projectNames.length} de ${projects.length} proyectos · `}
          {projectNames.map(p => p.name).join(' · ')}
        </div>
      )}
    </div>
  );
}
