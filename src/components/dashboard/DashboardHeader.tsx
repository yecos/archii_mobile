'use client';
import React from 'react';
import { AlertTriangle, Download, FileText, CalendarDays, Clock, CircleHelp, DollarSign, CheckCircle2 } from 'lucide-react';
import { exportGeneralReportPDF } from '@/lib/export-pdf';
import { exportProjectsExcel } from '@/lib/export-excel';
import type { Task, Expense, Invoice, TimeEntry, Project, Meeting, TeamUser } from '@/lib/types';

interface DashboardHeaderProps {
  greeting: string;
  userName: string;
  dateFormatted: string;
  unreadCount: number;
  overdueCount: number;
  todayMeetings: Meeting[];
  todayDueTasks: Task[];
  overdueRFIs: number;
  overdueInvoices: number;
  navigateTo: (screen: string) => void;
  showToast: (msg: string, type?: string) => void;
  projects: Project[];
  tasks: Task[];
  expenses: Expense[];
  invoices: Invoice[];
  teamUsers: TeamUser[];
  timeEntries: TimeEntry[];
}

export default function DashboardHeader({
  greeting, userName, dateFormatted, unreadCount, overdueCount,
  todayMeetings, todayDueTasks, overdueRFIs, overdueInvoices,
  navigateTo, showToast, projects, tasks, expenses, invoices, teamUsers, timeEntries,
}: DashboardHeaderProps) {
  return (
    <div className="bg-gradient-to-br from-[var(--card)] via-[var(--af-bg3)] to-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 relative overflow-hidden">
      {/* Subtle decorative gradient blob */}
      <div className="absolute -top-20 -right-20 w-60 h-60 bg-[var(--af-accent)]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative">
        {/* Top row: greeting + actions */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-[11px] text-[var(--af-text3)] mb-1 capitalize">{dateFormatted}</div>
            <div style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg sm:text-xl">
              {greeting}, <span className="text-[var(--af-accent)]">{userName}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {unreadCount > 0 && (
              <div className="relative">
                <button className="w-9 h-9 rounded-xl bg-[var(--af-bg4)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg3)] transition-colors" onClick={() => navigateTo('chat')}>
                  <span className="text-sm">🔔</span>
                </button>
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
              </div>
            )}
            <button className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--af-accent)] transition-colors px-2 py-1.5 rounded-lg bg-[var(--af-bg4)] border border-[var(--border)]" onClick={() => { try { exportGeneralReportPDF({ projects, tasks, expenses, invoices, teamUsers, timeEntries }); showToast('Reporte PDF descargado'); } catch { showToast('Error', 'error'); } }}>
              <FileText size={11} aria-hidden="true"/> PDF
            </button>
            <button className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--af-accent)] transition-colors px-2 py-1.5 rounded-lg bg-[var(--af-bg4)] border border-[var(--border)]" onClick={() => { try { exportProjectsExcel(projects, tasks, expenses); showToast('Excel descargado'); } catch { showToast('Error', 'error'); } }}>
              <Download size={11} aria-hidden="true"/> Excel
            </button>
          </div>
        </div>

        {/* Quick summary pills */}
        <div className="flex flex-wrap gap-2">
          {overdueCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/15 transition-colors" onClick={() => navigateTo('tasks')}>
              <AlertTriangle size={12} className="text-red-400" aria-hidden="true"/>
              <span className="text-[11px] text-red-400 font-medium">{overdueCount} tarea{overdueCount !== 1 ? 's' : ''} vencida{overdueCount !== 1 ? 's' : ''}</span>
            </div>
          )}
          {todayMeetings.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 cursor-pointer hover:bg-purple-500/15 transition-colors" onClick={() => navigateTo('calendar')}>
              <CalendarDays size={12} className="text-purple-400" aria-hidden="true"/>
              <span className="text-[11px] text-purple-400 font-medium">{todayMeetings.length} reunión{todayMeetings.length !== 1 ? 'es' : ''} hoy</span>
            </div>
          )}
          {todayDueTasks.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:bg-amber-500/15 transition-colors" onClick={() => navigateTo('tasks')}>
              <Clock size={12} className="text-amber-400" aria-hidden="true"/>
              <span className="text-[11px] text-amber-400 font-medium">{todayDueTasks.length} vence{todayDueTasks.length !== 1 ? 'n' : ''} hoy</span>
            </div>
          )}
          {overdueRFIs > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 cursor-pointer hover:bg-blue-500/15 transition-colors" onClick={() => navigateTo('rfis')}>
              <CircleHelp size={12} className="text-blue-400" aria-hidden="true"/>
              <span className="text-[11px] text-blue-400 font-medium">{overdueRFIs} RFI{overdueRFIs !== 1 ? 's' : ''} vencida{overdueRFIs !== 1 ? 's' : ''}</span>
            </div>
          )}
          {overdueInvoices > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:bg-amber-500/15 transition-colors" onClick={() => navigateTo('invoices')}>
              <DollarSign size={12} className="text-amber-400" aria-hidden="true"/>
              <span className="text-[11px] text-amber-400 font-medium">{overdueInvoices} factura{overdueInvoices !== 1 ? 's' : ''} vencida{overdueInvoices !== 1 ? 's' : ''}</span>
            </div>
          )}
          {overdueCount === 0 && todayMeetings.length === 0 && todayDueTasks.length === 0 && overdueRFIs === 0 && overdueInvoices === 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 size={12} className="text-emerald-400" aria-hidden="true"/>
              <span className="text-[11px] text-emerald-400 font-medium">Todo al día</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
