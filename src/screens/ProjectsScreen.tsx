'use client';
import React from 'react';
import { SkeletonProjects } from '@/components/ui/SkeletonLoaders';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { exportProjectsPDF } from '@/lib/export-pdf';
import { exportProjectsExcel } from '@/lib/export-excel';
import { FolderKanban, CheckSquare } from 'lucide-react';

import { useProjectsData } from '@/components/projects/useProjectsData';
import ProjectTimelineView from '@/components/projects/ProjectTimelineView';
import ProjectBatchActionBar from '@/components/projects/ProjectBatchActionBar';
import ProjectHeader from '@/components/projects/ProjectHeader';
import ProjectSearchFilters from '@/components/projects/ProjectSearchFilters';
import ProjectStatusTabs from '@/components/projects/ProjectStatusTabs';
import ProjectCompanyFilter from '@/components/projects/ProjectCompanyFilter';
import ProjectKPIs from '@/components/projects/ProjectKPIs';
import ProjectCharts from '@/components/projects/ProjectCharts';
import ProjectBudgetCards from '@/components/projects/ProjectBudgetCards';
import ProjectCards from '@/components/projects/ProjectCards';

export default function ProjectsScreen() {
  const data = useProjectsData();

  const handleExportPDF = () => {
    try {
      exportProjectsPDF({ projects: data.filteredProjects, tasks: data.tasks, expenses: data.expenses });
      data.showToast('Reporte PDF descargado');
    } catch {
      data.showToast('Error al generar PDF', 'error');
    }
  };

  const handleExportExcel = () => {
    try {
      exportProjectsExcel(data.filteredProjects, data.tasks, data.expenses);
      data.showToast('Excel descargado');
    } catch {
      data.showToast('Error al generar Excel', 'error');
    }
  };

  return (
    <div className="animate-fadeIn space-y-5">
      {/* ===== HEADER ===== */}
      <ProjectHeader
        projectsCount={data.projects.length}
        filteredCount={data.filteredProjects.length}
        viewMode={data.viewMode}
        setViewMode={data.setViewMode}
        selectedIdsSize={data.selectedIds.size}
        clearSelection={data.clearSelection}
        setSelectedIds={data.setSelectedIds}
        onExportPDF={handleExportPDF}
        onExportExcel={handleExportExcel}
        onExportCSV={data.exportCSV}
        handleNewProject={data.handleNewProject}
      />

      {/* ===== SEARCH + FILTERS ===== */}
      <ProjectSearchFilters
        search={data.search}
        setSearch={data.setSearch}
        showFilters={data.showFilters}
        setShowFilters={data.setShowFilters}
        filterType={data.filterType}
        setFilterType={data.setFilterType}
        filterBudgetMin={data.filterBudgetMin}
        setFilterBudgetMin={data.setFilterBudgetMin}
        filterBudgetMax={data.filterBudgetMax}
        setFilterBudgetMax={data.setFilterBudgetMax}
        filterDateFrom={data.filterDateFrom}
        setFilterDateFrom={data.setFilterDateFrom}
        filterDateTo={data.filterDateTo}
        setFilterDateTo={data.setFilterDateTo}
        hasActiveFilters={data.hasActiveFilters}
        clearFilters={data.clearFilters}
      />

      {/* ===== STATUS TABS ===== */}
      <ProjectStatusTabs
        currentFilter={data.forms.projFilter}
        setForms={data.setForms}
        visibleProjects={data.visibleProjects}
      />

      {/* ===== COMPANY FILTER PILLS ===== */}
      <ProjectCompanyFilter
        companies={data.companies}
        getMyRole={data.getMyRole}
        projCompanyFilter={data.forms.projCompanyFilter}
        setForms={data.setForms}
      />

      {/* ===== KPI CARDS ===== */}
      <ProjectKPIs
        projectsCount={data.projects.length}
        completedCount={data.completedCount}
        totalBudget={data.totalBudget}
        totalSpent={data.totalSpent}
        avgProgress={data.avgProgress}
        projectsWithOverdue={data.projectsWithOverdue}
        overBudgetCount={data.overBudgetCount}
        projectBudgetDataLength={data.projectBudgetData.length}
        healthSummary={data.healthSummary}
        healthChartData={data.healthChartData}
      />

      {/* ===== CHARTS: PIE + BAR ===== */}
      <ProjectCharts
        statusDist={data.statusDist}
        monthlyCreated={data.monthlyCreated}
      />

      {/* ===== BUDGET CARDS PER PROJECT ===== */}
      {data.projectBudgetData.length > 0 && data.viewMode === 'cards' && (
        <ProjectBudgetCards projectBudgetData={data.projectBudgetData} />
      )}

      {/* ===== LOADING ===== */}
      {data.loading && <SkeletonProjects />}

      {/* ===== EMPTY STATE ===== */}
      {!data.loading && data.filteredProjects.length === 0 && (
        <div className="text-center py-16 text-[var(--af-text3)]">
          <div className="w-14 h-14 rounded-2xl bg-[var(--af-bg3)] flex items-center justify-center mx-auto mb-3">
            <FolderKanban size={24} className="text-[var(--af-text3)]" aria-hidden="true"/>
          </div>
          <div className="text-[15px] font-medium text-[var(--muted-foreground)]">Sin proyectos</div>
          <div className="text-xs mt-1">{data.hasActiveFilters || data.forms.projFilter ? 'No se encontraron resultados con los filtros aplicados' : 'Crea tu primer proyecto para empezar'}</div>
        </div>
      )}

      {/* ===== SELECT ALL BAR (when batch mode active) ===== */}
      {!data.loading && data.filteredProjects.length > 0 && data.selectedIds.size >= 0 && (
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[var(--muted-foreground)]">
            <button
              className="w-5 h-5 rounded flex items-center justify-center border transition-colors cursor-pointer"
              style={{
                borderColor: data.isAllSelected ? 'var(--af-accent)' : 'var(--border)',
                background: data.isAllSelected ? 'var(--af-accent)' : 'transparent',
              }}
              onClick={data.toggleSelectAll}
            >
              {data.isAllSelected && <CheckSquare size={13} className="text-background" aria-hidden="true"/>}
            </button>
            Seleccionar todos ({data.filteredProjects.length})
          </label>
          {data.selectedIds.size > 0 && (
            <button className="text-[11px] text-[var(--af-accent)] cursor-pointer hover:underline" onClick={data.clearSelection}>
              Limpiar selección
            </button>
          )}
        </div>
      )}

      {/* ===== TIMELINE VIEW ===== */}
      {!data.loading && data.viewMode === 'timeline' && data.filteredProjects.length > 0 && (
        <ProjectTimelineView projects={data.filteredProjects} getHealth={data.getHealth} onOpenProject={data.openProject} />
      )}

      {/* ===== PROJECT CARDS ===== */}
      {!data.loading && data.viewMode === 'cards' && data.filteredProjects.length > 0 && (
        <ProjectCards
          filteredProjects={data.filteredProjects}
          companies={data.companies}
          selectedIds={data.selectedIds}
          toggleSelect={data.toggleSelect}
          openProject={data.openProject}
          openEditProject={data.openEditProject}
          deleteProject={data.deleteProject}
          confirmDialog={data.confirmDialog}
          getHealth={data.getHealth}
          getProjectStats={data.getProjectStats}
          getProjectSpent={data.getProjectSpent}
          getDaysRemaining={data.getDaysRemaining}
          today={data.today}
        />
      )}

      {/* ===== MOBILE FAB ===== */}
      <FloatingActionButton onClick={data.handleNewProject} ariaLabel="Nuevo proyecto" />

      {/* ===== BATCH ACTION BAR ===== */}
      {data.selectedIds.size > 0 && (
        <ProjectBatchActionBar
          selectedCount={data.selectedIds.size}
          onClear={data.clearSelection}
          onExportPDF={data.batchExportPDF}
          onExportCSV={data.batchExportCSV}
          onStatusChange={data.batchChangeStatus}
        />
      )}

      {/* ===== CONFIRM DIALOG ===== */}
      <ConfirmDialog {...data.confirmDialog} />
    </div>
  );
}
