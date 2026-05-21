'use client';
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useTimeTrackingContext } from '@/hooks/useTimeTracking';
import { useOneDrive, formatFileSize, getFileIcon } from '@/hooks/useOneDrive';
import { getFirebase } from '@/lib/firebase-service';
import { fmtCOP, fmtDate, fmtSize, statusColor, prioColor, taskStColor } from '@/lib/helpers';
import { isOverdue as checkOverdue } from '@/lib/kanban-helpers';
import { Plus, Layers, MessageSquare, BarChart3, Calendar, Send, ChevronLeft, X, Pencil, Eye, Trash2, Download, XCircle } from 'lucide-react';
import { PROJECT_TYPE_COLORS, EXPENSE_CATS, type Task, type WorkPhase, type Expense, type Comment, type TimeEntry, type RFI, type Submittal, type PunchItem, type TeamUser, type DailyLog } from '@/lib/types';
import { SkeletonFileList } from '@/components/ui/SkeletonLoaders';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import ConfirmDialog from '@/components/common/ConfirmDialog';



export default function ProjectDetailScreen() {
  const od = useOneDrive();
  const confirmDialog = useConfirmDialog();
  const {
    approvals, calcGanttDays, calcGanttOffset, currentProject, dailyLogs, dailyLogTab,
    deleteApproval, deleteDailyLog, deleteExpense, deleteFile, deleteTask,
    openEditExpense,
    doMicrosoftLogin,
    forms,
    getUserName, initDefaultPhases, addMissingPhases,
    loading,
    navigateTo, openEditProject, openEditTask, openModal,
    projectBudget, projectExpenses, projectFiles, projectSpent, projectTasks,
    selectedProjectId, setForms, setLightboxIndex, setLightboxPhoto,
    timeAgo, toggleTask,
    updateApproval, updatePhaseStatus, updatePhaseDates, updateProjectProgress, uploadFile, workPhases,
    doTogglePhaseEnabled,
    initPhasesByType, isMigratingPhases,
    setEditingId, saveTask,
    logForm, setLogForm, openEditLog, resetLogForm, saveDailyLog, selectedLogId,
    setDailyLogTab, setSelectedLogId,
    rfis, submittals, punchItems, changeTaskStatus, showToast,
    getPhaseName,
    comments, commentText, setCommentText, replyingTo, setReplyingTo,
    authUser, teamUsers, activeTenantId,
  } = useApp();
  const { timeEntries } = useTimeTrackingContext();

  // Computed values
  const today = new Date().toISOString().split('T')[0];
  const pendingTasks = projectTasks.filter((t: Task) => t.data.status !== 'Completado');
  const overdueCount = pendingTasks.filter((t: Task) => t.data.dueDate && checkOverdue(t.data.dueDate)).length;
  const pendingCount = pendingTasks.length;
  const projRFIs = rfis.filter((r: RFI) => r.data.projectId === selectedProjectId);
  const projSubs = submittals.filter((s: Submittal) => s.data.projectId === selectedProjectId);
  const projPunch = punchItems.filter((pi: PunchItem) => pi.data.projectId === selectedProjectId);
  const openRFIs = projRFIs.filter((r: RFI) => r.data.status === 'Abierto').length;
  const budgetPct = projectBudget > 0 ? Math.min(100, Math.round((projectSpent / projectBudget) * 100)) : 0;
  const budgetExceeded = projectSpent > projectBudget && projectBudget > 0;

  // --- Computed progress from enabled phases ---
  const enabledPhases = workPhases.filter((p: WorkPhase) => p.data.enabled !== false);
  const getPhaseProgress = useCallback((phaseId: string) => {
    const phaseTasks = projectTasks.filter((t: Task) => t.data.phaseId === phaseId);
    if (phaseTasks.length === 0) return null;
    const completed = phaseTasks.filter((t: Task) => t.data.status === 'Completado').length;
    return Math.round((completed / phaseTasks.length) * 100);
  }, [projectTasks]);
  const computedProgress = enabledPhases.length > 0
    ? Math.round(
        enabledPhases.map((p: WorkPhase) => {
          const fromTasks = getPhaseProgress(p.id);
          return fromTasks !== null ? fromTasks : (p.data.status === 'Completado' ? 100 : p.data.status === 'En progreso' ? 50 : 0);
        }).reduce((a: number, b: number) => a + b, 0) / enabledPhases.length
      )
    : (currentProject?.data.progress || 0);

  // Auto-sync computed progress to Firestore
  const lastSyncedProgress = useRef<number | null>(null);
  useEffect(() => {
    if (enabledPhases.length === 0) return; // No phases — use manual value
    if (!selectedProjectId) return;
    const current = currentProject?.data.progress ?? 0;
    if (computedProgress !== current && computedProgress !== lastSyncedProgress.current) {
      lastSyncedProgress.current = computedProgress;
      getFirebase().firestore().collection('projects').doc(selectedProjectId).update({
        progress: computedProgress,
        updatedAt: getFirebase().firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    }
  }, [computedProgress, selectedProjectId, currentProject?.data.progress, enabledPhases.length]);

  // Progress edit state
  const [editingProgress, setEditingProgress] = useState(false);

  // Computed: project comments
  const projComments = (comments || []).filter((c: Comment) => c.data.projectId === selectedProjectId && !c.data.parentId);
  const projReplies = (comments || []).filter((c: Comment) => c.data.projectId === selectedProjectId && c.data.parentId);

  // Computed: project time entries
  const projTimeEntries = (timeEntries || []).filter((te: TimeEntry) => te.data.projectId === selectedProjectId);
  const totalProjectHours = projTimeEntries.reduce((acc: number, te: TimeEntry) => acc + (te.data.duration || 0), 0) / 60;
  const billableHours = projTimeEntries.filter((te: TimeEntry) => te.data.billable).reduce((acc: number, te: TimeEntry) => acc + (te.data.duration || 0), 0) / 60;

  // Computed: expense categories breakdown
  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    projectExpenses.forEach((e: Expense) => { map[e.data.category] = (map[e.data.category] || 0) + (e.data.amount || 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [projectExpenses]);

  // Computed: task status distribution
  const taskStatusDist = useMemo(() => {
    const map: Record<string, number> = {};
    projectTasks.forEach((t: Task) => { map[t.data.status] = (map[t.data.status] || 0) + 1; });
    return map;
  }, [projectTasks]);

  // Gantt computed data
  const ganttData = useMemo(() => {
    if (enabledPhases.length === 0) return { phases: [], totalDays: 0, timelineStart: '' };
    const withDates = enabledPhases.filter((p: WorkPhase) => p.data.startDate && p.data.endDate);
    if (withDates.length === 0) return { phases: enabledPhases.map((p: WorkPhase) => ({ ...p, days: 0, offset: 0, tasks: [] })), totalDays: 1, timelineStart: '' };
    const allStarts = withDates.map((p: WorkPhase) => new Date(p.data.startDate).getTime());
    const allEnds = withDates.map((p: WorkPhase) => new Date(p.data.endDate).getTime());
    const timelineStart = new Date(Math.min(...allStarts)).toISOString().split('T')[0];
    const timelineEnd = new Date(Math.max(...allEnds)).toISOString().split('T')[0];
    const totalDays = Math.max(1, calcGanttDays(timelineStart, timelineEnd));
    const phases = withDates.map((p: WorkPhase) => ({
      ...p,
      days: calcGanttDays(p.data.startDate, p.data.endDate),
      offset: calcGanttOffset(p.data.startDate, timelineStart),
      tasks: projectTasks.filter((t: Task) => t.data.phaseId === p.id).sort((a: Task, b: Task) => {
        if (!a.data.dueDate) return 1; if (!b.data.dueDate) return -1;
        return new Date(a.data.dueDate).getTime() - new Date(b.data.dueDate).getTime();
      }),
    }));
    return { phases, totalDays, timelineStart };
  }, [enabledPhases, projectTasks, calcGanttDays, calcGanttOffset]);

  // Comment handler
  const handleProjectComment = useCallback(() => {
    if (!commentText.trim() || !selectedProjectId) return;
    const mentionRegex = /@(\w+)/g;
    let match;
    const mentions: string[] = [];
    while ((match = mentionRegex.exec(commentText)) !== null) {
      const mentionedName = match[1];
      const mentionedUser = (teamUsers || []).find((u: TeamUser) => u.data.name.toLowerCase().includes(mentionedName.toLowerCase()));
      if (mentionedUser) mentions.push(mentionedUser.id);
    }
    getFirebase().firestore().collection('comments').add({
      taskId: '', projectId: selectedProjectId,
      userId: authUser?.uid, userName: authUser?.displayName || authUser?.email || 'Usuario',
      userPhoto: authUser?.photoURL || '', text: commentText.trim(), mentions, parentId: replyingTo || null,
      createdAt: getFirebase().firestore.FieldValue.serverTimestamp(), tenantId: activeTenantId || '',
    }).then(() => { setCommentText(''); setReplyingTo(null); showToast('Comentario agregado'); }).catch(() => {});
  }, [commentText, selectedProjectId, authUser, teamUsers, replyingTo, activeTenantId, setCommentText, setReplyingTo, showToast]);



  if (!currentProject) return null;

  return (
<><div className="animate-fadeIn space-y-4">
            {/* 1. HEADER */}
            <div className="bg-gradient-to-br from-[var(--card)] to-[var(--af-bg3)] border border-[var(--border)] rounded-xl p-5 md:p-6 relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-44 h-44 border-[40px] border-[var(--af-accent)]/5 rounded-full" />
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusColor(currentProject.data.status)}`}>{currentProject.data.status}</span>
                    {currentProject.data.projectType && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PROJECT_TYPE_COLORS[currentProject.data.projectType] || PROJECT_TYPE_COLORS['Ejecución']}`}>
                        {currentProject.data.projectType}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl mt-2">{currentProject.data.name}</div>
                  <div className="text-sm text-[var(--muted-foreground)] mt-1">{currentProject.data.location && '📍 ' + currentProject.data.location}{currentProject.data.client ? ' · ' + currentProject.data.client : ''}</div>
                  {currentProject.data.description && <div className="text-sm text-[var(--muted-foreground)] mt-3 max-w-xl">{currentProject.data.description}</div>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button className="flex items-center gap-1.5 bg-[var(--af-bg3)] border border-[var(--border)] text-[var(--foreground)] px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer hover:bg-[var(--af-bg4)] transition-colors" onClick={() => navigateTo('projects')}>
                    <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true"/>
                    Volver
                  </button>
                  <button className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity" onClick={() => openEditProject(currentProject)}>
                    ✏️ Editar proyecto
                  </button>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1 h-2 bg-[var(--af-bg4)] rounded-full overflow-hidden"><div className={`h-full rounded-full ${computedProgress >= 80 ? 'bg-emerald-500' : computedProgress >= 40 ? 'bg-[var(--af-accent)]' : 'bg-amber-500'}`} style={{ width: computedProgress + '%' }} /></div>
                {editingProgress ? (
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    max="100"
                    className="w-14 bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1 text-sm text-[var(--foreground)] outline-none text-center focus:border-[var(--af-accent)]"
                    value={currentProject.data.progress || 0}
                    onChange={e => { const v = Math.min(100, Math.max(0, Number(e.target.value) || 0)); updateProjectProgress(v); }}
                    onBlur={() => setEditingProgress(false)}
                    onKeyDown={e => { if (e.key === 'Enter') setEditingProgress(false); }}
                  />
                ) : (
                  <button className="flex items-center gap-1 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer bg-transparent border-none" onClick={() => setEditingProgress(true)}>
                    {currentProject.data.progress || 0}%
                    <Pencil className="w-3 h-3 ml-0.5" aria-hidden="true"/>
                  </button>
                )}
              </div>
            </div>

            {/* 2. KPI CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Card 1: Tareas pendientes */}
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3">
                <div className="text-lg font-bold">{pendingCount}</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">Tareas pendientes</div>
              </div>
              {/* Card 2: Tareas vencidas */}
              <div className={`border rounded-xl p-3 ${overdueCount > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-[var(--card)] border-[var(--border)]'}`}>
                <div className={`text-lg font-bold ${overdueCount > 0 ? 'text-red-400' : ''}`}>{overdueCount}</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">Tareas vencidas</div>
              </div>
              {/* Card 3: RFIs abiertos */}
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3">
                <div className="text-lg font-bold text-blue-400">{openRFIs}</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">RFIs abiertos</div>
              </div>
              {/* Card 4: Presupuesto */}
              <div className={`border rounded-xl p-3 ${budgetExceeded ? 'bg-red-500/5 border-red-500/20' : 'bg-[var(--card)] border-[var(--border)]'}`}>
                <div className={`text-lg font-bold ${budgetExceeded ? 'text-red-400' : 'text-[var(--af-accent)]'}`}>{budgetPct}%</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  {budgetExceeded ? `Excedido` : `Presupuesto`}
                  <span className="block text-[10px]">{fmtCOP(projectSpent)} / {fmtCOP(projectBudget)}</span>
                </div>
              </div>
            </div>

            {/* 3. TAB BAR (9 tabs) */}
            <div className="flex gap-1 bg-[var(--af-bg3)] rounded-lg p-1 w-fit overflow-x-auto -mx-1 px-1 scrollbar-none">
              {[
                { id: 'Resumen', icon: '' },
                { id: 'Tareas', icon: '' },
                { id: 'Cronograma', icon: '📊' },
                { id: 'Calidad', icon: '' },
                { id: 'Comentarios', icon: '' },
                { id: 'Archivos', icon: '' },
                { id: 'Obra', icon: '' },
                { id: 'Reportes', icon: '' },
                { id: 'Portal', icon: '🌐' },
              ].map(tab => (
                <button key={tab.id} className={`px-3 py-1.5 rounded-md text-[13px] cursor-pointer transition-all flex items-center gap-1 ${forms.detailTab === tab.id ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`} onClick={() => setForms(p => ({ ...p, detailTab: tab.id }))}>
                  {tab.icon && <span className="text-[11px]">{tab.icon}</span>}{tab.id}
                </button>
              ))}
            </div>

            {/* 4. TAB: Resumen (enriched) */}
            {forms.detailTab === 'Resumen' && (
            <div className="space-y-4">
              {/* Quick info grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3">
                  <div className="text-[10px] text-[var(--muted-foreground)] mb-1">Cliente</div>
                  <div className="text-sm font-medium truncate">{currentProject.data.client || '—'}</div>
                </div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3">
                  <div className="text-[10px] text-[var(--muted-foreground)] mb-1">Ubicación</div>
                  <div className="text-sm font-medium truncate">{currentProject.data.location || '—'}</div>
                </div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3">
                  <div className="text-[10px] text-[var(--muted-foreground)] mb-1">Inicio</div>
                  <div className="text-sm font-medium">{currentProject.data.startDate || '—'}</div>
                </div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3">
                  <div className="text-[10px] text-[var(--muted-foreground)] mb-1">Entrega</div>
                  <div className="text-sm font-medium">{currentProject.data.endDate || '—'}</div>
                </div>
              </div>

              {/* Description */}
              {currentProject.data.description && (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                  <div className="text-[13px] font-semibold mb-2">Descripción</div>
                  <div className="text-sm text-[var(--muted-foreground)] leading-relaxed">{currentProject.data.description}</div>
                </div>
              )}

              {/* Work phases timeline (compact) — only enabled phases */}
              {enabledPhases.length > 0 && (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                  <div className="text-[13px] font-semibold mb-3">Fases del proyecto</div>
                  <div className="relative pl-5">
                    <div className="absolute left-[7px] top-1 bottom-1 w-px bg-[var(--input)]" />
                    {enabledPhases.map((phase: WorkPhase) => {
                      const isActive = phase.data.status === 'En progreso';
                      const isDone = phase.data.status === 'Completado';
                      return (
                        <div key={phase.id} className="relative mb-3 last:mb-0">
                          <div className={`absolute -left-5 top-1.5 w-3 h-3 rounded-full border-2 border-[var(--card)] ${isDone ? 'bg-emerald-500' : isActive ? 'bg-[var(--af-accent)]' : 'bg-[var(--af-bg4)] border-[var(--input)]'}`} />
                          <div className="flex items-center justify-between">
                            <span className="text-sm">{phase.data.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isDone ? 'bg-emerald-500/10 text-emerald-400' : isActive ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)]' : 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]'}`}>{phase.data.status}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent tasks (overdue first, then by due date) */}
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <div className="text-[13px] font-semibold mb-3">Tareas pendientes ({pendingCount})</div>
                {pendingTasks.length === 0 ? (
                  <div className="text-center py-4 text-[var(--af-text3)] text-sm">Sin tareas pendientes</div>
                ) : (
                  <div className="space-y-2">
                    {[...pendingTasks].sort((a: Task, b: Task) => {
                      const aOverdue = a.data.dueDate && checkOverdue(a.data.dueDate);
                      const bOverdue = b.data.dueDate && checkOverdue(b.data.dueDate);
                      if (aOverdue && !bOverdue) return -1;
                      if (!aOverdue && bOverdue) return 1;
                      return 0;
                    }).slice(0, 8).map((t: Task) => (
                      <div key={t.id} className="flex items-center gap-3 py-1.5">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.data.priority === 'Alta' ? 'bg-red-500' : t.data.priority === 'Media' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        <div className="flex-1 text-sm truncate">{t.data.title}</div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {t.data.dueDate && (
                            <span className={`text-[10px] ${checkOverdue(t.data.dueDate) ? 'text-red-400 font-medium' : 'text-[var(--af-text3)]'}`}>
                              {fmtDate(t.data.dueDate)}
                            </span>
                          )}
                          {t.data.assigneeId && <span className="text-[10px] text-[var(--af-text3)]">{getUserName(t.data.assigneeId)}</span>}
                        </div>
                      </div>
                    ))}
                    {pendingTasks.length > 8 && (
                      <button className="text-[11px] text-[var(--af-accent)] cursor-pointer hover:underline" onClick={() => setForms(p => ({ ...p, detailTab: 'Tareas' }))}>Ver todas las tareas →</button>
                    )}
                  </div>
                )}
              </div>
            </div>
            )}

            {/* 5. TAB: Tareas */}
            {forms.detailTab === 'Tareas' && (<div>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div className="text-sm text-[var(--muted-foreground)]">{projectTasks.length} tareas en este proyecto</div>
                <button className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-none" onClick={() => { setForms(p => ({ ...p, taskTitle: '', taskProject: selectedProjectId, taskDue: new Date().toISOString().split('T')[0], taskStatus: 'Por hacer' })); openModal('task'); }}>+ Nueva tarea</button>
              </div>
              {projectTasks.length === 0 ? <div className="text-center py-12 text-[var(--af-text3)]"><div className="text-3xl mb-2">✅</div><div className="text-sm">Sin tareas en este proyecto</div></div> :
              projectTasks.map((t: Task) => (
                <div key={t.id} className="flex items-start gap-3 py-3 border-b border-[var(--border)] last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 ${t.data.priority === 'Alta' ? 'bg-red-500' : t.data.priority === 'Media' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  <div className="w-4 h-4 rounded border border-[var(--input)] flex-shrink-0 mt-0.5 cursor-pointer flex items-center justify-center hover:border-[var(--af-accent)] ${t.data.status === 'Completado' ? 'bg-emerald-500 border-emerald-500' : ''}" onClick={() => toggleTask(t.id, t.data.status)}>{t.data.status === 'Completado' && <span className="text-white text-[10px] font-bold">✓</span>}</div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13.5px] font-medium ${t.data.status === 'Completado' ? 'line-through text-[var(--af-text3)]' : ''}`}>{t.data.title}</div>
                    <div className="text-[11px] text-[var(--af-text3)] mt-1 flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${prioColor(t.data.priority)}`}>{t.data.priority}</span>
                      {t.data.phaseId && (() => {
                        const phaseName = getPhaseName(t.data.phaseId, selectedProjectId);
                        if (!phaseName) return null;
                        return (
                          <span className="inline-flex items-center gap-0.5 text-violet-400">
                            <Layers size={10} className="flex-shrink-0" aria-hidden="true"/>
                            {phaseName}
                          </span>
                        );
                      })()}
                      {t.data.dueDate && <span>📅 {fmtDate(t.data.dueDate)}</span>}
                      {t.data.assigneeId && <span>👤 {getUserName(t.data.assigneeId)}</span>}
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${taskStColor(t.data.status)}`}>{t.data.status}</span>
                  <button aria-label="Editar tarea" className="text-xs px-1.5 py-0.5 rounded bg-[var(--af-accent)]/10 text-[var(--af-accent)] cursor-pointer hover:bg-[var(--af-accent)]/20" onClick={() => openEditTask(t)}><Pencil size={11} aria-hidden="true"/></button>
                  <button aria-label="Eliminar tarea" className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 cursor-pointer hover:bg-red-500/20" onClick={() => deleteTask(t.id)}><Trash2 size={11} aria-hidden="true"/></button>
                </div>
              ))}
            </div>)}

            {/* 6. TAB: Calidad (with Calidad | Finanzas sub-tabs) */}
            {forms.detailTab === 'Calidad' && (() => {
              const punchDone = projPunch.filter((pi: PunchItem) => pi.data.status === 'Completado').length;
              const punchPct = projPunch.length > 0 ? Math.round((punchDone / projPunch.length) * 100) : 0;
              return (<div>
                {/* Sub-tab switcher */}
                <div className="flex gap-1 bg-[var(--af-bg3)] rounded-lg p-1 mb-4 w-fit">
                  <button className={`px-3 py-1.5 rounded-md text-[12px] cursor-pointer transition-all ${(!forms.cfTab || forms.cfTab === 'calidad') ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`} onClick={() => setForms(p => ({ ...p, cfTab: 'calidad' }))}>Calidad</button>
                  <button className={`px-3 py-1.5 rounded-md text-[12px] cursor-pointer transition-all ${forms.cfTab === 'finanzas' ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`} onClick={() => setForms(p => ({ ...p, cfTab: 'finanzas' }))}>
                    Finanzas
                    {budgetExceeded && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />}
                  </button>
                </div>

                {/* Sub: Calidad */}
                {(!forms.cfTab || forms.cfTab === 'calidad') && (<div className="space-y-5">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-blue-500/10 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-blue-400">{projRFIs.length}</div>
                      <div className="text-[10px] text-blue-400/70">RFIs</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">{projRFIs.filter((r: RFI) => r.data.status === 'Abierto').length} abiertos</div>
                    </div>
                    <div className="bg-purple-500/10 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-purple-400">{projSubs.length}</div>
                      <div className="text-[10px] text-purple-400/70">Submittals</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">{projSubs.filter((s: Submittal) => s.data.status === 'Aprobado').length} aprobados</div>
                    </div>
                    <div className="bg-teal-500/10 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-teal-400">{punchPct}%</div>
                      <div className="text-[10px] text-teal-400/70">Punch List</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">{punchDone}/{projPunch.length} items</div>
                    </div>
                  </div>

                  {/* RFIs section */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[14px] font-semibold">❓ RFIs del proyecto</div>
                      <button className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 cursor-pointer border border-blue-500/20" onClick={() => { setForms(p => ({ ...p, rfiProject: selectedProjectId, rfiSubject: '', rfiQuestion: '', rfiPriority: 'Media' })); openModal('rfi'); }}>+ Nuevo</button>
                    </div>
                    {projRFIs.length === 0 ? <div className="text-center py-6 text-[var(--af-text3)] text-sm">Sin RFIs</div> : (
                      <div className="space-y-2">
                        {projRFIs.slice(0, 5).map((r: RFI) => (
                          <div key={r.id} className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0">
                            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">{r.data.number}</span>
                            <div className="flex-1 min-w-0 text-[13px] font-medium truncate">{r.data.subject}</div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${r.data.status === 'Abierto' ? 'bg-blue-500/15 text-blue-400' : r.data.status === 'Respondido' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]'}`}>{r.data.status}</span>
                          </div>
                        ))}
                        {projRFIs.length > 5 && <div className="text-[11px] text-[var(--af-accent)] cursor-pointer text-center hover:underline" onClick={() => { /* navigate to RFIs filtered */ }}>+{projRFIs.length - 5} más...</div>}
                      </div>
                    )}
                  </div>

                  {/* Submittals section */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[14px] font-semibold">📋 Submittals del proyecto</div>
                      <button className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 cursor-pointer border border-purple-500/20" onClick={() => { setForms(p => ({ ...p, subProject: selectedProjectId, subTitle: '', subDescription: '', subSpecification: '' })); openModal('submittal'); }}>+ Nuevo</button>
                    </div>
                    {projSubs.length === 0 ? <div className="text-center py-6 text-[var(--af-text3)] text-sm">Sin submittals</div> : (
                      <div className="space-y-2">
                        {projSubs.slice(0, 5).map((s: Submittal) => (
                          <div key={s.id} className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0">
                            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400">{s.data.number}</span>
                            <div className="flex-1 min-w-0 text-[13px] font-medium truncate">{s.data.title}</div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.data.status === 'Aprobado' ? 'bg-emerald-500/15 text-emerald-400' : s.data.status === 'Rechazado' ? 'bg-red-500/15 text-red-400' : s.data.status === 'En revisión' ? 'bg-amber-500/15 text-amber-400' : 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]'}`}>{s.data.status}</span>
                          </div>
                        ))}
                        {projSubs.length > 5 && <div className="text-[11px] text-[var(--af-accent)] cursor-pointer text-center hover:underline">+{projSubs.length - 5} más...</div>}
                      </div>
                    )}
                  </div>

                  {/* Punch List section */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[14px] font-semibold">✅ Punch List del proyecto</div>
                      <button className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 cursor-pointer border border-teal-500/20" onClick={() => { setForms(p => ({ ...p, punchProject: selectedProjectId, punchTitle: '', punchLocation: 'Otro', punchPriority: 'Media' })); openModal('punchItem'); }}>+ Nuevo</button>
                    </div>
                    <div className="relative h-2 bg-[var(--af-bg3)] rounded-full overflow-hidden mb-3">
                      <div className="absolute h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all" style={{ width: `${punchPct}%` }} />
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)] mb-3 text-right">{punchPct}% completado ({punchDone}/{projPunch.length})</div>
                    {projPunch.length === 0 ? <div className="text-center py-6 text-[var(--af-text3)] text-sm">Sin items de punch list</div> : (
                      <div className="space-y-2">
                        {projPunch.slice(0, 5).map((pi: PunchItem) => (
                          <div key={pi.id} className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${pi.data.status === 'Completado' ? 'bg-emerald-500/15 text-emerald-400' : pi.data.status === 'En progreso' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>{pi.data.status}</span>
                            <div className="flex-1 min-w-0 text-[13px] font-medium truncate">{pi.data.title}</div>
                            <span className="text-[10px] text-[var(--af-text3)]">{pi.data.location}</span>
                          </div>
                        ))}
                        {projPunch.length > 5 && <div className="text-[11px] text-[var(--af-accent)] cursor-pointer text-center hover:underline">+{projPunch.length - 5} más...</div>}
                      </div>
                    )}
                  </div>
                </div>)}

                {/* Sub: Finanzas */}
                {forms.cfTab === 'finanzas' && (<div>
                  <div className="flex justify-between items-center mb-4">
                    <div className="text-sm text-[var(--muted-foreground)]">{projectExpenses.length} gastos · Total: <span className="text-[var(--af-accent)] font-semibold">{fmtCOP(projectSpent)}</span> {projectBudget > 0 && <span>de {fmtCOP(projectBudget)}</span>}</div>
                    <button className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-none" onClick={() => { setForms(p => ({ ...p, expConcept: '', expProject: selectedProjectId, expAmount: '', expDate: new Date().toISOString().split('T')[0], expCategory: 'Materiales', expPaymentMethod: 'Efectivo', expVendor: '', expNotes: '' })); openModal('expense'); }}>+ Registrar gasto</button>
                  </div>
                  {projectBudget > 0 && <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 mb-4">
                    <div className="flex justify-between text-sm mb-2"><span className="text-[var(--muted-foreground)]">Presupuesto utilizado</span><span className="font-semibold">{Math.min(100, Math.round((projectSpent / projectBudget) * 100))}%</span></div>
                    <div className="h-2 bg-[var(--af-bg4)] rounded-full overflow-hidden"><div className={`h-full rounded-full ${projectSpent > projectBudget ? 'bg-red-500' : projectSpent > projectBudget * 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: Math.min(100, (projectSpent / projectBudget) * 100) + '%' }} /></div>
                  </div>}
                  {projectExpenses.length === 0 ? <div className="text-center py-12 text-[var(--af-text3)]"><div className="text-3xl mb-2">💰</div><div className="text-sm">Sin gastos registrados</div></div> :
                  <div className="space-y-2">
                    {projectExpenses.map((e: Expense) => (
                      <div key={e.id} className="flex items-center gap-3 py-2.5 px-3 bg-[var(--card)] border border-[var(--border)] rounded-lg">
                        <div className="flex-1 min-w-0"><div className="text-sm font-medium">{e.data.concept}</div><div className="text-[11px] text-[var(--af-text3)]">{e.data.category} · {e.data.date}{e.data.vendor ? ` · ${e.data.vendor}` : ''}</div></div>
                        <div className="text-sm font-semibold text-[var(--af-accent)]">{fmtCOP(e.data.amount)}</div>
                        <button className="text-xs px-1.5 py-0.5 rounded bg-[var(--af-accent)]/10 text-[var(--af-accent)] cursor-pointer hover:bg-[var(--af-accent)]/20" onClick={() => openEditExpense(e)}>✎</button>
                        <button className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 cursor-pointer" onClick={() => deleteExpense(e.id)}>✕</button>
                      </div>
                    ))}
                  </div>}
                </div>)}
              </div>);
            })()}

            {/* 7. TAB: Archivos (OneDrive + Local + Approvals) */}
            {forms.detailTab === 'Archivos' && (<div>
              {/* OneDrive Section */}
              {!od.msConnected ? (
                <div className="mb-4 bg-[#0078d4]/10 border border-[#0078d4]/20 rounded-xl p-6 text-center">
                  <div className="text-[40px] mb-3">☁️</div>
                  <div className="text-[15px] font-semibold mb-1">Conectar OneDrive</div>
                  <div className="text-[13px] text-[var(--muted-foreground)] mb-4">Almacena planos, fotos y documentos en la nube</div>
                  <button onClick={doMicrosoftLogin} className="px-5 py-2.5 bg-[#0078d4] text-white rounded-lg text-[13px] font-medium hover:bg-[#006cbd] transition-colors cursor-pointer border-none">Conectar con Microsoft</button>
                </div>
              ) : (
                <div className="mb-4">
                  {!od.showOneDrive ? (
                    <button className="w-full bg-gradient-to-r from-[#00a4ef] to-[#7fba00] text-white border-none rounded-xl py-3 text-sm font-semibold cursor-pointer hover:opacity-90 transition-all flex items-center justify-center gap-2" onClick={() => currentProject && od.openOneDriveForProject(currentProject.data.name)}>
                      <svg viewBox="0 0 21 21" className="w-4 h-4"><rect x="1" y="1" width="9" height="9" fill="#fff"/><rect x="1" y="11" width="9" height="9" fill="#fff"/><rect x="11" y="1" width="9" height="9" fill="#fff"/><rect x="11" y="11" width="9" height="9" fill="#fff"/></svg>
                      Abrir en OneDrive — {currentProject?.data.name}
                    </button>
                  ) : (
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                      {/* Header with tabs */}
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <svg viewBox="0 0 21 21" className="w-4 h-4"><rect x="1" y="1" width="9" height="9" fill="#00a4ef"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="1" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#00a4ef"/></svg>
                          <span className="text-sm font-semibold text-[#00a4ef]">OneDrive — {currentProject?.data.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-0.5 bg-[var(--af-bg3)] rounded-lg p-0.5">
                            <button onClick={() => od.setOdTab('files')} className={`px-2.5 py-1 rounded-md text-[11px] cursor-pointer transition-all ${od.odTab === 'files' ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)]'}`}>📋 Archivos</button>
                            <button onClick={() => { od.setOdTab('gallery'); if (selectedProjectId) od.loadGalleryPhotos(selectedProjectId); }} className={`px-2.5 py-1 rounded-md text-[11px] cursor-pointer transition-all ${od.odTab === 'gallery' ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)]'}`}>🖼️ Galería</button>
                          </div>
                          <button className="text-xs px-2 py-1.5 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] cursor-pointer hover:bg-[var(--af-bg4)] transition-colors" onClick={() => { od.setShowOneDrive(false); od.setOneDriveFiles([]); od.setOdBreadcrumbs([]); od.setOdSearchQuery(''); od.setOdSearchResults([]); }}>✕</button>
                        </div>
                      </div>

                      {od.odTab === 'gallery' ? (
                        /* === Gallery View === */
                        <div>
                          {od.galleryLoading ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                              {Array.from({length: 8}).map((_, i) => (
                                <div key={i} className="bg-[var(--af-bg3)] rounded-lg animate-pulse aspect-square" />
                              ))}
                            </div>
                          ) : od.odGalleryPhotos.length === 0 ? (
                            <div className="text-center py-8 text-[var(--af-text3)]">
                              <div className="text-3xl mb-2">🖼️</div>
                              <div className="text-sm">Sin fotos en la galería</div>
                              <div className="text-xs mt-1">Las imágenes de OneDrive aparecerán aquí</div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                              {od.odGalleryPhotos.map((photo: any, idx: number) => (
                                <div key={photo.id || idx} className="relative group rounded-lg overflow-hidden cursor-pointer border border-[var(--border)] hover:border-[#00a4ef]/40 transition-all" onClick={() => { setLightboxPhoto(photo); setLightboxIndex(idx); }}>
                                  <img
                                    src={`${photo.thumbnailUrl || photo.thumbnailLarge || photo.webUrl}?access_token=${od.msAccessToken}`}
                                    alt={photo.name || ''}
                                    className="w-full aspect-square object-cover bg-[var(--af-bg3)]"
                                    loading="lazy"
                                    onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23f0f0f0%22 width=%22100%22 height=%22100%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2212%22>🖼️</text></svg>'; }}
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-end">
                                    <div className="w-full px-2 py-1.5 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                      <div className="text-[10px] text-white truncate">{photo.name || 'Foto'}</div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* === Files View === */
                        <div>
                          {/* Toolbar */}
                          <div className="flex items-center gap-2 mb-3 flex-wrap">
                            {/* Breadcrumbs */}
                            <div className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] min-w-0 flex-1 overflow-hidden">
                              <button onClick={() => { if (od.odProjectFolder) { od.setOdCurrentFolder(od.odProjectFolder); od.setOdBreadcrumbs([]); od.loadOneDriveFiles(od.odProjectFolder); } }} className="hover:text-[#00a4ef] truncate shrink-0 cursor-pointer bg-transparent border-none text-inherit">OneDrive</button>
                              {od.odBreadcrumbs.map((crumb: { id: string; name: string }, i: number) => (
                                <React.Fragment key={crumb.id}>
                                  <span className="shrink-0">/</span>
                                  <button onClick={() => od.navigateToFolder(crumb.id, i)} className="hover:text-[#00a4ef] truncate max-w-[80px] sm:max-w-[120px] cursor-pointer bg-transparent border-none text-inherit">{crumb.name}</button>
                                </React.Fragment>
                              ))}
                            </div>

                            {/* Search */}
                            <div className="relative flex-shrink-0">
                              <input
                                value={od.odSearchQuery}
                                onChange={(e) => { od.setOdSearchQuery(e.target.value); if (e.target.value.length > 2) od.searchOneDriveFiles(e.target.value); else if (!e.target.value) od.setOdSearchResults([]); }}
                                placeholder="Buscar archivos..."
                                className="w-[150px] sm:w-[180px] pl-7 pr-2.5 py-1.5 text-[11px] rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] outline-none focus:border-[#00a4ef]/40"
                              />
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]">🔍</span>
                              {od.odSearching && <div className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 border border-[#00a4ef]/30 border-t-[#00a4ef] rounded-full animate-spin" />}
                            </div>

                            {/* View toggle */}
                            <div className="flex items-center gap-0.5 bg-[var(--af-bg3)] rounded-lg p-0.5">
                              <button onClick={() => od.setOdViewMode('list')} className={`px-1.5 py-1 rounded-md text-[11px] cursor-pointer transition-all ${od.odViewMode === 'list' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}>📋</button>
                              <button onClick={() => od.setOdViewMode('grid')} className={`px-1.5 py-1 rounded-md text-[11px] cursor-pointer transition-all ${od.odViewMode === 'grid' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}>⊞</button>
                            </div>

                            {/* Upload */}
                            <label className="px-2.5 py-1.5 bg-[#00a4ef] text-white rounded-lg text-[11px] font-medium cursor-pointer hover:bg-[#0091d5] transition-colors flex items-center gap-1">
                              <span>⬆️</span> Subir
                              <input type="file" className="hidden" onChange={od.handleFileUpload} />
                            </label>
                          </div>

                          {/* Upload progress */}
                          {od.odUploading && (
                            <div className="mb-3 bg-[var(--af-bg3)] rounded-lg p-3">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[11px] font-medium truncate max-w-[200px]">{od.odUploadFile}</span>
                                <span className="text-[10px] text-[var(--muted-foreground)]">{od.odUploadProgress}%</span>
                              </div>
                              <div className="w-full bg-[var(--border)] rounded-full h-1.5 overflow-hidden">
                                <div className="h-full bg-[#00a4ef] rounded-full transition-all duration-300" style={{ width: `${od.odUploadProgress}%` }} />
                              </div>
                            </div>
                          )}

                          {/* Drag & drop wrapper */}
                          <div
                            onDragOver={(e) => { e.preventDefault(); od.setOdDragOver(true); }}
                            onDragLeave={() => od.setOdDragOver(false)}
                            onDrop={async (e) => { e.preventDefault(); od.setOdDragOver(false); await od.handleDroppedFiles(e.dataTransfer.files); }}
                            className={`rounded-lg transition-colors min-h-[120px] ${od.odDragOver ? 'ring-2 ring-[#00a4ef] bg-[#00a4ef]/5' : ''}`}
                          >
                            {od.msLoading ? (
                              <SkeletonFileList count={5} />
                            ) : od.odSearchQuery && od.odSearchResults.length > 0 ? (
                              /* Search results */
                              <div className="space-y-1">
                                <div className="text-[10px] text-[var(--muted-foreground)] mb-2">{od.odSearchResults.length} resultado(s) para &quot;{od.odSearchQuery}&quot;</div>
                                {od.odSearchResults.map((f: any) => (
                                  <div key={f.id} className="flex items-center gap-2 py-2 px-2 bg-[var(--af-bg3)] rounded-lg hover:bg-[var(--af-bg4)] transition-colors">
                                    <span className="text-sm">{getFileIcon(f.mimeType || '', f.name)}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[11px] font-medium truncate">{f.name}</div>
                                      <div className="text-[10px] text-[var(--af-text3)]">{formatFileSize(f.size || 0)}</div>
                                    </div>
                                    <button onClick={() => od.downloadOneDriveFile(f.id, f.name)} className="text-[10px] text-[#00a4ef] px-1.5 py-0.5 rounded hover:bg-[#00a4ef]/10 cursor-pointer bg-transparent border-none">⬇️</button>
                                  </div>
                                ))}
                              </div>
                            ) : od.odSearchQuery && !od.odSearching && od.odSearchResults.length === 0 ? (
                              <div className="text-center py-8 text-[var(--af-text3)]">
                                <div className="text-sm">Sin resultados para &quot;{od.odSearchQuery}&quot;</div>
                              </div>
                            ) : od.oneDriveFiles.length === 0 ? (
                              <div className="text-center py-8 text-[var(--af-text3)]">
                                <div className="text-3xl mb-2">☁️</div>
                                <div className="text-sm">Carpeta vacía</div>
                                <div className="text-xs mt-1">Arrastra archivos aquí o usa el botón &quot;Subir&quot;</div>
                              </div>
                            ) : od.odViewMode === 'grid' ? (
                              /* Grid view */
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {od.oneDriveFiles.map((f: any) => (
                                  <div key={f.id} className={`bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg p-2.5 hover:border-[#00a4ef]/30 transition-all group ${f.folder ? 'cursor-pointer' : ''}`} onClick={() => { if (f.folder) { od.navigateToFolder(f.id); od.setOdBreadcrumbs((prev: any[]) => [...prev, { id: f.id, name: f.name }]); } }}>
                                    <div className="w-9 h-9 bg-[var(--af-bg4)] rounded-lg flex items-center justify-center text-base mb-2">{getFileIcon(f.file?.mimeType || f.mimeType || '', f.name)}</div>
                                    <div className="text-[11px] font-medium truncate mb-0.5">
                                      {od.odRenaming === f.id ? (
                                        <input
                                          autoFocus
                                          value={od.odRenameName}
                                          onChange={(e) => od.setOdRenameName(e.target.value)}
                                          onBlur={() => od.renameOneDriveFile(f.id, od.odRenameName)}
                                          onKeyDown={(e) => { if (e.key === 'Enter') od.renameOneDriveFile(f.id, od.odRenameName); if (e.key === 'Escape') od.setOdRenaming(null); }}
                                          className="w-full px-1.5 py-0.5 text-[11px] rounded border border-[#00a4ef]/40 bg-[var(--card)] outline-none"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      ) : f.name}
                                    </div>
                                    <div className="text-[10px] text-[var(--af-text3)]">{f.folder ? 'Carpeta' : formatFileSize(f.size || 0)}</div>
                                    {f.lastModifiedDateTime && <div className="text-[10px] text-[var(--af-text3)]">{timeAgo(f.lastModifiedDateTime)}</div>}
                                    {!f.folder && (
                                      <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                        <button aria-label="Descargar archivo" onClick={() => od.downloadOneDriveFile(f.id, f.name)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-[var(--card)] cursor-pointer bg-transparent border-none"><Download size={11} aria-hidden="true"/></button>
                                        <button aria-label="Renombrar archivo" onClick={() => { od.setOdRenaming(f.id); od.setOdRenameName(f.name); }} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-[var(--card)] cursor-pointer bg-transparent border-none"><Pencil size={11} aria-hidden="true"/></button>
                                        <button aria-label="Eliminar archivo" onClick={async () => { if (await confirmDialog.confirm({ title: 'Eliminar archivo de OneDrive', description: '¿Estás seguro de que desea eliminar este archivo de OneDrive?' })) { od.deleteFromOneDrive(f.id, od.odCurrentFolder); } }} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 cursor-pointer border-none hover:bg-red-500/20"><Trash2 size={11} aria-hidden="true"/></button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              /* List view */
                              <div className="space-y-1">
                                {/* Column headers */}
                                <div className="flex items-center gap-2 px-2 py-1 text-[10px] text-[var(--muted-foreground)] font-medium border-b border-[var(--border)]">
                                  <div className="w-7 shrink-0"></div>
                                  <div className="flex-1 min-w-0">Nombre</div>
                                  <div className="w-[60px] text-right shrink-0 hidden sm:block">Tamaño</div>
                                  <div className="w-[70px] text-right shrink-0 hidden sm:block">Fecha</div>
                                  <div className="w-[60px] shrink-0"></div>
                                </div>
                                {od.oneDriveFiles.map((f: any) => (
                                  <div key={f.id} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-[var(--af-bg3)] transition-colors group ${f.folder ? 'cursor-pointer' : ''}`} onClick={() => { if (f.folder) { od.navigateToFolder(f.id); od.setOdBreadcrumbs((prev: any[]) => [...prev, { id: f.id, name: f.name }]); } }}>
                                    <div className="w-7 h-7 bg-[var(--af-bg3)] rounded-md flex items-center justify-center text-sm flex-shrink-0">{getFileIcon(f.file?.mimeType || f.mimeType || '', f.name)}</div>
                                    <div className="flex-1 min-w-0">
                                      {od.odRenaming === f.id ? (
                                        <input
                                          autoFocus
                                          value={od.odRenameName}
                                          onChange={(e) => od.setOdRenameName(e.target.value)}
                                          onBlur={() => od.renameOneDriveFile(f.id, od.odRenameName)}
                                          onKeyDown={(e) => { if (e.key === 'Enter') od.renameOneDriveFile(f.id, od.odRenameName); if (e.key === 'Escape') od.setOdRenaming(null); }}
                                          className="w-full px-1.5 py-0.5 text-[11px] rounded border border-[#00a4ef]/40 bg-[var(--card)] outline-none"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      ) : (
                                        <div className="text-[11px] font-medium truncate">{f.name}</div>
                                      )}
                                    </div>
                                    <div className="w-[60px] text-right text-[10px] text-[var(--af-text3)] shrink-0 hidden sm:block">{f.folder ? '—' : formatFileSize(f.size || 0)}</div>
                                    <div className="w-[70px] text-right text-[10px] text-[var(--af-text3)] shrink-0 hidden sm:block">{f.lastModifiedDateTime ? timeAgo(f.lastModifiedDateTime) : '—'}</div>
                                    <div className="flex items-center gap-0.5 w-[60px] shrink-0 justify-end opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                      {!f.folder && (
                                        <>
                                          <button aria-label="Descargar archivo" onClick={() => od.downloadOneDriveFile(f.id, f.name)} className="text-[10px] px-1 py-0.5 rounded hover:bg-[var(--af-bg4)] cursor-pointer bg-transparent border-none" title="Descargar"><Download size={10} aria-hidden="true"/></button>
                                          <button aria-label="Renombrar archivo" onClick={() => { od.setOdRenaming(f.id); od.setOdRenameName(f.name); }} className="text-[10px] px-1 py-0.5 rounded hover:bg-[var(--af-bg4)] cursor-pointer bg-transparent border-none" title="Renombrar"><Pencil size={10} aria-hidden="true"/></button>
                                        </>
                                      )}
                                      <button aria-label="Eliminar archivo" onClick={async () => { if (await confirmDialog.confirm({ title: 'Eliminar de OneDrive', description: '¿Estás seguro de que deseas eliminar este archivo de OneDrive?' })) { od.deleteFromOneDrive(f.id, od.odCurrentFolder); } }} className="text-[10px] px-1 py-0.5 rounded bg-red-500/10 text-red-400 cursor-pointer border-none hover:bg-red-500/20" title="Eliminar"><Trash2 size={10} aria-hidden="true"/></button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Local Files Section */}
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-[var(--muted-foreground)]">{projectFiles.length} archivos locales</div>
                <div>
                  <button className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors" onClick={() => document.getElementById('file-upload-input')?.click()}>
                    + Subir archivo
                  </button>
                  <input id="file-upload-input" type="file" style={{ display: 'none' }} onChange={uploadFile} />
                </div>
              </div>
              {projectFiles.length === 0 ? <div className="text-center py-12 text-[var(--af-text3)]"><div className="text-3xl mb-2">📂</div><div className="text-sm">Sin archivos subidos</div></div> :
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {projectFiles.map((f: any) => (
                  <div key={f.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--input)] transition-all group">
                    <div className="flex items-start justify-between mb-2">
                      <div className="w-10 h-10 bg-[var(--af-bg3)] rounded-lg flex items-center justify-center text-lg">
                        {f.type?.startsWith('image/') ? '🖼️' : f.type === 'application/pdf' ? '📄' : f.type?.includes('video') ? '🎬' : '📎'}
                      </div>
                      <button className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 cursor-pointer transition-opacity" onClick={() => deleteFile(f)}>✕</button>
                    </div>
                    <div className="text-sm font-medium truncate mb-0.5">{f.name}</div>
                    <div className="text-[11px] text-[var(--af-text3)]">{fmtSize(f.size)}</div>
                    {f.type?.startsWith('image/') && f.data && <div className="mt-2"><img src={f.data} alt={f.name} className="w-full h-24 object-cover rounded-lg border border-[var(--border)]" loading="lazy" /></div>}
                    {f.data && <a href={f.data} download={f.name} className="text-[11px] text-[var(--af-accent)] mt-2 inline-block hover:underline">Descargar archivo</a>}
                  </div>
                ))}
              </div>}

              {/* Approvals section (from Portal) */}
              <div className="mt-4 bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[14px] font-semibold">Aprobaciones</div>
                  <button className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--af-accent)]/10 text-[var(--af-accent)] cursor-pointer border border-[var(--af-accent)]/20" onClick={() => { setForms(p => ({ ...p, appTitle: '', appDesc: '' })); openModal('approval'); }}>+ Nueva</button>
                </div>
                {approvals.length === 0 ? (
                  <div className="text-center py-6 text-[var(--af-text3)] text-sm">Sin solicitudes de aprobación</div>
                ) : (
                  approvals.map(a => (
                    <div key={a.id} className="border border-[var(--border)] rounded-lg p-3 mb-2 last:mb-0">
                      <div className="flex items-start justify-between mb-1">
                        <div className="text-sm font-semibold">{a.data.title}</div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.data.status === 'Aprobado' ? 'bg-emerald-500/10 text-emerald-400' : a.data.status === 'Rechazado' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>{a.data.status}</span>
                      </div>
                      {a.data.description && <div className="text-xs text-[var(--muted-foreground)] mb-2">{a.data.description}</div>}
                      {a.data.status === 'Pendiente' && (
                        <div className="flex gap-2 mt-2">
                          <button className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-md text-xs font-medium cursor-pointer hover:bg-emerald-500 hover:text-white transition-all" onClick={() => updateApproval(a.id, 'Aprobado')}>✓ Aprobar</button>
                          <button className="bg-red-500/10 text-red-400 border border-red-500/30 px-3 py-1 rounded-md text-xs font-medium cursor-pointer hover:bg-red-500 hover:text-white transition-all" onClick={() => updateApproval(a.id, 'Rechazado')}>✕ Rechazar</button>
                          <button className="ml-auto text-xs text-[var(--af-text3)] cursor-pointer hover:text-red-400" onClick={() => deleteApproval(a.id)}>Eliminar</button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>)}

            {/* 8. TAB: Obra — Fases por tipo (Diseño/Ejecución) + Timeline + Gantt + Bitácora */}
            {forms.detailTab === 'Obra' && (<div>
              {/* View tabs */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex gap-1 bg-[var(--af-bg3)] rounded-lg p-1">
                  <button className={`px-3 py-1.5 rounded-md text-[12px] cursor-pointer transition-all ${forms.workView === 'timeline' ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`} onClick={() => setForms(p => ({ ...p, workView: 'timeline' }))}>Fases</button>
                  <button className={`px-3 py-1.5 rounded-md text-[12px] cursor-pointer transition-all ${forms.workView === 'gantt' ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`} onClick={() => setForms(p => ({ ...p, workView: 'gantt' }))}>Gantt</button>
                  <button className={`px-3 py-1.5 rounded-md text-[12px] cursor-pointer transition-all ${forms.workView === 'bitacora' ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`} onClick={() => setForms(p => ({ ...p, workView: 'bitacora' }))}>📝 Bitácora</button>
                </div>
                <div className="flex gap-2">
                  {forms.workView !== 'bitacora' && (
                    <>
                      <button className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-none hover:bg-emerald-700 transition-colors" onClick={initDefaultPhases}>🔄 Reinicializar fases</button>
                      <button className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-none hover:bg-blue-700 transition-colors" onClick={() => addMissingPhases('Ambos')}>➕ Agregar fases faltantes</button>
                      <button className="flex items-center gap-1.5 bg-violet-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-none hover:bg-violet-700 transition-colors" onClick={() => addMissingPhases('Diseño')}>📐 Agregar Diseño</button>
                      <button className="flex items-center gap-1.5 bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-none hover:bg-amber-700 transition-colors" onClick={() => addMissingPhases('Ejecución')}>🏗️ Agregar Ejecución</button>
                    </>
                  )}
                </div>
              </div>

              {/* Helper: calculate phase progress from tasks */}
              {(() => {
                const getPhaseProgress = (phaseId: string) => {
                  const phaseTasks = projectTasks.filter((t: Task) => t.data.phaseId === phaseId);
                  if (phaseTasks.length === 0) return null;
                  const completed = phaseTasks.filter((t: Task) => t.data.status === 'Completado').length;
                  return Math.round((completed / phaseTasks.length) * 100);
                };

                // Group phases by type
                const enabledPhases = workPhases.filter((p: WorkPhase) => p.data.enabled !== false);
                const designPhases = enabledPhases.filter((p: WorkPhase) => p.data.type === 'Diseño');
                const executionPhases = enabledPhases.filter((p: WorkPhase) => p.data.type === 'Ejecución');
                const otherPhases = enabledPhases.filter((p: WorkPhase) => !p.data.type || p.data.type === 'Otro');
                // Legacy phases without type — assign to Ejecución
                const legacyPhases = enabledPhases.filter((p: WorkPhase) => !p.data.type);
                const effectiveExecPhases = [...executionPhases, ...legacyPhases];
                const allPhases = [...designPhases, ...effectiveExecPhases];

                // Overall progress from phases
                const phasePcts = allPhases.map((p: WorkPhase) => {
                  const manual = p.data.status === 'Completado' ? 100 : p.data.status === 'En progreso' ? 50 : 0;
                  const fromTasks = getPhaseProgress(p.id);
                  return fromTasks !== null ? fromTasks : manual;
                });
                const overallPct = phasePcts.length > 0 ? Math.round(phasePcts.reduce((a: number, b: number) => a + b, 0) / phasePcts.length) : 0;
                const completedPhases = allPhases.filter((p: WorkPhase) => p.data.status === 'Completado').length;

                return (
                  <>
                    {/* Progress summary */}
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 mb-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold">Progreso por fases</div>
                        <div className="text-lg font-bold text-[var(--af-accent)]">{overallPct}%</div>
                      </div>
                      <div className="h-2 bg-[var(--af-bg4)] rounded-full overflow-hidden mb-2">
                        <div className={`h-full rounded-full transition-all duration-500 ${overallPct >= 80 ? 'bg-emerald-500' : overallPct >= 40 ? 'bg-[var(--af-accent)]' : 'bg-amber-500'}`} style={{ width: `${overallPct}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                        <span>{completedPhases} de {allPhases.length} fases completadas</span>
                        <span>{allPhases.filter((p: WorkPhase) => p.data.status === 'En progreso').length} en progreso</span>
                      </div>
                    </div>

                    {/* Sub-tab: Fases (Timeline con acordeones por tipo) */}
                    {forms.workView === 'timeline' && (allPhases.length === 0 ? (
                      <div className="text-center py-12 text-[var(--af-text3)]">
                        <div className="text-3xl mb-2">🏗️</div>
                        <div className="text-sm">Haz clic en &quot;Inicializar fases&quot; para comenzar el seguimiento</div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Accordion: Diseño */}
                        {designPhases.length > 0 && (
                          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-violet-500/5 border-b border-[var(--border)]">
                              <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center text-sm">📐</div>
                              <div className="flex-1">
                                <div className="text-[13px] font-semibold text-violet-400">Diseño</div>
                                <div className="text-[10px] text-[var(--muted-foreground)]">{designPhases.length} fases · {designPhases.filter((p: WorkPhase) => p.data.status === 'Completado').length} completadas</div>
                              </div>
                            </div>
                            <div className="relative pl-6 pr-4 py-3">
                              <div className="absolute left-[7px] top-3 bottom-3 w-px bg-[var(--input)]" />
                              {designPhases.map((phase: WorkPhase) => {
                                const isActive = phase.data.status === 'En progreso', isDone = phase.data.status === 'Completado';
                                const pct = getPhaseProgress(phase.id);
                                const phaseTasks = projectTasks.filter((t: Task) => t.data.phaseId === phase.id);
                                const enabled = phase.data.enabled !== false;
                                return (
                                  <div key={phase.id} className={`relative mb-4 last:mb-0 ${!enabled ? 'opacity-40' : ''}`}>
                                    <div className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-[var(--card)] ${isDone ? 'bg-emerald-500' : isActive ? 'bg-violet-500 shadow-[0_0_0_3px_rgba(139,92,246,0.2)]' : 'bg-[var(--af-bg4)] border-[var(--input)]'}`} />
                                    <div className="bg-[var(--af-bg3)]/50 border border-[var(--border)] rounded-xl p-3.5 hover:border-[var(--input)] transition-all">
                                      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-semibold">{phase.data.name}</span>
                                          {!enabled && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--muted-foreground)]">OFF</span>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <select className="bg-[var(--card)] border border-[var(--input)] rounded-md px-2 py-1 text-xs text-[var(--foreground)] outline-none cursor-pointer" value={phase.data.status} onChange={e => updatePhaseStatus(phase.id, e.target.value)}>
                                            <option value="Pendiente">Pendiente</option><option value="En progreso">En progreso</option><option value="Completado">Completado</option>
                                          </select>
                                          <button className="text-[10px] px-2 py-0.5 rounded-full border cursor-pointer transition-colors border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--af-bg4)] bg-transparent" onClick={() => doTogglePhaseEnabled(phase.id, !enabled)} title={enabled ? 'Desactivar fase' : 'Activar fase'}>
                                            {enabled ? 'ON' : 'OFF'}
                                          </button>
                                        </div>
                                      </div>
                                      {phase.data.description && <div className="text-[11px] text-[var(--muted-foreground)] mb-2">{phase.data.description}</div>}
                                      {/* Progress bar */}
                                      {pct !== null && (
                                        <div className="mb-2">
                                          <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] mb-1">
                                            <span>{phaseTasks.filter((t: Task) => t.data.status === 'Completado').length}/{phaseTasks.length} tareas</span>
                                            <span>{pct}%</span>
                                          </div>
                                          <div className="h-1.5 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                                            <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                          </div>
                                        </div>
                                      )}
                                      {/* Tasks preview */}
                                      {phaseTasks.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                          {phaseTasks.filter((t: Task) => t.data.status !== 'Completado').slice(0, 3).map((t: Task) => (
                                            <div key={t.id} className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.data.status === 'Completado' ? 'bg-emerald-500' : 'bg-violet-400'}`} />
                                              {t.data.title}
                                            </div>
                                          ))}
                                          {phaseTasks.filter((t: Task) => t.data.status !== 'Completado').length > 3 && (
                                            <div className="text-[10px] text-violet-400">+{phaseTasks.filter((t: Task) => t.data.status !== 'Completado').length - 3} más</div>
                                          )}
                                        </div>
                                      )}
                                      {/* Add task from phase */}
                                      <button className="mt-2 text-[10px] px-2 py-1 rounded-md bg-violet-500/10 text-violet-400 cursor-pointer border-none hover:bg-violet-500/20 transition-colors" onClick={() => { setForms(p => ({ ...p, taskTitle: '', taskProject: selectedProjectId, taskPhase: phase.id, taskPriority: 'Media', taskStatus: 'Por hacer', taskDueDate: '', taskAssignee: '', taskDescription: '' })); setEditingId(null); openModal('task'); }}>
                                        + Agregar tarea
                                      </button>
                                      {/* Dates — editable inputs */}
                                      <div className="flex items-center gap-3 mt-2.5">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] text-[var(--af-text3)]">📅</span>
                                          <input type="date" className="bg-[var(--card)] border border-[var(--input)] rounded-md px-2 py-1 text-[10px] text-[var(--foreground)] outline-none cursor-pointer w-[130px]" value={phase.data.startDate || ''} onChange={e => updatePhaseDates(phase.id, 'startDate', e.target.value)} />
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] text-[var(--af-text3)]">🏁</span>
                                          <input type="date" className="bg-[var(--card)] border border-[var(--input)] rounded-md px-2 py-1 text-[10px] text-[var(--foreground)] outline-none cursor-pointer w-[130px]" value={phase.data.endDate || ''} onChange={e => updatePhaseDates(phase.id, 'endDate', e.target.value)} />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Accordion: Ejecución */}
                        {effectiveExecPhases.length > 0 && (
                          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/5 border-b border-[var(--border)]">
                              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-sm">🔨</div>
                              <div className="flex-1">
                                <div className="text-[13px] font-semibold text-amber-400">Ejecución</div>
                                <div className="text-[10px] text-[var(--muted-foreground)]">{effectiveExecPhases.length} fases · {effectiveExecPhases.filter((p: WorkPhase) => p.data.status === 'Completado').length} completadas</div>
                              </div>
                            </div>
                            <div className="relative pl-6 pr-4 py-3">
                              <div className="absolute left-[7px] top-3 bottom-3 w-px bg-[var(--input)]" />
                              {effectiveExecPhases.map((phase: WorkPhase) => {
                                const isActive = phase.data.status === 'En progreso', isDone = phase.data.status === 'Completado';
                                const pct = getPhaseProgress(phase.id);
                                const phaseTasks = projectTasks.filter((t: Task) => t.data.phaseId === phase.id);
                                const enabled = phase.data.enabled !== false;
                                return (
                                  <div key={phase.id} className={`relative mb-4 last:mb-0 ${!enabled ? 'opacity-40' : ''}`}>
                                    <div className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-[var(--card)] ${isDone ? 'bg-emerald-500' : isActive ? 'bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.2)]' : 'bg-[var(--af-bg4)] border-[var(--input)]'}`} />
                                    <div className="bg-[var(--af-bg3)]/50 border border-[var(--border)] rounded-xl p-3.5 hover:border-[var(--input)] transition-all">
                                      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-semibold">{phase.data.name}</span>
                                          {!enabled && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--muted-foreground)]">OFF</span>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <select className="bg-[var(--card)] border border-[var(--input)] rounded-md px-2 py-1 text-xs text-[var(--foreground)] outline-none cursor-pointer" value={phase.data.status} onChange={e => updatePhaseStatus(phase.id, e.target.value)}>
                                            <option value="Pendiente">Pendiente</option><option value="En progreso">En progreso</option><option value="Completado">Completado</option>
                                          </select>
                                          <button className="text-[10px] px-2 py-0.5 rounded-full border cursor-pointer transition-colors border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--af-bg4)] bg-transparent" onClick={() => doTogglePhaseEnabled(phase.id, !enabled)} title={enabled ? 'Desactivar fase' : 'Activar fase'}>
                                            {enabled ? 'ON' : 'OFF'}
                                          </button>
                                        </div>
                                      </div>
                                      {phase.data.description && <div className="text-[11px] text-[var(--muted-foreground)] mb-2">{phase.data.description}</div>}
                                      {pct !== null && (
                                        <div className="mb-2">
                                          <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] mb-1">
                                            <span>{phaseTasks.filter((t: Task) => t.data.status === 'Completado').length}/{phaseTasks.length} tareas</span>
                                            <span>{pct}%</span>
                                          </div>
                                          <div className="h-1.5 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                                            <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                          </div>
                                        </div>
                                      )}
                                      {phaseTasks.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                          {phaseTasks.filter((t: Task) => t.data.status !== 'Completado').slice(0, 3).map((t: Task) => (
                                            <div key={t.id} className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.data.status === 'Completado' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                                              {t.data.title}
                                            </div>
                                          ))}
                                          {phaseTasks.filter((t: Task) => t.data.status !== 'Completado').length > 3 && (
                                            <div className="text-[10px] text-amber-400">+{phaseTasks.filter((t: Task) => t.data.status !== 'Completado').length - 3} más</div>
                                          )}
                                        </div>
                                      )}
                                      <button className="mt-2 text-[10px] px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 cursor-pointer border-none hover:bg-amber-500/20 transition-colors" onClick={() => { setForms(p => ({ ...p, taskTitle: '', taskProject: selectedProjectId, taskPhase: phase.id, taskPriority: 'Media', taskStatus: 'Por hacer', taskDueDate: '', taskAssignee: '', taskDescription: '' })); setEditingId(null); openModal('task'); }}>
                                        + Agregar tarea
                                      </button>
                                      {/* Dates — editable inputs */}
                                      <div className="flex items-center gap-3 mt-2.5">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] text-[var(--af-text3)]">📅</span>
                                          <input type="date" className="bg-[var(--card)] border border-[var(--input)] rounded-md px-2 py-1 text-[10px] text-[var(--foreground)] outline-none cursor-pointer w-[130px]" value={phase.data.startDate || ''} onChange={e => updatePhaseDates(phase.id, 'startDate', e.target.value)} />
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] text-[var(--af-text3)]">🏁</span>
                                          <input type="date" className="bg-[var(--card)] border border-[var(--input)] rounded-md px-2 py-1 text-[10px] text-[var(--foreground)] outline-none cursor-pointer w-[130px]" value={phase.data.endDate || ''} onChange={e => updatePhaseDates(phase.id, 'endDate', e.target.value)} />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Sub-tab: Gantt (same but only enabled phases) */}
                    {forms.workView === 'gantt' && (allPhases.length === 0 ? (
                      <div className="text-center py-12 text-[var(--af-text3)]"><div className="text-3xl mb-2">🏗️</div><div className="text-sm">Haz clic en &quot;Inicializar fases&quot; para comenzar el seguimiento</div></div>
                    ) : (
                      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 overflow-x-auto">
                        {(() => {
                          const phasesWithDates = allPhases.filter((ph: WorkPhase) => ph.data.startDate || ph.data.endDate);
                          const allDates = allPhases.filter((ph: WorkPhase) => ph.data.startDate).map((ph: WorkPhase) => new Date(ph.data.startDate).getTime()).concat(allPhases.filter((ph: WorkPhase) => ph.data.endDate).map((ph: WorkPhase) => new Date(ph.data.endDate).getTime()));
                          const timelineStart = allDates.length > 0 ? new Date(Math.min(...allDates)) : new Date();
                          const timelineEnd = allDates.length > 0 ? new Date(Math.max(...allDates)) : new Date(timelineStart.getTime() + 30 * 86400000);
                          const totalDays = Math.max(1, Math.ceil((timelineEnd.getTime() - timelineStart.getTime()) / 86400000) + 7);
                          const dayWidth = Math.max(24, Math.min(50, 700 / totalDays));
                          const ganttColors = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#f59e0b', '#fbbf24', '#f97316', '#ef4444'];
                          return phasesWithDates.length === 0 ? (
                            <div className="text-center py-8 text-[var(--muted-foreground)] text-sm">Las fases necesitan fechas de inicio/fin para mostrar el Gantt. Edita las fases para agregar fechas.</div>
                          ) : (
                            <div>
                              {/* Group headers */}
                              {designPhases.some((p: WorkPhase) => p.data.startDate || p.data.endDate) && effectiveExecPhases.some((p: WorkPhase) => p.data.startDate || p.data.endDate) && (
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-[130px] flex items-center gap-1.5 text-[10px] font-semibold text-violet-400">
                                    <div className="w-2 h-2 rounded-full bg-violet-500" /> DISEÑO
                                  </div>
                                  <div className="flex-1 border-b border-dashed border-violet-500/20" />
                                  <div className="w-[130px] flex items-center justify-end gap-1.5 text-[10px] font-semibold text-amber-400">
                                    EJECUCIÓN <div className="w-2 h-2 rounded-full bg-amber-500" />
                                  </div>
                                  <div className="flex-1 border-b border-dashed border-amber-500/20" />
                                </div>
                              )}
                              <div className="flex text-[10px] text-[var(--muted-foreground)] mb-2 ml-[140px]" style={{ width: totalDays * dayWidth }}>
                                {Array.from({ length: Math.min(totalDays, 30) }, (_, i) => {
                                  const d = new Date(timelineStart.getTime() + i * 86400000);
                                  return <div key={i} className="flex-shrink-0 text-center" style={{ width: dayWidth }}>{d.getDate()}/{d.getMonth() + 1}</div>;
                                })}
                              </div>
                              {allPhases.map((phase: WorkPhase, idx: number) => {
                                const days = calcGanttDays(phase.data.startDate, phase.data.endDate);
                                const offset = calcGanttOffset(phase.data.startDate, timelineStart.toISOString());
                                const isDesign = phase.data.type === 'Diseño';
                                const color = isDesign ? ganttColors[idx % 3] : ganttColors[3 + (idx % 4)];
                                const isDone = phase.data.status === 'Completado';
                                const isActive = phase.data.status === 'En progreso';
                                return (
                                  <div key={phase.id} className="flex items-center mb-1.5">
                                    <div className="w-[130px] text-[11px] font-medium truncate pr-2 shrink-0 flex items-center gap-1.5">
                                      <div className={`w-2 h-2 rounded-full shrink-0 ${isDone ? 'bg-emerald-500' : isActive ? (isDesign ? 'bg-violet-500' : 'bg-amber-500') : 'bg-[var(--af-bg4)]'}`} />
                                      {phase.data.name}
                                    </div>
                                    <div className="relative h-6" style={{ width: totalDays * dayWidth }}>
                                      <div className={`absolute h-6 rounded-md flex items-center px-2 text-[10px] font-medium text-white ${isDone ? 'opacity-70' : ''}`} style={{ left: offset * dayWidth, width: Math.max(days * dayWidth, 20), backgroundColor: color }}>
                                        {days > 2 && phase.data.name.substring(0, 12)}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    ))}

                    {/* Sub-tab: Bitácora (unchanged) */}
              {forms.workView === 'bitacora' && (
              <div>
                {/* Bitácora header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[13px] font-medium text-[var(--muted-foreground)]">
                    {dailyLogs.length} registro{dailyLogs.length !== 1 ? 's' : ''} de bitácora
                  </div>
                  <button
                    className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity"
                    onClick={() => { resetLogForm(); setSelectedLogId(null); setDailyLogTab('create'); }}
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true"/>
                    Nuevo Registro
                  </button>
                </div>

                {/* Bitácora: List view */}
                {dailyLogTab === 'list' && (
                  <div className="space-y-3">
                    {dailyLogs.length === 0 ? (
                      <div className="text-center py-14 text-[var(--af-text3)]">
                        <div className="text-5xl mb-3">📋</div>
                        <div className="text-sm font-medium mb-1">Sin registros de bitácora</div>
                        <div className="text-xs">Crea el primer registro diario con actividades, clima y personal</div>
                        <button className="mt-4 text-xs px-4 py-2 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--foreground)] transition-colors" onClick={() => { resetLogForm(); setDailyLogTab('create'); }}>
                          Crear primer registro
                        </button>
                      </div>
                    ) : (
                      dailyLogs.map(log => {
                        const d = log.data;
                        const logDate = new Date(d.date + 'T12:00:00');
                        const todayStr = new Date().toISOString().split('T')[0];
                        const isToday = d.date === todayStr;
                        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
                        const isYesterday = d.date === yesterday.toISOString().split('T')[0];
                        const dateLabel = isToday ? 'Hoy' : isYesterday ? 'Ayer' : logDate.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });

                        return (
                          <div key={log.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--input)] transition-all group">
                            {/* Log header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--af-bg3)]/30">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${isToday ? 'bg-[var(--af-accent)]/15' : 'bg-[var(--af-bg4)]'}`}>
                                  {d.weather ? (() => { switch(d.weather) { case 'Soleado': return '☀️'; case 'Nublado': return '☁️'; case 'Lluvioso': return '🌧️'; case 'Parcialmente nublado': return '⛅'; case 'Tormenta': return '⛈️'; default: return '🌤️'; } })() : '📅'}
                                </div>
                                <div>
                                  <div className="text-sm font-semibold capitalize">{dateLabel}</div>
                                  <div className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-2">
                                    {d.weather && <span>{d.weather}</span>}
                                    {d.temperature && <span>· {d.temperature}°C</span>}
                                    {d.laborCount > 0 && <span>· {d.laborCount} personas</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--af-bg3)] text-[var(--muted-foreground)] cursor-pointer border-none bg-transparent transition-colors" onClick={() => { setSelectedLogId(log.id); setDailyLogTab('detail'); }} title="Ver detalle">
                                  <Eye className="w-3.5 h-3.5" aria-hidden="true"/>
                                </button>
                                <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--af-bg3)] text-[var(--muted-foreground)] cursor-pointer border-none bg-transparent transition-colors" onClick={() => openEditLog(log)} title="Editar">
                                  <Pencil className="w-3.5 h-3.5" aria-hidden="true"/>
                                </button>
                                <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 text-[var(--muted-foreground)] hover:text-red-400 cursor-pointer border-none bg-transparent transition-colors" onClick={async () => { if (await confirmDialog.confirm({ title: 'Eliminar bitácora', description: '¿Eliminar este registro de bitácora?' })) deleteDailyLog(log.id); }} title="Eliminar">
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true"/>
                                </button>
                              </div>
                            </div>

                            {/* Log summary */}
                            <div className="px-4 py-3">
                              {d.activities?.length > 0 && (
                                <div className="mb-2">
                                  <div className="text-[10px] font-semibold uppercase text-[var(--muted-foreground)] mb-1">Actividades</div>
                                  <div className="flex flex-wrap gap-1">
                                    {d.activities.map((a: string, i: number) => (
                                      <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--af-bg3)] text-[var(--foreground)]">{a}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {d.observations && (
                                <div className="text-[12px] text-[var(--muted-foreground)] mt-1 line-clamp-2">{d.observations}</div>
                              )}
                              {d.photos?.length > 0 && (
                                <div className="flex gap-1.5 mt-2">
                                  {d.photos.slice(0, 4).map((p: string, i: number) => (
                                    <img key={i} src={p} alt="Foto del proyecto" className="w-14 h-14 rounded-lg object-cover border border-[var(--border)]" />
                                  ))}
                                  {d.photos.length > 4 && <div className="w-14 h-14 rounded-lg bg-[var(--af-bg3)] flex items-center justify-center text-[11px] text-[var(--muted-foreground)] border border-[var(--border)]">+{d.photos.length - 4}</div>}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Bitácora: Detail view */}
                {dailyLogTab === 'detail' && selectedLogId && (() => {
                  const log = dailyLogs.find((l: DailyLog) => l.id === selectedLogId);
                  if (!log) return <div className="text-center py-8 text-[var(--af-text3)]">Registro no encontrado</div>;
                  const d = log.data;
                  return (
                    <div className="space-y-4">
                      <button className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer border-none bg-transparent" onClick={() => { setDailyLogTab('list'); setSelectedLogId(null); }}>
                        <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true"/>
                        Volver a bitácora
                      </button>

                      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <div className="text-lg font-semibold">{new Date(d.date + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                            <div className="text-[12px] text-[var(--muted-foreground)] mt-0.5">
                              {d.supervisor && <span>Supervisor: {d.supervisor}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {d.weather && <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--af-bg3)] text-xs">{(() => { switch(d.weather) { case 'Soleado': return '☀️'; case 'Nublado': return '☁️'; case 'Lluvioso': return '🌧️'; case 'Parcialmente nublado': return '⛅'; case 'Tormenta': return '⛈️'; default: return '🌤️'; } })()} {d.weather}</div>}
                            {d.temperature > 0 && <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--af-bg3)] text-xs">🌡️ {d.temperature}°C</div>}
                          </div>
                        </div>

                        {d.activities?.length > 0 && (
                          <div className="mb-4">
                            <div className="text-[11px] font-semibold uppercase text-[var(--muted-foreground)] mb-2">Actividades Realizadas</div>
                            <div className="space-y-1.5">
                              {d.activities.map((a: string, i: number) => (
                                <div key={i} className="flex items-start gap-2 text-sm">
                                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--af-accent)] mt-1.5 flex-shrink-0" />
                                  {a}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 mb-4">
                          {d.laborCount > 0 && (
                            <div className="bg-[var(--af-bg3)] rounded-lg p-3">
                              <div className="text-[10px] font-semibold uppercase text-[var(--muted-foreground)] mb-1">Personal en Obra</div>
                              <div className="text-xl font-semibold text-[var(--af-accent)]">{d.laborCount}</div>
                            </div>
                          )}
                          {d.equipment?.length > 0 && (
                            <div className="bg-[var(--af-bg3)] rounded-lg p-3">
                              <div className="text-[10px] font-semibold uppercase text-[var(--muted-foreground)] mb-1">Equipos</div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {d.equipment.map((e: string, i: number) => <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--card)]">{e}</span>)}
                              </div>
                            </div>
                          )}
                        </div>

                        {d.materials?.length > 0 && (
                          <div className="mb-4">
                            <div className="text-[11px] font-semibold uppercase text-[var(--muted-foreground)] mb-2">Materiales Utilizados</div>
                            <div className="flex flex-wrap gap-1">
                              {d.materials.map((m: string, i: number) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">{m}</span>)}
                            </div>
                          </div>
                        )}

                        {d.photos?.length > 0 && (
                          <div className="mb-4">
                            <div className="text-[11px] font-semibold uppercase text-[var(--muted-foreground)] mb-2">Fotos del Día ({d.photos.length})</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {d.photos.map((p: string, i: number) => <img key={i} src={p} alt="Foto del diario de obra" className="w-full h-28 rounded-lg object-cover border border-[var(--border)] cursor-pointer hover:opacity-90 transition-opacity" />)}
                            </div>
                          </div>
                        )}

                        {d.observations && (
                          <div>
                            <div className="text-[11px] font-semibold uppercase text-[var(--muted-foreground)] mb-2">Observaciones</div>
                            <div className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap bg-[var(--af-bg3)] rounded-lg p-3">{d.observations}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Bitácora: Create/Edit form */}
                {dailyLogTab === 'create' && (
                  <div className="space-y-4">
                    <button className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer border-none bg-transparent" onClick={() => { setDailyLogTab('list'); setSelectedLogId(null); resetLogForm(); }}>
                      <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true"/>
                      Volver a bitácora
                    </button>

                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                      <div className="text-[15px] font-semibold mb-4">{selectedLogId ? '✏️ Editar Registro' : '📝 Nuevo Registro'}</div>

                      {/* Date and Weather */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                        <div>
                          <label className="text-[11px] font-semibold text-[var(--muted-foreground)] mb-1 block">Fecha *</label>
                          <input type="date" className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]" value={logForm.date} onChange={e => setLogForm((p: Record<string, any>) => ({ ...p, date: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-[var(--muted-foreground)] mb-1 block">Clima</label>
                          <select className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] cursor-pointer" value={logForm.weather} onChange={e => setLogForm((p: Record<string, any>) => ({ ...p, weather: e.target.value }))}>
                            <option value="">Seleccionar...</option>
                            <option value="Soleado">☀️ Soleado</option>
                            <option value="Parcialmente nublado">⛅ Parcialmente nublado</option>
                            <option value="Nublado">☁️ Nublado</option>
                            <option value="Lluvioso">🌧️ Lluvioso</option>
                            <option value="Tormenta">⛈️ Tormenta</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-[var(--muted-foreground)] mb-1 block">Temperatura (°C)</label>
                          <input type="number" className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]" placeholder="25" value={logForm.temperature} onChange={e => setLogForm((p: Record<string, any>) => ({ ...p, temperature: e.target.value }))} />
                        </div>
                      </div>

                      {/* Supervisor and Labor */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div>
                          <label className="text-[11px] font-semibold text-[var(--muted-foreground)] mb-1 block">Supervisor</label>
                          <input type="text" className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]" placeholder="Nombre del supervisor" value={logForm.supervisor} onChange={e => setLogForm((p: Record<string, any>) => ({ ...p, supervisor: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-[var(--muted-foreground)] mb-1 block">Personal en Obra</label>
                          <input type="number" className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]" placeholder="10" value={logForm.laborCount} onChange={e => setLogForm((p: Record<string, any>) => ({ ...p, laborCount: e.target.value }))} />
                        </div>
                      </div>

                      {/* Activities */}
                      <div className="mb-4">
                        <label className="text-[11px] font-semibold text-[var(--muted-foreground)] mb-2 block">Actividades Realizadas</label>
                        <div className="space-y-2">
                          {(logForm.activities || ['']).map((a: string, i: number) => (
                            <div key={i} className="flex gap-2">
                              <input type="text" className="flex-1 bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]" placeholder={`Actividad ${i + 1}`} value={a} onChange={e => { const arr = [...(logForm.activities || [''])]; arr[i] = e.target.value; setLogForm((p: Record<string, any>) => ({ ...p, activities: arr })); }} />
                              {(logForm.activities || ['']).length > 1 && (
                                <button className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-red-500/10 text-[var(--muted-foreground)] hover:text-red-400 cursor-pointer border-none bg-transparent flex-shrink-0 transition-colors" onClick={() => { const arr = (logForm.activities || ['']).filter((_: string, idx: number) => idx !== i); setLogForm((p: Record<string, any>) => ({ ...p, activities: arr.length > 0 ? arr : [''] })); }}>
                                  <X className="w-4 h-4" aria-hidden="true"/>
                                </button>
                              )}
                            </div>
                          ))}
                          <button className="text-[11px] px-3 py-1.5 rounded-lg border border-dashed border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--af-accent)]/40 cursor-pointer bg-transparent transition-colors" onClick={() => setLogForm((p: Record<string, any>) => ({ ...p, activities: [...(p.activities || ['']), ''] }))}>
                            + Agregar actividad
                          </button>
                        </div>
                      </div>

                      {/* Equipment */}
                      <div className="mb-4">
                        <label className="text-[11px] font-semibold text-[var(--muted-foreground)] mb-2 block">Equipos Utilizados</label>
                        <div className="space-y-2">
                          {(logForm.equipment || ['']).map((e: string, i: number) => (
                            <div key={i} className="flex gap-2">
                              <input type="text" className="flex-1 bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]" placeholder={`Equipo ${i + 1}`} value={e} onChange={ev => { const arr = [...(logForm.equipment || [''])]; arr[i] = ev.target.value; setLogForm((p: Record<string, any>) => ({ ...p, equipment: arr })); }} />
                              {(logForm.equipment || ['']).length > 1 && (
                                <button className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-red-500/10 text-[var(--muted-foreground)] hover:text-red-400 cursor-pointer border-none bg-transparent flex-shrink-0 transition-colors" onClick={() => { const arr = (logForm.equipment || ['']).filter((_: string, idx: number) => idx !== i); setLogForm((p: Record<string, any>) => ({ ...p, equipment: arr.length > 0 ? arr : [''] })); }}>
                                  <X className="w-4 h-4" aria-hidden="true"/>
                                </button>
                              )}
                            </div>
                          ))}
                          <button className="text-[11px] px-3 py-1.5 rounded-lg border border-dashed border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--af-accent)]/40 cursor-pointer bg-transparent transition-colors" onClick={() => setLogForm((p: Record<string, any>) => ({ ...p, equipment: [...(p.equipment || ['']), ''] }))}>
                            + Agregar equipo
                          </button>
                        </div>
                      </div>

                      {/* Materials */}
                      <div className="mb-4">
                        <label className="text-[11px] font-semibold text-[var(--muted-foreground)] mb-2 block">Materiales Utilizados</label>
                        <div className="space-y-2">
                          {(logForm.materials || ['']).map((m: string, i: number) => (
                            <div key={i} className="flex gap-2">
                              <input type="text" className="flex-1 bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]" placeholder={`Material ${i + 1}`} value={m} onChange={ev => { const arr = [...(logForm.materials || [''])]; arr[i] = ev.target.value; setLogForm((p: Record<string, any>) => ({ ...p, materials: arr })); }} />
                              {(logForm.materials || ['']).length > 1 && (
                                <button className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-red-500/10 text-[var(--muted-foreground)] hover:text-red-400 cursor-pointer border-none bg-transparent flex-shrink-0 transition-colors" onClick={() => { const arr = (logForm.materials || ['']).filter((_: string, idx: number) => idx !== i); setLogForm((p: Record<string, any>) => ({ ...p, materials: arr.length > 0 ? arr : [''] })); }}>
                                  <X className="w-4 h-4" aria-hidden="true"/>
                                </button>
                              )}
                            </div>
                          ))}
                          <button className="text-[11px] px-3 py-1.5 rounded-lg border border-dashed border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--af-accent)]/40 cursor-pointer bg-transparent transition-colors" onClick={() => setLogForm((p: Record<string, any>) => ({ ...p, materials: [...(p.materials || ['']), ''] }))}>
                            + Agregar material
                          </button>
                        </div>
                      </div>

                      {/* Photos */}
                      <div className="mb-4">
                        <label className="text-[11px] font-semibold text-[var(--muted-foreground)] mb-2 block">Fotos del Día</label>
                        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                          {(logForm.photos || []).map((p: string, i: number) => (
                            <div key={i} className="relative flex-shrink-0 w-20 h-20">
                              <img src={p} alt="Foto del proyecto" className="w-full h-full rounded-lg object-cover border border-[var(--border)]" />
                              <button className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center cursor-pointer border-none leading-none" onClick={() => { const arr = (logForm.photos || []).filter((_: string, idx: number) => idx !== i); setLogForm((pf: Record<string, any>) => ({ ...pf, photos: arr })); }}>✕</button>
                            </div>
                          ))}
                          <label className="w-20 h-20 rounded-lg border-2 border-dashed border-[var(--border)] flex items-center justify-center cursor-pointer hover:border-[var(--af-accent)]/40 transition-colors flex-shrink-0">
                            <input type="file" accept="image/*" className="hidden" multiple onChange={e => { const files = e.target.files; if (!files) return; Array.from(files).forEach(f => { const reader = new FileReader(); reader.onload = () => setLogForm((pf: Record<string, any>) => ({ ...pf, photos: [...(pf.photos || []), reader.result as string] })); reader.readAsDataURL(f); }); }} />
                            <Plus className="w-5 h-5 text-[var(--muted-foreground)]" aria-hidden="true"/>
                          </label>
                        </div>
                      </div>

                      {/* Observations */}
                      <div className="mb-5">
                        <label className="text-[11px] font-semibold text-[var(--muted-foreground)] mb-1 block">Observaciones</label>
                        <textarea className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] resize-none" rows={3} placeholder="Notas adicionales del día..." value={logForm.observations} onChange={e => setLogForm((p: Record<string, any>) => ({ ...p, observations: e.target.value }))} />
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 justify-end">
                        <button className="px-4 py-2 rounded-lg text-sm border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer bg-transparent transition-colors" onClick={() => { setDailyLogTab('list'); setSelectedLogId(null); resetLogForm(); }}>Cancelar</button>
                        <button className="px-5 py-2 rounded-lg text-sm bg-[var(--af-accent)] text-background font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity" onClick={saveDailyLog}>{selectedLogId ? 'Actualizar' : 'Guardar Registro'}</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}
                  </>
                );
              })()}
            </div>)}

            {/* 9. TAB: Cronograma */}
            {forms.detailTab === 'Cronograma' && (<div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3"><div className="text-lg font-bold">{enabledPhases.length}</div><div className="text-[11px] text-[var(--muted-foreground)]">Fases activas</div></div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3"><div className="text-lg font-bold">{ganttData.totalDays}</div><div className="text-[11px] text-[var(--muted-foreground)]">Dias totales</div></div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3"><div className="text-lg font-bold text-[var(--af-accent)]">{computedProgress}%</div><div className="text-[11px] text-[var(--muted-foreground)]">Progreso</div></div>
              </div>
              {ganttData.phases.length === 0 ? (
                <div className="text-center py-16 text-[var(--af-text3)]"><div className="text-4xl mb-3">📊</div><div className="text-sm font-medium">Sin fases con fechas</div><div className="text-xs mt-1">Configura fechas en la pestana Obra</div><button className="mt-4 text-[11px] text-[var(--af-accent)] cursor-pointer hover:underline" onClick={() => setForms(p => ({ ...p, detailTab: 'Obra' }))}>Ir a Obra →</button></div>
              ) : (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 overflow-x-auto">
                  <div className="text-[13px] font-semibold mb-4">Cronograma del proyecto</div>
                  <div className="relative" style={{ minWidth: Math.max(600, ganttData.totalDays * 8) + 'px' }}>
                    {(() => { const months: string[] = []; if (ganttData.timelineStart) { const s = new Date(ganttData.timelineStart); for (let i = 0; i < ganttData.totalDays; i += 30) { const d = new Date(s); d.setDate(d.getDate() + i); months.push(d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' })); } } return months.length > 0 && <div className="flex mb-2 ml-[200px] border-b border-[var(--border)] pb-1">{months.map((m: string, i: number) => <div key={i} className="text-[10px] text-[var(--muted-foreground)] shrink-0" style={{ width: (30 / ganttData.totalDays * 100) + '%' }}>{m}</div>)}</div>; })()}
                    {(() => { if (!ganttData.timelineStart) return null; const off = calcGanttOffset(today, ganttData.timelineStart); if (off < 0 || off > ganttData.totalDays) return null; const tw = Math.max(600, ganttData.totalDays * 8); return <div className="absolute top-0 bottom-0 z-10 pointer-events-none" style={{ left: (200 + (off / ganttData.totalDays) * tw) + 'px' }}><div className="w-px h-full bg-red-500/40" /><div className="text-[9px] text-red-400 font-medium -ml-[14px] mt-1">Hoy</div></div>; })()}
                    {ganttData.phases.map((phase: WorkPhase & { days: number; offset: number; tasks: Task[] }) => { const pp = getPhaseProgress(phase.id) ?? (phase.data.status === 'Completado' ? 100 : phase.data.status === 'En progreso' ? 50 : 0); const bw = (phase.days / ganttData.totalDays) * 100; const bl = (phase.offset / ganttData.totalDays) * 100; const bc = phase.data.status === 'Completado' ? 'bg-emerald-500' : phase.data.status === 'En progreso' ? 'bg-[var(--af-accent)]' : 'bg-violet-500/40'; return (<div key={phase.id} className="flex items-center mb-2"><div className="w-[200px] shrink-0 pr-3 text-right"><div className="text-[11px] font-medium truncate">{phase.data.name}</div><div className="text-[10px] text-[var(--muted-foreground)]">{phase.data.startDate} — {phase.data.endDate}</div></div><div className="flex-1 relative h-6 bg-[var(--af-bg3)] rounded-sm overflow-hidden"><div className={"absolute top-0 left-0 h-full rounded-sm opacity-80 " + bc} style={{ width: bw + '%', left: bl + '%' }} /><div className={"absolute top-0 left-0 h-full bg-white/20 rounded-sm"} style={{ width: (bw * pp / 100) + '%', left: bl + '%' }} /><div className="absolute inset-0 flex items-center justify-center"><span className="text-[9px] font-bold text-white drop-shadow">{pp}%</span></div></div></div>); })}
                  </div>
                </div>
              )}
              {ganttData.phases.length > 0 && (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-4"><div className="text-[13px] font-semibold">Tareas por fase</div>{ganttData.phases.map((phase: WorkPhase & { days: number; offset: number; tasks: Task[] }) => phase.tasks.length > 0 && (<div key={phase.id}><div className="text-[11px] font-medium text-[var(--muted-foreground)] mb-1.5 flex items-center gap-1"><Layers size={10} aria-hidden="true"/> {phase.data.name} ({phase.tasks.length})</div>{phase.tasks.slice(0, 5).map((t: Task) => (<div key={t.id} className="flex items-center gap-2 py-1 ml-3"><div className={"w-1.5 h-1.5 rounded-full " + (t.data.status === 'Completado' ? 'bg-emerald-500' : 'bg-[var(--af-bg4)]')} /><span className={"text-[11px] flex-1 truncate " + (t.data.status === 'Completado' ? 'line-through text-[var(--af-text3)]' : '')}>{t.data.title}</span>{t.data.dueDate && <span className="text-[10px] text-[var(--af-text3)]">{fmtDate(t.data.dueDate)}</span>}</div>))}{phase.tasks.length > 5 && <div className="text-[10px] text-[var(--af-accent)] ml-3">+{phase.tasks.length - 5} mas...</div>}</div>))}</div>
              )}
            </div>)}

            {/* 10. TAB: Comentarios */}
            {forms.detailTab === 'Comentarios' && (<div className="space-y-4">
              <div className="flex items-center gap-3"><div className="bg-[var(--card)] border border-[var(--border)] rounded-xl px-3 py-2 flex items-center gap-2"><MessageSquare size={14} className="text-[var(--af-accent)]" aria-hidden="true"/><span className="text-sm font-bold">{projComments.length}</span><span className="text-[11px] text-[var(--muted-foreground)]">comentarios</span></div></div>
              {replyingTo && (<div className="bg-[var(--af-accent)]/10 border border-[var(--af-accent)]/20 rounded-lg px-3 py-2 flex items-center justify-between"><span className="text-[11px] text-[var(--af-accent)]">Respondiendo a {(comments || []).find((c: Comment) => c.id === replyingTo)?.data?.userName || '...'}</span><button className="text-[10px] text-red-400 cursor-pointer hover:underline" onClick={() => setReplyingTo(null)}>Cancelar</button></div>)}
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3"><textarea className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] resize-none" rows={3} placeholder="Escribe un comentario... Usa @ para mencionar" value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleProjectComment(); }} /><div className="flex justify-end mt-2"><button className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-none hover:opacity-90 disabled:opacity-40" disabled={!commentText.trim()} onClick={handleProjectComment}><Send size={12} aria-hidden="true"/> Enviar</button></div></div>
              {projComments.length === 0 ? (<div className="text-center py-16 text-[var(--af-text3)]"><div className="text-4xl mb-3">💬</div><div className="text-sm font-medium">Sin comentarios</div><div className="text-xs mt-1">Inicia la conversacion sobre este proyecto</div></div>) : (<div className="space-y-3">{projComments.map((c: Comment) => { const replies = (projReplies || []).filter((r: Comment) => r.data.parentId === c.id); return (<div key={c.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3"><div className="flex items-start gap-2.5"><div className="w-7 h-7 rounded-full bg-[var(--af-bg4)] flex items-center justify-center text-[11px] font-bold text-[var(--af-accent)] shrink-0 overflow-hidden">{c.data.userPhoto ? <img src={c.data.userPhoto} alt={c.data.userName || 'Usuario'} className="w-full h-full object-cover rounded-full" /> : (c.data.userName || '?')[0].toUpperCase()}</div><div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-0.5"><span className="text-[12px] font-semibold">{c.data.userName || 'Usuario'}</span>{c.data.createdAt && <span className="text-[10px] text-[var(--muted-foreground)]">{timeAgo(c.data.createdAt)}</span>}</div><div className="text-[12px] text-[var(--foreground)] leading-relaxed whitespace-pre-wrap break-words">{c.data.text}</div>{c.data.mentions && c.data.mentions.length > 0 && <div className="text-[10px] text-blue-400 mt-1">Menciona: {(c.data.mentions || []).map((m: string) => getUserName(m)).filter(Boolean).join(', ')}</div>}<button className="text-[10px] text-[var(--muted-foreground)] mt-1.5 cursor-pointer hover:text-[var(--af-accent)]" onClick={() => setReplyingTo(c.id)}>Responder</button>{replies.length > 0 && (<div className="mt-2 pl-3 border-l-2 border-[var(--af-bg4)] space-y-2">{replies.map((r: Comment) => (<div key={r.id} className="flex items-start gap-2"><div className="w-5 h-5 rounded-full bg-[var(--af-bg4)] flex items-center justify-center text-[10px] font-bold text-[var(--muted-foreground)] shrink-0">{(r.data.userName || '?')[0].toUpperCase()}</div><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="text-[11px] font-medium">{r.data.userName}</span>{r.data.createdAt && <span className="text-[9px] text-[var(--muted-foreground)]">{timeAgo(r.data.createdAt)}</span>}</div><div className="text-[11px] leading-relaxed whitespace-pre-wrap">{r.data.text}</div></div></div>))}</div>)}</div></div></div>); })}</div>)}
            </div>)}

            {/* 11. TAB: Reportes */}
            {forms.detailTab === 'Reportes' && (<div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3"><div className="text-lg font-bold">{totalProjectHours.toFixed(1)}h</div><div className="text-[11px] text-[var(--muted-foreground)]">Horas totales</div><div className="text-[10px] text-emerald-400">{billableHours.toFixed(1)}h facturables</div></div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3"><div className="text-lg font-bold">{projectTasks.length}</div><div className="text-[11px] text-[var(--muted-foreground)]">Total tareas</div><div className="text-[10px] text-[var(--muted-foreground)]">{taskStatusDist['Completado'] || 0} completadas</div></div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3"><div className="text-lg font-bold text-[var(--af-accent)]">{fmtCOP(projectSpent)}</div><div className="text-[11px] text-[var(--muted-foreground)]">Gastado</div><div className="text-[10px] text-[var(--muted-foreground)]">de {fmtCOP(projectBudget)}</div></div>
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3"><div className="text-lg font-bold">{projTimeEntries.length}</div><div className="text-[11px] text-[var(--muted-foreground)]">Registros tiempo</div><div className="text-[10px] text-[var(--muted-foreground)]">{dailyLogs.length} bitacoras</div></div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4"><div className="text-[13px] font-semibold mb-3">Distribucion de tareas</div>{projectTasks.length === 0 ? (<div className="text-center py-6 text-[var(--af-text3)] text-sm">Sin tareas</div>) : (<div className="space-y-2">{Object.entries(taskStatusDist).map(([status, count]) => { const pct = Math.round((count / projectTasks.length) * 100); const colors: Record<string, string> = { 'Por hacer': 'bg-slate-400', 'En progreso': 'bg-blue-500', 'Revision': 'bg-amber-500', 'Completado': 'bg-emerald-500' }; return (<div key={status} className="flex items-center gap-3"><div className="w-20 text-[11px] text-[var(--muted-foreground)] shrink-0">{status}</div><div className="flex-1 h-3 bg-[var(--af-bg3)] rounded-full overflow-hidden"><div className={"h-full rounded-full " + (colors[status] || 'bg-gray-400')} style={{ width: pct + '%' }} /></div><div className="w-14 text-[11px] text-right font-medium">{count} ({pct}%)</div></div>); })}</div>)}</div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4"><div className="text-[13px] font-semibold mb-3">Gastos por categoria</div>{expenseByCategory.length === 0 ? (<div className="text-center py-6 text-[var(--af-text3)] text-sm">Sin gastos</div>) : (<div className="space-y-2">{expenseByCategory.map(([cat, amount], idx) => { const pct = projectSpent > 0 ? Math.round((amount / projectSpent) * 100) : 0; const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-pink-500']; return (<div key={cat} className="flex items-center gap-3"><div className="w-24 text-[11px] text-[var(--muted-foreground)] shrink-0 truncate">{cat}</div><div className="flex-1 h-3 bg-[var(--af-bg3)] rounded-full overflow-hidden"><div className={"h-full rounded-full " + colors[idx % colors.length]} style={{ width: pct + '%' }} /></div><div className="w-28 text-[11px] text-right font-medium">{fmtCOP(amount)} ({pct}%)</div></div>); })}</div>)}</div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4"><div className="text-[13px] font-semibold mb-3">Progreso por fase</div>{enabledPhases.length === 0 ? (<div className="text-center py-6 text-[var(--af-text3)] text-sm">Sin fases</div>) : (<div className="space-y-2.5">{enabledPhases.map((phase: WorkPhase) => { const pp = getPhaseProgress(phase.id) ?? (phase.data.status === 'Completado' ? 100 : phase.data.status === 'En progreso' ? 50 : 0); const tc = projectTasks.filter((t: Task) => t.data.phaseId === phase.id).length; return (<div key={phase.id} className="flex items-center gap-3"><div className={"w-32 text-[11px] shrink-0 truncate " + (phase.data.status === 'Completado' ? 'text-emerald-400' : phase.data.status === 'En progreso' ? 'text-[var(--af-accent)] font-medium' : 'text-[var(--muted-foreground)]')}>{phase.data.name}</div><div className="flex-1 h-3 bg-[var(--af-bg3)] rounded-full overflow-hidden"><div className={"h-full rounded-full transition-all " + (pp >= 80 ? 'bg-emerald-500' : pp >= 40 ? 'bg-[var(--af-accent)]' : 'bg-amber-500')} style={{ width: pp + '%' }} /></div><div className="w-20 text-[11px] text-right font-medium">{pp}%</div><div className="w-16 text-[10px] text-[var(--muted-foreground)] text-right">{tc} tareas</div></div>); })}</div>)}</div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4"><div className="text-[13px] font-semibold mb-3">Registros de tiempo recientes</div>{projTimeEntries.length === 0 ? (<div className="text-center py-6 text-[var(--af-text3)] text-sm">Sin registros</div>) : (<div className="space-y-2">{projTimeEntries.slice(0, 8).map((te: TimeEntry) => (<div key={te.id} className="flex items-center gap-3 py-1.5"><div className={"w-2 h-2 rounded-full " + (te.data.billable ? 'bg-emerald-500' : 'bg-[var(--af-bg4)]')} /><div className="flex-1 text-[11px] truncate">{te.data.description || te.data.phaseName}</div><div className="text-[10px] text-[var(--muted-foreground)]">{te.data.userName}</div><div className="text-[10px] font-medium w-14 text-right">{(te.data.duration || 0) / 60}h</div></div>))}{projTimeEntries.length > 8 && <div className="text-[10px] text-[var(--af-text3)]">+{projTimeEntries.length - 8} mas...</div>}</div>)}</div>
            </div>)}

            {/* 12. TAB: Portal (Client-facing full view) */}
            {forms.detailTab === 'Portal' && (() => {
              const completedTasks = projectTasks.filter((t: Task) => t.data.status === 'Completado').length;
              const punchDone = projPunch.filter((pi: PunchItem) => pi.data.status === 'Completado').length;
              const punchPct = projPunch.length > 0 ? Math.round((punchDone / projPunch.length) * 100) : 0;
              const projApprovals = approvals.filter((a: any) => a.data?.projectId === selectedProjectId);
              const pendingApprovals = projApprovals.filter((a: any) => a.data?.status === 'Pendiente').length;
              return (
              <div className="space-y-5">
                {/* Project header card */}
                <div className="bg-gradient-to-br from-[var(--card)] to-[var(--af-bg3)] border border-[var(--border)] rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusColor(currentProject.data.status)}`}>{currentProject.data.status}</span>
                    {currentProject.data.projectType && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PROJECT_TYPE_COLORS[currentProject.data.projectType] || PROJECT_TYPE_COLORS['Ejecución']}`}>{currentProject.data.projectType}</span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold" style={{ fontFamily: "'DM Serif Display', serif" }}>{currentProject.data.name}</h2>
                  <p className="text-sm text-[var(--muted-foreground)] mt-1">{currentProject.data.description || ''}</p>
                  {/* General progress */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-[var(--muted-foreground)]">Progreso general</span>
                      <span className="text-[11px] font-medium">{computedProgress}%</span>
                    </div>
                    <div className="h-2.5 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${computedProgress >= 80 ? 'bg-emerald-500' : computedProgress >= 40 ? 'bg-[var(--af-accent)]' : 'bg-amber-500'}`} style={{ width: `${computedProgress}%` }} />
                    </div>
                  </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3">
                    <div className="text-lg font-bold">{projectTasks.length}</div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">Tareas totales</div>
                    <div className="text-[10px] text-[var(--af-text3)]">{completedTasks} completadas</div>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                    <div className="text-lg font-bold text-blue-400">{projRFIs.length}</div>
                    <div className="text-[10px] text-blue-400/70">RFIs</div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">{projRFIs.filter((r: RFI) => r.data.status === 'Abierto').length} abiertos</div>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                    <div className="text-lg font-bold text-purple-400">{projSubs.length}</div>
                    <div className="text-[10px] text-purple-400/70">Submittals</div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">{projSubs.filter((s: Submittal) => s.data.status === 'Aprobado').length} aprobados</div>
                  </div>
                  <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-3">
                    <div className="text-lg font-bold text-teal-400">{punchPct}%</div>
                    <div className="text-[10px] text-teal-400/70">Punch List</div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">{punchDone}/{projPunch.length} items</div>
                  </div>
                </div>

                {/* Phases with progress */}
                {enabledPhases.length > 0 && (
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                    <div className="text-[13px] font-semibold mb-3">Fases del proyecto</div>
                    <div className="space-y-3">
                      {enabledPhases.map((phase: WorkPhase) => {
                        const phaseProg = getPhaseProgress(phase.id);
                        const isActive = phase.data.status === 'En progreso';
                        const isDone = phase.data.status === 'Completado';
                        return (
                          <div key={phase.id}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[12px] font-medium">{phase.data.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isDone ? 'bg-emerald-500/10 text-emerald-400' : isActive ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)]' : 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]'}`}>
                                {isDone ? 'Completado' : isActive ? `En progreso${phaseProg !== null ? ` · ${phaseProg}%` : ''}` : 'Pendiente'}
                              </span>
                            </div>
                            {phaseProg !== null && (
                              <div className="h-1.5 bg-[var(--af-bg3)] rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${phaseProg >= 80 ? 'bg-emerald-500' : phaseProg >= 40 ? 'bg-[var(--af-accent)]' : 'bg-amber-500'}`} style={{ width: `${phaseProg}%` }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Budget */}
                {projectBudget > 0 && (
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                    <div className="text-[13px] font-semibold mb-3">Presupuesto</div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-[var(--muted-foreground)]">Gastado de {fmtCOP(projectBudget)}</span>
                      <span className={`font-semibold ${budgetExceeded ? 'text-red-400' : ''}`}>{fmtCOP(projectSpent)} ({budgetPct}%)</span>
                    </div>
                    <div className="h-2 bg-[var(--af-bg4)] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${projectSpent > projectBudget ? 'bg-red-500' : projectSpent > projectBudget * 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, budgetPct)}%` }} />
                    </div>
                  </div>
                )}

                {/* Recent activity (daily logs / bitacora) */}
                {dailyLogs.length > 0 && (
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                    <div className="text-[13px] font-semibold mb-3">Actividad reciente</div>
                    <div className="space-y-2">
                      {dailyLogs.slice(0, 5).map((log: DailyLog) => (
                        <div key={log.id} className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0">
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium">{log.data.date}</div>
                            <div className="text-[10px] text-[var(--af-text3)]">{log.data.activities?.slice(0, 2).join(', ') || 'Sin actividades registradas'}</div>
                          </div>
                          {log.data.weather && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--af-bg3)] text-[var(--muted-foreground)]">{log.data.weather} {log.data.temperature}°C</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Shared documents (files) */}
                {projectFiles.length > 0 && (
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                    <div className="text-[13px] font-semibold mb-3">Documentos compartidos ({projectFiles.length})</div>
                    <div className="space-y-2">
                      {projectFiles.slice(0, 5).map((f: any) => (
                        <div key={f.id} className="flex items-center gap-3 py-1.5">
                          <div className="text-[var(--af-text3)]">{f.data?.type === 'image' ? '🖼️' : '📄'}</div>
                          <div className="flex-1 min-w-0 text-[12px] truncate">{f.data?.name || 'Documento'}</div>
                          <span className="text-[10px] text-[var(--af-text3)]">{f.data?.size ? fmtSize(f.data.size) : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Approvals */}
                {projApprovals.length > 0 && (
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[13px] font-semibold">Aprobaciones</div>
                      {pendingApprovals > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">{pendingApprovals} pendiente{pendingApprovals !== 1 ? 's' : ''}</span>}
                    </div>
                    <div className="space-y-2">
                      {projApprovals.slice(0, 5).map((a: any) => (
                        <div key={a.id} className="flex items-center gap-3 py-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${a.data?.status === 'Aprobado' ? 'bg-emerald-500/15 text-emerald-400' : a.data?.status === 'Rechazado' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>{a.data?.status || 'N/A'}</span>
                          <span className="text-[12px] truncate flex-1">{a.data?.title || 'Sin titulo'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              );
            })()}
          </div>
          <ConfirmDialog {...confirmDialog} />
</>);
}
