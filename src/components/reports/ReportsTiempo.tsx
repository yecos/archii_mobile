'use client';
import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { FileText, FileSpreadsheet } from 'lucide-react';
import { exportTimeReportPDF } from '@/lib/export-pdf';
import { exportTimeExcel } from '@/lib/export-excel';
import { fmtCOP, getInitials, avatarColor, fmtDuration, getWeekStart } from '@/lib/helpers';
import { ChartTooltip } from './ChartComponents';
import type { ReportsTabProps } from './types';

export default function ReportsTiempo({ timeEntries, teamUsers, projects, dateLabel, showToast }: ReportsTabProps) {
  const hoursByProjectData = useMemo(() => {
    const byProject: Record<string, number> = {};
    timeEntries.forEach(e => { byProject[e.data.projectId] = (byProject[e.data.projectId] || 0) + (e.data.duration || 0); });
    return Object.entries(byProject).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([pid, mins]) => {
      const proj = projects.find(p => p.id === pid);
      const name = (proj?.data.name || pid).length > 15 ? (proj?.data.name || pid).slice(0, 15) + '...' : (proj?.data.name || pid);
      return { name, horas: Math.round(mins / 60 * 10) / 10 };
    });
  }, [timeEntries, projects]);

  const totalHrs = timeEntries.reduce((s, e) => s + (e.data.duration || 0), 0);
  const billableHrs = timeEntries.filter(e => e.data.billable).reduce((s, e) => s + (e.data.duration || 0), 0);
  const totalBillable = timeEntries.filter(e => e.data.billable).reduce((s, e) => s + (e.data.duration || 0) * (e.data.rate || 0) / 60, 0);
  const thisWeek = timeEntries.filter(e => { if (!e.data.date) return false; const d = new Date(e.data.date); return d >= getWeekStart(); });
  const weekHrs = thisWeek.reduce((s, e) => s + (e.data.duration || 0), 0);
  const byUser: Record<string, number> = {};
  timeEntries.forEach(e => { byUser[e.data.userId] = (byUser[e.data.userId] || 0) + (e.data.duration || 0); });

  return (<>
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-semibold">Resumen de Tiempo</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--af-text3)]">{dateLabel}</span>
          <button className="text-xs text-[var(--af-accent)] cursor-pointer hover:underline" onClick={() => {
            try { exportTimeReportPDF({ timeEntries, teamUsers, projects }); showToast('PDF descargado'); } catch { showToast('Error', 'error'); }
          }}><FileText size={12} className="inline mr-1" aria-hidden="true"/>PDF</button>
          <button className="text-xs text-[var(--af-accent)] cursor-pointer hover:underline" onClick={() => {
            try { exportTimeExcel(timeEntries, projects, teamUsers); showToast('Excel descargado'); } catch { showToast('Error', 'error'); }
          }}><FileSpreadsheet size={12} className="inline mr-1" aria-hidden="true"/>Excel</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-[var(--af-accent)]">{fmtDuration(totalHrs)}</div><div className="text-[11px] text-[var(--muted-foreground)]">Total registrado</div></div>
        <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-emerald-400">{fmtDuration(billableHrs)}</div><div className="text-[11px] text-[var(--muted-foreground)]">Facturable</div></div>
        <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-blue-400">{fmtCOP(totalBillable)}</div><div className="text-[11px] text-[var(--muted-foreground)]">Valor facturable</div></div>
        <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-center"><div className="text-2xl font-bold text-[var(--foreground)]">{fmtDuration(weekHrs)}</div><div className="text-[11px] text-[var(--muted-foreground)]">Esta semana</div></div>
      </div>
    </div>
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="text-[15px] font-semibold mb-4">Horas por Proyecto</h3>
      {hoursByProjectData.length === 0 ? <div className="text-sm text-[var(--muted-foreground)]">Sin datos</div> : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={hoursByProjectData} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--af-bg4)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} unit="h" />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={90} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(212,184,122,0.06)' }} />
            <Bar dataKey="horas" name="Horas" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="text-[15px] font-semibold mb-4">Horas por Miembro</h3>
      {Object.keys(byUser).length === 0 ? <div className="text-sm text-[var(--muted-foreground)]">Sin datos</div> : (
        <div className="space-y-2">{Object.entries(byUser).sort((a, b) => b[1] - a[1]).map(([uid, mins]) => {
          const user = teamUsers.find(u => u.id === uid);
          return (<div key={uid} className="flex items-center gap-2"><div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: avatarColor(uid) }}>{user ? getInitials(user.data.name) : '?'}</div><span className="text-sm text-[var(--foreground)] flex-1">{user?.data.name || uid.substring(0, 10)}</span><span className="text-sm font-semibold">{fmtDuration(mins)}</span></div>);
        })}</div>
      )}
    </div>
  </>);
}
