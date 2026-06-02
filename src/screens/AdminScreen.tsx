'use client';
import React from 'react';
import { useApp } from '@/contexts/AppContext';
import { fmtDate, getInitials, statusColor, avatarColor } from '@/lib/helpers';
import { isOverdue as checkOverdue } from '@/lib/kanban-helpers';
import { ShieldCheck, Loader2, Trash2, Shield, Search, ChevronDown, ChevronRight, CheckCircle2, Star, MessageSquare, RefreshCw, Filter, FileText, Bug, AlertTriangle } from 'lucide-react';
import { ADMIN_EMAILS, USER_ROLES, ROLE_COLORS, ROLE_ICONS } from '@/lib/types';
import { getFirebase, getAuthHeaders } from '@/lib/firebase-service';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import ConfirmDialog from '@/components/common/ConfirmDialog';

/* ===== Types for admin data ===== */
interface AuditLog {
  id: string;
  collection: string;
  docId: string;
  action: string;
  userId: string;
  userName: string;
  tenantId: string;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  changes?: Record<string, { from: any; to: any }>;
  timestamp: string;
  createdAt?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

interface ErrorReportGroup {
  message: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  ids: string[];
  resolved: boolean;
  sampleStack?: string;
  sampleComponentStack?: string;
  sampleScreen?: string;
  sampleUserAgent?: string;
  reports: any[];
}

interface FeedbackEntry {
  id: string;
  category: string;
  rating: number;
  text: string;
  screen?: string;
  userAgent?: string;
  timestamp: string;
  reviewed?: boolean;
  reviewedAt?: string;
  reviewedBy?: string;
  adminNote?: string;
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-emerald-500/15 text-emerald-400',
  update: 'bg-amber-500/15 text-amber-400',
  delete: 'bg-red-500/15 text-red-400',
  archive: 'bg-gray-500/15 text-gray-400',
  restore: 'bg-blue-500/15 text-blue-400',
  import: 'bg-purple-500/15 text-purple-400',
  export: 'bg-cyan-500/15 text-cyan-400',
};

const FEEDBACK_CATEGORY_COLORS: Record<string, string> = {
  bug: 'bg-red-500/15 text-red-400 border-red-500/30',
  feature: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  ux: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  performance: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  other: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

const FEEDBACK_CATEGORY_LABELS: Record<string, string> = {
  bug: '🐛 Bug',
  feature: '💡 Sugerencia',
  ux: '🎨 UX',
  performance: '⚡ Rendimiento',
  other: '💬 Otro',
};

export default function AdminScreen() {
  // Track deleting state per user ID (outside of .map to avoid hooks violation)
  const [deletingIds, setDeletingIds] = React.useState<Set<string>>(new Set());
  const confirmDialog = useConfirmDialog();
  const setDeleting = (uid: string, val: boolean) => {
    setDeletingIds(prev => {
      const next = new Set(prev);
      if (val) next.add(uid); else next.delete(uid);
      return next;
    });
  };
  const {
    GANTT_DAYS, GANTT_DAY_NAMES, GANTT_PRIO_CFG, GANTT_STATUS_CFG, activeTasks,
    activeTenantId,
    adminPermSection, adminTab, adminTooltipPos, adminTooltipTask, authUser,
    buildGanttRows, completedTasks, findOverlaps, getGanttDays, getProjectColor,
    getProjectColorLight, getTaskBar, getUserName, isAdmin, overdueTasks,
    projects, rolePerms, setAdminPermSection, setAdminTab, setAdminTooltipPos,
    setAdminTooltipTask, setAdminWeekOffset, showToast, tasks, teamUsers,
    toggleRolePerm, updateUserRole,
  } = useApp();

  // ===== Audit tab state =====
  const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = React.useState(false);
  const [auditPage, setAuditPage] = React.useState(1);
  const [auditHasMore, setAuditHasMore] = React.useState(false);
  const [auditTotal, setAuditTotal] = React.useState(0);
  const [auditSearch, setAuditSearch] = React.useState('');
  const [auditActionFilter, setAuditActionFilter] = React.useState('');
  const [auditExpandedId, setAuditExpandedId] = React.useState<string | null>(null);

  // ===== Errors tab state =====
  const [errorGroups, setErrorGroups] = React.useState<ErrorReportGroup[]>([]);
  const [errorsLoading, setErrorsLoading] = React.useState(false);
  const [errorsPage, setErrorsPage] = React.useState(1);
  const [errorsHasMore, setErrorsHasMore] = React.useState(false);
  const [errorsTotal, setErrorsTotal] = React.useState(0);
  const [unresolvedCount, setUnresolvedCount] = React.useState(0);
  const [errorsResolvedFilter, setErrorsResolvedFilter] = React.useState<string>('unresolved');
  const [expandedErrorKey, setExpandedErrorKey] = React.useState<string | null>(null);
  const [resolvingIds, setResolvingIds] = React.useState<Set<string>>(new Set());

  // ===== Feedback tab state =====
  const [feedbackEntries, setFeedbackEntries] = React.useState<FeedbackEntry[]>([]);
  const [feedbackLoading, setFeedbackLoading] = React.useState(false);
  const [feedbackPage, setFeedbackPage] = React.useState(1);
  const [feedbackHasMore, setFeedbackHasMore] = React.useState(false);
  const [feedbackTotal, setFeedbackTotal] = React.useState(0);
  const [feedbackReviewedCount, setFeedbackReviewedCount] = React.useState(0);
  const [feedbackCategoryFilter, setFeedbackCategoryFilter] = React.useState('');
  const [reviewingId, setReviewingId] = React.useState<string | null>(null);
  const [feedbackNote, setFeedbackNote] = React.useState('');

  // ===== Auto-refresh timer for audit logs =====
  const auditRefreshRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // ===== Fetch functions =====
  const fetchAuditLogs = React.useCallback(async (page: number = 1, append = false) => {
    if (!activeTenantId) return;
    setAuditLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          action: 'audit-logs',
          tenantId: activeTenantId,
          collection: auditSearch || undefined,
          filterAction: auditActionFilter || undefined,
          page,
          pageSize: 20,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Error al cargar auditoría', 'error'); setAuditLoading(false); return; }
      setAuditLogs(append ? prev => [...prev, ...data.logs] : data.logs);
      setAuditHasMore(data.hasMore);
      setAuditTotal(data.totalCount);
      setAuditPage(page);
    } catch {
      showToast('Error de conexión', 'error');
    } finally {
      setAuditLoading(false);
    }
  }, [activeTenantId, auditSearch, auditActionFilter, showToast]);

  const fetchErrors = React.useCallback(async (page: number = 1) => {
    setErrorsLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const resolved = errorsResolvedFilter === 'resolved' ? true : errorsResolvedFilter === 'unresolved' ? false : undefined;
      const res = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          action: 'error-reports',
          resolved,
          page,
          pageSize: 20,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Error al cargar errores', 'error'); setErrorsLoading(false); return; }
      setErrorGroups(data.grouped || []);
      setErrorsHasMore(data.hasMore);
      setErrorsTotal(data.totalCount);
      setUnresolvedCount(data.unresolvedCount);
      setErrorsPage(page);
    } catch {
      showToast('Error de conexión', 'error');
    } finally {
      setErrorsLoading(false);
    }
  }, [errorsResolvedFilter, showToast]);

  const fetchFeedback = React.useCallback(async (page: number = 1) => {
    setFeedbackLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          action: 'beta-feedback',
          category: feedbackCategoryFilter || undefined,
          page,
          pageSize: 20,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Error al cargar feedback', 'error'); setFeedbackLoading(false); return; }
      setFeedbackEntries(data.entries || []);
      setFeedbackHasMore(data.hasMore);
      setFeedbackTotal(data.totalCount);
      setFeedbackReviewedCount(data.reviewedCount);
      setFeedbackPage(page);
    } catch {
      showToast('Error de conexión', 'error');
    } finally {
      setFeedbackLoading(false);
    }
  }, [feedbackCategoryFilter, showToast]);

  // ===== Action handlers =====
  const handleResolveError = async (errorId: string) => {
    setResolvingIds(prev => new Set(prev).add(errorId));
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ action: 'resolve-error', errorId }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Error al resolver', 'error'); return; }
      showToast('Error marcado como resuelto');
      fetchErrors(1);
    } catch {
      showToast('Error de conexión', 'error');
    } finally {
      setResolvingIds(prev => { const n = new Set(prev); n.delete(errorId); return n; });
    }
  };

  const handleReviewFeedback = async (feedbackId: string) => {
    if (reviewingId !== feedbackId) {
      setReviewingId(feedbackId);
      setFeedbackNote('');
      return;
    }
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ action: 'review-feedback', feedbackId, adminNote: feedbackNote || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Error al revisar', 'error'); return; }
      showToast('Feedback marcado como revisado');
      setReviewingId(null);
      setFeedbackNote('');
      fetchFeedback(feedbackPage);
    } catch {
      showToast('Error de conexión', 'error');
    }
  };

  // ===== Data fetching on tab change =====
  React.useEffect(() => {
    if (adminTab === 'audit' && activeTenantId) {
      fetchAuditLogs(1);
    }
  }, [adminTab, activeTenantId, auditSearch, auditActionFilter]);

  React.useEffect(() => {
    if (adminTab === 'errors') {
      fetchErrors(1);
    }
  }, [adminTab, errorsResolvedFilter]);

  React.useEffect(() => {
    if (adminTab === 'feedback') {
      fetchFeedback(1);
    }
  }, [adminTab, feedbackCategoryFilter]);

  // ===== Auto-refresh audit logs every 30s =====
  React.useEffect(() => {
    if (auditRefreshRef.current) clearInterval(auditRefreshRef.current);
    if (adminTab === 'audit' && activeTenantId) {
      auditRefreshRef.current = setInterval(() => {
        fetchAuditLogs(auditPage);
      }, 30000);
    }
    return () => {
      if (auditRefreshRef.current) clearInterval(auditRefreshRef.current);
    };
  }, [adminTab, activeTenantId, auditPage, fetchAuditLogs]);

  // ===== Star rating component =====
  const StarRating = ({ rating }: { rating: number }) => (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={12}
          className={i <= rating ? 'fill-amber-400 text-amber-400' : 'text-[var(--muted-foreground)]/30'}
        />
      ))}
    </div>
  );

  // ===== Format relative time =====
  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `Hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `Hace ${days}d`;
    return fmtDate(dateStr);
  };

  return (
    <>
      {!isAdmin && (
        <div className="animate-fadeIn p-6 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="text-lg font-semibold">Acceso restringido</div>
          <div className="text-sm text-[var(--muted-foreground)] mt-1">Solo administradores y directores pueden acceder a este panel</div>
        </div>
      )}

      {isAdmin && (
        <div className="animate-fadeIn p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShieldCheck size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
                Panel Admin
              </h2>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Gestión administrativa del equipo</p>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-1 bg-[var(--af-bg3)] rounded-lg p-1 overflow-x-auto scrollbar-none">
            {[
              { id: 'timeline' as const, label: '📊 Timeline' },
              { id: 'dashboard' as const, label: '📈 Dashboard' },
              { id: 'permissions' as const, label: '🔐 Permisos' },
              { id: 'team' as const, label: '👥 Equipo' },
              { id: 'audit' as const, label: '🔍 Auditoría' },
              { id: 'errors' as const, label: `🐛 Errores${unresolvedCount > 0 ? ` (${unresolvedCount})` : ''}` },
              { id: 'feedback' as const, label: '💬 Feedback Beta' },
            ].map(tab => (
              <button key={tab.id} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-all ${adminTab === tab.id ? 'bg-[var(--af-accent)] text-background' : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`} onClick={() => setAdminTab(tab.id)}>{tab.label}</button>
            ))}
          </div>

          {/* ===== TIMELINE TAB ===== */}
          {adminTab === 'timeline' && (() => {
            const days = getGanttDays();
            const todayOffset = Math.round((Number(new Date(new Date().toDateString())) - Number(days[0])) / 86400000);
            const teamWithTasks = teamUsers.map(m => {
              const mt = tasks.filter(t => t.data.assigneeId === m.id && t.data.status !== 'Completado' && t.data.dueDate).sort((a, b) => Number(new Date(a.data.dueDate || 0)) - Number(new Date(b.data.dueDate || 0)));
              return { ...m, tasks: mt };
            });
            const totalActive = teamWithTasks.reduce((s, m) => s + m.tasks.length, 0);
            const totalHours = activeTasks.length; // simplified
            const membersWithOverlaps = teamWithTasks.filter(m => findOverlaps(m.tasks).size > 0);
            const uniqueProjs = [...new Set(activeTasks.map((t: any) => t.data.projectId).filter(Boolean))];

            return (<div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">📊 Admin Timeline</h3>
                  <p className="text-xs text-[var(--muted-foreground)]">Vista de tareas del equipo en el tiempo</p>
                </div>
                <div className="flex gap-1.5">
                  <button className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-[var(--af-bg3)] border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-all" onClick={() => setAdminWeekOffset((p: any) => p - 1)}>◀ Anterior</button>
                  <button className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-[var(--af-bg3)] border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-all" onClick={() => setAdminWeekOffset(0)}>Hoy</button>
                  <button className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-[var(--af-bg3)] border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-all" onClick={() => setAdminWeekOffset((p: any) => p + 1)}>Siguiente ▶</button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]"><div className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide font-semibold">Colaboradores</div><div className="text-2xl font-bold mt-1">{teamWithTasks.length}</div></div>
                <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]"><div className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide font-semibold">Tareas Activas</div><div className="text-2xl font-bold text-blue-400 mt-1">{totalActive}</div></div>
                <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]"><div className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide font-semibold">Con Traslapes</div><div className="text-2xl font-bold text-red-400 mt-1">{membersWithOverlaps.length}</div></div>
                <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]"><div className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide font-semibold">Proyectos</div><div className="text-2xl font-bold text-amber-400 mt-1">{uniqueProjs.length}</div></div>
              </div>

              {/* Legend */}
              <div className="bg-[var(--af-bg3)] rounded-xl p-3 border border-[var(--border)] flex flex-wrap items-center gap-3">
                <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)] mr-1">Proyectos:</span>
                {projects.slice(0, 6).map(p => (<div key={p.id} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getProjectColor(p.id) }} /><span className="text-[11px] text-[var(--foreground)]">{p.data.name.substring(0, 20)}</span></div>))}
                <div className="w-px h-4 bg-[var(--border)]" />
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[var(--foreground)]" /><span className="text-[11px]">Hoy</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-400/30 border border-red-400" /><span className="text-[11px]">Traslape</span></div>
              </div>

              {/* Gantt Chart */}
              <div className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="md:hidden text-center py-8 text-sm text-[var(--muted-foreground)]">El cronograma detallado está disponible en vista de escritorio.</div>
                <div className="hidden md:block overflow-x-auto">
                  <div className="min-w-[1200px]">
                    {/* Header */}
                    <div className="flex border-b-2 border-[var(--border)] bg-[var(--card)]" style={{ height: 48 }}>
                      <div className="w-[180px] min-w-[180px] flex items-center px-3 text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)] border-r border-[var(--border)]">Equipo</div>
                      <div className="flex-1 flex">
                        {days.map((day: any, i: any) => {
                          const isWknd = day.getDay() === 0 || day.getDay() === 6;
                          const isToday = day.toDateString() === new Date().toDateString();
                          return (<div key={i} className={`w-[72px] min-w-[72px] flex flex-col items-center justify-center border-r border-[var(--border)]/50 ${isWknd ? 'bg-[var(--af-bg4)]' : ''}`}>
                            <span className={`text-[10px] ${isWknd ? 'text-[var(--muted-foreground)]/50' : 'text-[var(--muted-foreground)]'}`}>{GANTT_DAY_NAMES[(day.getDay() + 6) % 7]}</span>
                            {isToday ? <span className="text-[11px] font-bold bg-[var(--foreground)] text-[var(--card)] w-5 h-5 rounded-full flex items-center justify-center">{day.getDate()}</span> : <span className={`text-[11px] font-semibold ${isWknd ? 'text-[var(--muted-foreground)]/50' : 'text-[var(--foreground)]'}`}>{day.getDate()}</span>}
                          </div>);
                        })}
                      </div>
                    </div>
                    {/* Rows */}
                    {teamWithTasks.map(member => {
                      const rows = buildGanttRows(member.tasks);
                      const overlapIds = findOverlaps(member.tasks);
                      const hasOverlap = overlapIds.size > 0;
                      const rowH = rows.length > 1 ? rows.length * 40 + 8 : 40;
                      return (<div key={member.id} className="flex border-b border-[var(--border)]/50 hover:bg-[var(--af-bg4)]/30">
                        <div className="w-[180px] min-w-[180px] flex items-center gap-2 px-3 border-r border-[var(--border)]" style={{ minHeight: rowH }}>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${avatarColor(member.id)}`}>{getInitials(member.data?.name || '?')}</div>
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold truncate">{member.data?.name || 'Sin nombre'}</div>
                            <div className="text-[10px] text-[var(--muted-foreground)]">{member.data?.role || 'Miembro'} · {member.tasks.length} tareas</div>
                          </div>
                          {hasOverlap && <span className="ml-auto text-[10px] text-red-400">⚠</span>}
                        </div>
                        <div className="flex-1 relative" style={{ minHeight: rowH }}>
                          {/* Weekend backgrounds */}
                          {days.map((day: any, i: any) => { if (day.getDay() === 0 || day.getDay() === 6) return <div key={i} className="absolute top-0 bottom-0 bg-[var(--af-bg4)]/50" style={{ left: `${(i / GANTT_DAYS) * 100}%`, width: `${(1 / GANTT_DAYS) * 100}%` }} />; return null; })}
                          {/* Today line */}
                          {todayOffset >= 0 && todayOffset <= GANTT_DAYS && <div className="absolute top-0 bottom-0 w-0.5 bg-[var(--foreground)] z-20" style={{ left: `${((todayOffset + 0.5) / GANTT_DAYS) * 100}%` }} />}
                          {/* Task bars */}
                          {rows.map((row: any, rIdx: any) => row.map((task: any) => {
                            const pos = getTaskBar(task, days);
                            if (!pos) return null;
                            const isOvlp = overlapIds.has(task.id);
                            const proj = projects.find(p => p.id === task.data.projectId);
                            const pColor = proj ? getProjectColor(task.data.projectId) : '#6b7280';
                            const top = rIdx * 40 + 4;
                            return (<div key={task.id} className="absolute h-[28px] rounded-md flex items-center gap-1 px-1.5 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg hover:z-30 z-10 overflow-hidden" style={{ left: `${pos.left}%`, width: `${pos.width}%`, top, backgroundColor: isOvlp ? getProjectColorLight(task.data.projectId) : pColor, border: isOvlp ? `1.5px solid ${pColor}` : 'none', color: isOvlp ? pColor : 'white' }} onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setAdminTooltipPos({ x: Math.min(r.left, window.innerWidth - 280), y: r.top }); setAdminTooltipTask(task); }} onMouseLeave={() => setAdminTooltipTask(null)}>
                              <div className="w-[3px] h-full flex-shrink-0 rounded-sm" style={{ backgroundColor: isOvlp ? pColor : 'rgba(255,255,255,0.3)' }} />
                              <span className="text-[10px] font-medium truncate flex-1">{task.data.title}</span>
                            </div>);
                          }))}
                          {member.tasks.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--muted-foreground)]/50 italic">Sin tareas</div>}
                        </div>
                      </div>);
                    })}
                  </div>
                </div>
              </div>

              {/* Tooltip */}
              {adminTooltipTask && (() => {
                const t = adminTooltipTask;
                const proj = projects.find(p => p.id === t.data.projectId);
                const sc = GANTT_STATUS_CFG[t.data.status] || { label: t.data.status, color: '#6b7280' };
                const pc = GANTT_PRIO_CFG[t.data.priority] || { label: t.data.priority || '', bg: '#f1f5f9', color: '#475569' };
                return (
                  /* Admin tooltip — hidden on mobile (touch has no hover) */
                  <div key={t.id} className="hidden md:block fixed z-[200] bg-[var(--foreground)] text-[var(--card)] rounded-lg p-3 text-[11px] max-w-[280px] shadow-xl pointer-events-none" style={{ left: adminTooltipPos.x, top: adminTooltipPos.y - 10, transform: 'translateY(-100%)' }}>
                    <div className="flex gap-2"><span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: pc.bg + '33', color: pc.color }}>{pc.label}</span><span className="text-[10px] text-[var(--muted-foreground)]">{sc.label}</span></div>
                    <div className="text-[12px] font-semibold mt-1">{t.data.title}</div>
                    {proj && <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{proj.data.name}</div>}
                    <div className="flex gap-3 mt-1 text-[10px] text-[var(--muted-foreground)]">
                      {t.data.startDate && <span>{fmtDate(t.data.startDate)}</span>}
                      {t.data.dueDate && <span>→ {fmtDate(t.data.dueDate)}</span>}
                    </div>
                    <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">👤 {getUserName(t.data.assigneeId)}</div>
                  </div>);
              })()}

              {/* Overlap Alerts */}
              {membersWithOverlaps.length > 0 && (<div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3"><span className="text-sm font-semibold text-red-400">⚠️ Alertas de Carga</span></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {membersWithOverlaps.map(m => {
                    const ovlTasks = m.tasks.filter((t: any) => findOverlaps(m.tasks).has(t.id));
                    return (<div key={m.id} className="bg-[var(--card)] rounded-lg p-3 border border-red-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold ${avatarColor(m.id)}`}>{getInitials(m.data?.name || '?')}</div>
                        <span className="text-xs font-semibold">{m.data?.name}</span>
                        <span className="ml-auto text-[10px] text-red-400 font-semibold">{ovlTasks.length} traslape{ovlTasks.length > 1 ? 's' : ''}</span>
                      </div>
                      {ovlTasks.map((t: any) => (<div key={t.id} className="flex items-center gap-2 py-1">
                        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: getProjectColor(t.data.projectId) }} />
                        <span className="text-[10px] truncate flex-1">{t.data.title}</span>
                      </div>))}
                    </div>);
                  })}
                </div>
              </div>)}
            </div>);
          })()}

          {/* ===== DASHBOARD TAB ===== */}
          {adminTab === 'dashboard' && (<div className="space-y-4">
            <h3 className="text-lg font-semibold">📈 Dashboard Admin</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]"><div className="text-xs text-[var(--muted-foreground)]">Total Tareas</div><div className="text-2xl font-bold mt-1">{tasks.length}</div></div>
              <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]"><div className="text-xs text-[var(--muted-foreground)]">En Progreso</div><div className="text-2xl font-bold text-blue-400 mt-1">{tasks.filter(t => t.data.status === 'En progreso').length}</div></div>
              <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]"><div className="text-xs text-[var(--muted-foreground)]">Completadas</div><div className="text-2xl font-bold text-emerald-400 mt-1">{completedTasks.length}</div></div>
              <div className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)]"><div className="text-xs text-[var(--muted-foreground)]">Vencidas</div><div className="text-2xl font-bold text-red-400 mt-1">{overdueTasks.length}</div></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Upcoming */}
              <div className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] p-4">
                <h4 className="text-sm font-semibold mb-3">📅 Próximas Entregas</h4>
                {activeTasks.filter((t: any) => t.data.dueDate).sort((a: any, b: any) => Number(new Date(a.data.dueDate)) - Number(new Date(b.data.dueDate))).slice(0, 8).map((t: any) => {
                  const proj = projects.find(p => p.id === t.data.projectId);
                  const sc = GANTT_STATUS_CFG[t.data.status] || { color: '#6b7280', label: t.data.status };
                  const isOverdue = t.data.dueDate && checkOverdue(t.data.dueDate);
                  return (<div key={t.id} className="flex items-center gap-3 py-2 border-b border-[var(--border)]/50 last:border-b-0">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0`} style={{ backgroundColor: sc.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{t.data.title}</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">{proj?.data.name || '—'} · {getUserName(t.data.assigneeId)}</div>
                    </div>
                    <span className={`text-xs flex-shrink-0 ${isOverdue ? 'text-red-400 font-semibold' : 'text-[var(--muted-foreground)]'}`}>{t.data.dueDate ? fmtDate(t.data.dueDate) : ''}</span>
                  </div>);
                })}
              </div>
              {/* Projects overview */}
              <div className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] p-4">
                <h4 className="text-sm font-semibold mb-3">🏗️ Proyectos</h4>
                {projects.map(p => {
                  const pTasks = tasks.filter(t => t.data.projectId === p.id);
                  const done = pTasks.filter(t => t.data.status === 'Completado').length;
                  return (<div key={p.id} className="py-2.5 border-b border-[var(--border)]/50 last:border-b-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getProjectColor(p.id) }} /><span className="text-xs font-medium">{p.data.name}</span></div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColor(p.data.status)}`}>{p.data.status}</span>
                    </div>
                    <div className="flex items-center gap-2"><div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p.data.progress || 0}%`, backgroundColor: getProjectColor(p.id) }} /></div><span className="text-[10px] text-[var(--muted-foreground)]">{p.data.progress || 0}%</span></div>
                    <div className="text-[10px] text-[var(--muted-foreground)] mt-1">{done}/{pTasks.length} tareas</div>
                  </div>);
                })}
              </div>
            </div>
            {/* Team productivity */}
            <div className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] p-4">
              <h4 className="text-sm font-semibold mb-3">👥 Productividad del Equipo</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {teamUsers.map(m => {
                  const mTasks = tasks.filter(t => t.data.assigneeId === m.id);
                  const mActive = mTasks.filter(t => t.data.status !== 'Completado');
                  const mDone = mTasks.filter(t => t.data.status === 'Completado');
                  const pct = mTasks.length > 0 ? Math.round((mDone.length / mTasks.length) * 100) : 0;
                  return (<div key={m.id} className="bg-[var(--card)] rounded-lg p-3 border border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold ${avatarColor(m.id)}`}>{getInitials(m.data?.name || '?')}</div>
                      <div className="min-w-0"><div className="text-xs font-semibold truncate">{m.data?.name}</div><div className="text-[10px] text-[var(--muted-foreground)]">{m.data?.role || 'Miembro'}</div></div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><div className="text-sm font-bold text-blue-400">{mActive.length}</div><div className="text-[10px] text-[var(--muted-foreground)]">Activas</div></div>
                      <div><div className="text-sm font-bold text-emerald-400">{mDone.length}</div><div className="text-[10px] text-[var(--muted-foreground)]">Hechas</div></div>
                      <div><div className="text-sm font-bold">{pct}%</div><div className="text-[10px] text-[var(--muted-foreground)]">Completado</div></div>
                    </div>
                  </div>);
                })}
              </div>
            </div>
          </div>)}

          {/* ===== PERMISSIONS TAB ===== */}
          {adminTab === 'permissions' && (<div className="space-y-4">
            <h3 className="text-lg font-semibold">🔐 Permisos y Roles</h3>
            <div className="flex gap-1 mb-4">
              {[{ id: 'roles', label: '👥 Roles' }, { id: 'permissions', label: '🔑 Permisos por rol' }].map(tab => (
                <button key={tab.id} className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${adminPermSection === tab.id ? 'bg-[var(--af-accent)] text-background' : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)]'}`} onClick={() => setAdminPermSection(tab.id)}>{tab.label}</button>
              ))}
            </div>

            {adminPermSection === 'roles' && (<div className="space-y-4">
              {/* Role description */}
              <div className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] p-4">
                <h4 className="text-sm font-semibold mb-3">Roles del Sistema</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {USER_ROLES.map(role => {
                    const count = teamUsers.filter(u => u.data?.role === role).length;
                    return (<div key={role} className="bg-[var(--card)] rounded-lg p-3 border border-[var(--border)]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{ROLE_ICONS[role]}</span>
                          <div><div className="text-xs font-semibold">{role}</div><div className="text-[10px] text-[var(--muted-foreground)]">{count} usuario{count !== 1 ? 's' : ''}</div></div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${ROLE_COLORS[role]}`}>{role}</span>
                      </div>
                    </div>);
                  })}
                </div>
              </div>
              {/* Team members with role management */}
              <div className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] p-4">
                <h4 className="text-sm font-semibold mb-3">Gestionar Roles</h4>
                <div className="space-y-2">
                  {teamUsers.map(u => {
                    const canChange = isAdmin && u.id !== authUser?.uid;
                    return (<div key={u.id} className="flex items-center gap-3 bg-[var(--card)] rounded-lg p-3 border border-[var(--border)]">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatarColor(u.id)}`}>{getInitials(u.data?.name || '?')}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{u.data?.name}{u.id === authUser?.uid && <span className="text-[10px] text-[var(--muted-foreground)] ml-1">(Tú)</span>}</div>
                        <div className="text-[10px] text-[var(--muted-foreground)] truncate">{u.data?.email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1" style={{ borderColor: 'var(--border)' }}>
                          <span>{ROLE_ICONS[u.data?.role || 'Miembro']}</span>
                          {u.data?.role || 'Miembro'}
                        </span>
                        {canChange && (<select className="bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-2 py-1 text-[10px] text-[var(--foreground)] outline-none cursor-pointer" value={u.data?.role || 'Miembro'} onChange={e => updateUserRole(u.id, e.target.value)}>
                          {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>)}
                      </div>
                    </div>);
                  })}
                </div>
              </div>
            </div>)}

            {adminPermSection === 'permissions' && (<div className="space-y-4">
              <div className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold">Permisos por Rol</h4>
                  <span className="text-[10px] text-[var(--muted-foreground)]">Los cambios se guardan automáticamente</span>
                </div>
                <div className="overflow-x-auto -mx-4 px-4 pb-2">
                  <table className="w-full text-[11px]">
                    <thead><tr className="border-b border-[var(--border)]">
                      <th className="text-left py-2 px-2 text-[var(--muted-foreground)] font-medium sticky left-0 bg-[var(--af-bg3)] min-w-[160px]">Permiso</th>
                      {USER_ROLES.map(r => <th key={r} className="text-center py-2 px-1.5 text-[var(--muted-foreground)] font-medium whitespace-nowrap min-w-[70px]">{ROLE_ICONS[r]} {r}</th>)}
                    </tr></thead>
                    <tbody>
                      {(() => {
                        // Group permissions by category for better readability
                        const categories: { label: string; emoji: string; perms: string[] }[] = [
                          { label: 'Dashboard & Proyectos', emoji: '📊', perms: ['Ver Dashboard','Crear proyectos','Editar proyectos','Eliminar proyectos'] },
                          { label: 'Tareas', emoji: '✅', perms: ['Crear tareas','Asignar tareas','Ver tablero Kanban'] },
                          { label: 'Time Tracking', emoji: '⏱️', perms: ['Time Tracking'] },
                          { label: 'Presupuestos', emoji: '💰', perms: ['Ver presupuestos','Gestionar presupuestos'] },
                          { label: 'Archivos & Galería', emoji: '📁', perms: ['Ver planos y archivos','Subir archivos','Ver galería','Subir fotos galería','Seguimiento obra'] },
                          { label: 'Inventario', emoji: '📦', perms: ['Ver inventario','Gestionar inventario'] },
                          { label: 'Calidad', emoji: '🔍', perms: ['Ver RFIs','Crear RFIs','Ver Submittals','Crear Submittals','Ver Punch List','Crear Punch List','Ver Órdenes de Cambio','Crear Órdenes de Cambio','Ver Notas de Campo','Crear Notas de Campo'] },
                          { label: 'Administración', emoji: '⚙️', perms: ['Panel Admin','Gestionar equipo','Cambiar roles','Ver proveedores','Gestionar proveedores','Ver facturas','Gestionar facturas','Ver empresas','Gestionar empresas','Ver catálogos','Gestionar catálogos','Ver integraciones','Gestionar integraciones'] },
                          { label: 'Carnets', emoji: '🪪', perms: ['Ver carnets','Crear carnets','Usar diseñador de carnets','Importar carnets Excel'] },
                          { label: 'Comunicación', emoji: '💬', perms: ['Chat general','Mensajes directos'] },
                          { label: 'Calendario & Reportes', emoji: '📅', perms: ['Ver calendario','Ver reportes','Exportar reportes'] },
                          { label: 'Portal cliente', emoji: '🌐', perms: ['Portal cliente'] },
                        ];
                        const rows: React.ReactNode[] = [];
                        categories.forEach((cat, ci) => {
                          // Category header row
                          rows.push(
                            <tr key={`cat-${ci}`} className="border-b border-[var(--border)]/30">
                              <td colSpan={USER_ROLES.length + 1} className="py-2 px-2 bg-[var(--card)] sticky left-0">
                                <span className="text-[11px] font-bold text-[var(--af-accent)]">{cat.emoji} {cat.label}</span>
                              </td>
                            </tr>
                          );
                          // Permission rows
                          cat.perms.forEach(permName => {
                            const perms = rolePerms[permName];
                            if (!perms) return;
                            rows.push(
                              <tr key={permName} className="border-b border-[var(--border)]/50">
                                <td className="py-1.5 px-2 pl-5 font-medium sticky left-0 bg-[var(--af-bg3)]">{permName}</td>
                                {USER_ROLES.map(r => {
                                  const has = (perms as string[]).includes(r);
                                  return (<td key={r} className="py-1.5 px-1.5 text-center">
                                    <button
                                      className={`w-6 h-6 rounded-md flex items-center justify-center mx-auto cursor-pointer border-none transition-all text-[13px] ${has ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/5 text-red-400/30 hover:bg-red-500/10'}`}
                                      onClick={() => toggleRolePerm(permName, r)}
                                      title={has ? 'Quitar permiso' : 'Dar permiso'}
                                    >{has ? '✓' : '✕'}</button>
                                  </td>);
                                })}
                              </tr>
                            );
                          });
                        });
                        // Add any uncategorized permissions
                        const allCategorized = new Set(categories.flatMap(c => c.perms));
                        const uncategorized = Object.keys(rolePerms).filter(p => !allCategorized.has(p));
                        if (uncategorized.length > 0) {
                          rows.push(
                            <tr key="cat-other" className="border-b border-[var(--border)]/30">
                              <td colSpan={USER_ROLES.length + 1} className="py-2 px-2 bg-[var(--card)] sticky left-0">
                                <span className="text-[11px] font-bold text-[var(--af-accent)]">📋 Otros</span>
                              </td>
                            </tr>
                          );
                          uncategorized.forEach(permName => {
                            const perms = rolePerms[permName];
                            rows.push(
                              <tr key={permName} className="border-b border-[var(--border)]/50">
                                <td className="py-1.5 px-2 pl-5 font-medium sticky left-0 bg-[var(--af-bg3)]">{permName}</td>
                                {USER_ROLES.map(r => {
                                  const has = (perms as string[]).includes(r);
                                  return (<td key={r} className="py-1.5 px-1.5 text-center">
                                    <button
                                      className={`w-6 h-6 rounded-md flex items-center justify-center mx-auto cursor-pointer border-none transition-all text-[13px] ${has ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/5 text-red-400/30 hover:bg-red-500/10'}`}
                                      onClick={() => toggleRolePerm(permName, r)}
                                      title={has ? 'Quitar permiso' : 'Dar permiso'}
                                    >{has ? '✓' : '✕'}</button>
                                  </td>);
                                })}
                              </tr>
                            );
                          });
                        }
                        return rows;
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>)}
          </div>)}

          {/* ===== TEAM TAB ===== */}
          {adminTab === 'team' && (<div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">👥 Equipo ({teamUsers.length})</h3>
            </div>
            {teamUsers.length === 0 ? (
              <div className="text-center py-16 text-[var(--af-text3)]">
                <div className="text-4xl mb-3">👥</div>
                <div className="text-[15px] font-medium text-[var(--muted-foreground)] mb-1">Sin miembros en el equipo</div>
                <div className="text-[13px]">Invita miembros desde la sección de gestión del tenant</div>
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {teamUsers.map(m => {
                const mTasks = activeTasks.filter((t: any) => t.data.assigneeId === m.id);
                const mOverdue = mTasks.filter((t: any) => t.data.dueDate && checkOverdue(t.data.dueDate));
                const isSelf = m.id === authUser?.uid;
                const deleting = deletingIds.has(m.id);
                const handleDeleteMember = async () => {
                  if (!await confirmDialog.confirm({ title: 'Eliminar miembro', description: `¿Eliminar a ${m.data?.name || m.data?.email} del equipo? Esta acción no se puede deshacer.` })) return;
                  if (!activeTenantId) { showToast('No hay tenant activo', 'error'); return; }
                  setDeleting(m.id, true);
                  try {
                    const authHeaders = await getAuthHeaders();
                    const res = await fetch('/api/tenants', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...authHeaders },
                      body: JSON.stringify({ action: 'delete-member', tenantId: activeTenantId, memberUid: m.id }),
                    });
                    const data = await res.json();
                    if (!res.ok) { showToast(data.error || 'Error al eliminar', 'error'); setDeleting(m.id, false); return; }
                    showToast(`${m.data?.name || m.data?.email} eliminado del equipo`);
                    setDeleting(m.id, false);
                  } catch (err) { showToast('Error de conexión al eliminar', 'error'); setDeleting(m.id, false); }
                };
                return (<div key={m.id} className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)] relative group">
                  {/* Delete button — visible for Admin/Director users */}
                  {isAdmin && !isSelf && (
                    <button
                      onClick={handleDeleteMember}
                      disabled={deleting}
                      className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Eliminar del equipo"
                    >
                      {deleting ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden="true"/>
                      ) : (
                        <Trash2 size={14} aria-hidden="true"/>
                      )}
                    </button>
                  )}
                  {isSelf && (
                    <div className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-[var(--card)] text-[var(--muted-foreground)] flex items-center justify-center" title="No puedes eliminarte a ti mismo">
                      <Shield size={14} aria-hidden="true"/>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${avatarColor(m.id)}`}>{getInitials(m.data?.name || '?')}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{m.data?.name}</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">{m.data?.role || 'Miembro'}{m.data?.email ? ` · ${m.data.email}` : ''}</div>
                    </div>
                    <span className="text-[10px] bg-[var(--card)] px-2 py-0.5 rounded-full border border-[var(--border)]">{mTasks.length} tareas</span>
                  </div>
                  {mOverdue.length > 0 && (<div className="text-[10px] text-red-400 mb-2">⚠ {mOverdue.length} vencida{mOverdue.length > 1 ? 's' : ''}</div>)}
                  {mTasks.length > 0 ? (<div className="space-y-1.5">
                    {mTasks.slice(0, 4).map((t: any) => {
                      const proj = projects.find(p => p.id === t.data.projectId);
                      const isOverdue = t.data.dueDate && checkOverdue(t.data.dueDate);
                      const sc = GANTT_STATUS_CFG[t.data.status] || { color: '#6b7280' };
                      const pc = GANTT_PRIO_CFG[t.data.priority] || { bg: '#f1f5f9', color: '#475569', label: '' };
                      return (<div key={t.id} className="flex items-center gap-2 bg-[var(--card)] rounded-lg px-2.5 py-2">
                        <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: sc.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-medium truncate">{t.data.title}</div>
                          {proj && <div className="text-[10px] text-[var(--muted-foreground)]">{proj.data.name}</div>}
                        </div>
                        <span className={`text-[10px] flex-shrink-0 ${isOverdue ? 'text-red-400 font-semibold' : 'text-[var(--muted-foreground)]'}`}>{t.data.dueDate ? fmtDate(t.data.dueDate) : ''}</span>
                      </div>);
                    })}
                    {mTasks.length > 4 && <div className="text-[10px] text-[var(--muted-foreground)] text-center pt-1">+{mTasks.length - 4} más</div>}
                  </div>) : (<div className="text-center py-4 text-[11px] text-[var(--muted-foreground)]">Sin tareas activas</div>)}
                </div>);
              })}
            </div>
            )}
          </div>)}

          {/* ===== AUDIT TAB ===== */}
          {adminTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <FileText size={18} className="text-[var(--af-accent)]" />
                    🔍 Auditoría
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Registro de actividades del equipo · Auto-refresh cada 30s</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--muted-foreground)]">{auditTotal} registros</span>
                  <button
                    className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-[var(--af-bg3)] border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-all flex items-center gap-1.5"
                    onClick={() => fetchAuditLogs(auditPage)}
                    disabled={auditLoading}
                  >
                    <RefreshCw size={12} className={auditLoading ? 'animate-spin' : ''} />
                    Actualizar
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    placeholder="Filtrar por colección (tasks, projects...)"
                    value={auditSearch}
                    onChange={e => setAuditSearch(e.target.value)}
                    className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] transition-colors"
                  />
                </div>
                <select
                  value={auditActionFilter}
                  onChange={e => setAuditActionFilter(e.target.value)}
                  className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--foreground)] outline-none cursor-pointer min-w-[140px]"
                >
                  <option value="">Todas las acciones</option>
                  <option value="create">Crear</option>
                  <option value="update">Actualizar</option>
                  <option value="delete">Eliminar</option>
                  <option value="archive">Archivar</option>
                  <option value="restore">Restaurar</option>
                  <option value="import">Importar</option>
                  <option value="export">Exportar</option>
                </select>
              </div>

              {/* Audit log table */}
              {auditLoading && auditLogs.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-[var(--af-accent)]" />
                  <span className="ml-2 text-sm text-[var(--muted-foreground)]">Cargando auditoría...</span>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">📋</div>
                  <div className="text-sm text-[var(--muted-foreground)]">No hay registros de auditoría</div>
                </div>
              ) : (
                <div className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] overflow-hidden">
                  {/* Table header - desktop only */}
                  <div className="hidden md:grid grid-cols-[140px_140px_90px_120px_100px_1fr] gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card)]">
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">Fecha</span>
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">Usuario</span>
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">Acción</span>
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">Colección</span>
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">Doc ID</span>
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">Cambios</span>
                  </div>
                  {/* Rows */}
                  <div className="max-h-[500px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                    {auditLogs.map((log) => {
                      const isExpanded = auditExpandedId === log.id;
                      const actionColor = ACTION_COLORS[log.action] || 'bg-gray-500/15 text-gray-400';
                      const changesCount = log.changes ? Object.keys(log.changes).length : 0;
                      const changesSummary = log.action === 'create'
                        ? 'Documento creado'
                        : log.action === 'delete'
                        ? 'Documento eliminado'
                        : `${changesCount} cambio${changesCount !== 1 ? 's' : ''}`;

                      return (
                        <div key={log.id} className="border-b border-[var(--border)]/30 last:border-b-0">
                          <div
                            className="grid grid-cols-1 md:grid-cols-[140px_140px_90px_120px_100px_1fr] gap-2 px-4 py-3 hover:bg-[var(--af-bg4)]/30 cursor-pointer transition-colors items-center"
                            onClick={() => setAuditExpandedId(isExpanded ? null : log.id)}
                          >
                            {/* Mobile: compact layout */}
                            <div className="md:hidden flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${actionColor}`}>
                                {log.action}
                              </span>
                              <span className="text-[11px] text-[var(--muted-foreground)]">{formatTimeAgo(log.timestamp || log.createdAt || '')}</span>
                              {isExpanded ? <ChevronDown size={14} className="ml-auto text-[var(--muted-foreground)]" /> : <ChevronRight size={14} className="ml-auto text-[var(--muted-foreground)]" />}
                            </div>
                            <div className="md:hidden flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-medium">{log.userName}</span>
                              <span className="text-[10px] text-[var(--muted-foreground)]">{log.collection}</span>
                              <span className="text-[10px] text-[var(--muted-foreground)]">· {changesSummary}</span>
                            </div>
                            {/* Desktop: full layout */}
                            <span className="hidden md:block text-[11px] text-[var(--muted-foreground)] truncate">{formatTimeAgo(log.timestamp || log.createdAt || '')}</span>
                            <span className="hidden md:block text-[11px] font-medium truncate">{log.userName}</span>
                            <span className="hidden md:block">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${actionColor}`}>{log.action}</span>
                            </span>
                            <span className="hidden md:block text-[11px] text-[var(--muted-foreground)] truncate">{log.collection}</span>
                            <span className="hidden md:block text-[10px] text-[var(--muted-foreground)] font-mono truncate">{log.docId?.substring(0, 8)}...</span>
                            <div className="hidden md:flex items-center gap-1.5">
                              <span className="text-[11px] text-[var(--muted-foreground)]">{changesSummary}</span>
                              {log.changes && <ChevronDown size={12} className={`text-[var(--muted-foreground)] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />}
                            </div>
                          </div>

                          {/* Expanded diff */}
                          {isExpanded && (
                            <div className="px-4 pb-3 pt-1 bg-[var(--af-bg4)]/20 border-t border-[var(--border)]/20">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">Colección</span>
                                  <p className="text-xs font-medium mt-0.5">{log.collection}</p>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">Documento ID</span>
                                  <p className="text-xs font-mono mt-0.5">{log.docId}</p>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">Usuario</span>
                                  <p className="text-xs mt-0.5">{log.userName} <span className="text-[var(--muted-foreground)]">({log.userId?.substring(0, 8)}...)</span></p>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">IP</span>
                                  <p className="text-xs mt-0.5">{log.ip || 'N/A'}</p>
                                </div>
                              </div>
                              {log.changes ? (
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)] mb-2 block">Cambios</span>
                                  <div className="space-y-1.5 max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                                    {Object.entries(log.changes).map(([key, val]: [string, any]) => (
                                      <div key={key} className="flex items-start gap-2 bg-[var(--card)] rounded-lg p-2 border border-[var(--border)]/50">
                                        <span className="text-[10px] font-semibold text-[var(--af-accent)] whitespace-nowrap min-w-[80px]">{key}</span>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-[10px] text-red-400 line-through truncate">{JSON.stringify(val.from)}</div>
                                          <div className="text-[10px] text-emerald-400 truncate">{JSON.stringify(val.to)}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : log.action === 'create' && log.after ? (
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)] mb-2 block">Datos creados</span>
                                  <div className="bg-[var(--card)] rounded-lg p-2 border border-[var(--border)]/50 max-h-40 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                                    <pre className="text-[10px] text-emerald-400 whitespace-pre-wrap">{JSON.stringify(log.after, null, 2)}</pre>
                                  </div>
                                </div>
                              ) : log.action === 'delete' && log.before ? (
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)] mb-2 block">Datos eliminados</span>
                                  <div className="bg-[var(--card)] rounded-lg p-2 border border-[var(--border)]/50 max-h-40 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                                    <pre className="text-[10px] text-red-400 whitespace-pre-wrap">{JSON.stringify(log.before, null, 2)}</pre>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Pagination */}
                  {auditHasMore && (
                    <div className="px-4 py-3 border-t border-[var(--border)] flex justify-center">
                      <button
                        className="px-4 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-[var(--af-bg3)] border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-all"
                        onClick={() => fetchAuditLogs(auditPage + 1, true)}
                        disabled={auditLoading}
                      >
                        {auditLoading ? 'Cargando...' : 'Cargar más'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ===== ERRORS TAB ===== */}
          {adminTab === 'errors' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Bug size={18} className="text-[var(--af-accent)]" />
                    🐛 Errores
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Reportes de errores agrupados por mensaje</p>
                </div>
                <div className="flex items-center gap-2">
                  {unresolvedCount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-semibold">
                      {unresolvedCount} sin resolver
                    </span>
                  )}
                  <span className="text-[10px] text-[var(--muted-foreground)]">{errorsTotal} total</span>
                  <button
                    className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-[var(--af-bg3)] border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-all flex items-center gap-1.5"
                    onClick={() => fetchErrors(1)}
                    disabled={errorsLoading}
                  >
                    <RefreshCw size={12} className={errorsLoading ? 'animate-spin' : ''} />
                    Actualizar
                  </button>
                </div>
              </div>

              {/* Filter */}
              <div className="flex gap-2">
                {[
                  { value: 'unresolved', label: 'Sin resolver' },
                  { value: 'resolved', label: 'Resueltos' },
                  { value: 'all', label: 'Todos' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${errorsResolvedFilter === opt.value ? 'bg-[var(--af-accent)] text-background' : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border border-[var(--border)] hover:text-[var(--foreground)]'}`}
                    onClick={() => setErrorsResolvedFilter(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Error groups */}
              {errorsLoading && errorGroups.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-[var(--af-accent)]" />
                  <span className="ml-2 text-sm text-[var(--muted-foreground)]">Cargando errores...</span>
                </div>
              ) : errorGroups.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">✅</div>
                  <div className="text-sm text-[var(--muted-foreground)]">No hay reportes de errores</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {errorGroups.map((group, idx) => {
                    const groupKey = `${group.message}-${idx}`;
                    const isExpanded = expandedErrorKey === groupKey;
                    const isResolving = group.ids.some(id => resolvingIds.has(id));

                    return (
                      <div key={groupKey} className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] overflow-hidden">
                        {/* Header */}
                        <div
                          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--af-bg4)]/30 transition-colors"
                          onClick={() => setExpandedErrorKey(isExpanded ? null : groupKey)}
                        >
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 flex-shrink-0">
                            <AlertTriangle size={16} className="text-red-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{group.message}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-[var(--muted-foreground)]">{group.count} ocurrencia{group.count !== 1 ? 's' : ''}</span>
                              <span className="text-[10px] text-[var(--muted-foreground)]">· Primero: {formatTimeAgo(group.firstSeen)}</span>
                              <span className="text-[10px] text-[var(--muted-foreground)]">· Último: {formatTimeAgo(group.lastSeen)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {group.resolved ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold">Resuelto</span>
                            ) : (
                              <button
                                className="px-3 py-1.5 rounded-lg text-[10px] font-medium cursor-pointer bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={(e) => { e.stopPropagation(); handleResolveError(group.ids[0]); }}
                                disabled={isResolving}
                              >
                                {isResolving ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
                                Resuelto
                              </button>
                            )}
                            {isExpanded ? <ChevronDown size={14} className="text-[var(--muted-foreground)]" /> : <ChevronRight size={14} className="text-[var(--muted-foreground)]" />}
                          </div>
                        </div>

                        {/* Expanded content */}
                        {isExpanded && (
                          <div className="px-4 pb-3 pt-1 border-t border-[var(--border)]/20 bg-[var(--af-bg4)]/20 space-y-3">
                            {group.sampleScreen && (
                              <div>
                                <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">Pantalla</span>
                                <p className="text-xs mt-0.5">{group.sampleScreen}</p>
                              </div>
                            )}
                            {group.sampleStack && (
                              <div>
                                <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">Stack Trace</span>
                                <div className="bg-[var(--card)] rounded-lg p-3 border border-[var(--border)]/50 max-h-48 overflow-y-auto mt-1" style={{ scrollbarWidth: 'thin' }}>
                                  <pre className="text-[10px] text-red-400/80 whitespace-pre-wrap font-mono">{group.sampleStack}</pre>
                                </div>
                              </div>
                            )}
                            {group.sampleComponentStack && (
                              <div>
                                <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">Component Stack</span>
                                <div className="bg-[var(--card)] rounded-lg p-3 border border-[var(--border)]/50 max-h-32 overflow-y-auto mt-1" style={{ scrollbarWidth: 'thin' }}>
                                  <pre className="text-[10px] text-amber-400/80 whitespace-pre-wrap font-mono">{group.sampleComponentStack}</pre>
                                </div>
                              </div>
                            )}
                            {group.sampleUserAgent && (
                              <div>
                                <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">User Agent</span>
                                <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5 break-all">{group.sampleUserAgent}</p>
                              </div>
                            )}
                            {/* Individual occurrences */}
                            <div>
                              <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--muted-foreground)]">Ocurrencias recientes</span>
                              <div className="space-y-1 mt-1.5 max-h-32 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                                {group.reports.map((r: any) => (
                                  <div key={r.id} className="flex items-center justify-between bg-[var(--card)] rounded-lg px-2.5 py-1.5 border border-[var(--border)]/30">
                                    <span className="text-[10px] text-[var(--muted-foreground)] truncate flex-1 mr-2">
                                      {r.screen || 'N/A'} · {r.userId?.substring(0, 8) || 'Anónimo'}
                                    </span>
                                    <span className="text-[10px] text-[var(--muted-foreground)] flex-shrink-0">{formatTimeAgo(r.timestamp)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {/* Resolve all in group */}
                            {!group.resolved && group.ids.length > 1 && (
                              <button
                                className="px-3 py-1.5 rounded-lg text-[10px] font-medium cursor-pointer bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-all flex items-center gap-1.5"
                                onClick={() => {
                                  group.ids.forEach(id => handleResolveError(id));
                                }}
                                disabled={isResolving}
                              >
                                <CheckCircle2 size={10} />
                                Resolver todos ({group.ids.length})
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {errorsHasMore && (
                <div className="flex justify-center">
                  <button
                    className="px-4 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-[var(--af-bg3)] border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-all"
                    onClick={() => fetchErrors(errorsPage + 1)}
                    disabled={errorsLoading}
                  >
                    {errorsLoading ? 'Cargando...' : 'Cargar más'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ===== FEEDBACK BETA TAB ===== */}
          {adminTab === 'feedback' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <MessageSquare size={18} className="text-[var(--af-accent)]" />
                    💬 Feedback Beta
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Opiniones de usuarios beta · {feedbackTotal} entradas · {feedbackReviewedCount} revisadas</p>
                </div>
                <button
                  className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-[var(--af-bg3)] border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-all flex items-center gap-1.5"
                  onClick={() => fetchFeedback(feedbackPage)}
                  disabled={feedbackLoading}
                >
                  <RefreshCw size={12} className={feedbackLoading ? 'animate-spin' : ''} />
                  Actualizar
                </button>
              </div>

              {/* Category filter */}
              <div className="flex gap-1.5 flex-wrap">
                <button
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${!feedbackCategoryFilter ? 'bg-[var(--af-accent)] text-background' : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border border-[var(--border)] hover:text-[var(--foreground)]'}`}
                  onClick={() => setFeedbackCategoryFilter('')}
                >
                  Todas
                </button>
                {[
                  { value: 'bug', label: '🐛 Bug' },
                  { value: 'feature', label: '💡 Sugerencia' },
                  { value: 'ux', label: '🎨 UX' },
                  { value: 'performance', label: '⚡ Rendimiento' },
                  { value: 'other', label: '💬 Otro' },
                ].map(cat => (
                  <button
                    key={cat.value}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${feedbackCategoryFilter === cat.value ? 'bg-[var(--af-accent)] text-background' : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border border-[var(--border)] hover:text-[var(--foreground)]'}`}
                    onClick={() => setFeedbackCategoryFilter(cat.value)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Feedback list */}
              {feedbackLoading && feedbackEntries.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-[var(--af-accent)]" />
                  <span className="ml-2 text-sm text-[var(--muted-foreground)]">Cargando feedback...</span>
                </div>
              ) : feedbackEntries.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">💬</div>
                  <div className="text-sm text-[var(--muted-foreground)]">No hay feedback beta</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {feedbackEntries.map((entry) => {
                    const isReviewing = reviewingId === entry.id;
                    const catColor = FEEDBACK_CATEGORY_COLORS[entry.category] || FEEDBACK_CATEGORY_COLORS.other;
                    const catLabel = FEEDBACK_CATEGORY_LABELS[entry.category] || entry.category;

                    return (
                      <div key={entry.id} className="bg-[var(--af-bg3)] rounded-xl border border-[var(--border)] p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex flex-col items-center gap-1 flex-shrink-0">
                            <StarRating rating={entry.rating} />
                            <span className="text-[10px] text-[var(--muted-foreground)]">{entry.rating}/5</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${catColor}`}>
                                {catLabel}
                              </span>
                              {entry.screen && (
                                <span className="text-[10px] text-[var(--muted-foreground)]">{entry.screen}</span>
                              )}
                              <span className="text-[10px] text-[var(--muted-foreground)] ml-auto">{formatTimeAgo(entry.timestamp)}</span>
                            </div>
                            <p className="text-xs text-[var(--foreground)] whitespace-pre-wrap mb-2">{entry.text}</p>

                            {/* Reviewed badge */}
                            {entry.reviewed && (
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold flex items-center gap-1">
                                  <CheckCircle2 size={10} />
                                  Revisado
                                </span>
                                {entry.adminNote && (
                                  <span className="text-[10px] text-[var(--muted-foreground)]">Nota: {entry.adminNote}</span>
                                )}
                              </div>
                            )}

                            {/* Review form */}
                            {isReviewing && (
                              <div className="mt-2 space-y-2 bg-[var(--af-bg4)]/30 rounded-lg p-3 border border-[var(--border)]/30">
                                <textarea
                                  value={feedbackNote}
                                  onChange={e => setFeedbackNote(e.target.value)}
                                  placeholder="Nota del administrador (opcional)..."
                                  className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] resize-none"
                                  rows={2}
                                />
                                <div className="flex gap-2">
                                  <button
                                    className="px-3 py-1.5 rounded-lg text-[10px] font-medium cursor-pointer bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-all flex items-center gap-1.5"
                                    onClick={() => handleReviewFeedback(entry.id)}
                                  >
                                    <CheckCircle2 size={10} />
                                    Confirmar revisión
                                  </button>
                                  <button
                                    className="px-3 py-1.5 rounded-lg text-[10px] font-medium cursor-pointer bg-[var(--af-bg3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all"
                                    onClick={() => { setReviewingId(null); setFeedbackNote(''); }}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Mark as reviewed button */}
                            {!entry.reviewed && !isReviewing && (
                              <button
                                className="px-3 py-1.5 rounded-lg text-[10px] font-medium cursor-pointer bg-[var(--af-bg3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] transition-all flex items-center gap-1.5"
                                onClick={() => handleReviewFeedback(entry.id)}
                              >
                                <CheckCircle2 size={10} />
                                Marcar como revisado
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {feedbackHasMore && (
                <div className="flex justify-center">
                  <button
                    className="px-4 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-[var(--af-bg3)] border border-[var(--border)] hover:bg-[var(--af-bg4)] transition-all"
                    onClick={() => fetchFeedback(feedbackPage + 1)}
                    disabled={feedbackLoading}
                  >
                    {feedbackLoading ? 'Cargando...' : 'Cargar más'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <ConfirmDialog {...confirmDialog} />
    </>
  );
}
