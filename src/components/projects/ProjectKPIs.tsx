'use client';
import React from 'react';
import { fmtCOP } from '@/lib/helpers';
import { FolderKanban, DollarSign, TrendingUp, CheckCircle2, AlertTriangle, HeartPulse, Heart } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { HEALTH_CONFIG } from './project-helpers';

export interface ProjectKPIsProps {
  projectsCount: number;
  completedCount: number;
  totalBudget: number;
  totalSpent: number;
  avgProgress: number;
  projectsWithOverdue: number;
  overBudgetCount: number;
  projectBudgetDataLength: number;
  healthSummary: { excelente: number; bueno: number; riesgo: number; critico: number; total: number };
  healthChartData: { name: string; value: number; color: string }[];
}

export default function ProjectKPIs({
  projectsCount,
  completedCount,
  totalBudget,
  totalSpent,
  avgProgress,
  projectsWithOverdue,
  overBudgetCount,
  projectBudgetDataLength,
  healthSummary,
  healthChartData,
}: ProjectKPIsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-8 gap-3">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
        <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
          <FolderKanban size={11} className="text-[var(--af-accent)]" aria-hidden="true"/>
          Activos
        </div>
        <div className="text-lg font-bold text-[var(--af-accent)]">{projectsCount - completedCount}</div>
        <div className="text-[10px] text-[var(--muted-foreground)]">{completedCount} terminados</div>
      </div>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
        <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
          <DollarSign size={11} className="text-[var(--af-accent)]" aria-hidden="true"/>
          Presupuesto
        </div>
        <div className="text-lg font-bold text-[var(--af-accent)]">{fmtCOP(totalBudget)}</div>
        <div className="text-[10px] text-[var(--muted-foreground)]">Gastado: {fmtCOP(totalSpent)}</div>
      </div>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
        <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
          <TrendingUp size={11} className="text-emerald-400" aria-hidden="true"/>
          Progreso prom.
        </div>
        <div className="text-lg font-bold">{avgProgress}%</div>
        <div className="text-[10px] text-[var(--muted-foreground)]">de todos los proyectos</div>
      </div>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
        <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
          <CheckCircle2 size={11} className="text-emerald-400" aria-hidden="true"/>
          Terminados
        </div>
        <div className="text-lg font-bold text-emerald-400">{completedCount}</div>
        <div className="text-[10px] text-[var(--muted-foreground)]">{projectsCount > 0 ? Math.round((completedCount / projectsCount) * 100) : 0}% del total</div>
      </div>
      <div className={`bg-[var(--card)] border rounded-xl p-4 ${projectsWithOverdue > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-[var(--border)]'}`}>
        <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
          {projectsWithOverdue > 0 && <AlertTriangle size={10} className="text-red-400" aria-hidden="true"/>}
          Tareas vencidas
        </div>
        <div className={`text-lg font-bold ${projectsWithOverdue > 0 ? 'text-red-400' : ''}`}>{projectsWithOverdue}</div>
        <div className="text-[10px] text-[var(--muted-foreground)]">del total filtrado</div>
      </div>
      <div className={`bg-[var(--card)] border rounded-xl p-4 ${overBudgetCount > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-[var(--border)]'}`}>
        <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
          {overBudgetCount > 0 && <AlertTriangle size={10} className="text-red-400" aria-hidden="true"/>}
          Sobrepasados
        </div>
        <div className={`text-lg font-bold ${overBudgetCount > 0 ? 'text-red-400' : ''}`}>{overBudgetCount}</div>
        <div className="text-[10px] text-[var(--muted-foreground)]">{projectBudgetDataLength} con presupuesto</div>
      </div>

      {/* ★ NEW: Health Score KPI */}
      <div className={`bg-[var(--card)] border rounded-xl p-4 ${healthSummary.critico > 0 ? 'border-red-500/20' : healthSummary.riesgo > 0 ? 'border-amber-500/20' : 'border-[var(--border)]'}`}>
        <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
          <HeartPulse size={11} className="text-emerald-400" aria-hidden="true"/>
          Salud global
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-bold text-emerald-400">{healthSummary.excelente}</span>
          <span className="text-[10px] text-[var(--muted-foreground)]">OK</span>
          {healthSummary.riesgo > 0 && <span className="text-[11px] font-medium text-amber-400">/ {healthSummary.riesgo} riesgo</span>}
          {healthSummary.critico > 0 && <span className="text-[11px] font-medium text-red-400">/ {healthSummary.critico} crítico</span>}
        </div>
        <div className="text-[10px] text-[var(--muted-foreground)]">{healthSummary.total} proyectos activos</div>
      </div>

      {/* ★ NEW: Health Distribution Mini Donut */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
        <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
          <Heart size={11} className="text-[var(--af-accent)]" aria-hidden="true"/>
          Distribución salud
        </div>
        {healthChartData.length > 0 ? (
          <div className="flex items-center gap-2">
            <ResponsiveContainer width={48} height={48}>
              <PieChart>
                <Pie data={healthChartData} cx="50%" cy="50%" innerRadius={14} outerRadius={22} paddingAngle={1} dataKey="value" stroke="none">
                  {healthChartData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-0.5">
              {healthChartData.filter(d => d.value > 0).map((d: any) => (
                <div key={d.name} className="flex items-center gap-1 text-[10px]">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: d.color }} />
                  <span className="text-[var(--muted-foreground)]">{d.name}</span>
                  <span className="font-semibold">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-[var(--muted-foreground)] mt-2">Sin datos</div>
        )}
      </div>
    </div>
  );
}
