'use client';
import React from 'react';
import { Users } from 'lucide-react';

interface DashboardTeamQuickViewProps {
  teamWorkload: { name: string; activas: number; completadas: number; pendientes: number }[];
  navigateTo: (screen: string) => void;
}

export default function DashboardTeamQuickView({
  teamWorkload, navigateTo,
}: DashboardTeamQuickViewProps) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[14px] font-semibold flex items-center gap-2">
          <Users size={14} className="text-purple-400" aria-hidden="true"/> Equipo
        </div>
        <button className="text-[10px] text-[var(--af-accent)] cursor-pointer hover:underline flex items-center gap-1" onClick={() => navigateTo('team')}>
          Equipo <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>
      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
        {teamWorkload.length === 0 ? (
          <div className="text-center py-6 text-[var(--af-text3)] text-[11px]">Sin tareas asignadas</div>
        ) : (
          teamWorkload.map((w, i) => {
            const total = w.activas + w.completadas + w.pendientes;
            const pct = total > 0 ? Math.round((w.completadas / total) * 100) : 0;
            return (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-[10px] font-bold text-purple-400 flex-shrink-0">{w.name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-medium">{w.name}</span>
                    <span className="text-[9px] text-[var(--af-text3)]">{w.completadas}/{total}</span>
                  </div>
                  <div className="h-1 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500/60 transition-all" style={{ width: pct + '%' }} />
                  </div>
                </div>
                {w.activas > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 flex-shrink-0">{w.activas}</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
