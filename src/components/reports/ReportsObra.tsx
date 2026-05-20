'use client';
import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { COLORS, ChartTooltip, ChartLegend } from './ChartComponents';
import { isOverdue as checkOverdue } from '@/lib/kanban-helpers';
import { FileText, Download } from 'lucide-react';
import { exportObraExcel } from '@/lib/export-excel';
import { exportObraPDF } from '@/lib/export-pdf';
import type { ReportsTabProps } from './types';

export default function ReportsObra({ projects, rfis, submittals, punchItems, dailyLogs, showToast }: ReportsTabProps) {
  const {
    rfiOpen, rfiReview, rfiResponded, rfiClosed, rfiOverdue,
    rfiStatusData, rfiProjectData,
    subDraft, subReview, subApproved, subRejected, subReturned,
    subStatusData, subApprovalRate,
    punchPending, punchProgress, punchDone, punchPct,
    punchLocationData,
  } = useMemo(() => {
    const rfiOpen = rfis.filter(r => r.data.status === 'Abierto').length;
    const rfiReview = rfis.filter(r => r.data.status === 'En revisión').length;
    const rfiResponded = rfis.filter(r => r.data.status === 'Respondido').length;
    const rfiClosed = rfis.filter(r => r.data.status === 'Cerrado').length;
    const rfiOverdue = rfis.filter(r => r.data.dueDate && r.data.status !== 'Cerrado' && r.data.status !== 'Respondido' && checkOverdue(r.data.dueDate)).length;

    const rfiStatusData = [
      { name: 'Abierto', value: rfiOpen },
      { name: 'En revisión', value: rfiReview },
      { name: 'Respondido', value: rfiResponded },
      { name: 'Cerrado', value: rfiClosed },
    ].filter(d => d.value > 0);

    const rfiByProject: Record<string, number> = {};
    rfis.forEach(r => { const pid = r.data.projectId || '_none'; rfiByProject[pid] = (rfiByProject[pid] || 0) + 1; });
    const rfiProjectData = Object.entries(rfiByProject)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([pid, count]) => ({ name: (projects.find(p => p.id === pid)?.data?.name || 'Sin proyecto').slice(0, 15), rfis: count }));

    const subDraft = submittals.filter(s => s.data.status === 'Borrador').length;
    const subReview = submittals.filter(s => s.data.status === 'En revisión').length;
    const subApproved = submittals.filter(s => s.data.status === 'Aprobado').length;
    const subRejected = submittals.filter(s => s.data.status === 'Rechazado').length;
    const subReturned = submittals.filter(s => s.data.status === 'Devuelto').length;

    const subStatusData = [
      { name: 'Borrador', value: subDraft },
      { name: 'En revisión', value: subReview },
      { name: 'Aprobado', value: subApproved },
      { name: 'Rechazado', value: subRejected },
      { name: 'Devuelto', value: subReturned },
    ].filter(d => d.value > 0);

    const subApprovalRate = submittals.length > 0 ? Math.round((subApproved / submittals.length) * 100) : 0;

    const punchPending = punchItems.filter(p => p.data.status === 'Pendiente').length;
    const punchProgress = punchItems.filter(p => p.data.status === 'En progreso').length;
    const punchDone = punchItems.filter(p => p.data.status === 'Completado').length;
    const punchPct = punchItems.length > 0 ? Math.round((punchDone / punchItems.length) * 100) : 0;

    const punchByLocation: Record<string, number> = {};
    punchItems.forEach(p => { const loc = p.data.location || 'Otro'; punchByLocation[loc] = (punchByLocation[loc] || 0) + 1; });
    const punchLocationData = Object.entries(punchByLocation)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    return {
      rfiOpen, rfiReview, rfiResponded, rfiClosed, rfiOverdue,
      rfiStatusData, rfiProjectData,
      subDraft, subReview, subApproved, subRejected, subReturned,
      subStatusData, subApprovalRate,
      punchPending, punchProgress, punchDone, punchPct,
      punchLocationData,
    };
  }, [rfis, submittals, punchItems, projects]);

  return (<>
    {/* Export buttons */}
    <div className="flex items-center gap-2 justify-end">
      <button className="flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-[var(--border)] hover:border-[var(--af-accent)]/30 transition-colors" onClick={() => { try { exportObraPDF({ rfis, submittals, punchItems, dailyLogs, projects }); showToast('Reporte PDF descargado'); } catch { showToast('Error al generar PDF', 'error'); } }}>
        <FileText size={12} aria-hidden="true"/> PDF
      </button>
      <button className="flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-[var(--border)] hover:border-[var(--af-accent)]/30 transition-colors" onClick={() => { try { exportObraExcel({ rfis, submittals, punchItems, dailyLogs, projects }); showToast('Reporte Excel descargado'); } catch { showToast('Error al generar Excel', 'error'); } }}>
        <Download size={12} aria-hidden="true"/> Excel
      </button>
    </div>

    {/* RFIs Overview */}
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">RFIs (Request for Information)</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-blue-500/10 rounded-lg p-3 text-center"><div className="text-2xl font-bold text-blue-400">{rfiOpen}</div><div className="text-[11px] text-[var(--muted-foreground)] mt-1">Abiertos</div></div>
        <div className="bg-amber-500/10 rounded-lg p-3 text-center"><div className="text-2xl font-bold text-amber-400">{rfiReview}</div><div className="text-[11px] text-[var(--muted-foreground)] mt-1">En revisión</div></div>
        <div className="bg-emerald-500/10 rounded-lg p-3 text-center"><div className="text-2xl font-bold text-emerald-400">{rfiResponded}</div><div className="text-[11px] text-[var(--muted-foreground)] mt-1">Respondidos</div></div>
        <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-[var(--foreground)]">{rfiClosed}</div><div className="text-[11px] text-[var(--muted-foreground)] mt-1">Cerrados</div></div>
      </div>
      {rfiOverdue > 0 && <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4 flex items-center gap-2"><span className="text-red-400">⚠️</span><span className="text-sm text-red-400 font-medium">{rfiOverdue} RFI{rfiOverdue !== 1 ? 's' : ''} vencido{rfiOverdue !== 1 ? 's' : ''}</span></div>}
      {rfiStatusData.length > 0 && <div className="mb-4"><div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide mb-2">Distribución por estado</div><ResponsiveContainer width="100%" height={160}><PieChart><Pie data={rfiStatusData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3} dataKey="value" stroke="none">{rfiStatusData.map((_, i) => <Cell key={i} fill={['#3b82f6', '#f59e0b', '#10b981', '#6b7280'][i % 4]} />)}</Pie><Tooltip content={<ChartTooltip />} /><Legend content={<ChartLegend />} /></PieChart></ResponsiveContainer></div>}
      {rfiProjectData.length > 0 && <div><div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide mb-2">RFIs por proyecto</div><ResponsiveContainer width="100%" height={140}><BarChart data={rfiProjectData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--af-bg4)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="rfis" name="RFIs" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={16} /></BarChart></ResponsiveContainer></div>}
    </div>

    {/* Submittals Overview */}
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">Submittals</h3>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
        <div className="bg-gray-500/10 rounded-lg p-3 text-center"><div className="text-xl font-bold text-gray-400">{subDraft}</div><div className="text-[11px] text-[var(--muted-foreground)] mt-1">Borrador</div></div>
        <div className="bg-amber-500/10 rounded-lg p-3 text-center"><div className="text-xl font-bold text-amber-400">{subReview}</div><div className="text-[11px] text-[var(--muted-foreground)] mt-1">En revisión</div></div>
        <div className="bg-emerald-500/10 rounded-lg p-3 text-center"><div className="text-xl font-bold text-emerald-400">{subApproved}</div><div className="text-[11px] text-[var(--muted-foreground)] mt-1">Aprobado</div></div>
        <div className="bg-red-500/10 rounded-lg p-3 text-center"><div className="text-xl font-bold text-red-400">{subRejected}</div><div className="text-[11px] text-[var(--muted-foreground)] mt-1">Rechazado</div></div>
        <div className="bg-purple-500/10 rounded-lg p-3 text-center"><div className="text-xl font-bold text-purple-400">{subReturned}</div><div className="text-[11px] text-[var(--muted-foreground)] mt-1">Devuelto</div></div>
      </div>
      {subStatusData.length > 0 && <div><div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide mb-2">Distribución por estado</div><ResponsiveContainer width="100%" height={160}><PieChart><Pie data={subStatusData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3} dataKey="value" stroke="none">{subStatusData.map((_, i) => <Cell key={i} fill={['#6b7280', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'][i % 5]} />)}</Pie><Tooltip content={<ChartTooltip />} /><Legend content={<ChartLegend />} /></PieChart></ResponsiveContainer></div>}
      {submittals.length > 0 && <div className="mt-4 text-xs text-[var(--muted-foreground)]">Tasa de aprobación: <span className="font-semibold text-emerald-400">{subApprovalRate}%</span> de {submittals.length} total</div>}
    </div>

    {/* Punch List Overview */}
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">Punch List</h3>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-[var(--foreground)]">{punchItems.length}</div><div className="text-[11px] text-[var(--muted-foreground)] mt-1">Total</div></div>
        <div className="bg-red-500/10 rounded-lg p-3 text-center"><div className="text-2xl font-bold text-red-400">{punchPending}</div><div className="text-[11px] text-[var(--muted-foreground)] mt-1">Pendientes</div></div>
        <div className="bg-amber-500/10 rounded-lg p-3 text-center"><div className="text-2xl font-bold text-amber-400">{punchProgress}</div><div className="text-[11px] text-[var(--muted-foreground)] mt-1">En progreso</div></div>
        <div className="bg-emerald-500/10 rounded-lg p-3 text-center"><div className="text-2xl font-bold text-emerald-400">{punchDone}</div><div className="text-[11px] text-[var(--muted-foreground)] mt-1">Completados</div></div>
      </div>
      <div className="bg-[var(--af-bg3)] rounded-lg p-3 mb-4">
        <div className="flex justify-between text-xs mb-1"><span className="text-[var(--foreground)]">Progreso general</span><span className="text-[var(--muted-foreground)]">{punchPct}% completado</span></div>
        <div className="w-full bg-[var(--af-bg2)] rounded-full h-3"><div className="bg-emerald-400 rounded-full h-3 transition-all" style={{ width: `${punchPct}%` }} /></div>
      </div>
      {punchLocationData.length > 0 && <div><div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide mb-2">Items por ubicación</div><ResponsiveContainer width="100%" height={160}><PieChart><Pie data={punchLocationData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3} dataKey="value" stroke="none">{punchLocationData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip content={<ChartTooltip />} /><Legend content={<ChartLegend />} /></PieChart></ResponsiveContainer></div>}
    </div>

    {/* Summary Card */}
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">Resumen de Obra</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between py-2 border-b border-[var(--border)]"><span className="text-sm text-[var(--muted-foreground)]">Total RFIs creados</span><span className="text-sm font-bold">{rfis.length}</span></div>
        <div className="flex items-center justify-between py-2 border-b border-[var(--border)]"><span className="text-sm text-[var(--muted-foreground)]">RFIs resueltos (respondidos + cerrados)</span><span className="text-sm font-bold text-emerald-400">{rfiResponded + rfiClosed}</span></div>
        <div className="flex items-center justify-between py-2 border-b border-[var(--border)]"><span className="text-sm text-[var(--muted-foreground)]">Submittals totales</span><span className="text-sm font-bold">{submittals.length}</span></div>
        <div className="flex items-center justify-between py-2 border-b border-[var(--border)]"><span className="text-sm text-[var(--muted-foreground)]">Submittals pendientes de revisión</span><span className="text-sm font-bold text-amber-400">{subReview}</span></div>
        <div className="flex items-center justify-between py-2 border-b border-[var(--border)]"><span className="text-sm text-[var(--muted-foreground)]">Items Punch List</span><span className="text-sm font-bold">{punchItems.length}</span></div>
        <div className="flex items-center justify-between py-2 border-b border-[var(--border)]"><span className="text-sm text-[var(--muted-foreground)]">Punch List completado</span><span className="text-sm font-bold text-emerald-400">{punchPct}%</span></div>
        <div className="flex items-center justify-between py-2"><span className="text-sm text-[var(--muted-foreground)]">Bitácoras registradas</span><span className="text-sm font-bold">{dailyLogs.length}</span></div>
      </div>
    </div>
  </>);
}
