'use client';
import React, { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useTimeTrackingContext } from '@/hooks/useTimeTracking';
import { BarChart3, Download, FileText } from 'lucide-react';
import { exportGeneralReportPDF } from '@/lib/export-pdf';
import ReportsOverview from '@/components/reports/ReportsOverview';
import ReportsFinanciero from '@/components/reports/ReportsFinanciero';
import ReportsTiempo from '@/components/reports/ReportsTiempo';
import ReportsEquipo from '@/components/reports/ReportsEquipo';
import ReportsObra from '@/components/reports/ReportsObra';

export default function ReportsScreen() {
  const {
    expenses, forms, projects, setForms,
    showToast, tasks, teamUsers, dailyLogs,
    rfis, submittals, punchItems,
  } = useApp();
  const { invoices, timeEntries } = useTimeTrackingContext();

  const [dateFilter, setDateFilter] = useState<'all' | 'month' | 'quarter' | 'year'>('all');

  // Filter data by date
  const filteredExpenses = useMemo(() => {
    if (dateFilter === 'all') return expenses;
    const now = new Date();
    let start: Date;
    if (dateFilter === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
    else if (dateFilter === 'quarter') { start = new Date(now.getFullYear(), now.getMonth() - 3, 1); }
    else { start = new Date(now.getFullYear(), 0, 1); }
    return expenses.filter(e => {
      if (!e.data.date) return false;
      return new Date(e.data.date) >= start;
    });
  }, [expenses, dateFilter]);

  const filteredInvoices = useMemo(() => {
    if (dateFilter === 'all') return invoices;
    const now = new Date();
    let start: Date;
    if (dateFilter === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
    else if (dateFilter === 'quarter') { start = new Date(now.getFullYear(), now.getMonth() - 3, 1); }
    else { start = new Date(now.getFullYear(), 0, 1); }
    return invoices.filter(inv => {
      if (!inv.data.issueDate) return false;
      return new Date(inv.data.issueDate) >= start;
    });
  }, [invoices, dateFilter]);

  const filteredTimeEntries = useMemo(() => {
    if (dateFilter === 'all') return timeEntries;
    const now = new Date();
    let start: Date;
    if (dateFilter === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
    else if (dateFilter === 'quarter') { start = new Date(now.getFullYear(), now.getMonth() - 3, 1); }
    else { start = new Date(now.getFullYear(), 0, 1); }
    return timeEntries.filter(e => {
      if (!e.data.date) return false;
      return new Date(e.data.date) >= start;
    });
  }, [timeEntries, dateFilter]);

  const dateLabel = { all: 'Todo el tiempo', month: 'Este mes', quarter: 'Este trimestre', year: 'Este año' }[dateFilter];

  const activeTab = forms.reportTab || 'General';

  const tabProps = {
    projects, tasks, expenses: filteredExpenses, invoices: filteredInvoices,
    timeEntries: filteredTimeEntries, teamUsers, dailyLogs,
    rfis, submittals, punchItems, dateLabel, showToast,
  };

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Reportes
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Reportes consolidados del proyecto</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date filter */}
          <div className="flex gap-1 bg-[var(--af-bg3)] rounded-lg p-0.5">
            {[{ k: 'all', l: 'Todo' }, { k: 'month', l: 'Mes' }, { k: 'quarter', l: 'Trim.' }, { k: 'year', l: 'Año' }].map(f => (
              <button key={f.k} className={`px-2 py-1 rounded-md text-[11px] cursor-pointer transition-all ${dateFilter === f.k ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)]'}`} onClick={() => setDateFilter(f.k as any)}>{f.l}</button>
            ))}
          </div>
          {/* PDF */}
          <button className="flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-2 rounded-lg text-xs font-medium cursor-pointer border border-[var(--border)] hover:border-[var(--af-accent)]/30 transition-colors" onClick={() => {
            try {
              exportGeneralReportPDF({ projects, tasks, expenses: filteredExpenses, invoices: filteredInvoices, teamUsers, timeEntries: filteredTimeEntries });
              showToast('Reporte PDF descargado');
            } catch (err) { showToast('Error al generar PDF', 'error'); }
          }}>
            <FileText size={13} aria-hidden="true"/> PDF
          </button>
          {/* CSV (legacy) */}
          <button className="flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-2 rounded-lg text-xs font-medium cursor-pointer border border-[var(--border)] hover:border-[var(--af-accent)]/30 transition-colors" onClick={() => {
            try {
              let csv = 'Tipo,Dato,Valor\n';
              csv += `Proyectos,Total,${projects.length}\n`;
              csv += `Presupuesto,Total,${projects.reduce((s, p) => s + (p.data.budget || 0), 0)}\n`;
              csv += `Gastos,Total,${filteredExpenses.reduce((s, e) => s + (e.data.amount || 0), 0)}\n`;
              csv += `Tareas,Completadas,${tasks.filter(t => t.data.status === 'Completado').length}\n`;
              csv += `Tareas,Pendientes,${tasks.filter(t => t.data.status !== 'Completado').length}\n`;
              csv += `Equipo,Miembros,${teamUsers.length}\n`;
              csv += `Tiempo,Horas totales,${filteredTimeEntries.reduce((s, e) => s + (e.data.duration || 0), 0)} minutos\n`;
              csv += `Facturas,Total facturado,${filteredInvoices.filter(i => i.data.status !== 'Cancelada').reduce((s, i) => s + (i.data.total || 0), 0)}\n`;
              projects.forEach(p => { csv += `Proyecto,"${p.data.name}",Presupuesto: ${p.data.budget}, Progreso: ${p.data.progress}%\n`; });
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `archii-reporte-${new Date().toISOString().split('T')[0]}.csv`; a.click();
              URL.revokeObjectURL(url);
              showToast('Reporte CSV descargado');
            } catch (err) { showToast('Error al exportar', 'error'); }
          }}>
            <Download size={13} aria-hidden="true"/> CSV
          </button>
        </div>
      </div>

      {/* Report tabs */}
      <div className="flex gap-1 bg-[var(--af-bg3)] rounded-lg p-1 overflow-x-auto scrollbar-none">
        {['General', 'Financiero', 'Tiempo', 'Equipo', 'Obra'].map(tab => (
          <button key={tab} className={`px-3 py-1.5 rounded-md text-[13px] cursor-pointer transition-all whitespace-nowrap ${activeTab === tab ? 'bg-[var(--card)] text-[var(--foreground)] font-medium shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`} onClick={() => setForms(p => ({ ...p, reportTab: tab }))}>{tab}</button>
        ))}
      </div>

      {/* General Report */}
      {activeTab === 'General' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ReportsOverview {...tabProps} />
        </div>
      )}

      {/* Financial Report */}
      {activeTab === 'Financiero' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ReportsFinanciero {...tabProps} />
        </div>
      )}

      {/* Time Report */}
      {activeTab === 'Tiempo' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ReportsTiempo {...tabProps} />
        </div>
      )}

      {/* Team Report */}
      {activeTab === 'Equipo' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ReportsEquipo {...tabProps} />
        </div>
      )}

      {/* Obra Report */}
      {activeTab === 'Obra' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ReportsObra {...tabProps} />
        </div>
      )}
    </div>
  );
}
