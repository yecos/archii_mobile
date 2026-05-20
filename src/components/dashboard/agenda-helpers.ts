// ─── Weekly Agenda Helpers ───

export function getWeekDates(baseDate: Date): Date[] {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd;
  });
}

export function agendaDateKey(d: Date): string { return d.toISOString().slice(0, 10); }

export const AGENDA_DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const AGENDA_HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8..17
export const AGENDA_SLOT_H = 44; // compact height

export const AGENDA_PRIO_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  'Alta':    { bg: 'bg-red-500/10 dark:bg-red-500/15', border: 'border-l-red-500', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  'Media':   { bg: 'bg-amber-500/10 dark:bg-amber-500/15', border: 'border-l-amber-500', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  'Baja':    { bg: 'bg-emerald-500/10 dark:bg-emerald-500/15', border: 'border-l-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  'Crítica': { bg: 'bg-purple-500/10 dark:bg-purple-500/15', border: 'border-l-purple-500', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500' },
};

export function agendaFormatHour(h: number): string {
  if (h === 0 || h === 12) return h === 0 ? '12am' : '12pm';
  return h > 12 ? `${h - 12}pm` : `${h}am`;
}

export function agendaFormatHourRange(hours: number[]): string {
  if (!hours.length) return '';
  const min = Math.min(...hours);
  const max = Math.max(...hours);
  return `${agendaFormatHour(min)} - ${agendaFormatHour(max + 1)}`;
}

export function agendaFmtDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
