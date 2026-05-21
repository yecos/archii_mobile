'use client';
import React from 'react';
import { TrendingUp } from 'lucide-react';
import { fmtDate } from '@/lib/helpers';
import type { NotifEntry, FirestoreTimestamp } from '@/lib/types';

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  time: FirestoreTimestamp | undefined;
  icon: string;
  color: string;
}

interface DashboardActivityProps {
  recentActivity: ActivityItem[];
  unreadNotifs: NotifEntry[];
  readNotifs: NotifEntry[];
  unreadCount: number;
  navigateTo: (screen: string) => void;
  fmtDate: (time: FirestoreTimestamp | undefined) => string;
}

export default function DashboardActivity({
  recentActivity, unreadNotifs, readNotifs, unreadCount, navigateTo, fmtDate,
}: DashboardActivityProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Recent Activity */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-semibold flex items-center gap-2">
            <TrendingUp size={14} className="text-emerald-400" aria-hidden="true"/> Actividad Reciente
          </div>
        </div>
        {recentActivity.length === 0 ? (
          <div className="text-center py-8 text-[var(--af-text3)] text-sm">Sin actividad reciente</div>
        ) : (
          <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
            {recentActivity.map(item => (
              <div key={item.id + item.type} className="flex items-start gap-2.5 group cursor-pointer hover:bg-[var(--af-bg3)] rounded-lg p-2 -mx-1 transition-colors" onClick={() => {
                if (item.type === 'rfi') navigateTo('rfis');
                else if (item.type === 'submittal') navigateTo('submittals');
                else if (item.type === 'punch') navigateTo('punchList');
                else if (item.type === 'task') navigateTo('tasks');
              }}>
                <div className={`w-6 h-6 rounded-lg ${item.color} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5`}>{item.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate">{item.title}</div>
                  <div className="text-[10px] text-[var(--af-text3)] truncate">{item.subtitle}</div>
                </div>
                <span className="text-[10px] text-[var(--af-text3)] flex-shrink-0 mt-0.5">{fmtDate(item.time)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notifications */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-semibold flex items-center gap-2">
            <span className="text-sm">🔔</span> Notificaciones
          </div>
          {unreadCount > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">{unreadCount} sin leer</span>}
        </div>
        <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
          {unreadNotifs.length === 0 && readNotifs.length === 0 ? (
            <div className="text-center py-8 text-[var(--af-text3)] text-sm">Sin notificaciones</div>
          ) : (
            <>
              {unreadNotifs.map((n: NotifEntry) => (
                <div key={n.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-[var(--af-accent)]/5 border border-[var(--af-accent)]/10 cursor-pointer hover:bg-[var(--af-accent)]/8 transition-colors">
                  <span className="text-[13px] mt-0.5 flex-shrink-0">{n.icon || '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate">{n.title}</div>
                    <div className="text-[10px] text-[var(--af-text3)] truncate">{n.body}</div>
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--af-accent)] mt-2 flex-shrink-0" />
                </div>
              ))}
              {readNotifs.map((n: NotifEntry) => (
                <div key={n.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[var(--af-bg3)] transition-colors cursor-pointer">
                  <span className="text-[13px] mt-0.5 flex-shrink-0 opacity-60">{n.icon || '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-[var(--muted-foreground)] truncate">{n.title}</div>
                    <div className="text-[10px] text-[var(--af-text3)] truncate">{n.body}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
