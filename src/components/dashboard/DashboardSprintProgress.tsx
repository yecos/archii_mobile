'use client';
import React from 'react';
import { Zap, Timer } from 'lucide-react';
import { CHART_COLORS } from './useDashboardData';

interface DashboardSprintProgressProps {
  rangeCompletedTasks: number;
  rangeTasksLength: number;
  rangeActiveTasks: number;
  rangeTotalTime: number;
  rangeTimeEntriesLength: number;
  taskStatusData: { name: string; value: number }[];
  fmtHours: (mins: number) => string;
}

export default function DashboardSprintProgress({
  rangeCompletedTasks, rangeTasksLength, rangeActiveTasks,
  rangeTotalTime, rangeTimeEntriesLength, taskStatusData, fmtHours,
}: DashboardSprintProgressProps) {
  const pct = rangeTasksLength > 0 ? (rangeCompletedTasks / rangeTasksLength) * 100 : 0;
  const strokeColor = rangeTasksLength > 0
    ? pct >= 80 ? '#10b981'
    : pct >= 40 ? '#d4b87a'
    : '#f59e0b'
    : 'var(--af-bg4)';

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
      <div className="text-[14px] font-semibold mb-3 flex items-center gap-2">
        <Zap size={14} className="text-[var(--af-accent)]" aria-hidden="true"/> Progreso Sprint
      </div>
      <div className="flex items-center justify-center">
        <div className="relative w-[90px] h-[90px]">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--af-bg4)" strokeWidth="2.5" />
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeDasharray={`${rangeTasksLength > 0 ? pct.toFixed(1) : 0}, 100`} strokeLinecap="round" className="transition-all duration-700" style={{ filter: 'drop-shadow(0 0 6px rgba(212,184,122,0.3))' }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[18px] font-bold">{rangeTasksLength > 0 ? Math.round(pct) : 0}%</span>
          </div>
        </div>
      </div>
      <div className="mt-2 text-center">
        <div className="text-[11px] text-[var(--muted-foreground)]">{rangeCompletedTasks} de {rangeTasksLength} tareas</div>
        <div className="flex items-center justify-center gap-3 mt-1.5">
          <span className="text-[10px] text-blue-400">{rangeActiveTasks} activas</span>
          <span className="text-[10px] text-[var(--af-text3)]">·</span>
          <span className="text-[10px] text-emerald-400">{rangeCompletedTasks} completadas</span>
        </div>
        {rangeTotalTime > 0 && (
          <div className="flex items-center justify-center gap-1.5 mt-1 pt-2 border-t border-[var(--border)]">
            <Timer size={10} className="text-blue-400" aria-hidden="true"/>
            <span className="text-[10px] text-blue-400 font-medium">{fmtHours(rangeTotalTime)} registradas</span>
            <span className="text-[10px] text-[var(--af-text3)]">({rangeTimeEntriesLength} entradas)</span>
          </div>
        )}
      </div>
      {/* Task distribution legend */}
      {taskStatusData.length > 0 && (
        <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-3 pt-3 border-t border-[var(--border)] justify-center">
          {taskStatusData.map((d: { name: string; value: number }, i: number) => (
            <div key={i} className="flex items-center gap-1 text-[10px]">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="text-[var(--muted-foreground)]">{d.name}</span>
              <span className="font-semibold">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
