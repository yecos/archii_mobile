import React from 'react';
import { fmtCOP } from '@/lib/helpers';
import { isOverdue as checkOverdue } from '@/lib/kanban-helpers';
import { HeartPulse, Heart, AlertTriangle } from 'lucide-react';
import type { Project, Task, Expense } from '@/lib/types';

// ─── Constants ───

export const STATUS_COLORS: Record<string, string> = {
  Concepto: '#828282',
  Diseno: '#3b82f6',
  Ejecucion: '#f59e0b',
  Terminado: '#10b981',
};

export const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const STATUS_LABELS: Record<string, string> = {
  Concepto: 'Concepto',
  Diseno: 'Diseño',
  Ejecucion: 'Ejecución',
  Terminado: 'Terminado',
};

// ─── Health Score ───

export type HealthLevel = 'excelente' | 'bueno' | 'riesgo' | 'critico';

export function computeHealth(
  p: Project,
  tasks: Task[],
  expenses: Expense[],
  today: string
): { score: number; level: HealthLevel; details: { budget: number; schedule: number; tasks: number; progress: number } } {
  const d = p.data;
  let budgetPts = 25;
  let schedulePts = 25;
  let tasksPts = 25;
  let progressPts = 25;

  // --- Budget health ---
  const budget = d.budget || 0;
  const spent = expenses
    .filter((e: Expense) => e.data.projectId === p.id)
    .reduce((s: number, e: Expense) => s + (Number(e.data.amount) || 0), 0);
  if (budget > 0) {
    const pct = spent / budget;
    if (pct > 1) budgetPts = 0;
    else if (pct > 0.9) budgetPts = 5;
    else if (pct > 0.75) budgetPts = 12;
    else if (pct > 0.5) budgetPts = 18;
    else budgetPts = 25;
  }

  // --- Schedule health ---
  if (d.startDate && d.endDate) {
    const start = new Date(d.startDate + 'T00:00:00').getTime();
    const end = new Date(d.endDate + 'T23:59:59').getTime();
    const now = new Date(today + 'T12:00:00').getTime();
    if (now > end) {
      schedulePts = d.status === 'Terminado' ? 25 : 0;
    } else if (now > end - 7 * 86400000) {
      schedulePts = 8;
    } else if (now > (start + end) / 2) {
      schedulePts = 15;
    } else {
      schedulePts = 25;
    }
  }

  // --- Task health ---
  const projTasks = tasks.filter((t: Task) => t.data.projectId === p.id);
  const totalTasks = projTasks.length;
  const overdueTasks = projTasks.filter(
    (t: Task) => t.data.status !== 'Completado' && t.data.dueDate && checkOverdue(t.data.dueDate)
  ).length;
  if (totalTasks > 0) {
    const overdueRatio = overdueTasks / totalTasks;
    if (overdueRatio > 0.5) tasksPts = 0;
    else if (overdueRatio > 0.25) tasksPts = 8;
    else if (overdueRatio > 0) tasksPts = 16;
    else tasksPts = 25;
  }

  // --- Progress alignment ---
  const prog = d.progress || 0;
  if (d.startDate && d.endDate && d.status !== 'Terminado') {
    const start = new Date(d.startDate + 'T00:00:00').getTime();
    const end = new Date(d.endDate + 'T23:59:59').getTime();
    const total = end - start;
    if (total > 0) {
      const elapsed = Math.max(
        0,
        Math.min(1, (new Date(today + 'T12:00:00').getTime() - start) / total)
      );
      const expectedProgress = Math.round(elapsed * 100);
      const diff = prog - expectedProgress;
      if (diff < -30) progressPts = 0;
      else if (diff < -15) progressPts = 8;
      else if (diff < -5) progressPts = 15;
      else progressPts = 25;
    }
  }

  const score = budgetPts + schedulePts + tasksPts + progressPts;
  let level: HealthLevel = 'excelente';
  if (score < 35) level = 'critico';
  else if (score < 60) level = 'riesgo';
  else if (score < 80) level = 'bueno';

  return {
    score,
    level,
    details: { budget: budgetPts, schedule: schedulePts, tasks: tasksPts, progress: progressPts },
  };
}

export const HEALTH_CONFIG: Record<HealthLevel, { color: string; bg: string; label: string; icon: React.ReactNode }> = {
  excelente: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', label: 'Excelente', icon: <HeartPulse size={11} className="text-emerald-400" aria-hidden="true"/> },
  bueno: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', label: 'Bueno', icon: <Heart size={11} className="text-blue-400" aria-hidden="true"/> },
  riesgo: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', label: 'En Riesgo', icon: <AlertTriangle size={11} className="text-amber-400" aria-hidden="true"/> },
  critico: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', label: 'Crítico', icon: <AlertTriangle size={11} className="text-red-400" aria-hidden="true"/> },
};

// ─── Chart Tooltip ───

export function ChartTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name?: string; dataKey?: string; value: number | string }[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-lg text-[12px]">
      <div className="font-semibold">{payload[0].name || payload[0].dataKey}</div>
      <div className="text-[var(--af-accent)]">
        {typeof payload[0].value === 'number' && payload[0].value > 1000
          ? fmtCOP(payload[0].value)
          : payload[0].value}
      </div>
    </div>
  );
}

// ─── Status tabs definition ───

export const STATUS_TABS = [
  { k: 'Todos', v: '' },
  { k: 'Concepto', v: 'Concepto' },
  { k: 'Diseño', v: 'Diseno' },
  { k: 'Ejecución', v: 'Ejecucion' },
  { k: 'Terminados', v: 'Terminado' },
];
