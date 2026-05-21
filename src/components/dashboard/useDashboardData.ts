'use client';
import { useMemo, useState } from 'react';
import { startOfWeek, startOfMonth, startOfQuarter, startOfYear } from 'date-fns';
import { useApp } from '@/contexts/AppContext';
import { useTimeTrackingContext } from '@/hooks/useTimeTracking';
import { useNotificationsContext } from '@/hooks/useNotifications';
import { useInventoryContext } from '@/hooks/useInventory';
import type { Task, Expense, Invoice, TimeEntry, RFI, Submittal, PunchItem, Meeting, Approval, TeamUser, NotifEntry, Project, FirestoreTimestamp } from '@/lib/types';
import { toDate } from '@/lib/types';
import { getWeekDates, agendaDateKey } from './agenda-helpers';
import { isOverdue as checkOverdue } from '@/lib/kanban-helpers';

export const CHART_COLORS = ['#d4b87a', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6', '#ec4899'];

export function useDashboardData() {
  const {
    loading, projects, tasks, pendingCount, navigateTo, openProject, getUserName,
    activeTasks, completedTasks, expenses, teamUsers, authUser,
    showToast, visibleProjects, companies, meetings,
    rfis, submittals, punchItems, overdueTasks, userName,
    approvals, dailyLogs, openModal, setForms, suppliers,
  } = useApp();
  const { invoices, timeEntries, timeSession } = useTimeTrackingContext();
  const { unreadCount, notifHistory } = useNotificationsContext();
  const { invLowStock, invAlerts } = useInventoryContext();

  // ─── Date Range State ───
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year' | 'custom'>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    let start: Date, end: Date = now;
    switch (dateRange) {
      case 'week':
        start = startOfWeek(now, { weekStartsOn: 1 });
        break;
      case 'month':
        start = startOfMonth(now);
        break;
      case 'quarter':
        start = startOfQuarter(now);
        break;
      case 'year':
        start = startOfYear(now);
        break;
      case 'custom':
        start = customStart ? new Date(customStart + 'T00:00:00') : startOfMonth(now);
        end = customEnd ? new Date(customEnd + 'T23:59:59') : now;
        break;
    }
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }, [dateRange, customStart, customEnd]);

  // Helper: check if a date string falls within the selected range
  const inRange = (dateStr: string | undefined | null) => {
    if (!dateStr) return false;
    return dateStr >= startDate && dateStr <= endDate;
  };

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const todayOnly = new Date(new Date().toDateString());

  // ─── Computed data (filtered by date range) ───
  const rangeTasks = useMemo(() => tasks.filter((t: Task) => inRange(t.data.dueDate) || (t.data.status === 'Completado' && t.data.updatedAt && inRange(toDate(t.data.updatedAt).toISOString().split('T')[0])) || (t.data.createdAt && inRange(toDate(t.data.createdAt).toISOString().split('T')[0]))), [tasks, startDate, endDate]);
  const rangeExpenses = useMemo(() => expenses.filter((e: Expense) => inRange(e.data.date)), [expenses, startDate, endDate]);
  const rangeInvoices = useMemo(() => invoices.filter((inv: Invoice) => inRange(inv.data.issueDate)), [invoices, startDate, endDate]);
  const rangeTimeEntries = useMemo(() => timeEntries.filter((te: TimeEntry) => inRange(te.data.date)), [timeEntries, startDate, endDate]);
  const totalExpenses = useMemo(() => rangeExpenses.reduce((s: number, e: Expense) => s + (Number(e.data.amount) || 0), 0), [rangeExpenses]);
  const totalInvoiced = useMemo(() => rangeInvoices.reduce((s: number, inv: Invoice) => s + (Number(inv.data.total) || 0), 0), [rangeInvoices]);
  const totalPaid = useMemo(() => rangeInvoices.filter((i: Invoice) => i.data.status === 'Pagada').reduce((s: number, i: Invoice) => s + (Number(i.data.total) || 0), 0), [rangeInvoices]);
  const overdueCount = overdueTasks.filter((t: Task) => inRange(t.data.dueDate)).length;

  // Quick access metrics
  const openRFIs = useMemo(() => rfis.filter((r: RFI) => (r.data.status === 'Abierto' || r.data.status === 'En revisión') && inRange(r.data.dueDate)).length, [rfis, startDate, endDate]);
  const pendingSubmittals = useMemo(() => submittals.filter((s: Submittal) => s.data.status === 'En revisión' && s.data.createdAt && inRange(toDate(s.data.createdAt).toISOString().split('T')[0])).length, [submittals, startDate, endDate]);
  const openPunchItems = useMemo(() => punchItems.filter((p: PunchItem) => p.data.status === 'Pendiente' && p.data.createdAt && inRange(toDate(p.data.createdAt).toISOString().split('T')[0])).length, [punchItems, startDate, endDate]);
  const overdueRFIs = useMemo(() => rfis.filter((r: RFI) => r.data.dueDate && r.data.status !== 'Cerrado' && r.data.status !== 'Respondido' && checkOverdue(r.data.dueDate) && inRange(r.data.dueDate)).length, [rfis, startDate, endDate]);
  const execProjects = useMemo(() => projects.filter((p: Project) => p.data.status === 'Ejecucion').length, [projects]);

  // Today's meetings
  const todayMeetings = useMemo(() => meetings.filter((m: Meeting) => m.data.date === todayStr).sort((a: Meeting, b: Meeting) => (a.data.time || '').localeCompare(b.data.time || '')), [meetings, todayStr]);

  // Tasks due today (not completed)
  const todayDueTasks = useMemo(() => tasks.filter((t: Task) => t.data.dueDate === todayStr && t.data.status !== 'Completado'), [tasks, todayStr]);

  // Range-filtered KPI counts
  const rangeCompletedTasks = useMemo(() => rangeTasks.filter((t: Task) => t.data.status === 'Completado').length, [rangeTasks]);
  const rangeActiveTasks = useMemo(() => rangeTasks.filter((t: Task) => t.data.status === 'En progreso' || t.data.status === 'Revision').length, [rangeTasks]);
  const rangeTotalTime = useMemo(() => rangeTimeEntries.reduce((s: number, te: TimeEntry) => s + (te.data.duration || 0), 0), [rangeTimeEntries]);

  // Pending approvals
  const pendingApprovals = useMemo(() => approvals.filter((a: Approval) => a.data.status === 'Pendiente').length, [approvals]);

  // Time formatting helper
  const fmtHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // Overdue invoices count
  const overdueInvoices = useMemo(() => invoices.filter((inv: Invoice) => {
    if (inv.data.status !== 'Enviada' || !inv.data.dueDate) return false;
    return checkOverdue(inv.data.dueDate);
  }).length, [invoices]);

  // Total budget across all projects
  const totalBudget = useMemo(() => projects.reduce((s: number, p: Project) => s + (p.data.budget || 0), 0), [projects]);

  // Tasks due this week (within 7 days, not completed, not overdue)
  const weekTasks = useMemo(() => tasks.filter((t: Task) => {
    if (!t.data.dueDate || t.data.status === 'Completado') return false;
    const diff = Math.ceil((new Date(t.data.dueDate).getTime() - today.getTime()) / 86400000);
    return diff >= 0 && diff <= 7;
  }), [tasks, today]);

  // Revenue trend (last 6 months)
  const revenueTrend = useMemo(() => {
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const data: { name: string; facturado: number; cobrado: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthInvoiced = invoices.filter((inv: Invoice) => inv.data.issueDate && inv.data.status !== 'Cancelada' && inv.data.issueDate.startsWith(key)).reduce((s, inv) => s + (inv.data.total || 0), 0);
      const monthPaid = invoices.filter((inv: Invoice) => inv.data.paidDate).reduce((s, inv: Invoice) => {
        try { const pd = toDate(inv.data.paidDate); return `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}` === key ? s + (inv.data.total || 0) : s; } catch { return s; }
      }, 0);
      data.push({ name: monthNames[d.getMonth()], facturado: monthInvoiced, cobrado: monthPaid });
    }
    return data;
  }, [invoices]);

  // Team workload (filtered by range)
  const teamWorkload = useMemo(() => {
    const byUser: Record<string, { total: number; active: number; done: number }> = {};
    teamUsers.forEach(u => { byUser[u.id] = { total: 0, active: 0, done: 0 }; });
    rangeTasks.forEach((t: Task) => {
      if (t.data.assigneeId && byUser[t.data.assigneeId]) {
        byUser[t.data.assigneeId].total++;
        if (t.data.status === 'En progreso' || t.data.status === 'Revision') byUser[t.data.assigneeId].active++;
        if (t.data.status === 'Completado') byUser[t.data.assigneeId].done++;
      }
    });
    return Object.entries(byUser).filter(([_, v]) => v.total > 0).sort((a, b) => b[1].active - a[1].active).slice(0, 8).map(([uid, data]) => {
      const user = teamUsers.find((u: TeamUser) => u.id === uid);
      return { name: (user?.data.name || 'Sin nombre').split(' ')[0], activas: data.active, completadas: data.done, pendientes: data.total - data.active - data.done };
    });
  }, [rangeTasks, teamUsers]);

  // Task status distribution (for donut, filtered by range)
  const taskStatusData = useMemo(() => {
    const statuses: Record<string, number> = {};
    rangeTasks.forEach((t: Task) => { statuses[t.data.status] = (statuses[t.data.status] || 0) + 1; });
    return Object.entries(statuses).map(([name, value]) => ({ name, value }));
  }, [rangeTasks]);

  // Recent activity
  const recentActivity = useMemo(() => {
    const items: { id: string; type: string; title: string; subtitle: string; time: FirestoreTimestamp | undefined; icon: string; color: string }[] = [];
    tasks.filter((t: Task) => t.data.status === 'Completado' && t.data.updatedAt).slice(0, 4).forEach((t: Task) => {
      const proj = projects.find((p: Project) => p.id === t.data.projectId);
      items.push({ id: t.id, type: 'task', title: t.data.title, subtitle: `Completada · ${proj?.data?.name || ''}`, time: t.data.updatedAt, icon: '✓', color: 'bg-emerald-500' });
    });
    rfis.filter((r: RFI) => r.data.status !== 'Cerrado').slice(0, 3).forEach((r: RFI) => {
      const proj = projects.find((p: Project) => p.id === r.data.projectId);
      items.push({ id: r.id, type: 'rfi', title: r.data.subject || r.data.number, subtitle: `RFI ${r.data.status} · ${proj?.data?.name || ''}`, time: r.data.createdAt, icon: '?', color: 'bg-blue-500' });
    });
    submittals.filter((s: Submittal) => s.data.status === 'En revisión').slice(0, 2).forEach((s: Submittal) => {
      const proj = projects.find((p: Project) => p.id === s.data.projectId);
      items.push({ id: s.id, type: 'submittal', title: s.data.title || s.data.number, subtitle: `Submittal en revisión · ${proj?.data?.name || ''}`, time: s.data.createdAt, icon: '📋', color: 'bg-purple-500' });
    });
    punchItems.filter((p: PunchItem) => p.data.status !== 'Completado').slice(0, 2).forEach((p: PunchItem) => {
      items.push({ id: p.id, type: 'punch', title: p.data.title, subtitle: `Punch ${p.data.status} · ${p.data.location || ''}`, time: p.data.createdAt, icon: '✅', color: 'bg-teal-500' });
    });
    items.sort((a, b) => {
      const ta = a.time ? toDate(a.time) : new Date(0);
      const tb = b.time ? toDate(b.time) : new Date(0);
      return tb.getTime() - ta.getTime();
    });
    return items.slice(0, 8);
  }, [tasks, projects, rfis, submittals, punchItems]);

  // Unread notifications (most recent first)
  const unreadNotifs = useMemo(() => notifHistory.filter((n: NotifEntry) => !n.read).slice(0, 5), [notifHistory]);
  const readNotifs = useMemo(() => notifHistory.filter((n: NotifEntry) => n.read).slice(0, 3), [notifHistory]);

  // Greeting based on time of day
  const greeting = useMemo(() => {
    const h = today.getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  }, []);

  // Date formatted in Spanish
  const dateFormatted = today.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ─── Weekly Agenda Data ───
  const agendaTasks = useMemo(() =>
    (tasks || []).filter((t: Task) => t.data.agendaMeta),
    [tasks]
  );
  const agendaWeekDates = useMemo(() => getWeekDates(new Date()), []);
  const agendaWeekLabel = useMemo(() => {
    const start = agendaWeekDates[0];
    const end = agendaWeekDates[6];
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    return `${start.toLocaleDateString('es-CO', opts)} — ${end.toLocaleDateString('es-CO', opts)}`;
  }, [agendaWeekDates]);
  const agendaTodayKey = agendaDateKey(new Date());
  const agendaProjectMap = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach((p: Project) => { m[p.id] = p.data.name; });
    return m;
  }, [projects]);
  const agendaOccupiedSlots = useMemo(() => {
    const s = new Set<string>();
    agendaTasks.forEach((t: Task) => {
      const meta = t.data.agendaMeta;
      if (!meta) return;
      meta.hourSlots.forEach((h: number) => s.add(`${meta.dayKey}:${h}`));
    });
    return s;
  }, [agendaTasks]);
  const agendaTasksByDayAndStartHour = useMemo(() => {
    const map: Record<string, Task[]> = {};
    agendaTasks.forEach((t: Task) => {
      const meta = t.data.agendaMeta;
      if (!meta || !meta.hourSlots.length) return;
      const firstHour = Math.min(...meta.hourSlots);
      const key = `${meta.dayKey}:${firstHour}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [agendaTasks]);
  const agendaTaskStartHoursByDay = useMemo(() => {
    const map: Record<string, Set<number>> = {};
    agendaTasks.forEach((t: Task) => {
      const meta = t.data.agendaMeta;
      if (!meta || !meta.hourSlots.length) return;
      if (!map[meta.dayKey]) map[meta.dayKey] = new Set();
      map[meta.dayKey].add(Math.min(...meta.hourSlots));
    });
    return map;
  }, [agendaTasks]);

  return {
    // From contexts
    loading,
    projects,
    tasks,
    pendingCount,
    navigateTo,
    openProject,
    getUserName,
    activeTasks,
    completedTasks,
    expenses,
    teamUsers,
    authUser,
    showToast,
    visibleProjects,
    companies,
    meetings,
    rfis,
    submittals,
    punchItems,
    overdueTasks,
    userName,
    approvals,
    dailyLogs,
    openModal,
    setForms,
    suppliers,
    invoices,
    timeEntries,
    timeSession,
    unreadCount,
    notifHistory,
    invLowStock,
    invAlerts,

    // Date range
    dateRange,
    setDateRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    startDate,
    endDate,

    // Computed
    today,
    todayStr,
    todayOnly,
    rangeTasks,
    rangeExpenses,
    rangeInvoices,
    rangeTimeEntries,
    totalExpenses,
    totalInvoiced,
    totalPaid,
    overdueCount,
    openRFIs,
    pendingSubmittals,
    openPunchItems,
    overdueRFIs,
    execProjects,
    todayMeetings,
    todayDueTasks,
    rangeCompletedTasks,
    rangeActiveTasks,
    rangeTotalTime,
    pendingApprovals,
    fmtHours,
    overdueInvoices,
    totalBudget,
    weekTasks,
    revenueTrend,
    teamWorkload,
    taskStatusData,
    recentActivity,
    unreadNotifs,
    readNotifs,
    greeting,
    dateFormatted,

    // Agenda
    agendaTasks,
    agendaWeekDates,
    agendaWeekLabel,
    agendaTodayKey,
    agendaProjectMap,
    agendaOccupiedSlots,
    agendaTasksByDayAndStartHour,
    agendaTaskStartHoursByDay,
  };
}
