'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useNotificationsContext } from '@/hooks/useNotifications';
import { Bell, MessageCircle, ClipboardList, Calendar, Package, Folder, CheckCircle, Clock, Volume2, Check, Loader, XCircle, CircleHelp, FileCheck, ListChecks, Mail, Smartphone, Radio, Settings } from 'lucide-react';
import { getExternalChannelPrefs, setExternalChannelPref } from '@/lib/notify-unified';
import { registerPushSubscription, unregisterPushSubscription, isPushSupported } from '@/lib/push-service';

export default function NotifPanel() {
  const { navigateTo } = useApp();
  const {
    showNotifPanel, setShowNotifPanel, notifFilterCat, setNotifFilterCat,
    notifHistory, notifPrefs, toggleNotifPref, notifSound, setNotifSound,
    notifPermission, requestNotifPermission, markNotifRead, markAllNotifRead,
    clearNotifHistory, unreadCount,
  } = useNotificationsContext();

  // Canales externos
  const [channelPrefs, setChannelPrefs] = useState({ whatsapp: true, email: true, push: true });
  const [pushSupported, setPushSupported] = useState(false);
  const [pushRegistering, setPushRegistering] = useState(false);
  const [showChannels, setShowChannels] = useState(false);

  useEffect(() => {
    setChannelPrefs(getExternalChannelPrefs());
    setPushSupported(isPushSupported());
  }, []);

  const toggleChannel = useCallback((channel: 'whatsapp' | 'email' | 'push') => {
    const newPrefs = { ...channelPrefs, [channel]: !channelPrefs[channel] };
    setChannelPrefs(newPrefs);
    setExternalChannelPref(channel, newPrefs[channel]);
  }, [channelPrefs]);

  const togglePush = useCallback(async () => {
    setPushRegistering(true);
    try {
      const registered = await registerPushSubscription();
      if (registered) {
        toggleChannel('push');
      }
    } catch {}
    setPushRegistering(false);
  }, [toggleChannel]);

  if (!showNotifPanel) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setShowNotifPanel(false)} />
      <div className="absolute right-2 sm:right-4 z-[60] w-[calc(100vw-16px)] sm:w-[400px] max-h-[85dvh] bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden animate-fadeIn flex flex-col" style={{ top: 'calc(60px + env(safe-area-inset-top, 0px))', animation: 'fadeIn 0.2s ease' }}>
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="text-[15px] font-semibold">Notificaciones</div>
              {unreadCount > 0 && <span className="min-w-[20px] h-[20px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1">{unreadCount}</span>}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button className="text-[11px] text-[var(--af-accent)] cursor-pointer hover:underline" onClick={markAllNotifRead}>
                  Leer todas
                </button>
              )}
              <button className="text-[11px] text-[var(--muted-foreground)] cursor-pointer hover:text-red-400" onClick={clearNotifHistory}>
                Limpiar
              </button>
            </div>
          </div>
          {/* Category filter tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
            {[
              { key: 'all', label: 'Todo', Icon: Bell },
              { key: 'chat', label: 'Chat', Icon: MessageCircle },
              { key: 'task', label: 'Tareas', Icon: ClipboardList },
              { key: 'meeting', label: 'Reuniones', Icon: Calendar },
              { key: 'inventory', label: 'Inventario', Icon: Package },
              { key: 'project', label: 'Proyectos', Icon: Folder },
              { key: 'approval', label: 'Aprob.', Icon: CheckCircle },
              { key: 'reminder', label: 'Record.', Icon: Clock },
            ].map(f => (
              <button
                key={f.key}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium cursor-pointer transition-all whitespace-nowrap flex-shrink-0 ${notifFilterCat === f.key ? 'bg-[var(--af-accent)] text-background' : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
                onClick={() => setNotifFilterCat(f.key)}
              ><f.Icon size={12} /> {f.label}</button>
            ))}
          </div>
        </div>

        {/* Permission prompt */}
        {notifPermission !== 'granted' && (
          <div className="p-4 bg-amber-500/5 border-b border-[var(--border)] flex-shrink-0">
            <div className="flex items-center gap-3">
              <Bell size={20} className="stroke-[var(--af-accent)]" aria-hidden="true"/>
              <div className="flex-1">
                <div className="text-[13px] font-medium">Activar notificaciones del sistema</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">Para recibir alertas incluso con la app cerrada</div>
              </div>
              <button className="px-3 py-1.5 bg-[var(--af-accent)] text-background rounded-lg text-[11px] font-semibold cursor-pointer hover:bg-[var(--af-accent2)] transition-colors border-none flex-shrink-0" onClick={requestNotifPermission}>
                Activar
              </button>
            </div>
          </div>
        )}

        {/* Notification list */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {(() => {
            const filtered = notifFilterCat === 'all' ? notifHistory : notifHistory.filter((n: any) => n.type === notifFilterCat);
            if (filtered.length === 0) return (
              <div className="p-8 text-center">
                <Bell size={28} className="stroke-[var(--muted-foreground)] mb-2" aria-hidden="true"/>
                <div className="text-sm text-[var(--muted-foreground)]">{notifFilterCat === 'all' ? 'Sin notificaciones' : 'Sin notificaciones de esta categoría'}</div>
                <div className="text-[11px] text-[var(--af-text3)] mt-1">Las alertas aparecerán aquí</div>
              </div>
            );
            return filtered.slice(0, 50).map((n: any) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 p-3 cursor-pointer transition-colors hover:bg-[var(--af-bg3)] border-b border-[var(--border)]/50 ${!n.read ? 'bg-[var(--af-accent)]/5' : ''}`}
                onClick={() => {
                  markNotifRead(n.id);
                  if (n.screen) {
                    navigateTo(n.screen, n.itemId);
                    setShowNotifPanel(false);
                  }
                }}
              >
                <div className="flex-shrink-0 mt-0.5"><Bell size={16} className="stroke-[var(--muted-foreground)]" aria-hidden="true"/></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className={`text-[13px] leading-snug ${!n.read ? 'font-semibold' : 'font-medium'}`}>{n.title}</div>
                    {n.type && <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${({chat:'bg-blue-500/10 text-blue-400',task:'bg-purple-500/10 text-purple-400',meeting:'bg-amber-500/10 text-amber-400',inventory:'bg-emerald-500/10 text-emerald-400',project:'bg-cyan-500/10 text-cyan-400',approval:'bg-pink-500/10 text-pink-400',reminder:'bg-red-500/10 text-red-400'} as any)[n.type] || 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]'}`}>{n.type}</span>}
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5 line-clamp-2">{n.body}</div>
                  <div className="text-[10px] text-[var(--af-text3)] mt-1">
                    {(() => {
                      const d = new Date(n.timestamp);
                      const now = new Date();
                      const diff = now.getTime() - d.getTime();
                      if (diff < 60000) return 'Ahora mismo';
                      if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
                      if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)} h`;
                      return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
                    })()}
                  </div>
                </div>
                {!n.read && <div className="w-2 h-2 rounded-full bg-[var(--af-accent)] flex-shrink-0 mt-2" />}
              </div>
            ));
          })()}
        </div>

        {/* Settings footer */}
        <div className="p-3 border-t border-[var(--border)] bg-[var(--af-bg3)] flex-shrink-0">
          {/* Toggle external channels */}
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Configurar alertas</div>
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--foreground)] hover:bg-[var(--af-bg4)] transition-all"
              onClick={() => setShowChannels(!showChannels)}
            >
              <Settings size={10} aria-hidden="true"/> Canales externos
            </button>
          </div>

          {/* External channels panel (collapsible) */}
          {showChannels && (
            <div className="mb-2 p-2.5 bg-[var(--card)] rounded-lg border border-[var(--border)]">
              <div className="text-[10px] text-[var(--muted-foreground)] mb-2">Recibir notificaciones fuera de la app:</div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] cursor-pointer transition-all ${channelPrefs.whatsapp ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border border-[var(--border)]'}`}
                  onClick={() => toggleChannel('whatsapp')}
                >
                  <MessageCircle size={11} aria-hidden="true"/> WhatsApp
                  {channelPrefs.whatsapp && <Check size={10} className="stroke-current" strokeWidth={3} aria-hidden="true"/>}
                </button>
                <button
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] cursor-pointer transition-all ${channelPrefs.email ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border border-[var(--border)]'}`}
                  onClick={() => toggleChannel('email')}
                >
                  <Mail size={11} aria-hidden="true"/> Email
                  {channelPrefs.email && <Check size={10} className="stroke-current" strokeWidth={3} aria-hidden="true"/>}
                </button>
                <button
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] cursor-pointer transition-all ${channelPrefs.push ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border border-[var(--border)]'}`}
                  onClick={() => {
                    if (!channelPrefs.push) {
                      togglePush();
                    } else {
                      unregisterPushSubscription().catch(() => {});
                      toggleChannel('push');
                    }
                  }}
                  disabled={pushRegistering}
                >
                  {pushRegistering ? <Loader size={11} className="animate-spin" aria-hidden="true"/> : <Smartphone size={11} aria-hidden="true"/>}
                  {pushRegistering ? '...' : 'Push'}
                  {channelPrefs.push && !pushRegistering && <Check size={10} className="stroke-current" strokeWidth={3} aria-hidden="true"/>}
                </button>
              </div>
              {!pushSupported && (
                <div className="text-[9px] text-[var(--af-text3)] mt-1.5 flex items-center gap-1">
                  <Radio size={9} aria-hidden="true"/> Push requiere configuración del servidor (VAPID keys)
                </div>
              )}
            </div>
          )}

          {/* Category toggles */}
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { key: 'chat', label: 'Chat', Icon: MessageCircle },
              { key: 'tasks', label: 'Tareas', Icon: ClipboardList },
              { key: 'meetings', label: 'Reuniones', Icon: Calendar },
              { key: 'approvals', label: 'Aprobaciones', Icon: CheckCircle },
              { key: 'inventory', label: 'Inventario', Icon: Package },
              { key: 'projects', label: 'Proyectos', Icon: Folder },
              { key: 'rfis', label: 'RFIs', Icon: CircleHelp },
              { key: 'submittals', label: 'Submittals', Icon: FileCheck },
              { key: 'punchList', label: 'Punch List', Icon: ListChecks },
            ].map(p => (
              <button
                key={p.key}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] cursor-pointer transition-all ${notifPrefs[p.key] ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border border-[var(--af-accent)]/30' : 'bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)]'}`}
                onClick={() => toggleNotifPref(p.key)}
              >
                <p.Icon size={11} /> {p.label}
                {notifPrefs[p.key] && <Check size={10} className="stroke-current" strokeWidth={3} aria-hidden="true"/>}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)]">
            <div className="flex items-center gap-2">
              <button
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] cursor-pointer transition-all ${notifSound ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border border-[var(--af-accent)]/30' : 'bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)]'}`}
                onClick={() => setNotifSound(!notifSound)}
              ><Volume2 size={12} className="inline mr-0.5" aria-hidden="true"/> Sonido</button>
              <span className="text-[10px] text-[var(--af-text3)]">
                {notifPermission === 'granted' ? <><CheckCircle size={10} className="inline mr-0.5 text-emerald-400" aria-hidden="true"/> OS activas</> : notifPermission === 'denied' ? <><XCircle size={10} className="inline mr-0.5 text-red-400" aria-hidden="true"/> OS bloqueadas</> : <><Loader size={10} className="inline mr-0.5 animate-spin" aria-hidden="true"/> Sin activar OS</>}
              </span>
            </div>
            <span className="text-[10px] text-[var(--af-text3)]">
              {notifHistory.length} total
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
