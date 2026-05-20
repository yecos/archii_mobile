'use client';
import { useMemo, useState, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { exportProjectsPDF } from '@/lib/export-pdf';
import { exportProjectsExcel } from '@/lib/export-excel';
import { isOverdue as checkOverdue } from '@/lib/kanban-helpers';
import type { Project, Task, Expense } from '@/lib/types';
import {
  computeHealth,
  HEALTH_CONFIG,
  STATUS_COLORS,
  STATUS_LABELS,
  MONTHS,
  HealthLevel,
} from './project-helpers';

export function useProjectsData() {
  const {
    loading, projects, companies, forms, setForms, setEditingId, openModal,
    visibleProjects, openEditProject, deleteProject, openProject, getMyRole, tasks,
    expenses, showToast, teamUsers, activeTenantId,
  } = useApp();

  const confirmDialog = useConfirmDialog();

  // --- Local filter state ---
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterBudgetMin, setFilterBudgetMin] = useState('');
  const [filterBudgetMax, setFilterBudgetMax] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // --- View mode: cards vs timeline ---
  const [viewMode, setViewMode] = useState<'cards' | 'timeline'>('cards');

  // --- Batch selection ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const today = new Date().toISOString().split('T')[0];

  // --- Filtered projects ---
  const filteredProjects = useMemo(() => {
    let projs = visibleProjects();
    if (forms.projFilter) projs = projs.filter((p: Project) => p.data.status === forms.projFilter);
    if (forms.projCompanyFilter) projs = projs.filter((p: Project) => p.data.companyId === forms.projCompanyFilter);
    if (filterType) projs = projs.filter((p: Project) => (p.data.projectType || 'Ejecución') === filterType);
    if (filterBudgetMin) projs = projs.filter((p: Project) => (p.data.budget || 0) >= Number(filterBudgetMin));
    if (filterBudgetMax) projs = projs.filter((p: Project) => (p.data.budget || 0) <= Number(filterBudgetMax));
    if (filterDateFrom) projs = projs.filter((p: Project) => p.data.startDate && p.data.startDate >= filterDateFrom);
    if (filterDateTo) projs = projs.filter((p: Project) => p.data.startDate && p.data.startDate <= filterDateTo);
    const q = search.toLowerCase();
    if (q) {
      projs = projs.filter((p: Project) =>
        (p.data.name || '').toLowerCase().includes(q) ||
        (p.data.client || '').toLowerCase().includes(q) ||
        (p.data.location || '').toLowerCase().includes(q) ||
        (p.data.description || '').toLowerCase().includes(q)
      );
    }
    return projs;
  }, [forms.projFilter, forms.projCompanyFilter, projects, search, filterType, filterBudgetMin, filterBudgetMax, filterDateFrom, filterDateTo]);

  // --- KPI computations ---
  const totalBudget = useMemo(() => projects.reduce((s: number, p: Project) => s + (p.data.budget || 0), 0), [projects]);
  const totalSpent = useMemo(() => {
    const projectIds = new Set(projects.map((p: Project) => p.id));
    return expenses.filter((e: Expense) => projectIds.has(e.data.projectId)).reduce((s: number, e: Expense) => s + (Number(e.data.amount) || 0), 0);
  }, [expenses, projects]);
  const avgProgress = useMemo(() => projects.length > 0
    ? Math.round(projects.reduce((s: number, p: Project) => s + (p.data.progress || 0), 0) / projects.length)
    : 0, [projects]);
  const completedCount = useMemo(() => projects.filter((p: Project) => p.data.status === 'Terminado').length, [projects]);
  const projectsWithOverdue = useMemo(() => {
    return filteredProjects.filter((p: Project) => {
      const projTasks = tasks.filter((t: Task) => t.data.projectId === p.id);
      return projTasks.some((t: Task) => t.data.status !== 'Completado' && t.data.dueDate && checkOverdue(t.data.dueDate));
    }).length;
  }, [filteredProjects, tasks, today]);
  const overBudgetCount = useMemo(() => {
    return projects.filter((p: Project) => {
      const budget = p.data.budget || 0;
      if (budget <= 0) return false;
      const spent = expenses.filter((e: Expense) => e.data.projectId === p.id).reduce((s: number, e: Expense) => s + (Number(e.data.amount) || 0), 0);
      return spent > budget;
    }).length;
  }, [projects, expenses]);

  // ─── Health score per project ───
  const healthMap = useMemo(() => {
    const map: Record<string, any> = {};
    projects.forEach((p: Project) => { map[p.id] = computeHealth(p, tasks, expenses, today); });
    return map;
  }, [projects, tasks, expenses, today]);

  const getHealth = useCallback((p: Project): { score: number; level: HealthLevel; details: { budget: number; schedule: number; tasks: number; progress: number } } =>
    healthMap[p.id] || { score: 100, level: 'excelente' as HealthLevel, details: { budget: 25, schedule: 25, tasks: 25, progress: 25 } }
  , [healthMap]);

  // Health KPI summary
  const healthSummary = useMemo(() => {
    const active = projects.filter((p: Project) => p.data.status !== 'Terminado');
    let excelente = 0, bueno = 0, riesgo = 0, critico = 0;
    active.forEach((p: Project) => {
      const h = healthMap[p.id];
      if (!h) return;
      if (h.level === 'excelente') excelente++;
      else if (h.level === 'bueno') bueno++;
      else if (h.level === 'riesgo') riesgo++;
      else critico++;
    });
    return { excelente, bueno, riesgo, critico, total: active.length };
  }, [projects, healthMap]);

  // Health chart data
  const healthChartData = useMemo(() => {
    if (healthSummary.total === 0) return [];
    return [
      { name: 'Excelente', value: healthSummary.excelente, color: '#10b981' },
      { name: 'Bueno', value: healthSummary.bueno, color: '#3b82f6' },
      { name: 'En Riesgo', value: healthSummary.riesgo, color: '#f59e0b' },
      { name: 'Crítico', value: healthSummary.critico, color: '#ef4444' },
    ].filter(d => d.value > 0);
  }, [healthSummary]);

  // --- Status distribution for pie chart ---
  const statusDist = useMemo(() => {
    const map: Record<string, number> = {};
    projects.forEach((p: Project) => {
      const s = p.data.status || 'Concepto';
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({
        name: STATUS_LABELS[name] || name,
        value,
        color: STATUS_COLORS[name] || '#828282',
      }));
  }, [projects]);

  // --- Monthly created trend (6 months) ---
  const monthlyCreated = useMemo(() => {
    const data: { name: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthTotal = projects.filter((p: Project) => {
        const created = p.data.createdAt;
        if (!created) return false;
        const dateStr = typeof created === 'object' && 'toDate' in created ? created.toDate() : new Date(created as string);
        const ck = `${dateStr.getFullYear()}-${String(dateStr.getMonth() + 1).padStart(2, '0')}`;
        return ck === key;
      }).length;
      data.push({ name: MONTHS[d.getMonth()], total: monthTotal });
    }
    return data;
  }, [projects]);

  // --- Budget per project ---
  const projectBudgetData = useMemo(() => {
    return projects
      .map((p: Project) => {
        const budget = p.data.budget || 0;
        const spent = expenses.filter((e: Expense) => e.data.projectId === p.id)
          .reduce((s: number, e: Expense) => s + (Number(e.data.amount) || 0), 0);
        return { id: p.id, name: p.data.name, budget, spent, pct: budget > 0 ? Math.round((spent / budget) * 100) : 0 };
      })
      .filter(p => p.budget > 0 || p.spent > 0)
      .sort((a, b) => b.spent - a.spent);
  }, [projects, expenses]);

  // --- Helpers ---
  const getProjectStats = useCallback((projectId: string) => {
    const projTasks = tasks.filter((t: Task) => t.data.projectId === projectId);
    const pending = projTasks.filter((t: Task) => t.data.status !== 'Completado').length;
    const overdue = projTasks.filter((t: Task) => t.data.status !== 'Completado' && t.data.dueDate && checkOverdue(t.data.dueDate)).length;
    const completed = projTasks.filter((t: Task) => t.data.status === 'Completado').length;
    return { pending, overdue, completed, total: projTasks.length };
  }, [tasks, today]);

  const getProjectSpent = useCallback((projectId: string) => {
    return expenses.filter((e: Expense) => e.data.projectId === projectId)
      .reduce((s: number, e: Expense) => s + (Number(e.data.amount) || 0), 0);
  }, [expenses]);

  const getDaysRemaining = useCallback((endDate: string) => {
    if (!endDate) return null;
    const diff = Math.ceil((new Date(endDate + 'T23:59:59').getTime() - new Date().getTime()) / 86400000);
    return diff;
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setFilterType('');
    setFilterBudgetMin('');
    setFilterBudgetMax('');
    setFilterDateFrom('');
    setFilterDateTo('');
  }, []);

  const hasActiveFilters = search || filterType || filterBudgetMin || filterBudgetMax || filterDateFrom || filterDateTo;

  // --- Exports ---
  const exportCSV = useCallback((projList?: Project[]) => {
    const list = projList || filteredProjects;
    const q = '"';
    const dq = '""';
    const headers = ['Proyecto', 'Estado', 'Tipo', 'Cliente', 'Ubicación', 'Presupuesto', 'Gastado', 'Saldo', 'Progreso', 'Tareas', 'Completadas', 'Fecha Inicio', 'Fecha Entrega', 'Salud'];
    const esc = (v: string | number) => q + String(v).split(q).join(dq) + q;
    const rows = list.map((p: Project) => {
      const d = p.data;
      const stats = getProjectStats(p.id);
      const spent = getProjectSpent(p.id);
      const h = getHealth(p);
      return [
        d.name, d.status, d.projectType || 'Ejecución', d.client || '', d.location || '',
        d.budget || 0, spent, (d.budget || 0) - spent, `${d.progress || 0}%`,
        stats.total, stats.completed, d.startDate || '', d.endDate || '',
        `${h.score} (${HEALTH_CONFIG[h.level].label})`,
      ];
    });
    const csv = [headers, ...rows].map((r: (string | number)[]) => r.map(esc).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'proyectos_' + new Date().toISOString().split('T')[0] + '.csv'; a.click(); URL.revokeObjectURL(url);
    showToast('Proyectos exportados a CSV');
  }, [filteredProjects, getProjectStats, getProjectSpent, getHealth, showToast]);

  const handleNewProject = useCallback(() => {
    setEditingId(null);
    openModal('project');
  }, [setEditingId, openModal]);

  // --- Batch operations ---
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredProjects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProjects.map((p: Project) => p.id)));
    }
  }, [selectedIds, filteredProjects]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const batchExportPDF = useCallback(() => {
    const selected = projects.filter((p: Project) => selectedIds.has(p.id));
    if (selected.length === 0) return;
    try {
      exportProjectsPDF({ projects: selected, tasks, expenses });
      showToast(`PDF generado con ${selected.length} proyectos`);
    } catch { showToast('Error al generar PDF', 'error'); }
  }, [projects, selectedIds, tasks, expenses, showToast]);

  const batchExportCSV = useCallback(() => {
    const selected = projects.filter((p: Project) => selectedIds.has(p.id));
    if (selected.length === 0) return;
    exportCSV(selected);
  }, [projects, selectedIds, exportCSV]);

  const batchChangeStatus = useCallback(async (newStatus: string) => {
    const selected = projects.filter((p: Project) => selectedIds.has(p.id));
    if (selected.length === 0) return;
    const confirmed = await confirmDialog.confirm({
      title: 'Cambiar estado en lote',
      description: `¿Cambiar el estado de ${selected.length} proyectos a "${STATUS_LABELS[newStatus] || newStatus}"?`,
    });
    if (!confirmed || !activeTenantId) return;
    try {
      const { getFirebase } = await import('@/lib/firebase-service');
      const app = getFirebase();
      const db = app.firestore();
      const batch = db.batch();
      const ts = app.FieldValue.serverTimestamp();
      selected.forEach((p: Project) => {
        const ref = db.collection('projects').doc(p.id);
        batch.update(ref, { status: newStatus, updatedAt: ts });
      });
      await batch.commit();
      showToast(`${selected.length} proyectos actualizados a "${STATUS_LABELS[newStatus] || newStatus}"`);
      clearSelection();
    } catch (err: unknown) {
      showToast('Error al actualizar proyectos: ' + (err instanceof Error ? err.message : ''), 'error');
    }
  }, [projects, selectedIds, confirmDialog, activeTenantId, showToast, clearSelection]);

  const isAllSelected = filteredProjects.length > 0 && selectedIds.size === filteredProjects.length;

  return {
    // App context
    loading,
    projects,
    companies,
    forms,
    setForms,
    getMyRole,
    openEditProject,
    deleteProject,
    openProject,
    showToast,
    tasks,
    expenses,
    confirmDialog,
    visibleProjects,

    // Filter state
    search, setSearch,
    filterType, setFilterType,
    filterBudgetMin, setFilterBudgetMin,
    filterBudgetMax, setFilterBudgetMax,
    filterDateFrom, setFilterDateFrom,
    filterDateTo, setFilterDateTo,
    showFilters, setShowFilters,
    hasActiveFilters,
    clearFilters,

    // View mode
    viewMode, setViewMode,

    // Batch selection
    selectedIds, setSelectedIds,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    isAllSelected,

    // Computed data
    filteredProjects,
    today,
    totalBudget,
    totalSpent,
    avgProgress,
    completedCount,
    projectsWithOverdue,
    overBudgetCount,
    healthMap,
    getHealth,
    healthSummary,
    healthChartData,
    statusDist,
    monthlyCreated,
    projectBudgetData,

    // Helper functions
    getProjectStats,
    getProjectSpent,
    getDaysRemaining,

    // Export handlers
    exportCSV,
    handleNewProject,
    batchExportPDF,
    batchExportCSV,
    batchChangeStatus,
  };
}
