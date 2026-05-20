'use client';
import React, { useState, useRef, useCallback, useMemo } from 'react';
import type { Task, Project } from '@/lib/types';
import { toDate } from '@/lib/types';
import { useApp } from '@/contexts/AppContext';
import { useTimeTrackingContext } from '@/hooks/useTimeTracking';
import { SkeletonTasks } from '@/components/ui/SkeletonLoaders';
import { fmtDate, getInitials, prioColor, taskStColor, avatarColor } from '@/lib/helpers';
import { isOverdue as checkOverdue } from '@/lib/kanban-helpers';
import { LayoutList, KanbanSquare, Plus, GripVertical, X, Search, Filter, Download, Calendar, CalendarDays, User, Pencil, Trash2, ChevronDown, Layers, FileText, BarChart3, CheckCircle2, AlertTriangle, Clock, TrendingUp, Users, Tag, Target, Eye, EyeOff, Archive, ChevronRight } from 'lucide-react';
import { exportTasksExcel } from '@/lib/export-excel';
import { exportTasksPDF } from '@/lib/export-pdf';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';
import { OverflowMenu } from '@/components/ui/OverflowMenu';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const KANBAN_COLS = [
  { status: 'Por hacer', color: 'bg-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/30', dot: 'bg-slate-400' },
  { status: 'En progreso', color: 'bg-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30', dot: 'bg-blue-500' },
  { status: 'Revision', color: 'bg-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  { status: 'Completado', color: 'bg-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
];

const STATUS_CHART_COLORS: Record<string, string> = {
  'Por hacer': '#94a3b8',
  'En progreso': '#3b82f6',
  'Revision': '#f59e0b',
  'Completado': '#10b981',
};

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function ChartTooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ name?: string; value: number; dataKey?: string }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-lg text-[12px]">
      <div className="font-semibold">{payload[0].name || payload[0].dataKey}</div>
      <div className="text-[var(--af-accent)]">{payload[0].value}</div>
    </div>
  );
}

function StatusPieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-lg text-[12px]">
      <div className="font-semibold">{payload[0].name}</div>
      <div className="text-[var(--af-accent)]">{payload[0].value} tareas</div>
    </div>
  );
}

function getAssigneeIds(t: Task): string[] {
  if (Array.isArray(t.data.assigneeIds) && t.data.assigneeIds.length > 0) return t.data.assigneeIds;
  if (t.data.assigneeId) return [t.data.assigneeId];
  return [];
}

function formatHourSlots(slots: number[]): string {
  if (!slots || slots.length === 0) return '';
  const min = Math.min(...slots);
  const max = Math.max(...slots);
  const fmt = (h: number) => `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`;
  return slots.length === 1 ? fmt(min) : `${fmt(min)}-${fmt(max)}`;
}

function AssigneeAvatars({ task, getUserName, size = 'sm' }: { task: Task; getUserName: (uid: string) => string; size?: 'sm' | 'md' }) {
  const ids = getAssigneeIds(task);
  if (ids.length === 0) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-[var(--af-text3)]">
        <User size={10} aria-hidden="true"/> Sin asignar
      </div>
    );
  }
  const isSmall = size === 'sm';
  return (
    <div className="flex items-center gap-1">
      <div className="flex -space-x-1">
        {ids.slice(0, 3).map((uid: string) => (
          <span
            key={uid}
            className={`${isSmall ? 'w-4 h-4 text-[7px]' : 'w-5 h-5 text-[8px]'} rounded-full font-semibold flex items-center justify-center ring-1 ring-[var(--card)] ${avatarColor(uid)}`}
            title={getUserName(uid)}
          >
            {getInitials(getUserName(uid))}
          </span>
        ))}
      </div>
      {ids.length > 3 && (
        <span className={`text-[var(--af-text3)] ${isSmall ? 'text-[10px]' : 'text-[11px]'}`}>
          +{ids.length - 3}
        </span>
      )}
      {ids.length <= 3 && (
        <span className={`text-[var(--af-text3)] truncate ${isSmall ? 'text-[10px] max-w-[80px]' : 'text-[11px] max-w-[100px]'}`}>
          {ids.map((uid: string) => getUserName(uid)).join(', ')}
        </span>
      )}
    </div>
  );
}

export default function TasksScreen() {
  const {
    changeTaskStatus, deleteTask, forms, getUserName, loading,
    openEditTask, openModal, projects, setForms, tasks,
    showToast, teamUsers, toggleTask,
    getPhaseName, loadPhasesForProject, projectPhasesCache, authUser,
  } = useApp();
  const { timeEntries } = useTimeTrackingContext();

  const confirmDialog = useConfirmDialog();

  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterPhase, setFilterPhase] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [kanbanCompletedCollapsed, setKanbanCompletedCollapsed] = useState(false);

  // Pick up incoming status/assignee filter set by navigation (e.g. from ProfileScreen)
  React.useEffect(() => {
    const incoming = forms.taskFilterStatus;
    if (incoming) { setFilterStatus(incoming); setForms((p: Record<string, any>) => ({ ...p, taskFilterStatus: '' })); }
    const incomingAssignee = forms.taskFilterAssignee;
    if (incomingAssignee) { setFilterAssignee(incomingAssignee); setForms((p: Record<string, any>) => ({ ...p, taskFilterAssignee: '' })); }
  }, []);
  const dragCounterRef = useRef<Record<string, number>>({});

  const taskFilterProject = forms.taskFilterProject || '';

  const handleNewTask = () => {
    setForms((p: Record<string, any>) => ({ ...p, taskTitle: '', taskAssignees: [], taskDue: new Date().toISOString().split('T')[0], taskStatus: 'Por hacer', taskTags: [], taskEstimatedHours: null }));
    openModal('task');
  };

  const handleNewTaskInColumn = (status: string) => {
    setForms((p: Record<string, any>) => ({ ...p, taskTitle: '', taskAssignees: [], taskDue: new Date().toISOString().split('T')[0], taskStatus: status, taskProject: taskFilterProject, taskTags: [], taskEstimatedHours: null }));
    openModal('task');
  };

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    setDragTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    try { (e.target as HTMLElement).style.opacity = '0.4'; } catch {}
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDragTaskId(null);
    setDragOverCol(null);
    dragCounterRef.current = {};
    try { (e.target as HTMLElement).style.opacity = '1'; } catch {}
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, colStatus: string) => {
    e.preventDefault();
    dragCounterRef.current[colStatus] = (dragCounterRef.current[colStatus] || 0) + 1;
    setDragOverCol(colStatus);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, colStatus: string) => {
    e.preventDefault();
    dragCounterRef.current[colStatus] = (dragCounterRef.current[colStatus] || 0) - 1;
    if (dragCounterRef.current[colStatus] <= 0) {
      dragCounterRef.current[colStatus] = 0;
      if (dragOverCol === colStatus) setDragOverCol(null);
    }
  }, [dragOverCol]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId && newStatus) {
      changeTaskStatus(taskId, newStatus);
      showToast(`Tarea movida a ${newStatus}`);
    }
    setDragTaskId(null);
    setDragOverCol(null);
    dragCounterRef.current = {};
  }, [changeTaskStatus, showToast]);

  // Multi-filter
  const filteredTasks = useMemo(() => {
    let result = taskFilterProject ? tasks.filter((t: Task) => t.data.projectId === taskFilterProject) : tasks;
    if (filterStatus) result = result.filter((t: Task) => t.data.status === filterStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t: Task) =>
        t.data.title.toLowerCase().includes(q) ||
        t.data.description?.toLowerCase().includes(q) ||
        (Array.isArray(t.data.tags) && t.data.tags.some((tag: string) => tag.toLowerCase().includes(q)))
      );
    }
    if (filterPriority) result = result.filter((t: Task) => t.data.priority === filterPriority);
    if (filterAssignee) result = result.filter((t: Task) => getAssigneeIds(t).includes(filterAssignee));
    if (filterPhase) result = result.filter((t: Task) => t.data.phaseId === filterPhase);
    if (filterDateFrom) result = result.filter((t: Task) => t.data.dueDate && t.data.dueDate >= filterDateFrom);
    if (filterDateTo) result = result.filter((t: Task) => t.data.dueDate && t.data.dueDate <= filterDateTo);
    return result;
  }, [tasks, taskFilterProject, filterStatus, searchQuery, filterPriority, filterAssignee, filterPhase, filterDateFrom, filterDateTo]);

  // Split filtered tasks into active and completed
  const activeTasks = useMemo(() => filteredTasks.filter((t: Task) => t.data.status !== 'Completado'), [filteredTasks]);
  const completedTasks = useMemo(() => {
    const ct = filteredTasks.filter((t: Task) => t.data.status === 'Completado');
    // Sort by completedAt descending (most recent first)
    return ct.sort((a: Task, b: Task) => {
      const da = a.data.completedAt ? toDate(a.data.completedAt).getTime() : 0;
      const db = b.data.completedAt ? toDate(b.data.completedAt).getTime() : 0;
      return db - da;
    });
  }, [filteredTasks]);

  // Count completed older than 30 days
  const completedOldCount = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return completedTasks.filter((t: Task) => {
      const ca = t.data.completedAt ? toDate(t.data.completedAt).getTime() : 0;
      return ca > 0 && ca < thirtyDaysAgo;
    }).length;
  }, [completedTasks]);

  // Get unique assignees for filter
  const assignees = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    tasks.forEach((t: Task) => {
      getAssigneeIds(t).forEach((uid: string) => {
        if (uid) {
          const name = getUserName(uid);
          map.set(uid, { id: uid, name });
        }
      });
    });
    return Array.from(map.values());
  }, [tasks, getUserName]);

  // Get unique phases for filter (from tasks with phaseId)
  const phaseOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    const sourceTasks = taskFilterProject ? tasks.filter((t: Task) => t.data.projectId === taskFilterProject) : tasks;
    sourceTasks.forEach((t: Task) => {
      if (t.data.phaseId && t.data.projectId) {
        const name = getPhaseName(t.data.phaseId, t.data.projectId);
        if (name) map.set(t.data.phaseId, { id: t.data.phaseId, name });
      }
    });
    return Array.from(map.values());
  }, [tasks, taskFilterProject, getPhaseName, projectPhasesCache]);

  // === KPI Calculations ===
  const kpis = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t: Task) => t.data.status === 'Completado').length;
    const inProgress = tasks.filter((t: Task) => t.data.status === 'En progreso').length;
    const overdue = tasks.filter((t: Task) => t.data.status !== 'Completado' && t.data.dueDate && checkOverdue(t.data.dueDate)).length;
    const highPrioActive = tasks.filter((t: Task) => t.data.priority === 'Alta' && t.data.status !== 'Completado').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Tasks created this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    const createdThisWeek = tasks.filter((t: Task) => {
      const created = toDate(t.data.createdAt);
      return created >= weekStart;
    }).length;

    return { total, completed, inProgress, overdue, highPrioActive, completionRate, createdThisWeek };
  }, [tasks]);

  // === Monthly trend (tasks created & completed, last 6 months) ===
  const monthlyTrend = useMemo(() => {
    const data: { name: string; creadas: number; completadas: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const created = tasks.filter((t: Task) => {
        const d = toDate(t.data.createdAt);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === key;
      }).length;
      const completed = tasks.filter((t: Task) => {
        const d = toDate(t.data.completedAt);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === key;
      }).length;
      data.push({ name: MONTHS[d.getMonth()], creadas: created, completadas: completed });
    }
    return data;
  }, [tasks]);

  // === Status distribution for pie chart ===
  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((t: Task) => {
      const s = t.data.status || 'Por hacer';
      counts[s] = (counts[s] || 0) + 1;
    });
    return KANBAN_COLS.map(col => ({
      name: col.status,
      value: counts[col.status] || 0,
      color: STATUS_CHART_COLORS[col.status],
    }));
  }, [tasks]);

  // === Per-member productivity ===
  const memberProductivity = useMemo(() => {
    const map: Record<string, { total: number; done: number; overdue: number; highPrio: number }> = {};
    tasks.forEach((t: Task) => {
      getAssigneeIds(t).forEach((uid: string) => {
        if (!uid) return;
        if (!map[uid]) map[uid] = { total: 0, done: 0, overdue: 0, highPrio: 0 };
        map[uid].total++;
        if (t.data.status === 'Completado') map[uid].done++;
        if (t.data.status !== 'Completado' && t.data.dueDate && checkOverdue(t.data.dueDate)) map[uid].overdue++;
        if (t.data.priority === 'Alta' && t.data.status !== 'Completado') map[uid].highPrio++;
      });
    });
    return Object.entries(map)
      .map(([uid, d]) => ({
        uid,
        name: getUserName(uid),
        ...d,
        pct: d.total > 0 ? Math.round((d.done / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [tasks, getUserName]);

  const hasActiveFilters = searchQuery || filterPriority || filterAssignee || filterStatus || filterPhase || filterDateFrom || filterDateTo;

  const clearFilters = () => {
    setSearchQuery('');
    setFilterPriority('');
    setFilterAssignee('');
    setFilterStatus('');
    setFilterPhase('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  // CSV Export
  const exportCSV = () => {
    const q = '"';
    const dq = '""';
    const getAssigneeNames = (t: Task): string => getAssigneeIds(t).map((uid: string) => getUserName(uid)).join(', ') || '-';
    const headers = ['Tarea', 'Proyecto', 'Prioridad', 'Estado', 'Asignado', 'Fecha Limite', 'Horas Est.', 'Subtareas', 'Etiquetas'];
    const esc = (v: string | number) => q + String(v).split(q).join(dq) + q;
    const rows = filteredTasks.map((t: Task) => {
      const sts: { text: string; done: boolean }[] = Array.isArray(t.data.subtasks) ? t.data.subtasks : [];
      const stDone = sts.filter((s: { text: string; done: boolean }) => s.done).length;
      const tags = Array.isArray(t.data.tags) ? t.data.tags.join(', ') : '-';
      return [
        t.data.title,
        projects.find((p: Project) => p.id === t.data.projectId)?.data?.name || '-',
        t.data.priority,
        t.data.status,
        getAssigneeNames(t),
        t.data.dueDate || '-',
        t.data.estimatedHours || '-',
        sts.length > 0 ? `${stDone}/${sts.length}` : '-',
        tags,
      ];
    });
    const csv = [headers, ...rows].map((r: (string | number)[]) => r.map(esc).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'tareas_' + new Date().toISOString().split('T')[0] + '.csv'; a.click(); URL.revokeObjectURL(url);
    showToast('Tareas exportadas a CSV');
  };

  const viewMode = forms.taskView || 'list';

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle2 size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Tareas
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{activeTasks.length} activas{completedTasks.length > 0 ? ` · ${completedTasks.length} completadas` : ''}{filteredTasks.length !== tasks.length ? ` · ${filteredTasks.length} filtradas` : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Export buttons */}
          <button
            className="hidden md:flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-colors"
            onClick={() => { try { exportTasksPDF({ tasks: filteredTasks, projects, teamUsers }); showToast('Tareas PDF descargado'); } catch { showToast('Error al generar PDF', 'error'); } }}
          >
            <FileText size={14} aria-hidden="true"/> PDF
          </button>
          <button
            className="hidden sm:flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-colors"
            onClick={() => { try { exportTasksExcel(filteredTasks, projects, teamUsers); showToast('Tareas Excel descargado'); } catch { showToast('Error al generar Excel', 'error'); } }}
          >
            <Download size={14} aria-hidden="true"/> Excel
          </button>
          <button
            className="hidden sm:flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-colors"
            onClick={exportCSV}
          >
            <Download size={14} aria-hidden="true"/> CSV
          </button>
          {/* Historial button - quick access to completed tasks */}
          {completedTasks.length > 0 && (
            <button
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium cursor-pointer border transition-colors ${showCompleted ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)] hover:bg-[var(--af-bg3)] hover:text-[var(--foreground)]'}`}
              onClick={() => setShowCompleted(!showCompleted)}
              title={showCompleted ? 'Ocultar completadas' : 'Ver historial de completadas'}
            >
              {showCompleted ? <EyeOff size={14} aria-hidden="true"/> : <Archive size={14} aria-hidden="true"/>}
              <span className="hidden sm:inline">Historial</span>
              <span className="sm:hidden">{completedTasks.length}</span>
              {!showCompleted && <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-full">{completedTasks.length}</span>}
            </button>
          )}
          {/* View toggle */}
          <div className="flex gap-1 bg-[var(--af-bg3)] rounded-lg p-1">
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] cursor-pointer transition-all ${viewMode === 'list' ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)]'}`}
              onClick={() => setForms((p: Record<string, any>) => ({ ...p, taskView: 'list' }))}
            >
              <LayoutList size={14} aria-hidden="true"/> Lista
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] cursor-pointer transition-all ${viewMode === 'kanban' ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)]'}`}
              onClick={() => setForms((p: Record<string, any>) => ({ ...p, taskView: 'kanban' }))}
            >
              <KanbanSquare size={14} aria-hidden="true"/> Kanban
            </button>
          </div>
          {/* New task - desktop */}
          <button
            className="hidden sm:flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors"
            onClick={handleNewTask}
          >
            <Plus size={15} aria-hidden="true"/> Nueva tarea
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-[280px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true"/>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar tarea, etiqueta..."
              className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] transition-colors"
            />
            {searchQuery && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--af-text3)] cursor-pointer" onClick={() => setSearchQuery('')}>
                <X size={12} aria-hidden="true"/>
              </button>
            )}
          </div>

          {/* Project filter */}
          <select
            className="text-[13px] bg-[var(--card)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-[var(--foreground)] outline-none cursor-pointer"
            value={taskFilterProject}
            onChange={e => setForms((p: Record<string, any>) => ({ ...p, taskFilterProject: e.target.value }))}
          >
            <option value="">Todos los proyectos</option>
            {projects.map((p: Project) => <option key={p.id} value={p.id}>{p.data.name}</option>)}
          </select>

          {/* Filter button */}
          <button
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium cursor-pointer border transition-colors ${showFilters || hasActiveFilters ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30' : 'bg-[var(--card)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--af-bg3)]'}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={14} aria-hidden="true"/>
            Filtros
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-[var(--af-accent)]" />}
          </button>
        </div>

        {showFilters && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 animate-fadeIn">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">Estado</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer">
                  <option value="">Todos</option>
                  {KANBAN_COLS.map(c => <option key={c.status} value={c.status}>{c.status}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">Prioridad</label>
                <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer">
                  <option value="">Todas</option>
                  <option value="Alta">Alta</option>
                  <option value="Media">Media</option>
                  <option value="Baja">Baja</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">Asignado</label>
                <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer">
                  <option value="">Todos</option>
                  {assignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">Fase</label>
                <select value={filterPhase} onChange={e => setFilterPhase(e.target.value)} className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer">
                  <option value="">Todas</option>
                  {phaseOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">Desde</label>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">Hasta</label>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--foreground)] outline-none cursor-pointer" />
              </div>
            </div>
            {hasActiveFilters && (
              <button className="mt-3 text-[11px] text-[var(--af-accent)] cursor-pointer hover:underline" onClick={clearFilters}>Limpiar filtros</button>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-[11px] text-[var(--muted-foreground)] mb-1">Total tareas</div>
          <div className="text-lg font-bold text-[var(--af-accent)]">{kpis.total}</div>
          <div className="text-[10px] text-[var(--muted-foreground)]">{kpis.createdThisWeek} esta semana</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-[11px] text-[var(--muted-foreground)] mb-1">Tasa de completado</div>
          <div className="text-lg font-bold flex items-center gap-1">
            <TrendingUp size={14} className={kpis.completionRate >= 50 ? 'text-emerald-400' : 'text-amber-400'} aria-hidden="true"/>
            <span className={kpis.completionRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}>{kpis.completionRate}%</span>
          </div>
          <div className="text-[10px] text-[var(--muted-foreground)]">{kpis.completed} completadas</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-[11px] text-[var(--muted-foreground)] mb-1">En progreso</div>
          <div className="text-lg font-bold text-blue-400">{kpis.inProgress}</div>
        </div>
        <div className={`bg-[var(--card)] border rounded-xl p-4 ${kpis.overdue > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-[var(--border)]'}`}>
          <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
            {kpis.overdue > 0 && <AlertTriangle size={10} className="text-red-400" aria-hidden="true"/>}
            Vencidas
          </div>
          <div className={`text-lg font-bold ${kpis.overdue > 0 ? 'text-red-400' : ''}`}>{kpis.overdue}</div>
        </div>
        <div className={`bg-[var(--card)] border rounded-xl p-4 ${kpis.highPrioActive > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-[var(--border)]'}`}>
          <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
            <Target size={10} className="text-amber-400" aria-hidden="true"/>
            Alta prioridad
          </div>
          <div className={`text-lg font-bold ${kpis.highPrioActive > 0 ? 'text-amber-400' : ''}`}>{kpis.highPrioActive}</div>
          <div className="text-[10px] text-[var(--muted-foreground)]">pendientes</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
            <Users size={10} aria-hidden="true"/>
            Equipo activo
          </div>
          <div className="text-lg font-bold">{memberProductivity.length}</div>
          <div className="text-[10px] text-[var(--muted-foreground)]">miembros con tareas</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie chart: Status distribution */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
          <div className="text-[15px] font-semibold mb-3">Distribucion por Estado</div>
          {kpis.total === 0 ? (
            <div className="text-center py-10 text-[var(--af-text3)] text-sm">Sin datos</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2} dataKey="value" stroke="none">
                    {statusDistribution.map((entry: { name: string; value: number; color: string }, i: number) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<StatusPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
                {statusDistribution.map((d: { name: string; value: number; color: string }, i: number) => (
                  <div key={i} className="flex items-center gap-1 text-[10px]">
                    <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                    <span className="text-[var(--muted-foreground)]">{d.name}</span>
                    <span className="font-semibold">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Bar chart: Monthly trend created vs completed */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[15px] font-semibold flex items-center gap-2">
              <BarChart3 size={16} className="text-[var(--af-accent)]" aria-hidden="true"/>
              Tendencia Mensual
            </div>
            <span className="text-[10px] text-[var(--muted-foreground)] px-2 py-0.5 rounded-full bg-[var(--af-bg4)]">6 meses</span>
          </div>
          {monthlyTrend.every(d => d.creadas === 0 && d.completadas === 0) ? (
            <div className="text-center py-10 text-[var(--af-text3)] text-sm">Sin datos en los ultimos 6 meses</div>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={monthlyTrend} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--af-bg4)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltipContent />} cursor={{ fill: 'rgba(200,169,110,0.06)' }} />
                <Bar dataKey="creadas" name="Creadas" fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={16} />
                <Bar dataKey="completadas" name="Completadas" fill="#10b981" radius={[3, 3, 0, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Member Productivity Section */}
      {memberProductivity.length > 0 && (
        <div>
          <div className="text-[15px] font-semibold mb-3 flex items-center gap-2">
            <Users size={16} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Productividad por Miembro
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {memberProductivity.map((m) => (
              <div key={m.uid} className={`bg-[var(--card)] border rounded-xl p-4 transition-all ${m.overdue > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-[var(--border)]'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-7 h-7 rounded-full font-semibold flex items-center justify-center text-[10px] ${avatarColor(m.uid)}`}>
                      {getInitials(m.name)}
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold">{m.name}</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">{m.total} tarea{m.total !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${m.pct >= 80 ? 'bg-emerald-500/15 text-emerald-400' : m.pct >= 50 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>
                    {m.pct}%
                  </span>
                </div>
                <div className="h-1.5 bg-[var(--af-bg4)] rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${m.pct >= 80 ? 'bg-emerald-500' : m.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${m.pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
                  <span>{m.done} completadas</span>
                  <span>{m.overdue > 0 ? <span className="text-red-400">{m.overdue} vencida{m.overdue !== 1 ? 's' : ''}</span> : 'Sin vencidas'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <SkeletonTasks />}

      {!loading && viewMode === 'list' ? (
        /* LIST VIEW */
        filteredTasks.length === 0 ? (
          <div className="text-center py-16 text-[var(--af-text3)]">
            <div className="w-14 h-14 rounded-2xl bg-[var(--af-bg3)] flex items-center justify-center mx-auto mb-3">
              <KanbanSquare size={24} className="text-[var(--af-text3)]" aria-hidden="true"/>
            </div>
            <div className="text-[15px] font-medium text-[var(--muted-foreground)]">
              {hasActiveFilters ? 'Sin resultados' : 'Sin tareas'}
            </div>
            <div className="text-xs mt-1">
              {hasActiveFilters ? 'Intenta con otros filtros' : 'Crea tu primera tarea para empezar'}
            </div>
          </div>
        ) : (
          <>
            {/* === ACTIVE TASKS (non-completed) === */}
            {activeTasks.length === 0 && completedTasks.length > 0 && (
              <div className="text-center py-8">
                <div className="inline-flex items-center gap-2 text-[var(--muted-foreground)] text-sm">
                  <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true"/>
                  Todas las tareas estan completadas
                </div>
              </div>
            )}
            {['Alta', 'Media', 'Baja'].map(prio => {
              const group = activeTasks.filter((t: Task) => t.data.priority === prio);
              if (!group.length) return null;
              const prioColorBg = prio === 'Alta' ? 'bg-red-500/10 text-red-400' : prio === 'Media' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400';
              const prioDot = prio === 'Alta' ? 'bg-red-400' : prio === 'Media' ? 'bg-amber-400' : 'bg-emerald-400';
              return (
                <div key={prio} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 sm:p-4 mb-4">
                  <div className={`inline-flex items-center gap-1.5 text-xs font-semibold mb-3 px-2.5 py-1 rounded-lg ${prioColorBg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${prioDot}`} />
                    Prioridad {prio}
                    <span className="text-[var(--af-text3)] ml-1">({group.length})</span>
                  </div>
                  {group.map((t: Task) => {
                    const proj = projects.find((p: Project) => p.id === t.data.projectId);
                    const isOverdue = t.data.dueDate && checkOverdue(t.data.dueDate) && t.data.status !== 'Completado';
                    const tTags: string[] = Array.isArray(t.data.tags) ? t.data.tags : [];
                    return (
                      <div key={t.id} className="flex items-start gap-3 py-2.5 border-b border-[var(--border)] last:border-0 group">
                        <div
                          className={`w-4 h-4 rounded border flex-shrink-0 mt-0.5 cursor-pointer flex items-center justify-center transition-all border-[var(--input)] hover:border-[var(--af-accent)]`}
                          onClick={() => toggleTask(t.id, t.data.status)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-medium">{t.data.title}</div>
                          {(() => {
                            const sts = Array.isArray(t.data.subtasks) ? t.data.subtasks as { text: string; done: boolean }[] : [];
                            if (sts.length === 0) return null;
                            const done = sts.filter(s => s.done).length;
                            const pct = Math.round((done / sts.length) * 100);
                            return (
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-[var(--af-accent)]'}`} style={{ width: pct + '%' }} />
                                </div>
                                <span className="text-[9px] text-[var(--af-text3)] flex-shrink-0">{done}/{sts.length} subtareas</span>
                              </div>
                            );
                          })()}
                          <div className="text-[11px] text-[var(--af-text3)] mt-1 flex items-center gap-2 flex-wrap">
                            {proj && <span>{proj.data.name}</span>}
                            {t.data.phaseId && (() => {
                              const phaseName = getPhaseName(t.data.phaseId, t.data.projectId);
                              if (!phaseName) return null;
                              return (
                                <span className="inline-flex items-center gap-0.5 text-violet-400">
                                  <Layers size={9} className="flex-shrink-0" aria-hidden="true"/>
                                  {phaseName}
                                </span>
                              );
                            })()}
                            {t.data.dueDate && (
                              <span className={isOverdue ? 'text-red-400' : ''}>
                                <Calendar size={10} className="inline mr-0.5" aria-hidden="true"/>
                                {fmtDate(t.data.dueDate)}
                              </span>
                            )}
                            {(t.data.estimatedHours ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-blue-400">
                                <Clock size={9} className="flex-shrink-0" aria-hidden="true"/>
                                {t.data.estimatedHours}h
                              </span>
                            )}
                            {tTags.length > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-violet-400">
                                <Tag size={9} className="flex-shrink-0" aria-hidden="true"/>
                                {tTags.slice(0, 2).join(', ')}{tTags.length > 2 ? ` +${tTags.length - 2}` : ''}
                              </span>
                            )}
                            {t.data.agendaMeta && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--af-accent)]/10 text-[var(--af-accent)] font-medium">
                                <CalendarDays className="w-2.5 h-2.5" aria-hidden="true"/>
                                Agenda
                                {t.data.agendaMeta.hourSlots?.length > 0 && (
                                  <span className="opacity-70">{formatHourSlots(t.data.agendaMeta.hourSlots)}</span>
                                )}
                              </span>
                            )}
                            <AssigneeAvatars task={t} getUserName={getUserName} />
                          </div>
                        </div>
                        {/* Status badge - desktop only */}
                        <span className={`hidden md:flex text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${taskStColor(t.data.status)}`}>{t.data.status}</span>
                        {/* Desktop hover actions */}
                        <div className="hidden md:flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="text-xs px-2.5 py-1.5 rounded bg-[var(--af-accent)]/10 text-[var(--af-accent)] cursor-pointer hover:bg-[var(--af-accent)]/20" onClick={() => openEditTask(t)}>Editar</button>
                          <button className="text-xs px-2 py-1.5 rounded bg-red-500/10 text-red-400 cursor-pointer hover:bg-red-500/20" onClick={async () => { if (await confirmDialog.confirm({ title: 'Eliminar tarea', description: '¿Estas seguro? La tarea sera eliminada permanentemente.' })) deleteTask(t.id); }}>
                            <X size={12} aria-hidden="true"/>
                          </button>
                        </div>
                        {/* Mobile overflow menu - always visible on mobile */}
                        <div className="md:hidden flex-shrink-0">
                          <OverflowMenu
                            actions={[
                              {
                                label: 'Editar tarea',
                                icon: <Pencil size={14} aria-hidden="true"/>,
                                onClick: () => openEditTask(t),
                              },
                              {
                                label: 'Eliminar tarea',
                                icon: <Trash2 size={14} aria-hidden="true"/>,
                                onClick: async () => { if (await confirmDialog.confirm({ title: 'Eliminar tarea', description: '¿Estas seguro? La tarea sera eliminada permanentemente.' })) deleteTask(t.id); },
                                variant: 'danger',
                                separator: true,
                              },
                            ]}
                            side="left"
                            align="end"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* === COMPLETED TASKS - Collapsible History Section === */}
            {completedTasks.length > 0 && (
              <div className="mt-2">
                {/* Toggle header */}
                <button
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--af-bg3)] transition-colors cursor-pointer group/hist"
                  onClick={() => setShowCompleted(!showCompleted)}
                >
                  <ChevronRight size={16} className={`text-[var(--af-text3)] transition-transform ${showCompleted ? 'rotate-90' : ''}`} aria-hidden="true"/>
                  <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true"/>
                  <span className="text-[13px] font-semibold flex-1 text-left">
                    Tareas completadas
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                    {completedTasks.length}
                  </span>
                  {completedOldCount > 0 && (
                    <span className="text-[10px] text-[var(--af-text3)] hidden sm:inline">
                      ({completedOldCount} hace mas de 30 dias)
                    </span>
                  )}
                  <span className="text-[11px] text-[var(--af-text3)] group-hover/hist:text-[var(--foreground)] transition-colors">
                    {showCompleted ? 'Ocultar' : 'Mostrar'}
                  </span>
                </button>

                {/* Completed tasks list - collapsible */}
                {showCompleted && (
                  <div className="mt-2 bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 sm:p-4 animate-fadeIn">
                    {/* Quick stats */}
                    <div className="flex items-center gap-3 mb-3 px-1 text-[10px] text-[var(--af-text3)]">
                      <span className="flex items-center gap-1"><Clock size={9} aria-hidden="true"/> Recientes primero</span>
                      {completedOldCount > 0 && (
                        <span className="flex items-center gap-1 text-amber-400/70"><Archive size={9} aria-hidden="true"/> {completedOldCount} archivadas (+30 dias)</span>
                      )}
                    </div>
                    {completedTasks.map((t: Task) => {
                      const proj = projects.find((p: Project) => p.id === t.data.projectId);
                      const completedDate = t.data.completedAt ? toDate(t.data.completedAt) : null;
                      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                      const isOld = completedDate ? completedDate.getTime() < thirtyDaysAgo : false;
                      const completedByName = t.data.updatedBy ? getUserName(t.data.updatedBy) : null;
                      return (
                        <div key={t.id} className={`flex items-start gap-3 py-2.5 border-b border-[var(--border)] last:border-0 group ${isOld ? 'opacity-50 hover:opacity-80 transition-opacity' : ''}`}>
                          <div
                            className="w-4 h-4 rounded bg-emerald-500 border-emerald-500 flex-shrink-0 mt-0.5 cursor-pointer flex items-center justify-center transition-all hover:bg-emerald-600"
                            onClick={() => toggleTask(t.id, t.data.status)}
                            title="Desmarcar como completada"
                          >
                            <span className="text-white text-[10px] font-bold">✓</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium line-through text-[var(--af-text3)]">{t.data.title}</div>
                            <div className="text-[10px] text-[var(--af-text3)] mt-1 flex items-center gap-2 flex-wrap">
                              {proj && <span>{proj.data.name}</span>}
                              {completedDate && (
                                <span className="inline-flex items-center gap-0.5 text-emerald-400/70">
                                  <CheckCircle2 size={8} className="flex-shrink-0" aria-hidden="true"/>
                                  Completada {fmtDate(completedDate.toISOString().split('T')[0])}
                                </span>
                              )}
                              {completedByName && (
                                <span className="inline-flex items-center gap-0.5">
                                  <User size={8} className="flex-shrink-0" aria-hidden="true"/>
                                  {completedByName}
                                </span>
                              )}
                              {isOld && (
                                <span className="inline-flex items-center gap-0.5 text-amber-400/60">
                                  <Archive size={8} className="flex-shrink-0" aria-hidden="true"/>
                                  Archivada
                                </span>
                              )}
                              {t.data.agendaMeta && (
                                <span className="inline-flex items-center gap-1 text-[9px] px-1 py-0.5 rounded bg-[var(--af-accent)]/5 text-[var(--af-accent)]/60 font-medium">
                                  <CalendarDays className="w-2 h-2" aria-hidden="true"/>
                                  Agenda
                                </span>
                              )}
                              <AssigneeAvatars task={t} getUserName={getUserName} />
                            </div>
                          </div>
                          {/* Desktop hover actions */}
                          <div className="hidden md:flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="text-xs px-2.5 py-1.5 rounded bg-[var(--af-accent)]/10 text-[var(--af-accent)] cursor-pointer hover:bg-[var(--af-accent)]/20" onClick={() => openEditTask(t)}>Editar</button>
                            <button className="text-xs px-2 py-1.5 rounded bg-red-500/10 text-red-400 cursor-pointer hover:bg-red-500/20" onClick={async () => { if (await confirmDialog.confirm({ title: 'Eliminar tarea', description: '¿Estas seguro? La tarea sera eliminada permanentemente.' })) deleteTask(t.id); }}>
                              <X size={12} aria-hidden="true"/>
                            </button>
                          </div>
                          {/* Mobile overflow */}
                          <div className="md:hidden flex-shrink-0">
                            <OverflowMenu
                              actions={[
                                { label: 'Reabrir tarea', icon: <Eye size={14} aria-hidden="true"/>, onClick: () => toggleTask(t.id, t.data.status) },
                                { label: 'Editar tarea', icon: <Pencil size={14} aria-hidden="true"/>, onClick: () => openEditTask(t) },
                                { label: 'Eliminar tarea', icon: <Trash2 size={14} aria-hidden="true"/>, onClick: async () => { if (await confirmDialog.confirm({ title: 'Eliminar tarea', description: '¿Estas seguro? La tarea sera eliminada permanentemente.' })) deleteTask(t.id); }, variant: 'danger', separator: true },
                              ]}
                              side="left"
                              align="end"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )
      ) : (
        /* KANBAN VIEW */
        filteredTasks.length === 0 ? (
          <div className="text-center py-16 text-[var(--af-text3)]">
            <div className="w-14 h-14 rounded-2xl bg-[var(--af-bg3)] flex items-center justify-center mx-auto mb-3">
              <KanbanSquare size={24} className="text-[var(--af-text3)]" aria-hidden="true"/>
            </div>
            <div className="text-[15px] font-medium text-[var(--muted-foreground)]">
              {hasActiveFilters ? 'Sin resultados' : 'Sin tareas'}
            </div>
            <div className="text-xs mt-1">
              {hasActiveFilters ? 'Intenta con otros filtros' : 'Crea tu primera tarea para empezar'}
            </div>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1" style={{ minHeight: 'calc(100vh - 280px)' }}>
            {KANBAN_COLS.map(col => {
              const colTasks = filteredTasks.filter((t: Task) => t.data.status === col.status);
              const isDragOver = dragOverCol === col.status;
              const isCompletedCol = col.status === 'Completado';
              const isCollapsed = isCompletedCol && kanbanCompletedCollapsed;
              return (
                <div
                  key={col.status}
                  className={`flex-shrink-0 rounded-xl transition-all ${
                    isCollapsed ? 'w-[56px]' : 'w-[270px] sm:w-[290px]'
                  } ${
                    isDragOver
                      ? `${col.bg} border-2 border-dashed ${col.border} ring-2 ring-[var(--af-accent)]/20 scale-[1.01]`
                      : 'bg-[var(--af-bg3)] border border-[var(--border)]'
                  } flex flex-col overflow-hidden`}
                  onDragEnter={e => handleDragEnter(e, col.status)}
                  onDragLeave={e => handleDragLeave(e, col.status)}
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, col.status)}
                >
                  {/* Colored top border */}
                  <div className={`h-[3px] w-full ${col.color} transition-all ${isDragOver ? 'h-[4px]' : ''}`} />

                  <div className={`p-3 flex flex-col flex-1 ${isCollapsed ? 'items-center' : ''}`}>
                    {/* Column Header */}
                    {isCollapsed ? (
                      /* Collapsed completed column - vertical label */
                      <div className="flex flex-col items-center gap-2 py-3 cursor-pointer" onClick={() => setKanbanCompletedCollapsed(false)}>
                        <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                        <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                        <span className="text-[10px] text-[var(--af-text3)] [writing-mode:vertical-lr] rotate-180">Completado</span>
                        <Eye size={12} className="text-[var(--af-text3)]" aria-hidden="true"/>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                          <span className="text-[13px] font-semibold flex-1">{col.status}</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                            col.status === 'Completado' ? 'bg-emerald-500/10 text-emerald-400' :
                            col.status === 'En progreso' ? 'bg-blue-500/10 text-blue-400' :
                            col.status === 'Revision' ? 'bg-amber-500/10 text-amber-400' :
                            'bg-[var(--af-bg4)] text-[var(--muted-foreground)]'
                          }`}>
                            {colTasks.length}
                          </span>
                          {isCompletedCol && (
                            <button
                              className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--af-text3)] hover:text-[var(--af-accent)] hover:bg-[var(--af-accent)]/10 cursor-pointer transition-all"
                              onClick={() => setKanbanCompletedCollapsed(true)}
                              title="Colapsar columna"
                            >
                              <EyeOff size={14} aria-hidden="true"/>
                            </button>
                          )}
                          <button
                            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--af-text3)] hover:text-[var(--af-accent)] hover:bg-[var(--af-accent)]/10 cursor-pointer transition-all opacity-60 hover:opacity-100"
                            onClick={() => handleNewTaskInColumn(col.status)}
                            title={`Agregar tarea en ${col.status}`}
                          >
                            <Plus size={14} aria-hidden="true"/>
                          </button>
                        </div>

                    {/* Task Cards */}
                    <div className="flex-1 space-y-2 overflow-y-auto pr-0.5" style={{ scrollbarWidth: 'thin' }}>
                      {colTasks.length === 0 && !isDragOver && (
                        <div className="text-center py-10 border-2 border-dashed border-[var(--border)] rounded-lg text-[var(--af-text3)]">
                          <div className="text-[11px] mb-1.5">Arrastra tareas aqui</div>
                          <button
                            className="text-[10px] px-2.5 py-1 rounded-md bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)] cursor-pointer hover:border-[var(--af-accent)]/30 hover:text-[var(--af-accent)] transition-all"
                            onClick={() => handleNewTaskInColumn(col.status)}
                          >
                            <Plus size={10} className="inline mr-0.5" aria-hidden="true"/> Crear tarea
                          </button>
                        </div>
                      )}
                      {colTasks.length === 0 && isDragOver && (
                        <div className={`text-center py-10 rounded-lg border-2 border-dashed ${col.border} text-[var(--af-text3)] text-[11px] animate-pulse`}>
                          <div className="text-base mb-1">↓</div>
                          Soltar aqui
                        </div>
                      )}
                      {colTasks.map((t: Task) => {
                        const proj = projects.find((p: Project) => p.id === t.data.projectId);
                        const isDragging = dragTaskId === t.id;
                        const isOverdue = t.data.dueDate && checkOverdue(t.data.dueDate) && t.data.status !== 'Completado';
                        const tTags: string[] = Array.isArray(t.data.tags) ? t.data.tags : [];
                        return (
                          <div
                            key={t.id}
                            draggable
                            onDragStart={e => handleDragStart(e, t.id)}
                            onDragEnd={handleDragEnd}
                            className={`relative bg-[var(--card)] border rounded-lg p-3 cursor-grab active:cursor-grabbing transition-all hover:shadow-md hover:-translate-y-0.5 group/card ${
                              isDragging ? 'opacity-40 scale-95 border-[var(--af-accent)]' : 'border-[var(--border)] hover:border-[var(--input)]'
                            }`}
                            onClick={() => openEditTask(t)}
                          >
                            {/* Hover actions - top right */}
                            <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity z-10">
                              <button
                                className="w-6 h-6 rounded flex items-center justify-center bg-[var(--card)]/90 backdrop-blur-sm text-[var(--af-text3)] hover:text-[var(--af-accent)] hover:bg-[var(--af-accent)]/10 cursor-pointer transition-colors border border-[var(--border)]"
                                onClick={e => { e.stopPropagation(); openEditTask(t); }}
                                title="Editar"
                              >
                                <Pencil size={11} aria-hidden="true"/>
                              </button>
                              <button
                                className="w-6 h-6 rounded flex items-center justify-center bg-[var(--card)]/90 backdrop-blur-sm text-[var(--af-text3)] hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors border border-[var(--border)]"
                                onClick={async e => { e.stopPropagation(); if (await confirmDialog.confirm({ title: 'Eliminar tarea', description: '¿Estas seguro? La tarea sera eliminada permanentemente.' })) deleteTask(t.id); }}
                                title="Eliminar"
                              >
                                <Trash2 size={11} aria-hidden="true"/>
                              </button>
                            </div>

                            {/* Project tag */}
                            {proj && (
                              <div className="text-[10px] text-[var(--af-text3)] mb-1 truncate pr-16">
                                {proj.data.name}
                                {t.data.phaseId && (() => {
                                  const phaseName = getPhaseName(t.data.phaseId, t.data.projectId);
                                  return phaseName ? (
                                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-violet-400">
                                      <Layers size={8} className="flex-shrink-0" aria-hidden="true"/>
                                      {phaseName}
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                            )}

                          {/* Task title */}
                          <div className="flex items-start gap-2">
                            <GripVertical size={14} className="text-[var(--af-text3)] flex-shrink-0 mt-0.5 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity" aria-hidden="true"/>
                            <div className={`text-[13px] font-medium flex-1 leading-snug ${t.data.status === 'Completado' ? 'line-through text-[var(--af-text3)]' : ''}`}>
                              {t.data.title}
                            </div>

                            {/* Tags row */}
                            <div className="flex items-center mt-2.5 gap-1.5 flex-wrap">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${prioColor(t.data.priority)}`}>
                                {t.data.priority}
                              </span>
                              {t.data.dueDate && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${isOverdue ? 'bg-red-500/10 text-red-400' : 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]'}`}>
                                  <Calendar size={9} className="flex-shrink-0" aria-hidden="true"/>
                                  {fmtDate(t.data.dueDate)}
                                </span>
                              )}
                              {(t.data.estimatedHours ?? 0) > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 bg-blue-500/10 text-blue-400">
                                  <Clock size={9} className="flex-shrink-0" aria-hidden="true"/>
                                  {t.data.estimatedHours}h
                                </span>
                              )}
                            </div>
                            {/* Subtask progress pill */}
                            {(() => {
                              const sts = Array.isArray(t.data.subtasks) ? t.data.subtasks as { text: string; done: boolean }[] : [];
                              if (sts.length === 0) return null;
                              const done = sts.filter(s => s.done).length;
                              const pct = Math.round((done / sts.length) * 100);
                              return (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${pct === 100 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[var(--af-accent)]/10 text-[var(--af-accent)]'}`}>
                                  {done}/{sts.length}
                                </span>
                              );
                            })()}
                            {/* Tags display */}
                            {tTags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {tTags.slice(0, 2).map((tag: string) => (
                                  <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400">
                                    {tag}
                                  </span>
                                ))}
                                {tTags.length > 2 && (
                                  <span className="text-[9px] px-1 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--muted-foreground)]">+{tTags.length - 2}</span>
                                )}
                              </div>
                            )}
                            {/* Agenda badge */}
                            {t.data.agendaMeta && (
                              <div className="mt-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--af-accent)]/10 text-[var(--af-accent)] font-medium">
                                  <CalendarDays className="w-2.5 h-2.5" aria-hidden="true"/>
                                  Agenda
                                  {t.data.agendaMeta.hourSlots?.length > 0 && (
                                    <span className="opacity-70">{formatHourSlots(t.data.agendaMeta.hourSlots)}</span>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Footer: assignees */}
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)]">
                            <AssigneeAvatars task={t} getUserName={getUserName} size="md" />
                            <button className="text-[10px] text-[var(--af-text3)] hover:text-red-400 cursor-pointer md:opacity-0 md:group-hover/card:opacity-100 transition-opacity" onClick={async e => { e.stopPropagation(); if (await confirmDialog.confirm({ title: 'Eliminar tarea', description: '¿Estas seguro? La tarea sera eliminada permanentemente.' })) deleteTask(t.id); }}>
                              <X size={12} aria-hidden="true"/>
                            </button>
                          </div>
                          {/* Mobile: Status change dropdown */}
                          <select
                            className="md:hidden w-full mt-2 text-[10px] bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--foreground)] outline-none cursor-pointer appearance-none"
                            value={t.data.status}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { if (e.target.value !== t.data.status) changeTaskStatus(t.id, e.target.value); }}
                          >
                            {KANBAN_COLS.map(col => (
                              <option key={col.status} value={col.status}>{col.status}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                    </div>
                  </>
                )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Mobile FAB */}
      <FloatingActionButton
        onClick={handleNewTask}
        ariaLabel="Nueva tarea"
      />
      <ConfirmDialog {...confirmDialog} />
    </div>
  );
}
