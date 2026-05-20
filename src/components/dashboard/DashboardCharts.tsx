'use client';
import React from 'react';
import { TrendingUp, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts';
import { fmtCOP } from '@/lib/helpers';

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-lg text-[12px]">
      {label && <div className="font-semibold text-[var(--foreground)] mb-1">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-[var(--muted-foreground)]">{p.name}:</span>
          <span className="font-semibold">{typeof p.value === 'number' && p.value > 9999 ? fmtCOP(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

interface DashboardChartsProps {
  revenueTrend: { name: string; facturado: number; cobrado: number }[];
  teamWorkload: { name: string; activas: number; completadas: number; pendientes: number }[];
  navigateTo: (screen: string) => void;
}

export default function DashboardCharts({
  revenueTrend, teamWorkload, navigateTo,
}: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Revenue Trend */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-semibold flex items-center gap-2">
            <TrendingUp size={14} className="text-[var(--af-accent)]" aria-hidden="true"/> Tendencia de Ingresos
          </div>
          <span className="text-[9px] text-[var(--af-text3)] px-2 py-0.5 rounded-full bg-[var(--af-bg4)]">6 meses</span>
        </div>
        {revenueTrend.some(d => d.facturado > 0 || d.cobrado > 0) ? (
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={revenueTrend} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--af-bg4)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000000 ? `${(v/1000000).toFixed(0)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="facturado" name="Facturado" stroke="#c8a96e" fill="rgba(200,169,110,0.1)" strokeWidth={2} />
              <Area type="monotone" dataKey="cobrado" name="Cobrado" stroke="#10b981" fill="rgba(16,185,129,0.08)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-10 text-[var(--af-text3)] text-sm">Sin datos de facturación aún</div>
        )}
      </div>

      {/* Team Workload Chart */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-semibold flex items-center gap-2">
            <Users size={14} className="text-purple-400" aria-hidden="true"/> Carga de Trabajo
          </div>
          <button className="text-[10px] text-[var(--af-accent)] cursor-pointer hover:underline flex items-center gap-1" onClick={() => navigateTo('reports')}>
            Reportes <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
        {teamWorkload.length === 0 ? (
          <div className="text-center py-10 text-[var(--af-text3)] text-sm">Sin tareas asignadas al equipo</div>
        ) : (
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={teamWorkload} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--af-bg4)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="activas" name="Activas" fill="#3b82f6" radius={[2, 2, 0, 0]} stackId="a" barSize={14} />
              <Bar dataKey="completadas" name="Completadas" fill="#10b981" radius={[0, 0, 0, 0]} stackId="a" barSize={14} />
              <Bar dataKey="pendientes" name="Pendientes" fill="rgba(200,169,110,0.4)" radius={[2, 2, 0, 0]} stackId="a" barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
