'use client';
import React from 'react';
import { FolderKanban, Clock, AlertTriangle, CalendarDays, CircleHelp, ListChecks, DollarSign, Timer } from 'lucide-react';
import { fmtCOP } from '@/lib/helpers';
import type { Task, PunchItem } from '@/lib/types';

interface DashboardKPIsProps {
  projectsLength: number;
  execProjects: number;
  rangeTasks: Task[];
  rangeActiveTasks: number;
  overdueCount: number;
  todayMeetingsLength: number;
  weekTasksLength: number;
  openRFIs: number;
  pendingSubmittals: number;
  overdueRFIs: number;
  openPunchItems: number;
  punchItemsLength: number;
  totalExpenses: number;
  totalBudget: number;
  rangeTotalTime: number;
  rangeTimeEntriesLength: number;
  fmtHours: (mins: number) => string;
  navigateTo: (screen: string) => void;
}

export default function DashboardKPIs({
  projectsLength, execProjects, rangeTasks, rangeActiveTasks, overdueCount,
  todayMeetingsLength, weekTasksLength, openRFIs, pendingSubmittals, overdueRFIs,
  openPunchItems, punchItemsLength, totalExpenses, totalBudget,
  rangeTotalTime, rangeTimeEntriesLength, fmtHours, navigateTo,
}: DashboardKPIsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3">
      {[
        { val: projectsLength, lbl: 'Proyectos', icon: <FolderKanban size={15} aria-hidden="true"/>, bg: 'bg-blue-500/10', iconC: 'text-blue-400', sub: `${execProjects} en ejecución`, click: 'projects' },
        { val: rangeTasks.filter((t: Task) => t.data.status !== 'Completado').length, lbl: 'Pendientes', icon: <Clock size={15} aria-hidden="true"/>, bg: 'bg-orange-500/10', iconC: 'text-orange-400', sub: `${rangeActiveTasks} activas`, click: 'tasks' },
        { val: overdueCount, lbl: 'Vencidas', icon: <AlertTriangle size={15} aria-hidden="true"/>, bg: overdueCount > 0 ? 'bg-red-500/10' : 'bg-[var(--af-bg4)]', iconC: overdueCount > 0 ? 'text-red-400' : 'text-emerald-400', sub: overdueCount > 0 ? 'Requieren atención' : 'Sin vencidas', click: 'tasks', alert: overdueCount > 0 },
        { val: todayMeetingsLength, lbl: 'Reuniones hoy', icon: <CalendarDays size={15} aria-hidden="true"/>, bg: 'bg-purple-500/10', iconC: 'text-purple-400', sub: weekTasksLength > 0 ? `${weekTasksLength} tareas esta semana` : '', click: 'calendar' },
        { val: openRFIs + pendingSubmittals, lbl: 'RFIs + Subs', icon: <CircleHelp size={15} aria-hidden="true"/>, bg: 'bg-blue-500/10', iconC: 'text-blue-400', sub: `${openRFIs} RFIs · ${pendingSubmittals} subs`, click: 'rfis', alert: overdueRFIs > 0 },
        { val: openPunchItems, lbl: 'Punch List', icon: <ListChecks size={15} aria-hidden="true"/>, bg: 'bg-teal-500/10', iconC: 'text-teal-400', sub: `${punchItemsLength} items totales`, click: 'punchList' },
        { val: totalBudget > 0 ? Math.round((totalExpenses / totalBudget) * 100) + '%' : '—', lbl: 'Presupuesto', icon: <DollarSign size={15} aria-hidden="true"/>, bg: totalBudget > 0 && totalExpenses > totalBudget * 0.9 ? 'bg-red-500/10' : 'bg-emerald-500/10', iconC: totalBudget > 0 && totalExpenses > totalBudget * 0.9 ? 'text-red-400' : 'text-emerald-400', sub: totalBudget > 0 ? `${fmtCOP(totalExpenses)} / ${fmtCOP(totalBudget)}` : 'Sin presupuesto', click: 'budget', alert: totalBudget > 0 && totalExpenses > totalBudget },
        { val: rangeTotalTime > 0 ? fmtHours(rangeTotalTime) : '—', lbl: 'Tiempo', icon: <Timer size={15} aria-hidden="true"/>, bg: 'bg-indigo-500/10', iconC: 'text-indigo-400', sub: `${rangeTimeEntriesLength} registros`, click: 'timeTracking' },
      ].map((m, i) => (
        <div key={i} className={`af-kpi-card p-3.5 sm:p-4 animate-fadeInUp stagger-${Math.min(i + 1, 8)} hover:border-[var(--af-accent)]/30 transition-all cursor-pointer group`} onClick={() => navigateTo(m.click)}>
          <div className="flex items-center justify-between mb-2">
            <div className={`w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center ${m.iconC}`}>{m.icon}</div>
            {m.alert && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
          </div>
          <div className="text-lg sm:text-xl font-bold leading-tight">{m.val}</div>
          <div className="text-[10px] sm:text-[11px] text-[var(--muted-foreground)] mt-1">{m.lbl}</div>
          <div className="text-[10px] sm:text-[10px] text-[var(--af-text3)] mt-0.5 truncate">{m.sub}</div>
        </div>
      ))}
    </div>
  );
}
