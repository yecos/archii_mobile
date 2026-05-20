'use client';
import React from 'react';
import { GanttChart } from 'lucide-react';
import type { Project } from '@/lib/types';
import { STATUS_COLORS, STATUS_LABELS, MONTHS, HEALTH_CONFIG, HealthLevel } from './project-helpers';

export interface TimelineViewProps {
  projects: Project[];
  getHealth: (p: Project) => { score: number; level: HealthLevel; details: { budget: number; schedule: number; tasks: number; progress: number } };
  onOpenProject: (id: string) => void;
}

export default function ProjectTimelineView({ projects, getHealth, onOpenProject }: TimelineViewProps) {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayMs = new Date(todayStr + 'T12:00:00').getTime();

  // Determine date range
  const allDates = projects.flatMap((p: Project) => {
    const dates: number[] = [];
    if (p.data.startDate) dates.push(new Date(p.data.startDate + 'T00:00:00').getTime());
    if (p.data.endDate) dates.push(new Date(p.data.endDate + 'T23:59:59').getTime());
    return dates;
  });
  const minDate = allDates.length > 0 ? Math.min(todayMs, ...allDates) - 7 * 86400000 : todayMs - 30 * 86400000;
  const maxDate = allDates.length > 0 ? Math.max(todayMs, ...allDates) + 14 * 86400000 : todayMs + 60 * 86400000;
  const totalRange = maxDate - minDate;

  const dateToPct = (dateStr: string, isEnd = false) => {
    if (!dateStr) return 0;
    const ms = new Date((isEnd ? dateStr + 'T23:59:59' : dateStr + 'T00:00:00')).getTime();
    return Math.max(0, Math.min(100, ((ms - minDate) / totalRange) * 100));
  };

  const todayPct = ((todayMs - minDate) / totalRange) * 100;

  // Generate month markers
  const monthMarkers: { label: string; pct: number }[] = [];
  const cursor = new Date(minDate);
  cursor.setDate(1);
  if (cursor.getTime() < minDate) cursor.setMonth(cursor.getMonth() + 1);
  while (cursor.getTime() < maxDate) {
    const pct = ((cursor.getTime() - minDate) / totalRange) * 100;
    monthMarkers.push({ label: MONTHS[cursor.getMonth()] + ' ' + cursor.getFullYear().toString().slice(2), pct });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--af-text3)] text-sm">
        <GanttChart size={32} className="mx-auto mb-2 opacity-30" aria-hidden="true"/>
        No hay proyectos con fechas para mostrar en el timeline
      </div>
    );
  }

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Timeline header */}
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="text-[15px] font-semibold flex items-center gap-2">
          <GanttChart size={16} className="text-[var(--af-accent)]" aria-hidden="true"/>
          Timeline de Proyectos
        </div>
      </div>

      {/* Month markers */}
      <div className="relative border-b border-[var(--border)] h-7 overflow-hidden">
        {monthMarkers.map((m, i) => (
          <div key={i} className="absolute top-0 h-full flex items-center" style={{ left: m.pct + '%' }}>
            <span className="text-[9px] text-[var(--muted-foreground)] pl-1 whitespace-nowrap">{m.label}</span>
            <div className="w-px h-full bg-[var(--af-bg4)] ml-1" />
          </div>
        ))}
      </div>

      {/* Project bars */}
      <div className="divide-y divide-[var(--border)]">
        {projects.map((p: Project) => {
          const d = p.data;
          const hasDates = d.startDate && d.endDate;
          const health = getHealth(p);
          const healthCfg = HEALTH_CONFIG[health.level as HealthLevel];
          const leftPct = dateToPct(d.startDate);
          const widthPct = hasDates ? Math.max(1.5, dateToPct(d.endDate, true) - leftPct) : 0;
          const barColor = STATUS_COLORS[d.status] || '#828282';

          return (
            <div key={p.id} className="relative px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--af-bg3)]/30 transition-colors cursor-pointer" onClick={() => onOpenProject(p.id)}>
              {/* Project label */}
              <div className="w-36 sm:w-48 flex-shrink-0">
                <div className="text-[12px] font-semibold truncate">{d.name}</div>
                <div className="text-[10px] text-[var(--muted-foreground)] truncate">{d.client || d.location || STATUS_LABELS[d.status] || d.status}</div>
              </div>

              {/* Bar area */}
              <div className="flex-1 relative h-10 overflow-hidden">
                {/* Today line */}
                <div className="absolute top-0 bottom-0 w-px bg-red-500/60 z-20" style={{ left: todayPct + '%' }}>
                  <div className="absolute -top-1 -left-1 w-2 h-2 bg-red-500 rounded-full" />
                </div>

                {/* Month grid lines */}
                {monthMarkers.map((m, i) => (
                  <div key={i} className="absolute top-0 bottom-0 w-px bg-[var(--af-bg4)]/50" style={{ left: m.pct + '%' }} />
                ))}

                {hasDates ? (
                  <div className="absolute top-1.5 h-7 rounded-md flex items-center overflow-hidden transition-all group/bar" style={{ left: leftPct + '%', width: widthPct + '%' }}>
                    <div className="absolute inset-0 opacity-90 rounded-md" style={{ background: barColor }} />
                    <div className="relative z-10 flex items-center justify-between px-2 w-full">
                      <span className="text-[10px] font-medium text-white truncate">{d.progress || 0}%</span>
                      <span className="text-[9px] text-white/80 hidden sm:inline">{STATUS_LABELS[d.status] || d.status}</span>
                    </div>
                    {/* Progress fill inside bar */}
                    <div className="absolute top-0 left-0 bottom-0 bg-white/20 rounded-l-md" style={{ width: (d.progress || 0) + '%' }} />
                  </div>
                ) : (
                  <div className="absolute top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted-foreground)]">Sin fechas definidas</div>
                )}
              </div>

              {/* Health badge */}
              <div className={`flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-medium border flex items-center gap-1 ${healthCfg.bg}`}>
                {healthCfg.icon}
                <span className="hidden sm:inline">{health.score}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Today legend */}
      <div className="border-t border-[var(--border)] px-4 py-2 flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-full" /> Hoy</div>
          {Object.entries(STATUS_COLORS).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm" style={{ background: v }} /> {STATUS_LABELS[k] || k}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
