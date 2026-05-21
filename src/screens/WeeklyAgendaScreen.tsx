'use client';
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getFirebase } from '@/lib/firebase-service';
import { scrubUndefined } from '@/lib/helpers';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Plus, Printer, CalendarDays,
  Trash2, Edit3, StickyNote, Clock, User,
  Flag, FolderOpen, MessageSquare, CheckCircle2, X,
  Link2, Search, Users, ListChecks, AlertTriangle
} from 'lucide-react';
import type { Task } from '@/lib/types';

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

interface WeekNote {
  id: string;
  text: string;
  color: string;
}

interface DragState {
  dayKey: string;
  startHour: number;
  currentHour: number;
  active: boolean;
}

interface ActivityForm {
  title: string;
  projectId: string;
  assigneeId: string;
  participantIds: string[];
  priority: string;
  status: string;
  observations: string;
  hours: number[];
  subtasks: { text: string; done: boolean }[];
}

type FormTab = 'new' | 'link';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

const DAY_NAMES = ['Lun', 'Mar', 'Mi\u00e9', 'Jue', 'Vie', 'S\u00e1b', 'Dom'];
const DAY_FULL = ['Lunes', 'Martes', 'Mi\u00e9rcoles', 'Jueves', 'Viernes', 'S\u00e1bado', 'Domingo'];
const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8..17
const SLOT_H = 56; // px height per slot

const PRIO_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  'Alta':    { bg: 'bg-red-500/10 dark:bg-red-500/15', border: 'border-l-red-500', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  'Media':   { bg: 'bg-amber-500/10 dark:bg-amber-500/15', border: 'border-l-amber-500', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  'Baja':    { bg: 'bg-emerald-500/10 dark:bg-emerald-500/15', border: 'border-l-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  'Cr\u00edtica': { bg: 'bg-purple-500/10 dark:bg-purple-500/15', border: 'border-l-purple-500', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500' },
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  'Por hacer': <Clock className="w-3 h-3 text-slate-400" aria-hidden="true"/>,
  'En progreso': <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />,
  'Revision': <Flag className="w-3 h-3 text-amber-500" aria-hidden="true"/>,
  'Completado': <CheckCircle2 className="w-3 h-3 text-emerald-500" aria-hidden="true"/>,
};

const NOTE_COLORS = [
  'var(--note-amber)', 'var(--note-blue)', 'var(--note-pink)',
  'var(--note-green)', 'var(--note-purple)', 'var(--note-yellow)',
];

const PRIORITIES = ['Alta', 'Media', 'Baja', 'Cr\u00edtica'];
const STATUSES = ['Por hacer', 'En progreso', 'Revision', 'Completado'];

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function getWeekDates(baseDate: Date): Date[] {
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

function fmtDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatHour(h: number): string {
  if (h === 0 || h === 12) return h === 0 ? '12:00 am' : '12:00 pm';
  return h > 12 ? `${h - 12}:00 pm` : `${h}:00 am`;
}

function formatHourShort(h: number): string {
  if (h === 0 || h === 12) return h === 0 ? '12am' : '12pm';
  return h > 12 ? `${h - 12}pm` : `${h}am`;
}

function formatHourRange(hours: number[]): string {
  if (!hours.length) return '';
  const min = Math.min(...hours);
  const max = Math.max(...hours);
  return `${formatHour(min)} - ${formatHour(max + 1)}`;
}

const EMPTY_FORM: ActivityForm = {
  title: '',
  projectId: '',
  assigneeId: '',
  participantIds: [],
  priority: 'Media',
  status: 'Por hacer',
  observations: '',
  hours: [],
  subtasks: [],
};

/* ═══════════════════════════════════════════════════════════════
   WEEKLY AGENDA SCREEN
   ═══════════════════════════════════════════════════════════════ */

export default function WeeklyAgendaScreen() {
  const { projects, teamUsers, tasks: ctxTasks, authUser, activeTenantId, deleteTask } = useApp();

  /* ─── State ─── */
  const [baseDate, setBaseDate] = useState(new Date());
  const [weekNotes, setWeekNotes] = useState<WeekNote[]>([]);
  const [filterProject, setFilterProject] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [formTab, setFormTab] = useState<FormTab>('new');
  const [formDayKey, setFormDayKey] = useState('');
  const [form, setForm] = useState<ActivityForm>({ ...EMPTY_FORM });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [linkTaskId, setLinkTaskId] = useState<string>('');
  const [linkSearch, setLinkSearch] = useState('');
  const [linkFilterProject, setLinkFilterProject] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [mobileDayIdx, setMobileDayIdx] = useState(() => {
    const today = new Date().getDay();
    return today === 0 ? 6 : today - 1; // 0=Mon..6=Sun
  });
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const printRef = useRef<HTMLDivElement>(null);

  /* ─── Derived data ─── */
  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate]);
  const weekLabel = useMemo(() => {
    const start = weekDates[0];
    const end = weekDates[6];
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    return `${start.toLocaleDateString('es-CO', opts)} \u2014 ${end.toLocaleDateString('es-CO', opts)}`;
  }, [weekDates]);

  const todayKey = dateKey(new Date());

  const projectMap = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach(p => { m[p.id] = p.data.name; });
    return m;
  }, [projects]);

  const userMap = useMemo(() => {
    const m: Record<string, { name: string; photoUrl?: string }> = {};
    teamUsers.forEach(u => { m[u.id] = { name: u.data?.name || 'Sin nombre', photoUrl: u.data?.photoURL }; });
    if (authUser?.uid) m[authUser.uid] = { name: authUser.displayName || authUser.email || 'Yo', photoUrl: authUser.photoURL || undefined };
    return m;
  }, [teamUsers, authUser]);

  const allUserOptions = useMemo(() => {
    const opts: { id: string; name: string }[] = [];
    teamUsers.forEach(u => opts.push({ id: u.id, name: u.data?.name || 'Usuario' }));
    if (authUser?.uid && !opts.find(o => o.id === authUser.uid)) {
      opts.push({ id: authUser.uid, name: authUser.displayName || authUser.email || 'Yo' });
    }
    return opts;
  }, [teamUsers, authUser]);

  /* ─── Agenda tasks from Firestore ─── */
  const agendaTasks = useMemo(() =>
    (ctxTasks || []).filter(t => t.data.agendaMeta),
    [ctxTasks]
  );

  /* ─── Overlap layout algorithm ───
     For each day, compute which "column" each task occupies when tasks overlap.
     Tasks that don't overlap share the full width. Overlapping tasks split into columns.
     Returns a map: taskId -> { col, totalCols } where col is 0-based column index
     and totalCols is the total number of columns in that overlap group.
  */
  interface OverlapInfo { col: number; totalCols: number }
  const overlapLayout = useMemo(() => {
    const layout: Record<string, OverlapInfo> = {};

    // Group tasks by dayKey
    const tasksByDay: Record<string, Task[]> = {};
    agendaTasks.forEach(t => {
      const meta = t.data.agendaMeta;
      if (!meta || !meta.hourSlots.length) return;
      if (!tasksByDay[meta.dayKey]) tasksByDay[meta.dayKey] = [];
      tasksByDay[meta.dayKey].push(t);
    });

    // For each day, compute columns using greedy interval scheduling
    Object.entries(tasksByDay).forEach(([, dayTasks]) => {
      // Sort by start hour, then by duration (longer first for stability)
      const sorted = [...dayTasks].sort((a, b) => {
        const aStart = Math.min(...a.data.agendaMeta!.hourSlots);
        const bStart = Math.min(...b.data.agendaMeta!.hourSlots);
        if (aStart !== bStart) return aStart - bStart;
        const aDur = a.data.agendaMeta!.hourSlots.length;
        const bDur = b.data.agendaMeta!.hourSlots.length;
        return bDur - aDur;
      });

      // Assign columns greedily — track which column each task is in
      interface ColSlot { endHour: number; task: Task }
      const columns: ColSlot[] = [];

      // First pass: assign column indices
      const taskColumns: Record<string, number> = {};
      sorted.forEach(task => {
        const meta = task.data.agendaMeta!;
        const startH = Math.min(...meta.hourSlots);
        const endH = Math.max(...meta.hourSlots) + 1; // exclusive end

        // Find first column where this task doesn't overlap
        let placed = false;
        for (let c = 0; c < columns.length; c++) {
          if (columns[c].endHour <= startH) {
            // No overlap — reuse this column
            columns[c] = { endHour: endH, task };
            taskColumns[task.id] = c;
            placed = true;
            break;
          }
        }
        if (!placed) {
          // Need a new column
          taskColumns[task.id] = columns.length;
          columns.push({ endHour: endH, task });
        }
      });

      // Second pass: for each task, compute how many tasks it actually overlaps with
      // Two tasks overlap if their hour slots intersect
      sorted.forEach(task => {
        const meta = task.data.agendaMeta!;
        const taskStart = Math.min(...meta.hourSlots);
        const taskEnd = Math.max(...meta.hourSlots) + 1;
        const myCol = taskColumns[task.id];

        // Find the max concurrent columns at any hour this task spans
        // by checking how many other tasks overlap at each hour
        const maxConcurrent = [myCol]; // always include own column
        sorted.forEach(other => {
          if (other.id === task.id) return;
          const oMeta = other.data.agendaMeta!;
          const oStart = Math.min(...oMeta.hourSlots);
          const oEnd = Math.max(...oMeta.hourSlots) + 1;
          // Check if they overlap
          if (oStart < taskEnd && oStart >= taskStart || oEnd > taskStart && oEnd <= taskEnd || oStart <= taskStart && oEnd >= taskEnd) {
            maxConcurrent.push(taskColumns[other.id]);
          }
        });

        // totalCols = number of unique columns that overlap with this task
        const uniqueCols = new Set(maxConcurrent);
        layout[task.id] = { col: myCol, totalCols: uniqueCols.size };
      });
    });

    return layout;
  }, [agendaTasks]);

  /* Group tasks by "dayKey:firstHour" for rendering tall blocks */
  const tasksByDayAndStartHour = useMemo(() => {
    const map: Record<string, Task[]> = {};
    agendaTasks.forEach(t => {
      const meta = t.data.agendaMeta;
      if (!meta || !meta.hourSlots.length) return;
      const firstHour = Math.min(...meta.hourSlots);
      const key = `${meta.dayKey}:${firstHour}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [agendaTasks]);

  /* For a given dayKey, compute which hours are the START of a task block */
  const taskStartHoursByDay = useMemo(() => {
    const map: Record<string, Set<number>> = {};
    agendaTasks.forEach(t => {
      const meta = t.data.agendaMeta;
      if (!meta || !meta.hourSlots.length) return;
      if (!map[meta.dayKey]) map[meta.dayKey] = new Set();
      map[meta.dayKey].add(Math.min(...meta.hourSlots));
    });
    return map;
  }, [agendaTasks]);

  /* ─── Responsive detection ─── */
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /* ─── Navigation ─── */
  const prevWeek = () => { const d = new Date(baseDate); d.setDate(d.getDate() - 7); setBaseDate(d); };
  const nextWeek = () => { const d = new Date(baseDate); d.setDate(d.getDate() + 7); setBaseDate(d); };
  const goToday = () => { setBaseDate(new Date()); const today = new Date().getDay(); setMobileDayIdx(today === 0 ? 6 : today - 1); };

  /* ─── Drag selection ─── */
  const handleCellMouseDown = (dayKey: string, hour: number) => {
    // Always allow drag to start — overlapping activities are supported
    setDrag({ dayKey, startHour: hour, currentHour: hour, active: true });
  };

  const handleCellMouseEnter = (dayKey: string, hour: number) => {
    if (!drag || !drag.active || drag.dayKey !== dayKey) return;
    setDrag(prev => prev ? { ...prev, currentHour: hour } : null);
  };

  const handleCellMouseUp = () => {
    if (!drag || !drag.active) return;
    const minH = Math.min(drag.startHour, drag.currentHour);
    const maxH = Math.max(drag.startHour, drag.currentHour);
    const selectedHours = HOURS.filter(h => h >= minH && h <= maxH);
    // Allow all selected hours — overlapping activities are supported
    if (selectedHours.length > 0) {
      openCreateForm(drag.dayKey, selectedHours);
    }
    setDrag(null);
  };

  const handleCellClick = (dayKey: string, hour: number) => {
    // Mobile: simple tap opens form with single hour — always allow
    openCreateForm(dayKey, [hour]);
  };

  /* ─── Form management ─── */
  const openCreateForm = (dayKey: string, hours: number[]) => {
    setEditingTask(null);
    setFormTab('new');
    setFormDayKey(dayKey);
    setForm({
      ...EMPTY_FORM,
      hours,
      projectId: filterProject !== 'all' ? filterProject : '',
    });
    setLinkTaskId('');
    setLinkSearch('');
    setLinkFilterProject('');
    setShowForm(true);
  };

  const openEditForm = (task: Task) => {
    const meta = task.data.agendaMeta;
    setEditingTask(task);
    setFormTab('new'); // edit always uses new tab
    setFormDayKey(meta?.dayKey || '');
    setForm({
      title: task.data.title || '',
      projectId: task.data.projectId || '',
      assigneeId: task.data.assigneeId || '',
      participantIds: meta?.participantIds || [],
      priority: task.data.priority || 'Media',
      status: task.data.status || 'Por hacer',
      observations: task.data.description || '',
      hours: meta?.hourSlots || [],
      subtasks: task.data.subtasks || [],
    });
    setLinkTaskId('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTask(null);
    setLinkTaskId('');
    setSaving(false);
  };

  /* ─── Hour slot management in form ─── */
  const addHourToForm = (h: number) => {
    setForm(f => {
      if (f.hours.includes(h)) return f;
      return { ...f, hours: [...f.hours, h].sort((a, b) => a - b) };
    });
  };

  const removeHourFromForm = (h: number) => {
    setForm(f => ({ ...f, hours: f.hours.filter(x => x !== h) }));
  };

  /* ─── Subtask management ─── */
  const addSubtask = () => {
    setForm(f => ({ ...f, subtasks: [...f.subtasks, { text: '', done: false }] }));
  };

  const updateSubtask = (idx: number, field: 'text' | 'done', value: string | boolean) => {
    setForm(f => ({
      ...f,
      subtasks: f.subtasks.map((s, i) => i === idx ? { ...s, [field]: value } : s),
    }));
  };

  const removeSubtask = (idx: number) => {
    setForm(f => ({ ...f, subtasks: f.subtasks.filter((_, i) => i !== idx) }));
  };

  /* ─── Firestore operations ─── */
  const handleSaveNew = async () => {
    if (!form.title.trim() || !authUser || !activeTenantId || !form.hours.length) return;
    setSaving(true);
    try {
      const db = getFirebase().firestore();
      const ts = getFirebase().firestore.FieldValue.serverTimestamp();
      const cleanedSubtasks = form.subtasks
        .filter(s => s.text.trim())
        .map(s => ({ text: s.text.trim(), done: Boolean(s.done) }));
      await db.collection('tasks').add(scrubUndefined({
        title: form.title.trim(),
        description: form.observations || '',
        projectId: form.projectId || '',
        assigneeId: form.assigneeId || '',
        assigneeIds: [form.assigneeId, ...form.participantIds].filter(Boolean),
        priority: form.priority,
        status: form.status,
        dueDate: formDayKey,
        subtasks: cleanedSubtasks.length > 0 ? cleanedSubtasks : undefined,
        tags: ['Agenda'],
        tenantId: activeTenantId,
        agendaMeta: {
          dayKey: formDayKey,
          hourSlots: form.hours,
          participantIds: form.participantIds,
          isAgendaItem: true,
        },
        createdAt: ts,
        createdBy: authUser.uid,
        updatedAt: ts,
        updatedBy: authUser.uid,
      }));
      closeForm();
    } catch (err) {
      console.error('[Archii Agenda] Error creating task:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleLinkExisting = async () => {
    if (!linkTaskId || !authUser || !form.hours.length) return;
    setSaving(true);
    try {
      const db = getFirebase().firestore();
      const ts = getFirebase().firestore.FieldValue.serverTimestamp();
      const existingTask = ctxTasks.find(t => t.id === linkTaskId);
      const existingTags = existingTask?.data.tags || [];
      await db.collection('tasks').doc(linkTaskId).update(scrubUndefined({
        agendaMeta: {
          dayKey: formDayKey,
          hourSlots: form.hours,
          participantIds: form.participantIds,
          isAgendaItem: false,
        },
        tags: [...new Set([...existingTags, 'Agenda'])],
        updatedAt: ts,
        updatedBy: authUser.uid,
      }));
      closeForm();
    } catch (err) {
      console.error('[Archii Agenda] Error linking task:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTask = async () => {
    if (!editingTask || !form.title.trim() || !authUser || !form.hours.length) return;
    setSaving(true);
    try {
      const db = getFirebase().firestore();
      const ts = getFirebase().firestore.FieldValue.serverTimestamp();
      const cleanedSubtasks = form.subtasks
        .filter(s => s.text.trim())
        .map(s => ({ text: s.text.trim(), done: Boolean(s.done) }));
      await db.collection('tasks').doc(editingTask.id).update(scrubUndefined({
        title: form.title.trim(),
        description: form.observations || '',
        projectId: form.projectId || '',
        assigneeId: form.assigneeId || '',
        assigneeIds: [form.assigneeId, ...form.participantIds].filter(Boolean),
        priority: form.priority,
        status: form.status,
        dueDate: formDayKey,
        subtasks: cleanedSubtasks.length > 0 ? cleanedSubtasks : undefined,
        agendaMeta: {
          dayKey: formDayKey,
          hourSlots: form.hours,
          participantIds: form.participantIds,
          isAgendaItem: editingTask.data.agendaMeta?.isAgendaItem ?? true,
        },
        updatedAt: ts,
        updatedBy: authUser.uid,
      }));
      closeForm();
    } catch (err) {
      console.error('[Archii Agenda] Error updating task:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (task: Task) => {
    if (!authUser) return;
    const meta = task.data.agendaMeta;
    try {
      if (meta?.isAgendaItem) {
        // Delete entire task — use AppContext's deleteTask which has undo toast
        await deleteTask(task.id);
      } else {
        // Only remove agendaMeta, keep the task — with undo
        const prevAgendaMeta = task.data.agendaMeta;
        const prevTags = task.data.tags ? [...task.data.tags] : [];
        const db = getFirebase().firestore();
        const ts = getFirebase().firestore.FieldValue.serverTimestamp();
        const existingTags = (task.data.tags || []).filter(t => t !== 'Agenda');
        await db.collection('tasks').doc(task.id).update(scrubUndefined({
          agendaMeta: getFirebase().firestore.FieldValue.delete(),
          tags: existingTags.length > 0 ? existingTags : undefined,
          updatedAt: ts,
          updatedBy: authUser.uid,
        }));
        toast.success('Eliminado de la agenda', {
          duration: 5000,
          action: {
            label: 'Deshacer',
            onClick: async () => {
              try {
                await db.collection('tasks').doc(task.id).update(scrubUndefined({
                  agendaMeta: prevAgendaMeta,
                  tags: prevTags.length > 0 ? prevTags : undefined,
                  updatedAt: getFirebase().firestore.FieldValue.serverTimestamp(),
                }));
                toast.success('Tarea restaurada en la agenda');
              } catch (err) { console.error('[Archii Agenda] undo remove:', err); toast.error('Error al restaurar'); }
            },
          },
        });
      }
      setConfirmDelete(null);
      closeForm();
    } catch (err) {
      console.error('[Archii Agenda] Error deleting:', err);
    }
  };

  /* ─── Notes ─── */
  const addNote = () => {
    setWeekNotes(prev => [...prev, { id: uid(), text: '', color: NOTE_COLORS[prev.length % NOTE_COLORS.length] }]);
  };
  const updateNote = (id: string, text: string) => {
    setWeekNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
  };
  const deleteNote = (id: string) => {
    setWeekNotes(prev => prev.filter(n => n.id !== id));
  };

  /* ─── Print ─── */
  const handlePrint = () => {
    // Build data-driven print view (not innerHTML dump)
    const filtered = filterProject === 'all'
      ? agendaTasks
      : agendaTasks.filter(t => t.data.projectId === filterProject);

    // Group tasks by day
    const tasksByDayKey: Record<string, Task[]> = {};
    filtered.forEach(t => {
      const dk = t.data.agendaMeta?.dayKey;
      if (!dk) return;
      if (!tasksByDayKey[dk]) tasksByDayKey[dk] = [];
      tasksByDayKey[dk].push(t);
    });

    // Stats
    const totalTasks = filtered.length;
    const byPriority: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byProject: Record<string, number> = {};
    let totalHours = 0;
    filtered.forEach(t => {
      const p = t.data.priority || 'Media';
      const s = t.data.status || 'Por hacer';
      const pr = t.data.projectId ? (projectMap[t.data.projectId] || 'Sin proyecto') : 'Sin proyecto';
      byPriority[p] = (byPriority[p] || 0) + 1;
      byStatus[s] = (byStatus[s] || 0) + 1;
      byProject[pr] = (byProject[pr] || 0) + 1;
      totalHours += t.data.agendaMeta?.hourSlots?.length || 0;
    });

    const statusSymbol: Record<string, string> = {
      'Por hacer': '\u25CB', 'En progreso': '\u25CE', 'Revision': '\u25B3', 'Completado': '\u2713',
    };

    const prioBorder: Record<string, string> = {
      'Alta': '#ef4444', 'Media': '#f59e0b', 'Baja': '#10b981', 'Cr\u00edtica': '#a855f7',
    };
    const prioBg: Record<string, string> = {
      'Alta': '#fef2f2', 'Media': '#fffbeb', 'Baja': '#ecfdf5', 'Cr\u00edtica': '#faf5ff',
    };

    const now = new Date();
    const genDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${now.getHours() > 12 ? now.getHours() - 12 : now.getHours()}:${String(now.getMinutes()).padStart(2, '0')} ${now.getHours() >= 12 ? 'pm' : 'am'}`;
    const filterLabel = filterProject !== 'all' ? (projectMap[filterProject] || 'Proyecto') : null;

    // Build grid rows
    let gridRows = '';
    HOURS.forEach(hour => {
      // Time label
      gridRows += `<div class="time-label">${formatHour(hour)}</div>`;
      // Day cells
      weekDates.forEach((d, di) => {
        const dk = dateKey(d);
        const isToday = dk === todayKey;
        const dayTasks = (tasksByDayKey[dk] || []).filter(t => {
          const slots = t.data.agendaMeta?.hourSlots || [];
          return Math.min(...slots) === hour;
        });

        let cellContent = '';
        dayTasks.forEach(task => {
          const meta = task.data.agendaMeta;
          if (!meta) return;
          const priority = task.data.priority || 'Media';
          const border = prioBorder[priority] || '#f59e0b';
          const bg = prioBg[priority] || '#fffbeb';
          const spanCount = Math.max(...meta.hourSlots) - Math.min(...meta.hourSlots) + 1;
          const heightPx = spanCount * 48 - 6;
          const proj = task.data.projectId ? (projectMap[task.data.projectId] || '') : '';
          const assignee = task.data.assigneeId ? (userMap[task.data.assigneeId]?.name || '') : '';
          const status = task.data.status || 'Por hacer';
          const participants = meta.participantIds?.length || 0;
          const subtasks = task.data.subtasks || [];
          const doneSub = subtasks.filter(s => s.done).length;
          const obs = (task.data.description || '').trim();

          cellContent += `
            <div class="task-card" style="border-left:3px solid ${border};background:${bg};height:${heightPx}px;">
              <div class="task-title">${task.data.title || ''}</div>
              <div class="task-meta">
                <span>${formatHourRange(meta.hourSlots)}</span>
                ${proj ? ` &middot; <span>${proj}</span>` : ''}
              </div>
              ${assignee ? `<div class="task-meta">${statusSymbol[status] || '\u25CB'} ${status} &middot; ${assignee}</div>` : `<div class="task-meta">${statusSymbol[status] || '\u25CB'} ${status}</div>`}
              ${participants > 0 ? `<div class="task-meta">\u{1F465} ${participants} participante${participants > 1 ? 's' : ''}</div>` : ''}
              ${subtasks.length > 0 ? `<div class="task-meta">\u2611 ${doneSub}/${subtasks.length} subtareas</div>` : ''}
              ${obs ? `<div class="task-obs">${obs.length > 80 ? obs.slice(0, 80) + '...' : obs}</div>` : ''}
            </div>`;
        });

        gridRows += `<div class="slot${isToday ? ' today' : ''}">${cellContent}</div>`;
      });
    });

    // Column headers
    let colHeaders = '<div class="col-header"></div>';
    weekDates.forEach((d, i) => {
      const dk = dateKey(d);
      const isToday = dk === todayKey;
      colHeaders += `<div class="col-header${isToday ? ' today' : ''}">
        <div class="day-name">${DAY_NAMES[i]}</div>
        <div class="day-date">${fmtDay(d)}</div>
      </div>`;
    });

    // Stats section
    let statsHtml = '';
    if (totalTasks > 0) {
      statsHtml = `
      <div class="stats-section">
        <h3>Resumen de la Semana</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${totalTasks}</div>
            <div class="stat-label">Actividades</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${totalHours}</div>
            <div class="stat-label">Horas programadas</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${Object.keys(byProject).length}</div>
            <div class="stat-label">Proyectos</div>
          </div>
        </div>
        <div class="stats-detail">
          <div class="stats-col">
            <h4>Prioridad</h4>
            ${Object.entries(byPriority).map(([k, v]) =>
              `<div class="stats-row"><span style="color:${prioBorder[k] || '#6b7280'}">\u25CF</span> ${k}: <strong>${v}</strong></div>`
            ).join('')}
          </div>
          <div class="stats-col">
            <h4>Estado</h4>
            ${Object.entries(byStatus).map(([k, v]) =>
              `<div class="stats-row">${statusSymbol[k] || '\u25CB'} ${k}: <strong>${v}</strong></div>`
            ).join('')}
          </div>
          <div class="stats-col">
            <h4>Por Proyecto</h4>
            ${Object.entries(byProject).map(([k, v]) =>
              `<div class="stats-row">\u25AA ${k}: <strong>${v}</strong></div>`
            ).join('')}
          </div>
        </div>
      </div>`;
    }

    // Notes section
    let notesHtml = '';
    if (weekNotes.length > 0 && weekNotes.some(n => n.text.trim())) {
      notesHtml = `
      <div class="notes-section">
        <h3>Notas de la Semana</h3>
        ${weekNotes.filter(n => n.text.trim()).map(n =>
          `<div class="note-block">${n.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
        ).join('')}
      </div>`;
    }

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8">
      <title>Agenda Semanal — Archii</title>
      <style>
        @page { size: landscape; margin: 10mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'DM Sans', 'Segoe UI', system-ui, -apple-system, sans-serif; background: #fff; color: #1a1a1a; padding: 16px; font-size: 11px; }
        
        /* Header */
        .print-header { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 3px solid #3b82f6; }
        .print-logo { font-size: 22px; font-weight: 800; color: #3b82f6; letter-spacing: -0.5px; }
        .print-title { font-size: 16px; font-weight: 700; color: #1e293b; }
        .print-subtitle { font-size: 11px; color: #64748b; margin-top: 2px; }
        .print-meta { margin-left: auto; text-align: right; font-size: 10px; color: #94a3b8; }
        .print-meta div { margin-bottom: 1px; }

        /* Grid */
        .agenda-grid { display: grid; grid-template-columns: 54px repeat(7, 1fr); border: 1.5px solid #d1d5db; border-radius: 8px; overflow: hidden; }
        .col-header { background: #f1f5f9; border-bottom: 1.5px solid #d1d5db; border-right: 1px solid #e2e8f0; padding: 6px 3px; text-align: center; }
        .col-header.today { background: #3b82f6; color: #fff; }
        .col-header .day-name { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        .col-header .day-date { font-size: 9px; margin-top: 1px; opacity: 0.7; }
        .col-header.today .day-date { color: #dbeafe; }
        .time-label { background: #f8fafc; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 3px 5px; text-align: right; font-size: 9px; color: #94a3b8; display: flex; align-items: flex-start; justify-content: flex-end; height: 48px; }
        .slot { border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 2px; min-height: 48px; position: relative; vertical-align: top; }
        .slot.today { background: #eff6ff; }
        .slot:last-child { border-right: none; }

        /* Task cards */
        .task-card { border-radius: 4px; padding: 3px 5px; margin-bottom: 2px; font-size: 8.5px; line-height: 1.35; overflow: hidden; position: absolute; top: 2px; left: 2px; right: 2px; }
        .task-card .task-title { font-weight: 700; font-size: 9px; color: #1e293b; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .task-card .task-meta { color: #64748b; font-size: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .task-card .task-obs { color: #94a3b8; font-size: 7.5px; margin-top: 1px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* Stats */
        .stats-section { margin-top: 14px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
        .stats-section h3 { font-size: 12px; font-weight: 700; color: #1e293b; margin-bottom: 10px; }
        .stats-grid { display: flex; gap: 12px; margin-bottom: 10px; }
        .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 16px; text-align: center; min-width: 100px; }
        .stat-value { font-size: 20px; font-weight: 800; color: #3b82f6; }
        .stat-label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
        .stats-detail { display: flex; gap: 24px; }
        .stats-col { min-width: 140px; }
        .stats-col h4 { font-size: 10px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
        .stats-row { font-size: 10px; color: #64748b; padding: 1px 0; }
        .stats-row strong { color: #1e293b; }

        /* Notes */
        .notes-section { margin-top: 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
        .notes-section h3 { font-size: 12px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }
        .note-block { background: #fef9c3; border-radius: 4px; padding: 6px 10px; margin-bottom: 4px; font-size: 10px; white-space: pre-wrap; color: #713f12; }

        /* Footer */
        .print-footer { margin-top: 10px; padding-top: 6px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }

        @media print {
          body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-header { break-inside: avoid; }
          .agenda-grid { break-inside: avoid; }
          .stats-section { break-inside: avoid; }
          .notes-section { break-inside: avoid; }
        }
      </style>
    </head><body>
      <div class="print-header">
        <div>
          <div class="print-logo">Archii</div>
        </div>
        <div>
          <div class="print-title">Agenda Semanal</div>
          <div class="print-subtitle">${weekLabel}${filterLabel ? ` &middot; Proyecto: ${filterLabel}` : ''}</div>
        </div>
        <div class="print-meta">
          <div>Generado: ${genDate}</div>
        </div>
      </div>

      <div class="agenda-grid">
        ${colHeaders}
        ${gridRows}
      </div>

      ${statsHtml}
      ${notesHtml}

      <div class="print-footer">
        <span>Archii \u2014 Gesti\u00f3n de Proyectos de Construcci\u00f3n</span>
        <span>Agenda Semanal ${weekLabel}</span>
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  /* ─── Global mouse up listener ─── */
  useEffect(() => {
    const handler = () => {
      if (drag?.active) {
        handleCellMouseUp();
      }
    };
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  });

  /* ─── Compute drag-selected hours ─── */
  const dragSelectedHours = useMemo(() => {
    if (!drag?.active) return new Set<string>();
    const minH = Math.min(drag.startHour, drag.currentHour);
    const maxH = Math.max(drag.startHour, drag.currentHour);
    const s = new Set<string>();
    for (let h = minH; h <= maxH; h++) {
      s.add(`${drag.dayKey}:${h}`);
    }
    return s;
  }, [drag]);

  /* ─── Linkable tasks (existing tasks without agendaMeta) ─── */
  const linkableTasks = useMemo(() => {
    return (ctxTasks || [])
      .filter(t => !t.data.agendaMeta)
      .filter(t => !linkFilterProject || t.data.projectId === linkFilterProject)
      .filter(t => {
        if (!linkSearch) return true;
        const q = linkSearch.toLowerCase();
        return (
          (t.data.title || '').toLowerCase().includes(q) ||
          (projectMap[t.data.projectId] || '').toLowerCase().includes(q)
        );
      });
  }, [ctxTasks, linkFilterProject, linkSearch, projectMap]);

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */

  return (
    <div className="h-full flex flex-col" ref={printRef}>
      {/* ─── Header Toolbar ─── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-1.5 md:gap-2 px-3 md:px-6 py-2 md:py-3 border-b border-[var(--border)] bg-[var(--card)]">
        <CalendarDays className="w-5 h-5 text-[var(--primary)] flex-shrink-0" aria-hidden="true"/>
        <h2 className="text-sm font-semibold mr-2 hidden sm:block">Agenda Semanal</h2>

        {/* Week nav */}
        <button onClick={prevWeek} className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" aria-label="Semana anterior">
          <ChevronLeft className="w-4 h-4" aria-hidden="true"/>
        </button>
        <span className="text-[10px] sm:text-xs font-medium min-w-[100px] sm:min-w-[180px] text-center">{weekLabel}</span>
        <button onClick={nextWeek} className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" aria-label="Semana siguiente">
          <ChevronRight className="w-4 h-4" aria-hidden="true"/>
        </button>
        <button onClick={goToday} className="text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 active:scale-95 transition-transform">
          Hoy
        </button>

        <div className="flex-1" />

        {/* Project filter */}
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="text-[10px] sm:text-xs rounded-lg border border-[var(--border)] bg-[var(--input)] px-2 py-1.5 max-w-[120px] sm:max-w-[160px] truncate no-print">
          <option value="all">Todos los proyectos</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}
        </select>

        {/* Print */}
        <button onClick={handlePrint}
          className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform no-print"
          aria-label="Imprimir agenda">
          <Printer className="w-4 h-4" aria-hidden="true"/>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MOBILE VIEW — Card Timeline (completely different from desktop)
          ═══════════════════════════════════════════════════════════════ */}
      {isMobile && (
        <div className="flex-1 overflow-auto">
          {/* Day Selector */}
          <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto no-print" style={{ scrollbarWidth: 'none' }}>
            {weekDates.map((d, i) => {
              const dk = dateKey(d);
              const isToday = dk === todayKey;
              const isActive = i === mobileDayIdx;
              const dayTasks = agendaTasks.filter(t => t.data.agendaMeta?.dayKey === dk);
              return (
                <button
                  key={dk}
                  onClick={() => setMobileDayIdx(i)}
                  className="flex flex-col items-center px-3 py-1.5 rounded-xl transition-all flex-shrink-0"
                  style={{
                    background: isActive ? 'var(--primary)' : isToday ? 'var(--accent)' : 'var(--af-bg3)',
                    color: isActive ? 'var(--primary-foreground)' : 'var(--foreground)',
                    border: isActive ? 'none' : '1px solid var(--border)',
                    minWidth: '46px',
                  }}
                >
                  <span className="text-[9px] font-semibold uppercase">{DAY_NAMES[i]}</span>
                  <span className="text-sm font-bold">{d.getDate()}</span>
                  {dayTasks.length > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full mt-0.5" style={{ background: isActive ? 'var(--primary-foreground)' : 'var(--primary)' }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Day title */}
          {(() => {
            const d = weekDates[mobileDayIdx];
            const dk = dateKey(d);
            const isToday = dk === todayKey;
            const dayTasks = agendaTasks
              .filter(t => t.data.agendaMeta?.dayKey === dk)
              .sort((a, b) => {
                const aMin = a.data.agendaMeta?.hourSlots.length ? Math.min(...a.data.agendaMeta.hourSlots) : 99;
                const bMin = b.data.agendaMeta?.hourSlots.length ? Math.min(...b.data.agendaMeta.hourSlots) : 99;
                return aMin - bMin;
              });
            return (
              <div className="px-3 pb-3">
                {/* Day header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-base font-bold text-[var(--foreground)]">
                      {DAY_FULL[mobileDayIdx]}
                    </div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {fmtDay(d)} {isToday && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>Hoy</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => openCreateForm(dk, [new Date().getHours() >= 8 && new Date().getHours() <= 17 ? new Date().getHours() : 8])}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium no-print"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true"/>
                    Actividad
                  </button>
                </div>

                {/* Empty state */}
                {dayTasks.length === 0 && (
                  <div className="text-center py-12">
                    <CalendarDays className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--muted-foreground)', opacity: 0.4 }} aria-hidden="true"/>
                    <p className="text-sm text-[var(--muted-foreground)]">Sin actividades este d\u00eda</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)', opacity: 0.7 }}>Toca el bot\u00f3n + para crear una</p>
                  </div>
                )}

                {/* Activity cards — sorted by time */}
                <div className="space-y-2">
                  {dayTasks.map(task => {
                    const meta = task.data.agendaMeta;
                    if (!meta) return null;
                    const pc = PRIO_COLORS[task.data.priority] || PRIO_COLORS['Media'];
                    const doneSubtasks = (task.data.subtasks || []).filter(s => s.done).length;
                    const totalSubtasks = (task.data.subtasks || []).length;

                    return (
                      <div
                        key={task.id}
                        className={`rounded-xl overflow-hidden ${pc.bg}`}
                        style={{ borderLeft: `4px solid`, borderLeftColor: task.data.priority === 'Alta' ? '#ef4444' : task.data.priority === 'Cr\u00edtica' ? '#a855f7' : task.data.priority === 'Baja' ? '#10b981' : '#f59e0b' }}
                      >
                        {/* Card header — tappable */}
                        <button
                          className="w-full text-left px-3 py-2.5 no-print"
                          onClick={() => openEditForm(task)}
                          style={{ background: 'transparent' }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {/* Title row */}
                              <div className="flex items-center gap-1.5 mb-1">
                                {STATUS_ICON[task.data.status]}
                                <span className="text-sm font-semibold truncate text-[var(--foreground)]">
                                  {task.data.title}
                                </span>
                              </div>
                              {/* Time + priority */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                                  <Clock className="w-3 h-3" aria-hidden="true"/>
                                  {formatHourRange(meta.hourSlots)}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${pc.text} bg-[var(--af-bg3)]`}>
                                  {task.data.priority}
                                </span>
                              </div>
                            </div>
                            {/* Delete button */}
                            <button
                              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                              style={{ background: 'rgba(239,68,68,0.1)' }}
                              onClick={e => { e.stopPropagation(); setConfirmDelete(task.id); }}
                              aria-label="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" aria-hidden="true"/>
                            </button>
                          </div>
                        </button>

                        {/* Card details (project, assignee, subtasks) */}
                        {(task.data.projectId || task.data.assigneeId || totalSubtasks > 0 || meta.participantIds.length > 0) && (
                          <div className="px-3 pb-2.5 pt-0 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--muted-foreground)]">
                            {task.data.projectId && (
                              <span className="flex items-center gap-1">
                                <FolderOpen className="w-3 h-3" aria-hidden="true"/>
                                <span className="truncate max-w-[140px]">{projectMap[task.data.projectId] || '\u2014'}</span>
                              </span>
                            )}
                            {task.data.assigneeId && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" aria-hidden="true"/>
                                <span className="truncate max-w-[100px]">{userMap[task.data.assigneeId]?.name || ''}</span>
                              </span>
                            )}
                            {meta.participantIds.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" aria-hidden="true"/>
                                {meta.participantIds.length}
                              </span>
                            )}
                            {totalSubtasks > 0 && (
                              <span className="flex items-center gap-1">
                                <ListChecks className="w-3 h-3" aria-hidden="true"/>
                                {doneSubtasks}/{totalSubtasks}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Quick hour slots — tap to create at specific time */}
                {dayTasks.length > 0 && (
                  <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 no-print text-[var(--muted-foreground)]">
                      Crear en hora...
                    </p>
                    <div className="flex flex-wrap gap-1.5 no-print">
                      {HOURS.map(h => (
                        <button
                          key={h}
                          onClick={() => openCreateForm(dk, [h])}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                          style={{ background: 'var(--af-bg3)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
                        >
                          {formatHourShort(h)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          DESKTOP VIEW — Grid Layout (unchanged)
          ═══════════════════════════════════════════════════════════════ */}
      {!isMobile && (
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col lg:flex-row gap-3">

          {/* ─── Agenda Grid ─── */}
          <div className="flex-1 agenda-grid-container" style={{ minWidth: 0 }}>
            <div
              className="agenda-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: '54px repeat(7, minmax(130px, 1fr))',
                border: '1.5px solid var(--border)',
                borderRadius: '10px',
                overflow: 'hidden',
                background: 'var(--card)',
              }}
            >
              {/* ─── Column Headers ─── */}
              <div style={{ background: 'var(--af-bg3)', borderBottom: '1.5px solid var(--border)', borderRight: '1px solid var(--border)' }} />
              {weekDates.map((d, i) => {
                const dk = dateKey(d);
                const isToday = dk === todayKey;
                return (
                  <div key={dk} style={{
                    background: isToday ? 'var(--primary)' : 'var(--af-bg3)',
                    borderBottom: '1.5px solid var(--border)',
                    borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                    color: isToday ? 'var(--primary-foreground)' : 'var(--foreground)',
                    padding: '8px 4px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {DAY_NAMES[i]}
                    </div>
                    <div style={{ fontSize: '10px', marginTop: 2, color: isToday ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}>
                      {fmtDay(d)}
                    </div>
                  </div>
                );
              })}

              {/* ─── Time Rows ─── */}
              {HOURS.map(hour => (
                <React.Fragment key={hour}>
                  {/* Time label */}
                  <div style={{
                    background: 'var(--af-bg3)',
                    borderRight: '1px solid var(--border)',
                    borderBottom: '1px solid var(--border)',
                    padding: '4px 6px',
                    textAlign: 'right',
                    fontSize: '10px',
                    color: 'var(--muted-foreground)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-end',
                    height: `${SLOT_H}px`,
                  }}>
                    {formatHour(hour)}
                  </div>

                  {/* Day cells — all 7 days */}
                  {weekDates.map((d, di) => {
                    const dk = dateKey(d);
                    const isToday = dk === todayKey;
                    const isDragSelected = dragSelectedHours.has(`${dk}:${hour}`);
                    const isTaskStart = taskStartHoursByDay[dk]?.has(hour);

                    // Get tasks that start at this hour on this day
                    const tasksStarting = isTaskStart ? (tasksByDayAndStartHour[`${dk}:${hour}`] || []) : [];

                    return (
                      <div
                        key={dk}
                        style={{
                          borderRight: di < 6 ? '1px solid var(--border)' : 'none',
                          borderBottom: '1px solid var(--border)',
                          minHeight: `${SLOT_H}px`,
                          height: `${SLOT_H}px`,
                          background: isDragSelected
                            ? 'var(--accent)'
                            : isToday
                              ? 'var(--accent)'
                              : 'var(--card)',
                          position: 'relative' as const,
                          cursor: 'pointer',
                          overflow: isTaskStart ? 'visible' as const : 'hidden' as const,
                        }}
                        className="group/slot"
                        onMouseDown={() => handleCellMouseDown(dk, hour)}
                        onMouseEnter={() => handleCellMouseEnter(dk, hour)}
                        onMouseUp={() => handleCellMouseUp()}
                        onClick={() => {
                          if (!drag?.active) {
                            handleCellClick(dk, hour);
                          }
                        }}
                      >
                        {/* Render tall activity blocks at their start hour, with overlap columns */}
                        {tasksStarting.map(task => {
                          const meta = task.data.agendaMeta;
                          if (!meta) return null;
                          const minH = Math.min(...meta.hourSlots);
                          const maxH = Math.max(...meta.hourSlots);
                          const spanCount = maxH - minH + 1;
                          const blockHeight = spanCount * SLOT_H;
                          const pc = PRIO_COLORS[task.data.priority] || PRIO_COLORS['Media'];
                          const doneSubtasks = (task.data.subtasks || []).filter(s => s.done).length;
                          const totalSubtasks = (task.data.subtasks || []).length;

                          // Overlap layout: compute left/width based on column assignment
                          const info = overlapLayout[task.id] || { col: 0, totalCols: 1 };
                          const GAP = 2; // px between columns
                          const cellPadding = 4; // total horizontal padding (2px each side)
                          const availWidth = `calc((100% - ${cellPadding}px - ${(info.totalCols - 1) * GAP}px) / ${info.totalCols})`;
                          const leftPos = `calc(2px + ${info.col} * (${availWidth} + ${GAP}px))`;

                          // When overlapping, show less detail to save space
                          const isNarrow = info.totalCols >= 3;
                          const isMedium = info.totalCols === 2;

                          return (
                            <div
                              key={task.id}
                              className={`${pc.bg} ${pc.border} group-hover/slot:opacity-70 hover:!opacity-100 no-print-hover transition-opacity`}
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: leftPos,
                                width: availWidth,
                                height: `${blockHeight - 4}px`,
                                borderLeftWidth: '3px',
                                borderLeftStyle: 'solid',
                                borderRadius: '6px',
                                padding: isNarrow ? '2px 3px' : '4px 6px',
                                fontSize: isNarrow ? '8px' : '10px',
                                lineHeight: 1.3,
                                cursor: 'pointer',
                                zIndex: 10,
                                overflow: 'hidden',
                              }}
                              onMouseDown={e => e.stopPropagation()}
                              onClick={e => { e.stopPropagation(); openEditForm(task); }}
                            >
                              {/* Title + priority dot */}
                              <div className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${pc.dot} flex-shrink-0`} />
                                <span style={{ fontWeight: 600, color: 'var(--foreground)' }} className="truncate text-[11px]">
                                  {task.data.title}
                                </span>
                              </div>

                              {/* Time range */}
                              {!isNarrow && (
                                <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted-foreground)', fontSize: '9px' }}>
                                  <Clock className="w-2.5 h-2.5" aria-hidden="true"/>
                                  <span>{formatHourRange(meta.hourSlots)}</span>
                                </div>
                              )}

                              {/* Project */}
                              {!isNarrow && !isMedium && task.data.projectId && (
                                <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted-foreground)', fontSize: '9px' }}>
                                  <FolderOpen className="w-2.5 h-2.5" aria-hidden="true"/>
                                  <span className="truncate">{projectMap[task.data.projectId] || '\u2014'}</span>
                                </div>
                              )}

                              {/* Responsable + participants */}
                              {!isNarrow && (
                                <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: '9px' }}>
                                  {STATUS_ICON[task.data.status]}
                                  <span className="truncate text-[var(--muted-foreground)]">
                                    {userMap[task.data.assigneeId]?.name || ''}
                                  </span>
                                  {!isMedium && meta.participantIds.length > 0 && (
                                    <span className="flex items-center gap-0.5 ml-1 text-[var(--muted-foreground)]">
                                      <Users className="w-2.5 h-2.5" aria-hidden="true"/>
                                      {meta.participantIds.length}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Subtasks */}
                              {!isNarrow && !isMedium && totalSubtasks > 0 && (
                                <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted-foreground)', fontSize: '9px' }}>
                                  <ListChecks className="w-2.5 h-2.5" aria-hidden="true"/>
                                  <span>{doneSubtasks}/{totalSubtasks}</span>
                                </div>
                              )}

                              {/* Agenda badge */}
                              {!isNarrow && meta.isAgendaItem && (
                                <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[8px] font-semibold"
                                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                                  Agenda
                                </span>
                              )}

                              {/* Delete button */}
                              <button
                                className="absolute top-1 left-1 w-5 h-5 rounded flex items-center justify-center opacity-0 hover:!opacity-100 transition-opacity z-[15]"
                                style={{ background: 'rgba(239,68,68,0.8)', color: '#fff', fontSize: '8px' }}
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => { e.stopPropagation(); setConfirmDelete(task.id); }}
                                aria-label="Eliminar actividad"
                              >
                                <X className="w-3 h-3" aria-hidden="true"/>
                              </button>
                            </div>
                          );
                        })}

                        {/* + button to create new activity */}
                        <button
                          className="absolute right-0.5 top-0.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover/slot:opacity-80 hover:!opacity-100 transition-opacity no-print z-[15]"
                          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: '10px' }}
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation();
                            handleCellClick(dk, hour);
                          }}
                          aria-label="Crear actividad"
                        >
                          <Plus className="w-3 h-3" aria-hidden="true"/>
                        </button>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* ─── Notes Panel — hidden on mobile ─── */}
          <div className="lg:w-52 flex-shrink-0 flex-col gap-2 no-print lg:min-w-[200px] hidden md:flex" style={{ minWidth: 0 }}>
            <div className="flex items-center gap-2 px-2 flex-shrink-0 lg:flex-shrink">
              <StickyNote className="w-4 h-4 text-amber-500" aria-hidden="true"/>
              <span className="text-xs font-semibold whitespace-nowrap">Notas</span>
              <div className="flex-1 hidden lg:block" />
              <button onClick={addNote} className="w-6 h-6 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" aria-label="Agregar nota">
                <Plus className="w-3.5 h-3.5" aria-hidden="true"/>
              </button>
            </div>

            {weekNotes.map(note => (
              <div key={note.id} style={{ background: note.color }} className="rounded-lg p-2.5 relative group/note w-44 lg:w-auto flex-shrink-0 lg:flex-shrink">
                <textarea
                  value={note.text}
                  onChange={e => updateNote(note.id, e.target.value)}
                  placeholder="Escribe una nota..."
                  className="w-full bg-transparent text-xs resize-none outline-none placeholder:text-[var(--muted-foreground)] min-h-[60px] text-[var(--foreground)]"
                  rows={3}
                />
                <button
                  onClick={() => deleteNote(note.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded bg-black/10 dark:bg-white/10 text-[var(--muted-foreground)] flex items-center justify-center opacity-0 group-hover/note:opacity-100 transition-opacity hover:bg-red-200 dark:hover:bg-red-800"
                  aria-label="Eliminar nota"
                >
                  <Trash2 className="w-3 h-3" aria-hidden="true"/>
                </button>
              </div>
            ))}

            {weekNotes.length === 0 && (
              <div className="text-center py-4 px-2 w-44 lg:w-auto flex-shrink-0 lg:flex-shrink">
                <StickyNote className="w-6 h-6 text-amber-500/50 dark:text-amber-400/40 mx-auto mb-1" aria-hidden="true"/>
                <p className="text-[10px] text-[var(--muted-foreground)]">Sin notas esta semana</p>
              </div>
            )}

            {/* Legend - hidden on mobile, visible on desktop */}
            <div className="mt-auto border-t border-[var(--border)] pt-3 px-1 hidden lg:block">
              <p className="text-[10px] font-semibold mb-2 text-[var(--muted-foreground)] uppercase tracking-wider">Prioridades</p>
              {Object.entries(PRIO_COLORS).map(([key, pc]) => (
                <div key={key} className="flex items-center gap-2 mb-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${pc.dot}`} />
                  <span className="text-[10px]">{key}</span>
                </div>
              ))}
              <p className="text-[10px] font-semibold mt-3 mb-2 text-[var(--muted-foreground)] uppercase tracking-wider">Estados</p>
              {STATUSES.map(s => (
                <div key={s} className="flex items-center gap-2 mb-1">
                  {STATUS_ICON[s]}
                  <span className="text-[10px]">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ─── Confirm Delete Dialog ─── */}
      {confirmDelete && (() => {
        const taskToDelete = agendaTasks.find(t => t.id === confirmDelete);
        const meta = taskToDelete?.data.agendaMeta;
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 no-print" onClick={() => setConfirmDelete(null)}>
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-2xl w-full max-w-sm p-5 af-modal-mobile" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-500" aria-hidden="true"/>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Eliminar actividad</h3>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {meta?.isAgendaItem
                      ? 'Se eliminara la tarea completa del sistema.'
                      : 'Solo se quitara de la agenda. La tarea permanecera en Tareas.'}
                  </p>
                </div>
              </div>
              {taskToDelete && (
                <p className="text-xs mb-4 px-1 text-[var(--foreground)]">
                  <strong>{taskToDelete.data.title}</strong>
                </p>
              )}
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => setConfirmDelete(null)}
                  className="text-xs px-4 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--af-bg3)] transition-colors">
                  Cancelar
                </button>
                <button onClick={() => taskToDelete && handleDelete(taskToDelete)}
                  className="text-xs px-4 py-2 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 active:scale-95 transition-all">
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Create / Edit / Link Modal ─── */}
      {showForm && (
        <div className={`fixed inset-0 z-50 flex no-print ${isMobile ? 'items-end' : 'items-center justify-center p-4'} bg-black/40`} onClick={closeForm}>
          <div
            className={`bg-[var(--card)] border border-[var(--border)] shadow-2xl w-full ${isMobile ? 'rounded-t-2xl border-b-0 max-h-[92vh] flex flex-col' : 'rounded-xl max-w-lg'}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Mobile drag handle */}
            {isMobile && (
              <div className="flex justify-center pt-2 pb-1 cursor-grab" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 rounded-full" style={{ background: 'var(--muted-foreground)', opacity: 0.3 }} />
              </div>
            )}
            {/* Modal Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary)', opacity: 0.12 }}>
                {editingTask ? (
                  <Edit3 className="w-4 h-4 text-[var(--primary)]" aria-hidden="true"/>
                ) : (
                  <Plus className="w-4 h-4 text-[var(--primary)]" aria-hidden="true"/>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold">
                  {editingTask ? 'Editar actividad' : 'Nueva actividad'}
                </h3>
                <p className="text-[10px] text-[var(--muted-foreground)]">
                  {formDayKey && (() => {
                    const dayIdx = weekDates.findIndex(d => dateKey(d) === formDayKey);
                    const dayName = dayIdx >= 0 ? DAY_FULL[dayIdx] : formDayKey;
                    const hours = form.hours;
                    if (hours.length === 1) {
                      return `${dayName} \u00b7 ${formatHour(hours[0])}`;
                    }
                    return `${dayName} \u00b7 ${formatHourRange(hours)}`;
                  })()}
                </p>
              </div>
              <div className="flex-1" />
              <button onClick={closeForm} className="w-8 h-8 rounded-lg hover:bg-[var(--af-bg3)] flex items-center justify-center" aria-label="Cerrar">
                <X className="w-4 h-4" aria-hidden="true"/>
              </button>
            </div>

            {/* Tabs (only when creating new, not editing) */}
            {!editingTask && (
              <div className="flex border-b border-[var(--border)]">
                <button
                  onClick={() => setFormTab('new')}
                  className="flex-1 px-4 py-2.5 text-xs font-medium text-center transition-colors"
                  style={{
                    borderBottom: formTab === 'new' ? '2px solid var(--primary)' : '2px solid transparent',
                    color: formTab === 'new' ? 'var(--primary)' : 'var(--muted-foreground)',
                  }}
                >
                  <Plus className="w-3.5 h-3.5 inline mr-1.5" aria-hidden="true"/>
                  Nueva tarea
                </button>
                <button
                  onClick={() => setFormTab('link')}
                  className="flex-1 px-4 py-2.5 text-xs font-medium text-center transition-colors"
                  style={{
                    borderBottom: formTab === 'link' ? '2px solid var(--primary)' : '2px solid transparent',
                    color: formTab === 'link' ? 'var(--primary)' : 'var(--muted-foreground)',
                  }}
                >
                  <Link2 className="w-3.5 h-3.5 inline mr-1.5" aria-hidden="true"/>
                  Vincular existente
                </button>
              </div>
            )}

            {/* Modal Body */}
            <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">

              {/* ══════ TAB: Nueva tarea ══════ */}
              {(formTab === 'new' || editingTask) && (
                <>
                  {/* Title */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <MessageSquare className="w-3 h-3" aria-hidden="true"/> Titulo *
                    </label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Nombre de la actividad"
                      className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--primary)]/30 text-[var(--foreground)]"
                      autoFocus
                    />
                  </div>

                  {/* Project */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <FolderOpen className="w-3 h-3" aria-hidden="true"/> Proyecto
                    </label>
                    <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
                      className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none text-[var(--foreground)]">
                      <option value="">Sin proyecto</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}
                    </select>
                  </div>

                  {/* Responsable */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <User className="w-3 h-3" aria-hidden="true"/> Responsable
                    </label>
                    <select value={form.assigneeId} onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value }))}
                      className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none text-[var(--foreground)]">
                      <option value="">Sin asignar</option>
                      {allUserOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>

                  {/* Participantes */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <Users className="w-3 h-3" aria-hidden="true"/> Participantes
                    </label>
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-[var(--border)] bg-[var(--input)] min-h-[36px]">
                      {allUserOptions.map(u => {
                        const isSelected = form.participantIds.includes(u.id);
                        // Don't show the assignee as a separate participant option to avoid confusion
                        // but still allow selecting them
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setForm(f => ({
                                ...f,
                                participantIds: isSelected
                                  ? f.participantIds.filter(id => id !== u.id)
                                  : [...f.participantIds, u.id],
                              }));
                            }}
                            className="text-[10px] px-2 py-1 rounded-md transition-colors"
                            style={{
                              background: isSelected ? 'var(--primary)' : 'var(--af-bg3)',
                              color: isSelected ? 'var(--primary-foreground)' : 'var(--foreground)',
                              border: isSelected ? 'none' : '1px solid var(--border)',
                            }}
                          >
                            {u.name}
                          </button>
                        );
                      })}
                      {allUserOptions.length === 0 && (
                        <span className="text-[10px] text-[var(--muted-foreground)]">No hay miembros en el equipo</span>
                      )}
                    </div>
                  </div>

                  {/* Priority + Status row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                        <Flag className="w-3 h-3" aria-hidden="true"/> Prioridad
                      </label>
                      <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                        className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none text-[var(--foreground)]">
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                        <CheckCircle2 className="w-3 h-3" aria-hidden="true"/> Estado
                      </label>
                      <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                        className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none text-[var(--foreground)]">
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Observations */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <MessageSquare className="w-3 h-3" aria-hidden="true"/> Observaciones
                    </label>
                    <textarea
                      value={form.observations}
                      onChange={e => setForm(f => ({ ...f, observations: e.target.value }))}
                      placeholder="Notas adicionales..."
                      className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--primary)]/30 resize-none text-[var(--foreground)]"
                      rows={2}
                    />
                  </div>

                  {/* Horas programadas */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <Clock className="w-3 h-3" aria-hidden="true"/> Horas programadas
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {form.hours.sort((a, b) => a - b).map(h => (
                        <span key={h} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
                          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                          {formatHourShort(h)}
                          <button
                            type="button"
                            onClick={() => removeHourFromForm(h)}
                            className="hover:opacity-70 transition-opacity"
                            aria-label={`Quitar ${formatHourShort(h)}`}
                          >
                            <X className="w-2.5 h-2.5" aria-hidden="true"/>
                          </button>
                        </span>
                      ))}
                      {/* Add hour button */}
                      <div className="relative">
                        <select
                          value=""
                          onChange={e => {
                            if (e.target.value) addHourToForm(Number(e.target.value));
                          }}
                          className="text-[10px] px-2 py-1 rounded-md border border-dashed border-[var(--border)] bg-[var(--af-bg3)] outline-none cursor-pointer text-[var(--muted-foreground)]"
                        >
                          <option value="">+ Agregar hora</option>
                          {HOURS.filter(h => !form.hours.includes(h)).map(h => (
                            <option key={h} value={h}>{formatHourShort(h)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {form.hours.length === 0 && (
                      <p className="text-[10px] text-red-400 mt-1">Selecciona al menos una hora</p>
                    )}
                  </div>

                  {/* Subtareas */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <ListChecks className="w-3 h-3" aria-hidden="true"/> Subtareas {form.subtasks.length > 0 ? `(${form.subtasks.filter(s => s.done).length}/${form.subtasks.length})` : ''}
                    </label>
                    <div className="space-y-2">
                      {form.subtasks.map((st, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={st.done}
                            onChange={e => updateSubtask(idx, 'done', e.target.checked)}
                            className="w-3.5 h-3.5 rounded flex-shrink-0 accent-[var(--af-accent)]"
                            style={{ accentColor: 'var(--af-accent)' }}
                          />
                          <input
                            type="text"
                            value={st.text}
                            onChange={e => updateSubtask(idx, 'text', e.target.value)}
                            placeholder={`Subtarea ${idx + 1}`}
                            className={`flex-1 text-[12px] bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--af-accent)]/50 ${st.done ? 'line-through' : ''}`}
                            style={{ color: st.done ? 'var(--muted-foreground)' : 'var(--foreground)' }}
                          />
                          <button
                            type="button"
                            className="text-[var(--muted-foreground)] hover:text-red-400 cursor-pointer bg-transparent border-none p-0 flex-shrink-0"
                            onClick={() => removeSubtask(idx)}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true"/>
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:underline bg-transparent border-none p-0 font-medium"
                        style={{ color: 'var(--af-accent)' }}
                        onClick={addSubtask}
                      >
                        <Plus className="w-3 h-3" aria-hidden="true"/> Agregar subtarea
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* ══════ TAB: Vincular existente ══════ */}
              {formTab === 'link' && !editingTask && (
                <>
                  {/* Project filter */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <FolderOpen className="w-3 h-3" aria-hidden="true"/> Filtrar por proyecto
                    </label>
                    <select value={linkFilterProject} onChange={e => setLinkFilterProject(e.target.value)}
                      className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none text-[var(--foreground)]">
                      <option value="">Todos los proyectos</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}
                    </select>
                  </div>

                  {/* Search */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <Search className="w-3 h-3" aria-hidden="true"/> Buscar tarea
                    </label>
                    <input
                      type="text"
                      value={linkSearch}
                      onChange={e => setLinkSearch(e.target.value)}
                      placeholder="Buscar por titulo o proyecto..."
                      className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--primary)]/30 text-[var(--foreground)]"
                    />
                  </div>

                  {/* Task list */}
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--af-bg3)]">
                    {linkableTasks.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-[10px] text-[var(--muted-foreground)]">No hay tareas disponibles para vincular</p>
                      </div>
                    ) : (
                      linkableTasks.slice(0, 20).map(t => {
                        const isSelected = linkTaskId === t.id;
                        const pc = PRIO_COLORS[t.data.priority] || PRIO_COLORS['Media'];
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setLinkTaskId(isSelected ? '' : t.id);
                              if (!isSelected) {
                                setForm(f => ({
                                  ...f,
                                  title: t.data.title,
                                  projectId: t.data.projectId || '',
                                  assigneeId: t.data.assigneeId || '',
                                  priority: t.data.priority || 'Media',
                                  status: t.data.status || 'Por hacer',
                                  observations: t.data.description || '',
                                  subtasks: t.data.subtasks || [],
                                }));
                              }
                            }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors border-b border-[var(--border)] last:border-b-0"
                            style={{
                              background: isSelected ? 'var(--accent)' : 'transparent',
                            }}
                          >
                            <span className={`w-2 h-2 rounded-full ${pc.dot} flex-shrink-0`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate text-[var(--foreground)]">{t.data.title}</p>
                              <p className="text-[9px] truncate text-[var(--muted-foreground)]">
                                {projectMap[t.data.projectId] || 'Sin proyecto'} &middot; {userMap[t.data.assigneeId]?.name || 'Sin asignar'}
                              </p>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-[var(--primary)]" aria-hidden="true"/>
                            )}
                          </button>
                        );
                      })
                    )}
                    {linkableTasks.length > 20 && (
                      <p className="text-[9px] text-center py-1 text-[var(--muted-foreground)]">
                        Mostrando 20 de {linkableTasks.length} tareas
                      </p>
                    )}
                  </div>

                  {/* Selected task info */}
                  {linkTaskId && (() => {
                    const selTask = ctxTasks.find(t => t.id === linkTaskId);
                    if (!selTask) return null;
                    const pc = PRIO_COLORS[selTask.data.priority] || PRIO_COLORS['Media'];
                    return (
                      <div className={`rounded-lg p-3 ${pc.bg} border-l-4 ${pc.border}`}>
                        <p className="text-xs font-semibold mb-1 text-[var(--foreground)]">{selTask.data.title}</p>
                        <div className="flex items-center gap-3 text-[10px] text-[var(--muted-foreground)]">
                          <span className="flex items-center gap-1"><FolderOpen className="w-2.5 h-2.5" aria-hidden="true"/>{projectMap[selTask.data.projectId] || 'Sin proyecto'}</span>
                          <span className="flex items-center gap-1"><User className="w-2.5 h-2.5" aria-hidden="true"/>{userMap[selTask.data.assigneeId]?.name || 'Sin asignar'}</span>
                          <span className={pc.text}>{selTask.data.priority}</span>
                        </div>
                        {((selTask.data.subtasks || [])).length > 0 && (
                          <p className="text-[9px] mt-1 text-[var(--muted-foreground)]">
                            Subtareas: {(selTask.data.subtasks || []).filter(s => s.done).length}/{(selTask.data.subtasks || []).length}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Participantes adicionales (link) */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <Users className="w-3 h-3" aria-hidden="true"/> Participantes adicionales
                    </label>
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-[var(--border)] bg-[var(--input)] min-h-[36px]">
                      {allUserOptions.map(u => {
                        const isSelected = form.participantIds.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setForm(f => ({
                                ...f,
                                participantIds: isSelected
                                  ? f.participantIds.filter(id => id !== u.id)
                                  : [...f.participantIds, u.id],
                              }));
                            }}
                            className="text-[10px] px-2 py-1 rounded-md transition-colors"
                            style={{
                              background: isSelected ? 'var(--primary)' : 'var(--af-bg3)',
                              color: isSelected ? 'var(--primary-foreground)' : 'var(--foreground)',
                              border: isSelected ? 'none' : '1px solid var(--border)',
                            }}
                          >
                            {u.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Horas programadas (link) */}
                  <div>
                    <label className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1 mb-1">
                      <Clock className="w-3 h-3" aria-hidden="true"/> Horas programadas
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {form.hours.sort((a, b) => a - b).map(h => (
                        <span key={h} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
                          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                          {formatHourShort(h)}
                          <button type="button" onClick={() => removeHourFromForm(h)} className="hover:opacity-70 transition-opacity">
                            <X className="w-2.5 h-2.5" aria-hidden="true"/>
                          </button>
                        </span>
                      ))}
                      <select
                        value=""
                        onChange={e => {
                          if (e.target.value) addHourToForm(Number(e.target.value));
                        }}
                        className="text-[10px] px-2 py-1 rounded-md border border-dashed border-[var(--border)] bg-[var(--af-bg3)] outline-none cursor-pointer text-[var(--muted-foreground)]"
                      >
                        <option value="">+ Agregar hora</option>
                        {HOURS.filter(h => !form.hours.includes(h)).map(h => (
                          <option key={h} value={h}>{formatHourShort(h)}</option>
                        ))}
                      </select>
                    </div>
                    {form.hours.length === 0 && (
                      <p className="text-[10px] text-red-400 mt-1">Selecciona al menos una hora</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--border)]">
              {editingTask && (
                <button
                  onClick={() => setConfirmDelete(editingTask.id)}
                  className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 transition-colors mr-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true"/> Eliminar
                </button>
              )}
              <div className="flex-1" />
              <button onClick={closeForm}
                className="text-xs px-4 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--af-bg3)] transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (editingTask) {
                    handleUpdateTask();
                  } else if (formTab === 'new') {
                    handleSaveNew();
                  } else {
                    handleLinkExisting();
                  }
                }}
                disabled={saving || !form.title.trim() || form.hours.length === 0 || (formTab === 'link' && !linkTaskId)}
                className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                {saving ? 'Guardando...' : editingTask ? 'Guardar' : formTab === 'new' ? 'Crear' : 'Vincular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
