'use client';
import React from 'react';
import { FolderKanban, ChevronRight } from 'lucide-react';
import { statusColor } from '@/lib/helpers';
import type { Project, Company } from '@/lib/types';

interface DashboardProjectsListProps {
  visibleProjects: () => Project[];
  companies: Company[];
  navigateTo: (screen: string) => void;
  openProject: (id: string) => void;
}

export default function DashboardProjectsList({
  visibleProjects, companies, navigateTo, openProject,
}: DashboardProjectsListProps) {
  const projs = visibleProjects().slice(0, 6);

  return (
    <div className="lg:col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[14px] sm:text-[15px] font-semibold flex items-center gap-2">
          <FolderKanban size={16} className="text-blue-400" aria-hidden="true"/>
          Proyectos
        </div>
        <button className="text-[10px] text-[var(--af-accent)] cursor-pointer hover:underline flex items-center gap-1" onClick={() => navigateTo('projects')}>
          Ver todos <ChevronRight size={12} aria-hidden="true"/>
        </button>
      </div>
      {projs.length === 0 ? (
        <div className="text-center py-8 text-[var(--af-text3)] text-sm">Crea tu primer proyecto</div>
      ) : (
        <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
          {projs.map((p: Project) => {
            const d = p.data, prog = d.progress || 0;
            const compName = companies.find((c: Company) => c.id === d.companyId)?.data?.name;
            return (
              <div key={p.id} className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-xl p-3 cursor-pointer transition-all hover:border-[var(--input)] hover:-translate-y-0.5" onClick={() => openProject(p.id)}>
                <div className="flex justify-between items-start mb-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor(d.status)}`}>{d.status || 'Concepto'}</span>
                    {compName && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--af-text3)]">{compName}</span>}
                  </div>
                  <div className="text-sm font-bold">{prog}%</div>
                </div>
                <div className="text-[13px] font-medium truncate mb-0.5">{d.name}</div>
                <div className="text-[10px] text-[var(--af-text3)] mb-2">{d.location ? d.location : ''}{d.client ? ' · ' + d.client : ''}</div>
                <div className="h-1 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${prog >= 80 ? 'bg-emerald-500' : prog >= 40 ? 'bg-[var(--af-accent)]' : 'bg-amber-500'}`} style={{ width: prog + '%' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
