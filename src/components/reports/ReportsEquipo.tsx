'use client';
import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { getInitials, avatarColor, fmtDuration } from '@/lib/helpers';
import { isOverdue as checkOverdue } from '@/lib/kanban-helpers';
import { COLORS, ChartTooltip, ChartLegend } from './ChartComponents';
import { FileText, Download } from 'lucide-react';
import { exportTeamExcel } from '@/lib/export-excel';
import { exportTeamPDF } from '@/lib/export-pdf';
import type { ReportsTabProps } from './types';

export default function ReportsEquipo({ teamUsers, tasks, timeEntries, showToast }: ReportsTabProps) {
  const roleDistData = useMemo(() => {
    const roles: Record<string, number> = {};
    teamUsers.forEach(u => { const r = u.data.role || 'Miembro'; roles[r] = (roles[r] || 0) + 1; });
    return Object.entries(roles).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [teamUsers]);

  const membersByRole: Record<string, number> = {};
  teamUsers.forEach(u => { const r = u.data.role || 'Miembro'; membersByRole[r] = (membersByRole[r] || 0) + 1; });
  const tasksPerMember: Record<string, { total: number; done: number; overdue: number }> = {};
  teamUsers.forEach(u => { tasksPerMember[u.id] = { total: 0, done: 0, overdue: 0 }; });
  tasks.forEach(t => { if (t.data.assigneeId && tasksPerMember[t.data.assigneeId]) { tasksPerMember[t.data.assigneeId].total++; if (t.data.status === 'Completado') tasksPerMember[t.data.assigneeId].done++; if (t.data.status !== 'Completado' && t.data.dueDate && checkOverdue(t.data.dueDate)) tasksPerMember[t.data.assigneeId].overdue++; } });
  const hoursPerMember: Record<string, number> = {};
  timeEntries.forEach(e => { hoursPerMember[e.data.userId] = (hoursPerMember[e.data.userId] || 0) + (e.data.duration || 0); });

  return (<>
    {/* Export buttons */}
    <div className="flex items-center gap-2 justify-end">
      <button className="flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-[var(--border)] hover:border-[var(--af-accent)]/30 transition-colors" onClick={() => { try { exportTeamPDF({ teamUsers, tasks, timeEntries }); showToast('Reporte PDF descargado'); } catch { showToast('Error al generar PDF', 'error'); } }}>
        <FileText size={12} aria-hidden="true"/> PDF
      </button>
      <button className="flex items-center gap-1.5 bg-[var(--af-bg3)] text-[var(--foreground)] px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-[var(--border)] hover:border-[var(--af-accent)]/30 transition-colors" onClick={() => { try { exportTeamExcel(teamUsers, tasks, timeEntries); showToast('Reporte Excel descargado'); } catch { showToast('Error al generar Excel', 'error'); } }}>
        <Download size={12} aria-hidden="true"/> Excel
      </button>
    </div>

    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="text-[15px] font-semibold mb-4">Distribucion por Roles</h3>
      {roleDistData.length === 0 ? <div className="text-sm text-[var(--muted-foreground)]">Sin miembros</div> : (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={roleDistData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={3} dataKey="value" stroke="none">
              {roleDistData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend content={<ChartLegend />} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="text-[15px] font-semibold mb-4">Productividad por Miembro</h3>
      <div className="md:hidden space-y-2">
        {teamUsers.sort((a, b) => (tasksPerMember[b.id]?.total || 0) - (tasksPerMember[a.id]?.total || 0)).map(u => {
          const stats = tasksPerMember[u.id] || { total: 0, done: 0, overdue: 0 };
          const hrs = hoursPerMember[u.id] || 0;
          return (
            <div key={u.id} className="bg-[var(--af-bg3)] rounded-lg p-3 border border-[var(--border)] flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: avatarColor(u.id) }}>{getInitials(u.data.name)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{u.data.name}</div>
                <div className="flex gap-3 mt-1 text-[10px] text-[var(--muted-foreground)]">
                  <span>{stats.total} tareas</span>
                  <span className="text-emerald-400">{stats.done} listas</span>
                  <span>{stats.overdue > 0 ? <span className="text-red-400">{stats.overdue} vencidas</span> : '0 vencidas'}</span>
                  <span>{fmtDuration(hrs)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--border)] text-[var(--muted-foreground)] text-xs"><th className="text-left py-2 pr-3">Miembro</th><th className="text-center py-2 px-2">Tareas</th><th className="text-center py-2 px-2">Listas</th><th className="text-center py-2 px-2">Vencidas</th><th className="text-center py-2 pl-2">Horas</th></tr></thead>
          <tbody>
            {teamUsers.sort((a, b) => (tasksPerMember[b.id]?.total || 0) - (tasksPerMember[a.id]?.total || 0)).map(u => {
              const stats = tasksPerMember[u.id] || { total: 0, done: 0, overdue: 0 };
              const hrs = hoursPerMember[u.id] || 0;
              return (<tr key={u.id} className="border-b border-[var(--border)] last:border-0"><td className="py-2 pr-3"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: avatarColor(u.id) }}>{getInitials(u.data.name)}</div><span className="text-xs truncate max-w-[80px]">{u.data.name}</span></div></td><td className="text-center py-2 px-2 text-xs">{stats.total}</td><td className="text-center py-2 px-2 text-xs text-emerald-400">{stats.done}</td><td className="text-center py-2 px-2 text-xs">{stats.overdue > 0 ? <span className="text-red-400">{stats.overdue}</span> : '0'}</td><td className="text-center py-2 pl-2 text-xs">{fmtDuration(hrs)}</td></tr>);
            })}
          </tbody>
        </table>
      </div>
    </div>
  </>);
}
