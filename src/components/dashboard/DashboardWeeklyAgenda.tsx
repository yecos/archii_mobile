'use client';
import React from 'react';
import { CalendarDays, ChevronRight, Clock, FolderKanban } from 'lucide-react';
import { agendaDateKey, AGENDA_DAY_NAMES, AGENDA_HOURS, AGENDA_SLOT_H, AGENDA_PRIO_COLORS, agendaFormatHour, agendaFormatHourRange, agendaFmtDay } from './agenda-helpers';
import type { Task } from '@/lib/types';

interface DashboardWeeklyAgendaProps {
  agendaTasks: Task[];
  agendaWeekDates: Date[];
  agendaWeekLabel: string;
  agendaTodayKey: string;
  agendaProjectMap: Record<string, string>;
  agendaOccupiedSlots: Set<string>;
  agendaTasksByDayAndStartHour: Record<string, Task[]>;
  agendaTaskStartHoursByDay: Record<string, Set<number>>;
  navigateTo: (screen: string) => void;
}

export default function DashboardWeeklyAgenda({
  agendaTasks, agendaWeekDates, agendaWeekLabel, agendaTodayKey,
  agendaProjectMap, agendaOccupiedSlots, agendaTasksByDayAndStartHour,
  agendaTaskStartHoursByDay, navigateTo,
}: DashboardWeeklyAgendaProps) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-[var(--af-accent)]" aria-hidden="true"/>
          <h3 className="text-[14px] sm:text-[15px] font-semibold">Agenda Semanal</h3>
          <span className="text-[11px] text-[var(--muted-foreground)] hidden sm:inline">{agendaWeekLabel}</span>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-[var(--border)] bg-[var(--af-bg3)] text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
          onClick={() => navigateTo('weeklyAgenda')}
        >
          Ver agenda completa <ChevronRight size={12} aria-hidden="true"/>
        </button>
      </div>

      {/* Agenda Grid */}
      <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '48px repeat(7, minmax(110px, 1fr))',
          border: '1.5px solid var(--border)',
          borderRadius: '10px',
          overflow: 'hidden',
          background: 'var(--card)',
          minWidth: '700px',
        }}>
          {/* Column Headers */}
          <div style={{ background: 'var(--af-bg3)', borderBottom: '1.5px solid var(--border)', borderRight: '1px solid var(--border)' }} />
          {agendaWeekDates.map((d, i) => {
            const dk = agendaDateKey(d);
            const isToday = dk === agendaTodayKey;
            return (
              <div key={dk} style={{
                background: isToday ? 'var(--primary)' : 'var(--af-bg3)',
                borderBottom: '1.5px solid var(--border)',
                borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                color: isToday ? 'var(--primary-foreground)' : 'var(--foreground)',
                padding: '6px 4px',
                textAlign: 'center',
              }}>
                <div style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {AGENDA_DAY_NAMES[i]}
                </div>
                <div style={{ fontSize: '10px', marginTop: 1, color: isToday ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}>
                  {agendaFmtDay(d)}
                </div>
              </div>
            );
          })}

          {/* Time Rows */}
          {AGENDA_HOURS.map(hour => (
            <React.Fragment key={hour}>
              {/* Time label */}
              <div style={{
                background: 'var(--af-bg3)',
                borderRight: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                padding: '2px 4px',
                textAlign: 'right',
                fontSize: '10px',
                color: 'var(--muted-foreground)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'flex-end',
                height: `${AGENDA_SLOT_H}px`,
              }}>
                {agendaFormatHour(hour)}
              </div>

              {/* Day cells */}
              {agendaWeekDates.map((d, di) => {
                const dk = agendaDateKey(d);
                const isToday = dk === agendaTodayKey;
                const isOccupied = agendaOccupiedSlots.has(`${dk}:${hour}`);
                const isTaskStart = agendaTaskStartHoursByDay[dk]?.has(hour);
                const tasksStarting = isTaskStart ? (agendaTasksByDayAndStartHour[`${dk}:${hour}`] || []) : [];

                return (
                  <div
                    key={dk}
                    style={{
                      borderRight: di < 6 ? '1px solid var(--border)' : 'none',
                      borderBottom: '1px solid var(--border)',
                      minHeight: `${AGENDA_SLOT_H}px`,
                      height: `${AGENDA_SLOT_H}px`,
                      background: isOccupied
                        ? 'var(--af-bg3)'
                        : isToday
                          ? 'var(--accent)'
                          : 'var(--card)',
                      position: 'relative' as const,
                      cursor: 'pointer',
                      overflow: isTaskStart ? ('visible' as const) : ('hidden' as const),
                    }}
                    className="group/agenda-slot"
                    onClick={() => navigateTo('weeklyAgenda')}
                  >
                    {/* Render tall activity blocks at their start hour */}
                    {tasksStarting.map((task: Task) => {
                      const meta = task.data.agendaMeta;
                      if (!meta) return null;
                      const minH = Math.min(...meta.hourSlots);
                      const maxH = Math.max(...meta.hourSlots);
                      const spanCount = maxH - minH + 1;
                      const blockHeight = spanCount * AGENDA_SLOT_H;
                      const pc = AGENDA_PRIO_COLORS[task.data.priority] || AGENDA_PRIO_COLORS['Media'];

                      return (
                        <div
                          key={task.id}
                          className={`${pc.bg} ${pc.border}`}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 2,
                            right: 2,
                            height: `${blockHeight - 4}px`,
                            borderLeftWidth: '3px',
                            borderLeftStyle: 'solid',
                            borderRadius: '6px',
                            padding: '3px 5px',
                            fontSize: '10px',
                            lineHeight: 1.3,
                            cursor: 'pointer',
                            zIndex: 10,
                            overflow: 'hidden',
                          }}
                          onClick={(e) => { e.stopPropagation(); navigateTo('weeklyAgenda'); }}
                        >
                          {/* Title + priority dot */}
                          <div className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${pc.dot} flex-shrink-0`} />
                            <span style={{ fontWeight: 600, color: 'var(--foreground)' }} className="truncate text-[10px]">
                              {task.data.title}
                            </span>
                          </div>

                          {/* Time range */}
                          <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted-foreground)', fontSize: '10px' }}>
                            <Clock className="w-2.5 h-2.5" aria-hidden="true"/>
                            <span>{agendaFormatHourRange(meta.hourSlots)}</span>
                          </div>

                          {/* Project */}
                          {task.data.projectId && (
                            <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted-foreground)', fontSize: '10px' }}>
                              <FolderKanban className="w-2.5 h-2.5" aria-hidden="true"/>
                              <span className="truncate">{agendaProjectMap[task.data.projectId] || '—'}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {agendaTasks.length === 0 && (
        <div className="text-center py-6 text-[var(--af-text3)]">
          <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" aria-hidden="true"/>
          <div className="text-sm">Sin actividades en la agenda</div>
          <div className="text-[11px] text-[var(--muted-foreground)] mt-1">Ve a la agenda semanal para crear actividades</div>
        </div>
      )}
    </div>
  );
}
