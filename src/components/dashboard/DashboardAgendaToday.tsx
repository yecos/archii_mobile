'use client';
import React from 'react';
import { CalendarDays, AlertTriangle, Timer, ChevronRight } from 'lucide-react';
import { prioColor } from '@/lib/helpers';
import type { Task, Meeting, Project } from '@/lib/types';

interface DashboardAgendaTodayProps {
  overdueTasks: Task[];
  overdueCount: number;
  todayMeetings: Meeting[];
  todayDueTasks: Task[];
  todayOnly: Date;
  projects: Project[];
  navigateTo: (screen: string) => void;
}

export default function DashboardAgendaToday({
  overdueTasks, overdueCount, todayMeetings, todayDueTasks, todayOnly, projects, navigateTo,
}: DashboardAgendaTodayProps) {
  return (
    <div className="lg:col-span-3 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[14px] sm:text-[15px] font-semibold flex items-center gap-2">
          <CalendarDays size={16} className="text-[var(--af-accent)]" aria-hidden="true"/>
          Agenda de Hoy
          <button className="text-[10px] text-[var(--af-accent)] cursor-pointer hover:underline ml-1" onClick={() => navigateTo('weeklyAgenda')}>Ver agenda completa →</button>
        </div>
        <button className="text-[10px] text-[var(--af-accent)] cursor-pointer hover:underline flex items-center gap-1" onClick={() => navigateTo('calendar')}>
          Calendario <ChevronRight size={12} aria-hidden="true"/>
        </button>
      </div>

      {todayMeetings.length === 0 && todayDueTasks.length === 0 && overdueCount === 0 ? (
        <div className="text-center py-8 text-[var(--af-text3)]">
          <div className="text-3xl mb-2">🏖️</div>
          <div className="text-sm">Sin actividades para hoy</div>
          <div className="text-[11px] text-[var(--muted-foreground)] mt-1">Tu día está libre o todo está al día</div>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
          {/* Overdue tasks (urgent, show first) */}
          {overdueCount > 0 && (
            <div className="mb-1">
              <div className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <AlertTriangle size={10} aria-hidden="true"/> {overdueCount} vencida{overdueCount !== 1 ? 's' : ''}
              </div>
              <div className="space-y-1">
                {overdueTasks.slice(0, 4).map((t: Task) => {
                  const proj = projects.find((p: Project) => p.id === t.data.projectId);
                  const daysOver = Math.floor((todayOnly.getTime() - new Date(t.data.dueDate).getTime()) / 86400000);
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-red-500/5 border border-red-500/15 cursor-pointer hover:bg-red-500/10 transition-colors" onClick={() => navigateTo('tasks')}>
                      <div className="w-6 h-6 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 text-[10px]">⚡</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium truncate">{t.data.title}</div>
                        <div className="text-[10px] text-[var(--af-text3)]">{proj?.data?.name || ''} · Venció hace {daysOver}d</div>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${prioColor(t.data.priority)}`}>{t.data.priority}</span>
                    </div>
                  );
                })}
                {overdueCount > 4 && <div className="text-[10px] text-red-400/70 pl-9">+{overdueCount - 4} más</div>}
              </div>
            </div>
          )}

          {/* Today's meetings */}
          {todayMeetings.length > 0 && (
            <div className="mb-1">
              <div className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <CalendarDays size={10} aria-hidden="true"/> {todayMeetings.length} reunión{todayMeetings.length !== 1 ? 'es' : ''}
              </div>
              <div className="space-y-1">
                {todayMeetings.map((m: Meeting) => {
                  const proj = projects.find((p: Project) => p.id === m.data.projectId);
                  return (
                    <div key={m.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-purple-500/5 border border-purple-500/15 cursor-pointer hover:bg-purple-500/10 transition-colors" onClick={() => navigateTo('calendar')}>
                      <div className="w-6 h-6 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 text-[10px] font-bold">{m.data.time ? m.data.time.split(':')[0] : '📅'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium truncate">{m.data.title}</div>
                        <div className="text-[10px] text-[var(--af-text3)]">{proj?.data?.name || ''} · {m.data.time || '09:00'} · {m.data.duration || 60}min</div>
                      </div>
                      {m.data.attendees && Array.isArray(m.data.attendees) && m.data.attendees.length > 0 && (
                        <span className="text-[10px] text-[var(--af-text3)] flex-shrink-0">👥 {m.data.attendees.length}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tasks due today */}
          {todayDueTasks.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Timer size={10} aria-hidden="true"/> {todayDueTasks.length} vence{todayDueTasks.length !== 1 ? 'n' : ''} hoy
              </div>
              <div className="space-y-1">
                {todayDueTasks.map((t: Task) => {
                  const proj = projects.find((p: Project) => p.id === t.data.projectId);
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-amber-500/5 border border-amber-500/15 cursor-pointer hover:bg-amber-500/10 transition-colors" onClick={() => navigateTo('tasks')}>
                      <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 text-[10px]">📝</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium truncate">{t.data.title}</div>
                        <div className="text-[10px] text-[var(--af-text3)]">{proj?.data?.name || ''} · {t.data.status}</div>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${prioColor(t.data.priority)}`}>{t.data.priority}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
