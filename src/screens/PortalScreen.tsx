'use client';
import React, { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { fmtCOP, statusColor } from '@/lib/helpers';
import type { Submittal, Project } from '@/lib/types';
import { Globe, Search, Filter, FolderKanban, DollarSign, CheckCircle2, ArrowRight, X, ChevronRight } from 'lucide-react';

const STATUS_OPTIONS = [
  { key: 'Todos', value: '' },
  { key: 'Concepto', value: 'Concepto' },
  { key: 'Diseno', value: 'Diseno' },
  { key: 'Ejecucion', value: 'Ejecucion' },
  { key: 'Terminado', value: 'Terminado' },
];

export default function PortalScreen() {
  const {
    projects, tasks, rfis, submittals, punchItems,
    setSelectedProjectId, setForms, navigateTo, teamUsers, loading,
    visibleProjects,
  } = useApp();

  // ─── Local filter state ───
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // ─── KPI summary from visible projects ───
  const kpiSummary = useMemo(() => {
    const projs = visibleProjects();
    const total = projs.length;
    const inExecution = projs.filter((p: Project) => p.data.status === 'Ejecucion').length;
    const completed = projs.filter((p: Project) => p.data.status === 'Terminado').length;
    const totalBudget = projs.reduce((s: number, p: Project) => s + (p.data.budget || 0), 0);
    return { total, inExecution, completed, totalBudget };
  }, [visibleProjects, projects, tasks, rfis, submittals, punchItems]);

  // ─── Filtered projects (search + status) ───
  const filteredProjects = useMemo(() => {
    let projs = visibleProjects();
    if (statusFilter) {
      projs = projs.filter((p: Project) => p.data.status === statusFilter);
    }
    const q = search.toLowerCase().trim();
    if (q) {
      projs = projs.filter((p: Project) =>
        (p.data.name || '').toLowerCase().includes(q) ||
        (p.data.description || '').toLowerCase().includes(q) ||
        (p.data.client || '').toLowerCase().includes(q) ||
        (p.data.location || '').toLowerCase().includes(q)
      );
    }
    return projs;
  }, [visibleProjects, statusFilter, search, projects, tasks, rfis, submittals, punchItems]);

  // ─── Per-project stats for client view ───
  const projectStats = useMemo(() => {
    return filteredProjects.map((p: Project) => {
      const projTasks = tasks.filter(t => t.data.projectId === p.id);
      const completedTasks = projTasks.filter(t => t.data.status === 'Completado').length;
      const totalTasks = projTasks.length;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      const openRFIs = rfis.filter(r => r.data.projectId === p.id && r.data.status !== 'Cerrado' && r.data.status !== 'Respondido').length;
      const pendingSubs = submittals.filter((s: Submittal) => s.data.projectId === p.id && (s.data.status === 'Borrador' || s.data.status === 'En revisión')).length;
      const openPunch = punchItems.filter(pi => pi.data.projectId === p.id && pi.data.status !== 'Completado').length;
      return { ...p, totalTasks, completedTasks, progress, openRFIs, pendingSubs, openPunch };
    });
  }, [filteredProjects, tasks, rfis, submittals, punchItems]);

  const activeProjects = projectStats.filter((p: any) => p.data.status === 'Ejecucion');
  const otherProjects = projectStats.filter((p: any) => p.data.status !== 'Ejecucion');

  const openProjectPortal = (projectId: string) => {
    setSelectedProjectId(projectId);
    setForms(p => ({ ...p, detailTab: 'Portal' }));
    navigateTo('projectDetail', projectId);
  };

  const hasFilters = search.trim() || statusFilter;

  return (
    <div className="animate-fadeIn space-y-5">
      {/* ════════════ HEADER ════════════ */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Globe size={20} className="text-blue-400" aria-hidden="true"/>
              Portal del cliente
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Accede al progreso y documentos de cada proyecto</p>
          </div>
        </div>
      </div>

      {/* ════════════ KPI SUMMARY CARDS ════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Projects */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--af-accent)]/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <FolderKanban size={15} className="text-blue-400" aria-hidden="true"/>
            </div>
          </div>
          <div className="text-lg font-bold">{kpiSummary.total}</div>
          <div className="text-[10px] sm:text-[11px] text-[var(--muted-foreground)] mt-0.5">Total proyectos</div>
        </div>

        {/* In Execution */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-amber-500/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <ArrowRight size={15} className="text-amber-400" aria-hidden="true"/>
            </div>
          </div>
          <div className="text-lg font-bold text-amber-400">{kpiSummary.inExecution}</div>
          <div className="text-[10px] sm:text-[11px] text-[var(--muted-foreground)] mt-0.5">En ejecucion</div>
        </div>

        {/* Completed */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-emerald-500/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 size={15} className="text-emerald-400" aria-hidden="true"/>
            </div>
          </div>
          <div className="text-lg font-bold text-emerald-400">{kpiSummary.completed}</div>
          <div className="text-[10px] sm:text-[11px] text-[var(--muted-foreground)] mt-0.5">Completados</div>
        </div>

        {/* Total Budget */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--af-accent)]/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--af-accent)]/10 flex items-center justify-center">
              <DollarSign size={15} className="text-[var(--af-accent)]" aria-hidden="true"/>
            </div>
          </div>
          <div className="text-lg font-bold text-[var(--af-accent)]">{fmtCOP(kpiSummary.totalBudget)}</div>
          <div className="text-[10px] sm:text-[11px] text-[var(--muted-foreground)] mt-0.5">Presupuesto total</div>
        </div>
      </div>

      {/* ════════════ SEARCH BAR ════════════ */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true"/>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, cliente, ubicacion..."
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] transition-colors"
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer transition-colors"
              onClick={() => setSearch('')}
            >
              <X size={14} aria-hidden="true"/>
            </button>
          )}
        </div>
        <button
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium cursor-pointer border transition-colors ${
            hasFilters
              ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30'
              : 'bg-[var(--card)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--af-bg3)]'
          }`}
          onClick={() => {
            if (hasFilters) {
              setSearch('');
              setStatusFilter('');
            }
          }}
        >
          <Filter size={14} aria-hidden="true"/>
          {hasFilters ? 'Limpiar' : 'Filtros'}
          {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-[var(--af-accent)]" />}
        </button>
      </div>

      {/* ════════════ STATUS FILTER PILLS ════════════ */}
      <div className="flex gap-1 bg-[var(--af-bg3)] rounded-lg p-1 overflow-x-auto scrollbar-none">
        {STATUS_OPTIONS.map(tab => {
          const allProjs = visibleProjects();
          const count = tab.value ? allProjs.filter((p: Project) => p.data.status === tab.value).length : allProjs.length;
          return (
            <button
              key={tab.key}
              className={`px-3 py-1.5 rounded-md text-[13px] cursor-pointer transition-all whitespace-nowrap ${
                statusFilter === tab.value
                  ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.key} ({count})
            </button>
          );
        })}
      </div>

      {/* ════════════ RESULTS COUNT ════════════ */}
      {hasFilters && (
        <div className="text-[11px] text-[var(--muted-foreground)] px-1">
          {projectStats.length} proyecto{projectStats.length !== 1 ? 's' : ''} encontrado{projectStats.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* ════════════ ACTIVE PROJECTS ════════════ */}
      {activeProjects.length > 0 && (
        <div>
          <div className="text-[13px] font-medium text-[var(--muted-foreground)] mb-3 uppercase tracking-wider">
            Proyectos en ejecucion
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeProjects.map((p: any) => (
              <button
                key={p.id}
                className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 text-left cursor-pointer hover:border-[var(--af-accent)]/40 transition-all group"
                onClick={() => openProjectPortal(p.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor(p.data.status)}`}>
                        {p.data.status || 'Concepto'}
                      </span>
                      {p.data.location && (
                        <span className="text-[10px] text-[var(--af-text3)] truncate">
                          {p.data.location}
                        </span>
                      )}
                    </div>
                    <div className="text-[14px] font-semibold truncate group-hover:text-[var(--af-accent)] transition-colors">
                      {p.data.name}
                    </div>
                    {p.data.description && (
                      <div className="text-[11px] text-[var(--af-text3)] mt-1 line-clamp-1">{p.data.description}</div>
                    )}
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] flex items-center justify-center text-[var(--af-text3)] group-hover:bg-[var(--af-accent)]/10 group-hover:text-[var(--af-accent)] transition-all flex-shrink-0 ml-2">
                    <ChevronRight size={16} className="stroke-current" aria-hidden="true"/>
                  </div>
                </div>
                {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-[var(--af-text3)]">Progreso general</span>
                      <span className="text-[10px] font-medium text-[var(--muted-foreground)]">{p.progress}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--af-bg3)]">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          p.progress >= 80 ? 'bg-emerald-500' : p.progress >= 40 ? 'bg-[var(--af-accent)]' : 'bg-amber-500'
                        }`}
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                  </div>
                  {/* Budget */}
                  {p.data.budget > 0 && (
                    <div className="mb-3">
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--af-accent)]/10 text-[var(--af-accent)]">
                        {fmtCOP(p.data.budget)}
                      </span>
                    </div>
                  )}
                  {/* Quick stats */}
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--af-bg3)] text-[var(--muted-foreground)]">
                      {p.completedTasks}/{p.totalTasks} tareas
                    </span>
                  {p.openRFIs > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400">
                      {p.openRFIs} RFI{p.openRFIs !== 1 ? 's' : ''} abierto{p.openRFIs !== 1 ? 's' : ''}
                    </span>
                  )}
                  {p.pendingSubs > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400">
                      {p.pendingSubs} submittal{p.pendingSubs !== 1 ? 's' : ''} pendiente{p.pendingSubs !== 1 ? 's' : ''}
                    </span>
                  )}
                  {p.openPunch > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-red-500/10 text-red-400">
                      {p.openPunch} punch item{p.openPunch !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ════════════ OTHER PROJECTS ════════════ */}
      {otherProjects.length > 0 && (
        <div>
          <div className="text-[13px] font-medium text-[var(--muted-foreground)] mb-3 uppercase tracking-wider">
            Otros proyectos
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {otherProjects.map((p: any) => (
              <button
                key={p.id}
                className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 text-left cursor-pointer hover:border-[var(--af-accent)]/40 transition-all group"
                onClick={() => openProjectPortal(p.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor(p.data.status)}`}>
                        {p.data.status || 'Concepto'}
                      </span>
                    </div>
                    <div className="text-[14px] font-medium truncate group-hover:text-[var(--af-accent)] transition-colors">
                      {p.data.name}
                    </div>
                    {p.data.description && (
                      <div className="text-[11px] text-[var(--af-text3)] mt-1 line-clamp-1">{p.data.description}</div>
                    )}
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] flex items-center justify-center text-[var(--af-text3)] group-hover:bg-[var(--af-accent)]/10 group-hover:text-[var(--af-accent)] transition-all flex-shrink-0 ml-2">
                <ChevronRight size={16} className="stroke-current" aria-hidden="true"/>
                  </div>
                </div>
                {/* Progress bar for non-active projects too */}
                  {p.totalTasks > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-[var(--af-text3)]">Progreso general</span>
                      <span className="text-[10px] font-medium text-[var(--muted-foreground)]">{p.progress}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--af-bg3)]">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          p.progress >= 80 ? 'bg-emerald-500' : p.progress >= 40 ? 'bg-[var(--af-accent)]' : 'bg-amber-500'
                        }`}
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                  </div>
                )}
                {/* Budget */}
                {p.data.budget > 0 && (
                  <div className="mb-3">
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--af-accent)]/10 text-[var(--af-accent)]">
                      {fmtCOP(p.data.budget)}
                    </span>
                  </div>
                )}
                {/* Quick stats */}
                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--af-bg3)] text-[var(--muted-foreground)]">
                    {p.completedTasks}/{p.totalTasks} tareas
                  </span>
                  {p.openRFIs > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400">
                      {p.openRFIs} RFI{p.openRFIs !== 1 ? 's' : ''} abierto{p.openRFIs !== 1 ? 's' : ''}
                    </span>
                  )}
                  {p.pendingSubs > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400">
                      {p.pendingSubs} submittal{p.pendingSubs !== 1 ? 's' : ''} pendiente{p.pendingSubs !== 1 ? 's' : ''}
                    </span>
                  )}
                  {p.openPunch > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-red-500/10 text-red-400">
                      {p.openPunch} punch item{p.openPunch !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ════════════ EMPTY STATE ════════════ */}
      {!loading && filteredProjects.length === 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-8 text-center">
          {hasFilters ? (
            <>
              <div className="text-3xl mb-2"><Filter size={32} className="mx-auto text-[var(--muted-foreground)] opacity-40" aria-hidden="true"/></div>
              <div className="text-[14px] font-medium text-[var(--muted-foreground)] mb-1">Sin resultados</div>
              <div className="text-[11px] text-[var(--af-text3)] mb-3">No se encontraron proyectos con los filtros aplicados</div>
              <button
                className="text-[12px] text-[var(--af-accent)] cursor-pointer hover:underline"
                onClick={() => { setSearch(''); setStatusFilter(''); }}
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              <div className="text-3xl mb-2">📋</div>
              <div className="text-[14px] font-medium text-[var(--muted-foreground)] mb-1">Sin proyectos</div>
              <div className="text-[11px] text-[var(--af-text3)]">Los proyectos aparecen aqui cuando se creen nuevos</div>
            </>
          )}
        </div>
      )}

      {/* ════════════ LOADING SKELETON ════════════ */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-16 h-4 bg-[var(--af-bg3)] rounded" />
                <div className="flex-1 h-4 bg-[var(--af-bg3)] rounded" />
              </div>
              <div className="w-full h-1.5 bg-[var(--af-bg3)] rounded-full mb-3" />
              <div className="flex gap-2">
                <div className="w-16 h-4 bg-[var(--af-bg3)] rounded" />
                <div className="w-16 h-4 bg-[var(--af-bg3)] rounded" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
