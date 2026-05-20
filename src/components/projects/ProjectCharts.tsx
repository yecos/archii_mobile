'use client';
import React from 'react';
import { BarChart3, PieChart as PieIcon } from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { ChartTooltipContent } from './project-helpers';

export interface ProjectChartsProps {
  statusDist: { name: string; value: number; color: string }[];
  monthlyCreated: { name: string; total: number }[];
}

export default function ProjectCharts({
  statusDist,
  monthlyCreated,
}: ProjectChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Pie chart - status distribution */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
        <div className="text-[15px] font-semibold mb-3 flex items-center gap-2">
          <PieIcon size={16} className="text-[var(--af-accent)]" aria-hidden="true"/>
          Distribución por Estado
        </div>
        {statusDist.length === 0 ? (
          <div className="text-center py-10 text-[var(--af-text3)] text-sm">Sin datos</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={statusDist} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2} dataKey="value" stroke="none">
                  {statusDist.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
              {statusDist.map((d: any, i: number) => (
                <div key={i} className="flex items-center gap-1 text-[10px]">
                  <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  <span className="text-[var(--muted-foreground)]">{d.name}</span>
                  <span className="font-semibold">{d.value}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bar chart - monthly created */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[15px] font-semibold flex items-center gap-2">
            <BarChart3 size={16} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Proyectos Creados
          </div>
          <span className="text-[10px] text-[var(--muted-foreground)] px-2 py-0.5 rounded-full bg-[var(--af-bg4)]">6 meses</span>
        </div>
        {monthlyCreated.every(d => d.total === 0) ? (
          <div className="text-center py-10 text-[var(--af-text3)] text-sm">Sin proyectos creados en los últimos 6 meses</div>
        ) : (
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={monthlyCreated} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--af-bg4)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltipContent />} cursor={{ fill: 'rgba(200,169,110,0.06)' }} />
              <Bar dataKey="total" name="Proyectos" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={28} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
