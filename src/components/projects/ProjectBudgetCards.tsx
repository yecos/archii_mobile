'use client';
import React from 'react';
import { DollarSign, AlertTriangle } from 'lucide-react';
import { fmtCOP } from '@/lib/helpers';

export interface ProjectBudgetCardsProps {
  projectBudgetData: { id: string; name: string; budget: number; spent: number; pct: number }[];
}

export default function ProjectBudgetCards({ projectBudgetData }: ProjectBudgetCardsProps) {
  if (projectBudgetData.length === 0) return null;

  return (
    <div>
      <div className="text-[15px] font-semibold mb-3 flex items-center gap-2">
        <DollarSign size={16} className="text-[var(--af-accent)]" aria-hidden="true"/>
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
  );
}
