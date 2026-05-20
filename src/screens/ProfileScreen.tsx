'use client';
import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useTimeTrackingContext } from '@/hooks/useTimeTracking';
import { useOneDrive } from '@/hooks/useOneDrive';
import { fmtCOP, fmtDate, prioColor, taskStColor, avatarColor } from '@/lib/helpers';
import { isOverdue as checkOverdue } from '@/lib/kanban-helpers';
import { ROLE_COLORS, ROLE_ICONS, MESES, DIAS_SEMANA, USER_ROLES, toDate } from '@/lib/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type ProfileTab = 'resumen' | 'calendario' | 'actividad' | 'integraciones';

// ─── Confirm Dialog ────────────────────────────────────
function ConfirmDialog({ open, title, message, onConfirm, onCancel }: { open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={onCancel}>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="text-[15px] font-semibold mb-2">{title}</div>
        <div className="text-[13px] text-[var(--muted-foreground)] mb-5">{message}</div>
        <div className="flex gap-2 justify-end">
          <button className="px-4 py-2 rounded-lg text-[13px] bg-[var(--af-bg4)] hover:bg-[var(--af-bg3)] border border-[var(--border)] cursor-pointer transition-colors" onClick={onCancel}>Cancelar</button>
          <button className="px-4 py-2 rounded-lg text-[13px] bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 cursor-pointer transition-colors" onClick={onConfirm}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Export Profile PDF ─────────────────────────────────
async function exportProfilePDF(data: { name: string; email: string; role: string; totalTasks: number; completed: number; pending: number; inProgress: number; compliance: number; overdue: number; totalProjects: number; totalHours: number; totalExpenses: number; rfis: number; submittals: number; punchItems: number }) {
  try {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    let y = 18;

    // Header
    doc.setFillColor(30, 30, 40);
    doc.rect(0, 0, pageW, 48, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('Perfil de Usuario', pageW / 2, 22, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(180, 180, 190);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-CO')}`, pageW / 2, 32, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(data.name, pageW / 2, 42, { align: 'center' });
    y = 58;

    // Info
    doc.setTextColor(60, 60, 70);
    doc.setFontSize(11);
    doc.text(`Email: ${data.email}`, 14, y); y += 7;
    doc.text(`Rol: ${data.role}`, 14, y); y += 7;
    doc.text(`Proyectos: ${data.totalProjects}`, 14, y); y += 12;

    // KPIs
    doc.setFontSize(13);
    doc.setTextColor(30, 30, 40);
    doc.text('Indicadores Clave', 14, y); y += 8;
    doc.setDrawColor(200, 200, 210);
    doc.line(14, y, pageW - 14, y); y += 6;
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 70);
    const kpis = [
      ['Total Tareas', String(data.totalTasks)],
      ['Completadas', String(data.completed)],
      ['Pendientes', String(data.pending)],
      ['En Progreso', String(data.inProgress)],
      ['Vencidas', String(data.overdue)],
      ['Cumplimiento', `${data.compliance}%`],
      ['Horas Registradas', `${data.totalHours}h`],
      ['Gastos', new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(data.totalExpenses)],
      ['RFIs Asignados', String(data.rfis)],
      ['Submittals', String(data.submittals)],
      ['Punch Items', String(data.punchItems)],
    ];
    kpis.forEach(([label, val]) => {
      doc.setTextColor(100, 100, 110);
      doc.text(label, 20, y);
      doc.setTextColor(30, 30, 40);
      doc.text(val, 120, y);
      y += 7;
    });

    doc.save(`perfil_${data.name.replace(/\s+/g, '_')}.pdf`);
  } catch (err) { console.error('[Profile PDF]', err); }
}

export default function ProfileScreen() {
  const {
    approvals, authUser, disconnectMicrosoft, doLogout, doMicrosoftLogin,
    expenses, initials, meetings, myRole,
    navigateTo, projects, tasks, teamUsers, userName,
    rfis, submittals, punchItems, getUserName, setForms,
    updateUserName, updateUserRole, updateUserCompany, companies, showToast,
  } = useApp();
  const { timeEntries } = useTimeTrackingContext();
  const od = useOneDrive();

  const today = new Date();
  const [activeTab, setActiveTab] = useState<ProfileTab>('resumen');
  const [pcMonth, setPcMonth] = useState(today.getMonth());
  const [pcYear, setPcYear] = useState(today.getFullYear());
  const [pcSelected, setPcSelected] = useState<string | null>(today.toISOString().split('T')[0]);
  const [editingName, setEditingName] = useState(false);
  const [editNameVal, setEditNameVal] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);

  const uid = authUser?.uid ?? '';

  // ─── Computed Data ──────────────────────────────────
  const computed = useMemo(() => {
    if (!uid) return null;
    const myTasks = tasks.filter(t => t.data.assigneeId === uid);
    const myUnassigned = tasks.filter(t => !t.data.assigneeId);
    const allMyTasks = [...myTasks, ...myUnassigned];

    const myPending = allMyTasks.filter(t => t.data.status !== 'Completado');
    const myCompleted = allMyTasks.filter(t => t.data.status === 'Completado');
    const myInProgress = allMyTasks.filter(t => t.data.status === 'En progreso');
    const myReview = allMyTasks.filter(t => t.data.status === 'Revision');
    const myHighPrio = myPending.filter(t => t.data.priority === 'Alta');
    const myOverdue = myPending.filter(t => t.data.dueDate && checkOverdue(t.data.dueDate));
    const totalRate = allMyTasks.length > 0 ? Math.round((myCompleted.length / allMyTasks.length) * 100) : 0;

    const myProjects = projects.filter(p => p.data.createdBy === uid || allMyTasks.some(t => t.data.projectId === p.id));
    const myExpenses = expenses.filter(e => e.data.createdBy === uid);
    const totalSpent = myExpenses.reduce((s, e) => s + (Number(e.data.amount) || 0), 0);

    const myTimeEntries = timeEntries.filter(t => t.data.userId === uid);
    const totalMinutes = myTimeEntries.reduce((s, t) => s + (Number(t.data.duration) || 0), 0);
    const totalHours = Math.round(totalMinutes / 60);
    const billableMinutes = myTimeEntries.filter(t => t.data.billable).reduce((s, t) => s + (Number(t.data.duration) || 0), 0);
    const billableHours = Math.round(billableMinutes / 60);

    // This week hours
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekMinutes = myTimeEntries.filter(t => {
      if (!t.data.date) return false;
      const d = new Date(t.data.date);
      return d >= weekStart;
    }).reduce((s, t) => s + (Number(t.data.duration) || 0), 0);
    const weekHours = Math.round(weekMinutes / 60);

    const myRFIs = rfis.filter(r => r.data.assignedTo === uid);
    const myOpenRFIs = myRFIs.filter(r => r.data.status !== 'Cerrado' && r.data.status !== 'Respondido');
    const mySubs = submittals.filter(s => s.data.reviewer === uid || s.data.createdBy === uid);
    const myOpenSubs = mySubs.filter(s => s.data.status !== 'Aprobado' && s.data.status !== 'Rechazado');
    const myPunch = punchItems.filter(p => p.data.assignedTo === uid);
    const myOpenPunch = myPunch.filter(p => p.data.status !== 'Completado');

    // Active projects (not finished)
    const activeProjects = myProjects.filter(p => p.data.status !== 'Finalizado' && p.data.status !== 'Cancelado');

    // Avg tasks per day (completed in last 30 days)
    const thirtyAgo = new Date(today.getTime() - 30 * 86400000);
    const recentCompleted = myCompleted.filter(t => {
      const cd = toDate(t.data.completedAt) || toDate(t.data.updatedAt) || toDate(t.data.createdAt);
      return cd >= thirtyAgo;
    });
    const avgPerDay = recentCompleted.length > 0 ? (recentCompleted.length / 30).toFixed(1) : '0';

    // Tasks by project
    const tasksByProject: { id: string; name: string; total: number; done: number; pct: number }[] = [];
    myProjects.forEach(p => {
      const pTasks = allMyTasks.filter(t => t.data.projectId === p.id);
      if (pTasks.length > 0) {
        const done = pTasks.filter(t => t.data.status === 'Completado').length;
        tasksByProject.push({ id: p.id, name: p.data.name, total: pTasks.length, done, pct: Math.round((done / pTasks.length) * 100) });
      }
    });
    tasksByProject.sort((a, b) => b.pct - a.pct);

    // Weekly activity (last 7 days)
    const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const weeklyData = weekDays.map((label, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      const completed = myCompleted.filter(t => {
        const cd = toDate(t.data.completedAt) || toDate(t.data.createdAt);
        return cd >= dayStart && cd < dayEnd;
      }).length;
      return { label, count: completed };
    });
    const weekMax = Math.max(...weeklyData.map(w => w.count), 1);

    // Priority data
    const prioData = [
      { label: 'Alta', count: allMyTasks.filter(t => t.data.priority === 'Alta').length, color: '#e05555' },
      { label: 'Media', count: allMyTasks.filter(t => t.data.priority === 'Media').length, color: '#e09855' },
      { label: 'Baja', count: allMyTasks.filter(t => t.data.priority === 'Baja').length, color: '#4caf7d' },
    ];
    const prioMax = Math.max(...prioData.map(p => p.count), 1);

    // Activity timeline (last 20 completed tasks sorted by date)
    const activityTimeline = myCompleted
      .map(t => {
        const proj = projects.find(p => p.id === t.data.projectId);
        const cd = toDate(t.data.completedAt) || toDate(t.data.updatedAt) || toDate(t.data.createdAt);
        return { id: t.id, title: t.data.title, project: proj?.data.name || '', date: cd, priority: t.data.priority };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 20);

    // Recent time entries (last 15)
    const recentTime = myTimeEntries
      .map(te => {
        const proj = projects.find(p => p.id === te.data.projectId);
        return { id: te.id, desc: te.data.description || te.data.phaseName, project: proj?.data.name || '', duration: te.data.duration, date: te.data.date, billable: te.data.billable };
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 15);

    // Calendar data
    const myCalTasks = tasks.filter(t => t.data.assigneeId === uid && t.data.dueDate && t.data.status !== 'Completado');
    const myCalRFIs = rfis.filter(r => r.data.assignedTo === uid && r.data.dueDate && r.data.status !== 'Cerrado' && r.data.status !== 'Respondido');
    const myCalSubs = submittals.filter(s => (s.data.reviewer === uid || s.data.createdBy === uid) && s.data.dueDate && s.data.status !== 'Aprobado' && s.data.status !== 'Rechazado');
    const myCalPunch = punchItems.filter(p => p.data.assignedTo === uid && p.data.dueDate && p.data.status !== 'Completado');
    const myCalMeetings = meetings.filter(m => m.data.date && (m.data.createdBy === uid || (Array.isArray(m.data.attendees) && m.data.attendees.some((a: string) => a === userName))));

    return {
      allMyTasks, myPending, myCompleted, myInProgress, myReview, myHighPrio, myOverdue,
      totalRate, myProjects, activeProjects, myExpenses, totalSpent,
      myTimeEntries, totalMinutes, totalHours, billableHours, weekHours,
      myRFIs, myOpenRFIs, mySubs, myOpenSubs, myPunch, myOpenPunch,
      avgPerDay, tasksByProject, weeklyData, weekMax, prioData, prioMax,
      activityTimeline, recentTime,
      myCalTasks, myCalRFIs, myCalSubs, myCalPunch, myCalMeetings,
    };
  }, [uid, tasks, projects, expenses, timeEntries, rfis, submittals, punchItems, meetings, userName]);

  // ─── Handlers ────────────────────────────────────────
  const startEditName = () => { setEditNameVal(userName || ''); setEditingName(true); };
  const saveName = () => { if (editNameVal.trim() && editNameVal !== userName) { updateUserName(editNameVal.trim()); } setEditingName(false); };

  // Calendar helpers
  const pcTodayStr = today.toISOString().split('T')[0];
  const pcFirstDay = new Date(pcYear, pcMonth, 1);
  const pcLastDay = new Date(pcYear, pcMonth + 1, 0);
  const pcStartDow = (pcFirstDay.getDay() + 6) % 7;
  const pcDaysInMonth = pcLastDay.getDate();
  const pcDateStr = (day: number) => `${pcYear}-${String(pcMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const pcCells: (number | null)[] = useMemo(() => {
    const cells: (number | null)[] = [];
    for (let i = 0; i < pcStartDow; i++) cells.push(null);
    for (let d = 1; d <= pcDaysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [pcStartDow, pcDaysInMonth]);

  const countForDay = useCallback((day: number) => {
    if (!computed) return 0;
    const ds = pcDateStr(day);
    return computed.myCalTasks.filter(t => t.data.dueDate === ds).length
      + computed.myCalRFIs.filter(r => r.data.dueDate === ds).length
      + computed.myCalSubs.filter(s => s.data.dueDate === ds).length
      + computed.myCalPunch.filter(p => p.data.dueDate === ds).length
      + computed.myCalMeetings.filter(m => m.data.date === ds).length;
  }, [computed, pcYear, pcMonth]);

  const selTasks = computed && pcSelected ? computed.myCalTasks.filter(t => t.data.dueDate === pcSelected) : [];
  const selRFIs = computed && pcSelected ? computed.myCalRFIs.filter(r => r.data.dueDate === pcSelected) : [];
  const selSubs = computed && pcSelected ? computed.myCalSubs.filter(s => s.data.dueDate === pcSelected) : [];
  const selPunch = computed && pcSelected ? computed.myCalPunch.filter(p => p.data.dueDate === pcSelected) : [];
  const selMeetings = computed && pcSelected ? computed.myCalMeetings.filter(m => m.data.date === pcSelected) : [];
  const selTotal = selTasks.length + selRFIs.length + selSubs.length + selPunch.length + selMeetings.length;

  const pcUrgent = computed?.myCalTasks.filter(t => t.data.priority === 'Alta').length || 0;
  const pcOverdue = computed?.myCalTasks.filter(t => t.data.dueDate && checkOverdue(t.data.dueDate)).length || 0;
  const pcThisWeek = computed?.myCalTasks.filter(t => { const d = t.data.dueDate; if (!d) return false; const diff = Math.ceil((new Date(d).getTime() - today.getTime()) / 86400000); return diff >= 0 && diff <= 7; }).length || 0;
  const pcMonthMeetings = computed?.myCalMeetings.filter(m => m.data.date && m.data.date.startsWith(`${pcYear}-${String(pcMonth + 1).padStart(2, '0')}`)).length || 0;

  const pcPrevMonth = () => { if (pcMonth === 0) { setPcMonth(11); setPcYear(y => y - 1); } else { setPcMonth(m => m - 1); } setPcSelected(null); };
  const pcNextMonth = () => { if (pcMonth === 11) { setPcMonth(0); setPcYear(y => y + 1); } else { setPcMonth(m => m + 1); } setPcSelected(null); };
  const pcGoToday = () => { setPcMonth(today.getMonth()); setPcYear(today.getFullYear()); setPcSelected(pcTodayStr); };

  const getItemsForDay = useCallback((day: number) => {
    if (!computed) return [];
    const ds = pcDateStr(day);
    const items: { type: string; label: string; color: string }[] = [];
    computed.myCalTasks.filter(t => t.data.dueDate === ds).slice(0, 2).forEach(t => items.push({ type: 'task', label: t.data.title, color: t.data.priority === 'Alta' ? 'bg-red-500/15 text-red-400' : t.data.priority === 'Media' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400' }));
    computed.myCalRFIs.filter(r => r.data.dueDate === ds).slice(0, 1).forEach(r => items.push({ type: 'rfi', label: `RFI ${r.data.number}`, color: 'bg-blue-500/15 text-blue-400' }));
    computed.myCalMeetings.filter(m => m.data.date === ds).slice(0, 1).forEach(m => items.push({ type: 'meeting', label: `${m.data.time || '09:00'}`, color: 'bg-purple-500/15 text-purple-400' }));
    computed.myCalPunch.filter(p => p.data.dueDate === ds).slice(0, 1).forEach(p => items.push({ type: 'punch', label: p.data.title, color: 'bg-teal-500/15 text-teal-400' }));
    computed.myCalSubs.filter(s => s.data.dueDate === ds).slice(0, 1).forEach(s => items.push({ type: 'sub', label: `Sub ${s.data.number}`, color: 'bg-fuchsia-500/15 text-fuchsia-400' }));
    return items;
  }, [computed, pcYear, pcMonth]);

  const handleExportPDF = () => {
    if (!computed || !userName) return;
    exportProfilePDF({
      name: userName, email: authUser?.email || '', role: myRole || 'Miembro',
      totalTasks: computed.allMyTasks.length, completed: computed.myCompleted.length,
      pending: computed.myPending.length, inProgress: computed.myInProgress.length,
      compliance: computed.totalRate, overdue: computed.myOverdue.length,
      totalProjects: computed.myProjects.length, totalHours: computed.totalHours,
      totalExpenses: computed.totalSpent, rfis: computed.myOpenRFIs.length,
      submittals: computed.myOpenSubs.length, punchItems: computed.myOpenPunch.length,
    });
  };

  // ─── Role from teamUsers ────────────────────────────
  const effectiveRole = teamUsers.find(u => u.id === uid)?.data?.role || myRole || 'Miembro';

  // ─── Tabs config ─────────────────────────────────────
  const tabs: { id: ProfileTab; label: string; icon: string }[] = [
    { id: 'resumen', label: 'Resumen', icon: '📊' },
    { id: 'calendario', label: 'Calendario', icon: '📅' },
    { id: 'actividad', label: 'Actividad', icon: '⚡' },
    { id: 'integraciones', label: 'Integraciones', icon: '🔗' },
  ];

  if (!computed) return null;

  // ─── Notifications ──────────────────────────────────
  const notifications: { icon: string; text: string; time: string; urgent: boolean }[] = [];
  const todayStr2 = today.toISOString().split('T')[0];
  const weekLater = new Date(today.getTime() + 7 * 86400000);

  computed.myOverdue.forEach(t => {
    const proj = projects.find(p => p.id === t.data.projectId);
    const days = Math.floor((today.getTime() - new Date(t.data.dueDate).getTime()) / 86400000);
    notifications.push({ icon: '⚡', text: `"${t.data.title}" venció hace ${days} día${days !== 1 ? 's' : ''}${proj ? ` — ${proj.data.name}` : ''}`, time: `Venció ${fmtDate(t.data.dueDate)}`, urgent: true });
  });
  computed.myHighPrio.forEach(t => {
    const proj = projects.find(p => p.id === t.data.projectId);
    notifications.push({ icon: '🔴', text: `Urgente: "${t.data.title}"${proj ? ` — ${proj.data.name}` : ''}`, time: `Prioridad Alta · ${t.data.status}`, urgent: true });
  });
  computed.myCalMeetings.forEach(m => {
    if (m.data.date && (m.data.date === todayStr2 || (m.data.date > todayStr2 && m.data.date <= weekLater.toISOString().split('T')[0]))) {
      const proj = projects.find(p => p.id === m.data.projectId);
      const isTd = m.data.date === todayStr2;
      notifications.push({ icon: '📅', text: `Reunión "${m.data.title}"${isTd ? ' hoy' : ''} a las ${m.data.time || '09:00'}${proj ? ` — ${proj.data.name}` : ''}`, time: `${fmtDate(m.data.date)} · ${m.data.duration || 60} min`, urgent: isTd });
    }
  });
  const pendingApps = approvals.filter(a => a.data.status === 'Pendiente');
  if (pendingApps.length > 0) notifications.push({ icon: '📋', text: `${pendingApps.length} aprobación${pendingApps.length > 1 ? 'es' : ''} pendiente${pendingApps.length > 1 ? 's' : ''}`, time: 'Requiere atención', urgent: false });
  computed.myInProgress.slice(0, 3).forEach(t => {
    const proj = projects.find(p => p.id === t.data.projectId);
    notifications.push({ icon: '🔄', text: `"${t.data.title}" en progreso${proj ? ` — ${proj.data.name}` : ''}${t.data.dueDate ? ` · Vence: ${fmtDate(t.data.dueDate)}` : ''}`, time: t.data.status, urgent: false });
  });
  notifications.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));

  // ─── Render ─────────────────────────────────────────
  return (
    <div className="animate-fadeIn space-y-4">
      <ConfirmDialog open={logoutOpen} title="Cerrar Sesión" message="¿Estás seguro de que deseas cerrar sesión? Se perderá el progreso no guardado." onConfirm={() => { setLogoutOpen(false); doLogout(); }} onCancel={() => setLogoutOpen(false)} />

      {/* ═══ HEADER CARD ═══ */}
      <div className="bg-gradient-to-br from-[var(--card)] to-[var(--af-bg3)] border border-[var(--border)] rounded-xl sm:rounded-2xl p-3.5 sm:p-5 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-[var(--af-accent)]/5 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full bg-[var(--af-accent)]/3 blur-xl" />

        <div className="flex items-start gap-3 relative">
          {/* Avatar */}
          <div className={`w-14 h-14 sm:w-18 sm:h-18 rounded-xl sm:rounded-2xl flex items-center justify-center text-xl sm:text-2xl font-bold border-2 ${authUser?.photoURL ? '' : avatarColor(uid)} flex-shrink-0 overflow-hidden shadow-lg`}>
            {authUser?.photoURL ? <img src={authUser.photoURL} alt="" className="w-full h-full object-cover" /> : initials}
          </div>

          {/* Name & Info */}
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2 mb-1">
                <input autoFocus className="bg-[var(--af-bg4)] border border-[var(--border)] rounded-lg px-3 py-1 text-[13px] sm:text-base font-semibold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--af-accent)]/30 w-full max-w-[200px]" value={editNameVal} onChange={e => setEditNameVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName()} />
                <button className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-[11px] cursor-pointer hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors" onClick={saveName}>Guardar</button>
                <button className="px-2.5 py-1 rounded-lg bg-[var(--af-bg4)] text-[var(--muted-foreground)] text-[11px] cursor-pointer hover:bg-[var(--af-bg3)] border border-[var(--border)] transition-colors" onClick={() => setEditingName(false)}>X</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div style={{ fontFamily: "'DM Serif Display', serif" }} className="text-base sm:text-xl cursor-pointer hover:text-[var(--af-accent)] transition-colors" onClick={startEditName}>{userName}</div>
                <button className="w-5 h-5 rounded flex items-center justify-center text-[10px] text-[var(--muted-foreground)] hover:text-[var(--af-accent)] hover:bg-[var(--af-accent)]/10 cursor-pointer transition-colors" onClick={startEditName} title="Editar nombre">✏️</button>
              </div>
            )}
            <div className="text-[11px] sm:text-sm text-[var(--muted-foreground)] truncate">{authUser?.email}</div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className={`text-[9px] sm:text-[11px] px-2 py-0.5 rounded-full border ${ROLE_COLORS[effectiveRole]}`}>{ROLE_ICONS[effectiveRole]} {effectiveRole}</span>
              <span className="text-[9px] sm:text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">{computed.myProjects.length} proyectos</span>
              <span className="text-[9px] sm:text-[11px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">{computed.totalHours}h registradas</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button className="w-8 h-8 rounded-lg bg-[var(--af-bg4)] border border-[var(--border)] flex items-center justify-center text-sm cursor-pointer hover:bg-[var(--af-bg3)] hover:text-[var(--af-accent)] transition-colors" onClick={handleExportPDF} title="Exportar perfil PDF">📄</button>
          </div>
        </div>

        {/* ═══ KPIs ROW ═══ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5 sm:gap-2 mt-4">
          {[
            { val: computed.myPending.length, lbl: 'Pendientes', c: 'text-amber-400', bg: 'bg-amber-500/10', filter: '' },
            { val: computed.myInProgress.length, lbl: 'En progreso', c: 'text-blue-400', bg: 'bg-blue-500/10', filter: 'En progreso' },
            { val: computed.myReview.length, lbl: 'En revisión', c: 'text-violet-400', bg: 'bg-violet-500/10', filter: 'Revision' },
            { val: computed.myCompleted.length, lbl: 'Completadas', c: 'text-emerald-400', bg: 'bg-emerald-500/10', filter: 'Completado' },
            { val: computed.totalRate + '%', lbl: 'Cumplimiento', c: 'text-[var(--af-accent)]', bg: 'bg-[var(--af-accent)]/10', filter: null },
            { val: computed.myOverdue.length, lbl: 'Vencidas', c: 'text-red-400', bg: 'bg-red-500/10', filter: null },
            { val: computed.weekHours + 'h', lbl: 'Esta semana', c: 'text-cyan-400', bg: 'bg-cyan-500/10', filter: null },
            { val: computed.avgPerDay, lbl: 'Prom/día', c: 'text-orange-400', bg: 'bg-orange-500/10', filter: null },
          ].map((s, i) => (
            <div key={i} className={`${s.bg} rounded-lg p-2 text-center ${s.filter !== null ? 'cursor-pointer hover:ring-2 hover:ring-[var(--af-accent)]/20 transition-all' : ''}`} onClick={() => {
              if (s.filter === null) return;
              setForms((p: any) => ({ ...p, taskFilterStatus: s.filter, taskFilterAssignee: uid || '' }));
              navigateTo('tasks');
            }}>
              <div className={`text-sm sm:text-lg font-bold ${s.c}`}>{s.val}</div>
              <div className="text-[7px] sm:text-[10px] text-[var(--muted-foreground)] leading-tight">{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ TABS NAV ═══ */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-1 flex gap-1 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} className={`flex-1 min-w-0 px-3 py-2 rounded-lg text-[11px] sm:text-[12px] font-medium cursor-pointer transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${activeTab === tab.id ? 'bg-[var(--af-accent)]/15 text-[var(--af-accent)] border border-[var(--af-accent)]/20' : 'text-[var(--muted-foreground)] hover:bg-[var(--af-bg3)] border border-transparent'}`} onClick={() => setActiveTab(tab.id)}>
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ═══ TAB: RESUMEN ═══ */}
      {activeTab === 'resumen' && (
        <>
          {/* Notificaciones */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-base">🔔</div>
                <div className="text-[13px] sm:text-[15px] font-semibold">Notificaciones</div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--muted-foreground)]">{notifications.length}</span>
            </div>
            {notifications.length === 0 ? (
              <div className="text-center py-6 text-[var(--af-text3)]">
                <div className="text-2xl mb-1">🔔</div>
                <div className="text-[12px]">Sin notificaciones nuevas</div>
              </div>
            ) : (
              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                {notifications.slice(0, 12).map((n, i) => (
                  <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg transition-colors ${n.urgent ? 'bg-red-500/5 border border-red-500/20' : 'bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)]'}`}>
                    <div className="text-base flex-shrink-0 mt-0.5">{n.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] sm:text-[13px] leading-snug">{n.text}</div>
                      <div className="text-[10px] text-[var(--af-text3)] mt-0.5">{n.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            {/* Compliance Donut */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 sm:p-5 flex flex-col items-center justify-center">
              <div className="text-[11px] sm:text-[13px] font-semibold text-[var(--muted-foreground)] mb-2 sm:mb-3">Cumplimiento</div>
              <div className="relative w-20 h-20 sm:w-28 sm:h-28">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--af-bg4)" strokeWidth="3" />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={computed.totalRate >= 80 ? '#4caf7d' : computed.totalRate >= 50 ? '#c8a96e' : '#e05555'} strokeWidth="3" strokeDasharray={`${computed.totalRate}, 100`} strokeLinecap="round" className="transition-all duration-700" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg sm:text-2xl font-bold">{computed.totalRate}%</span>
                </div>
              </div>
              <div className="text-[10px] sm:text-xs text-[var(--af-text3)] mt-1.5">{computed.myCompleted.length} de {computed.allMyTasks.length}</div>
            </div>

            {/* Priority Bars */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 sm:p-5">
              <div className="text-[11px] sm:text-[13px] font-semibold text-[var(--muted-foreground)] mb-3">Distribución por Prioridad</div>
              <div className="space-y-2.5">
                {computed.prioData.map((p, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-[11px] sm:text-[12px] mb-1"><span>{p.label}</span><span className="text-[var(--muted-foreground)]">{p.count}</span></div>
                    <div className="h-2 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: Math.round((p.count / computed.prioMax) * 100) + '%', backgroundColor: p.color }} />
                    </div>
                  </div>
                ))}
              </div>
              {computed.myHighPrio.length > 0 && <div className="mt-3 p-2 bg-red-500/10 rounded-lg text-[11px] text-red-400 text-center">{computed.myHighPrio.length} tarea{computed.myHighPrio.length > 1 ? 's' : ''} urgente{computed.myHighPrio.length > 1 ? 's' : ''} pendiente{computed.myHighPrio.length > 1 ? 's' : ''}</div>}
            </div>

            {/* Weekly Activity */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 sm:p-5">
              <div className="text-[11px] sm:text-[13px] font-semibold text-[var(--muted-foreground)] mb-3">Actividad Semanal</div>
              <div className="flex items-end gap-1.5 h-24">
                {computed.weeklyData.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-[8px] sm:text-[10px] text-[var(--af-accent)] font-bold">{d.count}</div>
                    <div className="w-full bg-[var(--af-bg4)] rounded-full overflow-hidden flex-1 relative" style={{ minHeight: 16 }}>
                      <div className="absolute bottom-0 left-0 right-0 bg-[var(--af-accent)]/60 rounded-full transition-all duration-500" style={{ height: Math.max(Math.round((d.count / computed.weekMax) * 100), d.count > 0 ? 8 : 0) + '%' }} />
                    </div>
                    <div className="text-[8px] sm:text-[9px] text-[var(--muted-foreground)]">{d.label}</div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-[var(--af-text3)] mt-2 text-center">Tareas completadas en los últimos 7 días</div>
            </div>
          </div>

          {/* Progress by Project */}
          {computed.tasksByProject.length > 0 && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-base">📁</div>
                <div className="text-[13px] sm:text-[15px] font-semibold">Progreso por Proyecto</div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--muted-foreground)]">{computed.tasksByProject.length} proyecto{computed.tasksByProject.length > 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto">
                {computed.tasksByProject.map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)] transition-colors cursor-pointer" onClick={() => { navigateTo('projects'); }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium truncate">{p.name}</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">{p.done}/{p.total} tareas</div>
                    </div>
                    <div className="w-24 sm:w-32 flex-shrink-0">
                      <div className="h-2 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${p.pct >= 80 ? 'bg-emerald-500' : p.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: p.pct + '%' }} />
                      </div>
                    </div>
                    <span className={`text-[11px] font-bold min-w-[36px] text-right ${p.pct >= 80 ? 'text-emerald-400' : p.pct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{p.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Access Grid */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 sm:p-5">
            <div className="text-[13px] sm:text-[15px] font-semibold mb-3">Accesos Rápidos</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { icon: '✅', label: 'Mis Tareas', sub: `${computed.myPending.length} pendientes`, screen: 'tasks', filter: { taskFilterAssignee: uid || '' } },
                { icon: '📁', label: 'Mis Proyectos', sub: `${computed.activeProjects.length} activos`, screen: 'projects' },
                { icon: '⏱️', label: 'Time Tracking', sub: `${computed.weekHours}h esta semana`, screen: 'timeTracking' },
                { icon: '💰', label: 'Mis Gastos', sub: fmtCOP(computed.totalSpent), screen: 'budget' },
                { icon: '❓', label: 'Mis RFIs', sub: `${computed.myOpenRFIs.length} abiertos`, screen: 'rfis' },
                { icon: '📋', label: 'Submittals', sub: `${computed.myOpenSubs.length} pendientes`, screen: 'submittals' },
                { icon: '✅', label: 'Punch List', sub: `${computed.myOpenPunch.length} pendientes`, screen: 'punchList' },
                { icon: '📅', label: 'Calendario', sub: 'Agenda completa', screen: 'calendar' },
              ].map((q, i) => (
                <button key={i} className="bg-[var(--af-bg3)] border border-[var(--border)] rounded-xl p-3 text-left cursor-pointer hover:border-[var(--af-accent)]/30 hover:bg-[var(--af-accent)]/5 transition-all group" onClick={() => { if (q.filter) setForms((p: any) => ({ ...p, ...q.filter })); navigateTo(q.screen); }}>
                  <div className="text-lg mb-1">{q.icon}</div>
                  <div className="text-[12px] font-medium group-hover:text-[var(--af-accent)] transition-colors">{q.label}</div>
                  <div className="text-[10px] text-[var(--muted-foreground)] truncate">{q.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ═══ TAB: CALENDARIO ═══ */}
      {activeTab === 'calendario' && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl sm:rounded-2xl p-3.5 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--af-accent)]/10 flex items-center justify-center text-base">📅</div>
              <div className="text-[13px] sm:text-[15px] font-semibold">Mi Calendario Personal</div>
            </div>
            <button className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--af-accent)]/10 text-[var(--af-accent)] cursor-pointer border border-[var(--af-accent)]/20 hover:bg-[var(--af-accent)]/20 transition-colors" onClick={() => navigateTo('calendar')}>
              Ver completo →
            </button>
          </div>
          <div className="text-[11px] text-[var(--muted-foreground)] mb-3">Solo se muestran tus tareas, RFIs, reuniones y pendientes.</div>

          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <button aria-label="Mes anterior" className="w-7 h-7 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg4)] transition-colors" onClick={pcPrevMonth}>
                <ChevronLeft size={14} className="text-[var(--muted-foreground)]" aria-hidden="true"/>
              </button>
              <div className="text-[13px] sm:text-[14px] font-semibold min-w-[110px] sm:min-w-[140px] text-center">{MESES[pcMonth]} {pcYear}</div>
              <button aria-label="Mes siguiente" className="w-7 h-7 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg4)] transition-colors" onClick={pcNextMonth}>
                <ChevronRight size={14} className="text-[var(--muted-foreground)]" aria-hidden="true"/>
              </button>
            </div>
            <button className="text-[10px] px-2 py-1 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] cursor-pointer hover:bg-[var(--af-bg4)] transition-colors" onClick={pcGoToday}>Hoy</button>
          </div>

          {/* Mini stats */}
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            <div className="bg-red-500/10 rounded-lg p-2 text-center"><div className="text-sm font-bold text-red-400">{pcUrgent}</div><div className="text-[8px] text-red-400/70">Urgentes</div></div>
            <div className="bg-amber-500/10 rounded-lg p-2 text-center"><div className="text-sm font-bold text-amber-400">{pcOverdue}</div><div className="text-[8px] text-amber-400/70">Vencidas</div></div>
            <div className="bg-blue-500/10 rounded-lg p-2 text-center"><div className="text-sm font-bold text-blue-400">{pcThisWeek}</div><div className="text-[8px] text-blue-400/70">Esta semana</div></div>
            <div className="bg-purple-500/10 rounded-lg p-2 text-center"><div className="text-sm font-bold text-purple-400">{pcMonthMeetings}</div><div className="text-[8px] text-purple-400/70">Reuniones</div></div>
          </div>

          {/* Calendar Grid */}
          <div className="rounded-xl overflow-hidden border border-[var(--border)]">
            <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--af-bg3)]/50">
              {DIAS_SEMANA.map(d => <div key={d} className="py-1.5 text-center text-[9px] sm:text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {pcCells.map((day, idx) => {
                if (day === null) return <div key={`e-${idx}`} className="min-h-[52px] sm:min-h-[72px] border-b border-r border-[var(--border)] bg-[var(--af-bg3)]/20" />;
                const ds = pcDateStr(day);
                const isToday = ds === pcTodayStr;
                const isSelected = ds === pcSelected;
                const isPast = ds < pcTodayStr && !isToday;
                const cnt = countForDay(day);
                const dayItems = getItemsForDay(day);
                return (
                  <div key={day} className={`min-h-[52px] sm:min-h-[72px] border-b border-r border-[var(--border)] p-0.5 sm:p-1 cursor-pointer transition-colors ${isSelected ? 'bg-[var(--af-accent)]/10 ring-1 ring-inset ring-[var(--af-accent)]/30' : 'hover:bg-[var(--af-bg3)]'} ${isPast ? 'opacity-60' : ''}`} onClick={() => setPcSelected(ds)}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className={`text-[10px] sm:text-[12px] font-medium ${isToday ? 'w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[var(--af-accent)] text-background flex items-center justify-center' : 'text-[var(--foreground)]'}`}>{day}</div>
                      {cnt > 0 && !isToday && <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[7px] sm:text-[8px] font-bold ${cnt > 4 ? 'bg-[var(--af-accent)] text-background' : 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]'}`}>{cnt}</div>}
                      {isToday && cnt > 0 && <div className="w-1.5 h-1.5 rounded-full bg-[var(--af-accent)] animate-pulse" />}
                    </div>
                    <div className="space-y-px">
                      {dayItems.slice(0, 2).map((item, i) => <div key={i} className={`text-[7px] sm:text-[8px] leading-tight px-0.5 py-px rounded truncate ${item.color}`} title={item.label}>{item.label}</div>)}
                      {cnt > 2 && <div className="text-[7px] text-[var(--muted-foreground)]">+{cnt - 2}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 px-1">
            {[{ label: 'Tareas', color: 'bg-emerald-500/15 text-emerald-400' }, { label: 'RFIs', color: 'bg-blue-500/15 text-blue-400' }, { label: 'Reuniones', color: 'bg-purple-500/15 text-purple-400' }, { label: 'Punch', color: 'bg-teal-500/15 text-teal-400' }, { label: 'Submittals', color: 'bg-fuchsia-500/15 text-fuchsia-400' }].map((l, i) => (
              <div key={i} className="flex items-center gap-1"><div className={`w-2 h-2 rounded-sm ${l.color}`} /><span className="text-[9px] text-[var(--muted-foreground)]">{l.label}</span></div>
            ))}
          </div>

          {/* Selected Day Detail */}
          {pcSelected && (
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[13px] font-semibold">{(() => { const parts = pcSelected.split('-'); return `${parseInt(parts[2])} de ${MESES[parseInt(parts[1]) - 1]} ${parts[0]}`; })()}</div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${selTotal > 0 ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)]' : 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]'}`}>{selTotal} actividad{selTotal !== 1 ? 'es' : ''}</span>
              </div>
              {selTotal === 0 ? (
                <div className="text-center py-6 text-[var(--af-text3)]"><div className="text-2xl mb-1">🏖️</div><div className="text-[12px]">Sin actividades para este día</div></div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {selMeetings.length > 0 && <div><div className="text-[11px] font-semibold text-purple-400 mb-1.5">📅 Reuniones ({selMeetings.length})</div><div className="space-y-1.5">{selMeetings.sort((a, b) => (a.data.time || '').localeCompare(b.data.time || '')).map(m => { const proj = projects.find(p => p.id === m.data.projectId); return (<div key={m.id} className="border border-purple-500/20 rounded-lg p-2.5 bg-purple-500/5"><div className="flex items-start justify-between gap-2"><div className="text-[12px] font-medium">{m.data.title}</div><span className="text-[10px] text-purple-400 flex-shrink-0">{m.data.time || '09:00'} · {m.data.duration || 60}min</span></div>{proj && <div className="text-[10px] text-[var(--af-text3)] mt-1">📁 {proj.data.name}</div>}</div>); })}</div></div>}
                  {selTasks.length > 0 && <div><div className="text-[11px] font-semibold mb-1.5">✅ Tareas ({selTasks.length})</div><div className="space-y-1.5">{selTasks.sort((a, b) => { const o: Record<string, number> = { Alta: 0, Media: 1, Baja: 2 }; return (o[a.data.priority] || 1) - (o[b.data.priority] || 1); }).map(t => { const proj = projects.find(p => p.id === t.data.projectId); const od = checkOverdue(t.data.dueDate); return (<div key={t.id} className={`border rounded-lg p-2.5 ${od ? 'border-red-500/20 bg-red-500/5' : 'border-[var(--border)] bg-[var(--af-bg3)]'}`}><div className="flex items-start justify-between gap-2"><div className="text-[12px] font-medium leading-snug">{od ? '⚡ ' : ''}{t.data.title}</div><span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${prioColor(t.data.priority)}`}>{t.data.priority}</span></div><div className="flex items-center gap-2 text-[10px] text-[var(--af-text3)] mt-1">{proj && <span>📁 {proj.data.name}</span>}<span className={`px-1.5 py-0.5 rounded-full ${taskStColor(t.data.status)}`}>{t.data.status}</span></div></div>); })}</div></div>}
                  {selRFIs.length > 0 && <div><div className="text-[11px] font-semibold text-blue-400 mb-1.5">❓ RFIs ({selRFIs.length})</div><div className="space-y-1.5">{selRFIs.map(r => { const proj = projects.find(p => p.id === r.data.projectId); return (<div key={r.id} className="border border-blue-500/20 rounded-lg p-2.5 bg-blue-500/5"><div className="text-[12px] font-medium">{r.data.number}: {r.data.subject}</div><div className="flex items-center gap-2 text-[10px] text-[var(--af-text3)] mt-1">{proj && <span>📁 {proj.data.name}</span>}<span className="text-blue-400">{r.data.status}</span></div></div>); })}</div></div>}
                  {selSubs.length > 0 && <div><div className="text-[11px] font-semibold text-fuchsia-400 mb-1.5">📋 Submittals ({selSubs.length})</div><div className="space-y-1.5">{selSubs.map(s => { const proj = projects.find(p => p.id === s.data.projectId); return (<div key={s.id} className="border border-fuchsia-500/20 rounded-lg p-2.5 bg-fuchsia-500/5"><div className="text-[12px] font-medium">{s.data.number}: {s.data.title}</div><div className="flex items-center gap-2 text-[10px] text-[var(--af-text3)] mt-1">{proj && <span>📁 {proj.data.name}</span>}<span className="text-fuchsia-400">{s.data.status}</span></div></div>); })}</div></div>}
                  {selPunch.length > 0 && <div><div className="text-[11px] font-semibold text-teal-400 mb-1.5">✅ Punch List ({selPunch.length})</div><div className="space-y-1.5">{selPunch.map(p => { const proj = projects.find(pr => pr.id === p.data.projectId); return (<div key={p.id} className="border border-teal-500/20 rounded-lg p-2.5 bg-teal-500/5"><div className="text-[12px] font-medium">{p.data.title}</div><div className="flex items-center gap-2 text-[10px] text-[var(--af-text3)] mt-1">{proj && <span>📁 {proj.data.name}</span>}<span className="text-teal-400">{p.data.status}</span></div></div>); })}</div></div>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: ACTIVIDAD ═══ */}
      {activeTab === 'actividad' && (
        <div className="space-y-4">
          {/* Time Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 text-center">
              <div className="text-xl sm:text-2xl font-bold text-cyan-400">{computed.totalHours}h</div>
              <div className="text-[10px] sm:text-[11px] text-[var(--muted-foreground)]">Total Registradas</div>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 text-center">
              <div className="text-xl sm:text-2xl font-bold text-emerald-400">{computed.billableHours}h</div>
              <div className="text-[10px] sm:text-[11px] text-[var(--muted-foreground)]">Facturables</div>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 text-center">
              <div className="text-xl sm:text-2xl font-bold text-blue-400">{computed.weekHours}h</div>
              <div className="text-[10px] sm:text-[11px] text-[var(--muted-foreground)]">Esta Semana</div>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 text-center">
              <div className="text-xl sm:text-2xl font-bold text-orange-400">{fmtCOP(computed.totalSpent)}</div>
              <div className="text-[10px] sm:text-[11px] text-[var(--muted-foreground)]">Gastos Totales</div>
            </div>
          </div>

          {/* Recent Time Entries */}
          {computed.recentTime.length > 0 && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-base">⏱️</div>
                <div className="text-[13px] sm:text-[15px] font-semibold">Registros de Tiempo Recientes</div>
              </div>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {computed.recentTime.map(te => (
                  <div key={te.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)] transition-colors">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs flex-shrink-0 ${te.billable ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]'}`}>{te.billable ? '$' : '⏱'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium truncate">{te.desc}</div>
                      <div className="text-[10px] text-[var(--af-text3)]">{te.project} · {te.date}</div>
                    </div>
                    <div className="text-[12px] font-bold text-cyan-400 flex-shrink-0">{te.duration}min</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-base">⚡</div>
              <div className="text-[13px] sm:text-[15px] font-semibold">Historial de Tareas Completadas</div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--muted-foreground)]">{computed.activityTimeline.length}</span>
            </div>
            {computed.activityTimeline.length === 0 ? (
              <div className="text-center py-8 text-[var(--af-text3)]"><div className="text-2xl mb-1">📋</div><div className="text-[12px]">Sin tareas completadas aún</div></div>
            ) : (
              <div className="relative max-h-[400px] overflow-y-auto">
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-[var(--border)]" />
                <div className="space-y-3">
                  {computed.activityTimeline.map((item, i) => (
                    <div key={item.id} className="flex gap-3 relative pl-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-[var(--card)] mt-1 flex-shrink-0 z-10" />
                      <div className="flex-1 p-2.5 rounded-lg bg-[var(--af-bg3)]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[12px] font-medium">{item.title}</div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${prioColor(item.priority)}`}>{item.priority}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--af-text3)] mt-1">
                          {item.project && <span>📁 {item.project}</span>}
                          <span>{fmtDate(item.date.toISOString())}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ TAB: INTEGRACIONES ═══ */}
      {activeTab === 'integraciones' && (
        <div className="space-y-4">
          {/* Microsoft OneDrive */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 sm:p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#00a4ef]/10 flex items-center justify-center text-xl">☁️</div>
              <div>
                <div className="text-[14px] font-semibold">Microsoft OneDrive</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">Almacenamiento en la nube para tus proyectos</div>
              </div>
              {od.msConnected && <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Conectado</span>}
            </div>

            {od.msConnected ? (
              <div className="space-y-3">
                <div className="text-[11px] text-[var(--af-text3)]">Accede a los archivos de tus proyectos directamente desde OneDrive.</div>
                <button className="w-full p-3 rounded-lg bg-[#00a4ef]/5 border border-[#00a4ef]/20 text-left cursor-pointer hover:bg-[#00a4ef]/10 transition-all group" onClick={() => navigateTo('files')}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">📂</span>
                    <div>
                      <div className="text-[12px] font-medium group-hover:text-[#00a4ef] transition-colors">Ver mis archivos en OneDrive</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">Ir a Archivos → Mi OneDrive</div>
                    </div>
                  </div>
                </button>
                {computed.activeProjects.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-[var(--muted-foreground)]">Carpetas de proyectos:</div>
                    {computed.activeProjects.slice(0, 5).map(p => (
                      <button key={p.id} className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg p-2.5 text-left cursor-pointer hover:border-[#00a4ef]/30 transition-all" onClick={() => od.openOneDriveForProject(p.data.name)}>
                        <div className="flex items-center gap-2"><span className="text-sm">📁</span><span className="text-[12px]">{p.data.name}</span></div>
                      </button>
                    ))}
                  </div>
                )}
                <button className="w-full p-2.5 rounded-lg border border-red-500/20 text-red-400 text-[12px] cursor-pointer hover:bg-red-500/5 transition-colors flex items-center justify-center gap-2" onClick={disconnectMicrosoft}>
                  Desconectar OneDrive
                </button>
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">☁️</div>
                <div className="text-[13px] text-[var(--af-text3)] mb-1">OneDrive no está conectado</div>
                <div className="text-[11px] text-[var(--muted-foreground)] mb-4">Conecta tu cuenta de Microsoft para sincronizar archivos</div>
                <button className="px-6 py-2.5 rounded-lg bg-[#00a4ef] text-white text-[13px] font-medium cursor-pointer hover:bg-[#0090d6] transition-colors flex items-center gap-2 mx-auto" onClick={doMicrosoftLogin}>
                  Conectar mi OneDrive
                </button>
              </div>
            )}
          </div>

          {/* Account Settings */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 sm:p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-base">⚙️</div>
              <div className="text-[13px] sm:text-[15px] font-semibold">Cuenta y Configuración</div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--af-bg3)]">
                <div><div className="text-[12px] font-medium">Nombre</div><div className="text-[11px] text-[var(--muted-foreground)]">{userName}</div></div>
                <button className="text-[10px] px-2.5 py-1 rounded-lg bg-[var(--af-bg4)] border border-[var(--border)] cursor-pointer hover:bg-[var(--af-bg3)] transition-colors" onClick={startEditName}>Editar</button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--af-bg3)]">
                <div><div className="text-[12px] font-medium">Email</div><div className="text-[11px] text-[var(--muted-foreground)]">{authUser?.email}</div></div>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--muted-foreground)]">Firebase Auth</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--af-bg3)]">
                <div><div className="text-[12px] font-medium">Rol</div><div className="text-[11px] text-[var(--muted-foreground)]">{ROLE_ICONS[effectiveRole]} {effectiveRole}</div></div>
                <span className={`text-[9px] px-2 py-0.5 rounded-full border ${ROLE_COLORS[effectiveRole]}`}>{effectiveRole}</span>
              </div>
            </div>
          </div>

          {/* Logout */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 sm:p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-base">🚪</div>
                <div>
                  <div className="text-[13px] font-medium">Cerrar Sesión</div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">Salir de tu cuenta en Archii</div>
                </div>
              </div>
              <button className="px-5 py-2.5 rounded-lg border border-red-500/30 text-red-400 text-[13px] font-medium cursor-pointer hover:bg-red-500/10 transition-colors flex items-center gap-2" onClick={() => setLogoutOpen(true)}>
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
