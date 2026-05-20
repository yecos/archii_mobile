'use client';
import React from 'react';
import { statusColor, fmtCOP } from '@/lib/helpers';
import { OverflowMenu } from '@/components/ui/OverflowMenu';
import {
  Pencil, Trash2, AlertTriangle, CheckCircle2, Clock, CheckSquare,
} from 'lucide-react';
import type { Project } from '@/lib/types';
import { STATUS_LABELS, HEALTH_CONFIG, HealthLevel } from './project-helpers';

export interface ProjectCardsProps {
  filteredProjects: Project[];
  companies: any[];
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  openProject: (id: string) => void;
  openEditProject: (p: Project) => void;
  deleteProject: (id: string) => void;
  confirmDialog: any;
  getHealth: (p: Project) => { score: number; level: HealthLevel; details: { budget: number; schedule: number; tasks: number; progress: number } };
  getProjectStats: (projectId: string) => { pending: number; overdue: number; completed: number; total: number };
  getProjectSpent: (projectId: string) => number;
  getDaysRemaining: (endDate: string) => number | null;
  today: string;
}

export default function ProjectCards({
  filteredProjects,
  companies,
  selectedIds,
  toggleSelect,
  openProject,
  openEditProject,
  deleteProject,
  confirmDialog,
  getHealth,
  getProjectStats,
  getProjectSpent,
  getDaysRemaining,
}: ProjectCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {filteredProjects.map((p: Project) => {
        const d = p.data;
        const prog = d.progress || 0;
        const compName = companies.find((c: any) => c.id === d.companyId)?.data?.name;
        const stats = getProjectStats(p.id);
        const daysLeft = getDaysRemaining(d.endDate);
        const spent = getProjectSpent(p.id);
        const budgetPct = d.budget > 0 ? Math.round((spent / d.budget) * 100) : 0;
        const health = getHealth(p);
        const healthCfg = HEALTH_CONFIG[health.level];
        const isSelected = selectedIds.has(p.id);

        return (
          <div key={p.id} className={`bg-[var(--card)] border rounded-xl p-4 cursor-pointer transition-all hover:border-[var(--input)] hover:-translate-y-0.5 relative overflow-hidden group ${isSelected ? 'border-[var(--af-accent)] ring-1 ring-[var(--af-accent)]/30' : 'border-[var(--border)]'}`} onClick={() => openProject(p.id)}>
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--af-accent)] opacity-0 group-hover:opacity-100 transition-opacity" />

            {/* ★ Batch checkbox */}
            <div className="absolute top-3 right-3 z-10" onClick={e => e.stopPropagation()}>
              <button
                className={`w-5 h-5 rounded flex items-center justify-center border transition-all cursor-pointer ${isSelected ? 'bg-[var(--af-accent)] border-[var(--af-accent)]' : 'border-[var(--border)] bg-[var(--card)] opacity-0 group-hover:opacity-100 hover:opacity-100'}`}
                onClick={() => toggleSelect(p.id)}
              >
                {isSelected && <CheckSquare size={13} className="text-background" aria-hidden="true"/>}
              </button>
            </div>

            {/* Top: status + type + company + overdue + health + actions */}
            <div className="flex justify-between items-start mb-3 pr-8">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusColor(d.status)}`}>{STATUS_LABELS[d.status] || d.status || 'Concepto'}</span>
                {d.projectType && d.projectType !== 'Ejecución' && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${d.projectType === 'Diseño' ? 'bg-violet-500/10 text-violet-400 border-violet-500/30' : d.projectType === 'Ambos' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
                    {d.projectType}
                  </span>
                )}
                {compName && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--af-text3)]">{compName}</span>}
                {stats.overdue > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" aria-hidden="true"/>{stats.overdue}
                  </span>
                )}
                {/* ★ Health badge */}
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 ${healthCfg.bg} ${healthCfg.color}`} title={`Salud: ${health.score}/100`}>
                  {healthCfg.icon}
                  {health.score}
                </span>
              </div>
              {/* Desktop edit/delete */}
              <div className="hidden md:flex gap-1.5" onClick={e => e.stopPropagation()}>
                <button className="px-2.5 py-1.5 rounded bg-[var(--af-bg4)] text-xs cursor-pointer hover:bg-[var(--af-bg3)]" onClick={() => openEditProject(p)}>✏️</button>
                <button className="px-2.5 py-1.5 rounded bg-red-500/10 text-xs cursor-pointer hover:bg-red-500/20" onClick={async () => { if (await confirmDialog.confirm({ title: 'Eliminar proyecto', description: `¿Estás seguro de eliminar "${d.name}"? Esta acción no se puede deshacer.` })) deleteProject(p.id); }}>🗑</button>
              </div>
              {/* Mobile overflow */}
              <div className="md:hidden" onClick={e => e.stopPropagation()}>
                <OverflowMenu
                  actions={[
                    { label: 'Editar proyecto', icon: <Pencil size={14} aria-hidden="true"/>, onClick: () => openEditProject(p) },
                    { label: 'Eliminar proyecto', icon: <Trash2 size={14} aria-hidden="true"/>, onClick: async () => { if (await confirmDialog.confirm({ title: 'Eliminar proyecto', description: `¿Estás seguro de eliminar "${d.name}"?` })) deleteProject(p.id); }, variant: 'danger', separator: true },
                  ]}
                  side="left"
                  align="end"
                />
              </div>
            </div>

            {/* Project name */}
            <div className="text-[15px] font-semibold mb-1 leading-tight">{d.name}</div>
            <div className="text-xs text-[var(--af-text3)] mb-3 truncate">
              {d.location ? '📍 ' + d.location : ''}{d.location && d.client ? ' · ' : ''}{d.client || ''}
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-[var(--af-bg4)] rounded-full overflow-hidden mb-3">
              <div className={`h-full rounded-full transition-all ${prog >= 80 ? 'bg-emerald-500' : prog >= 40 ? 'bg-[var(--af-accent)]' : 'bg-amber-500'}`} style={{ width: prog + '%' }} />
            </div>

            {/* Budget progress (if has budget) */}
            {d.budget > 0 && (
              <div className="mb-3">
                <div className="h-1 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${budgetPct > 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, budgetPct)}%` }} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-[var(--af-text3)] mt-1">
                  <span>{fmtCOP(spent)} gastado</span>
                  <span className={budgetPct > 100 ? 'text-red-400 font-medium' : ''}>{budgetPct}% de {fmtCOP(d.budget)}</span>
                </div>
              </div>
            )}

            {/* ★ Health detail bars (mini) */}
            <div className="mb-3 flex gap-1">
              {[
                { label: 'Pres.', val: health.details.budget, max: 25 },
                { label: 'Crono.', val: health.details.schedule, max: 25 },
                { label: 'Tareas', val: health.details.tasks, max: 25 },
                { label: 'Progr.', val: health.details.progress, max: 25 },
              ].map((h) => (
                <div key={h.label} className="flex-1 text-center">
                  <div className="h-1 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${h.val >= 20 ? 'bg-emerald-500' : h.val >= 12 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${(h.val / h.max) * 100}%` }}
                    />
                  </div>
                  <span className="text-[8px] text-[var(--muted-foreground)]">{h.label}</span>
                </div>
              ))}
            </div>

            {/* Bottom stats */}
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-[var(--foreground)]">{prog}%</span>
                {d.budget > 0 && <span className="text-[var(--af-accent)] font-medium">{fmtCOP(d.budget)}</span>}
                {stats.total > 0 && (
                  <span className="text-[var(--muted-foreground)]">
                    <CheckCircle2 size={10} className="inline mr-0.5 text-emerald-400" aria-hidden="true"/>{stats.completed}/{stats.total}
                  </span>
                )}
              </div>
              {daysLeft !== null && d.status !== 'Terminado' && (
                <span className={`flex items-center gap-1 font-medium ${daysLeft < 0 ? 'text-red-400' : daysLeft <= 7 ? 'text-amber-400' : 'text-[var(--muted-foreground)]'}`}>
                  <Clock className="w-3 h-3" aria-hidden="true"/>
                  {daysLeft < 0 ? `-${Math.abs(daysLeft)}d` : `${daysLeft}d`}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
