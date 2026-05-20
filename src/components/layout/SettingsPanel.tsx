'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useNotificationsContext } from '@/hooks/useNotifications';
import { useUIStore } from '@/stores/ui-store';
import { getExternalChannelPrefs, setExternalChannelPref } from '@/lib/notify-unified';
import { registerPushSubscription, unregisterPushSubscription, isPushSupported } from '@/lib/push-service';
import { THEME_REGISTRY, getThemeGroups } from '@/lib/theme-registry';
import type { ThemeDefinition } from '@/lib/theme-registry';
import {
  Settings, Moon, Sun, Volume2, VolumeX, Bell, MessageCircle, ClipboardList,
  Calendar, Package, Folder, CheckCircle, CircleHelp, FileCheck, ListChecks,
  Check, X, User, Shield, LogOut, ChevronRight, Palette,
  Mail, Smartphone, Loader, CheckCircle2, XCircle, Crown, Building2
} from 'lucide-react';

export default function SettingsPanel() {
  const open = useUIStore(s => s.settingsOpen);
  const setSettingsOpen = useUIStore(s => s.setSettingsOpen);
  const [activeTab, setActiveTab] = useState<'appearance' | 'notifications' | 'account'>('appearance');

  const onClose = () => setSettingsOpen(false);

  // Reset to first tab when opening
  useEffect(() => {
    if (open) setActiveTab('appearance');
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const tabs = [
    { id: 'appearance' as const, label: 'Apariencia', Icon: Palette },
    { id: 'notifications' as const, label: 'Notificaciones', Icon: Bell },
    { id: 'account' as const, label: 'Cuenta', Icon: User },
  ];

  return (
    <>
      {/* Mobile: BottomSheet-style full screen from bottom */}
      <div className="md:hidden fixed inset-0 z-[70] flex flex-col bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
        <div className="flex-1" onClick={onClose} />
        <div
          className="bg-[var(--card)] rounded-t-3xl max-h-[92dvh] flex flex-col shadow-[0_-4px_40px_rgba(0,0,0,0.2)] animate-slideUp"
          onClick={e => e.stopPropagation()}
        >
          {/* iOS drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1.5 rounded-full bg-[var(--muted-foreground)]/30" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[var(--af-accent)]/15 flex items-center justify-center">
                <Settings size={16} className="stroke-[var(--af-accent)]" aria-hidden="true"/>
              </div>
              <span className="text-base font-semibold">Configuración</span>
            </div>
            <button
              aria-label="Cerrar"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--af-bg3)] transition-all cursor-pointer border-none bg-transparent"
              onClick={onClose}
            >
              <X size={18} aria-hidden="true"/>
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 px-4 py-2 border-b border-[var(--border)]">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all ${
                  activeTab === tab.id
                    ? 'bg-[var(--af-accent)] text-background'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--af-bg3)] hover:text-[var(--foreground)]'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.Icon size={14} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto overscroll-contain pb-8" style={{ WebkitOverflowScrolling: 'touch' }}>
            {activeTab === 'appearance' && <AppearanceTab onThemeChange={onClose} />}
            {activeTab === 'notifications' && <NotificationsTab />}
            {activeTab === 'account' && <AccountTab onClose={onClose} />}
          </div>
        </div>
      </div>

      {/* Desktop: centered modal */}
      <div className="hidden md:flex fixed inset-0 z-[70] items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
        <div
          className="bg-[var(--card)] border border-[var(--border)] rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl animate-scaleIn"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[var(--af-accent)]/15 flex items-center justify-center">
                <Settings size={16} className="stroke-[var(--af-accent)]" aria-hidden="true"/>
              </div>
              <div>
                <h2 className="text-lg font-bold">Configuración</h2>
                <p className="text-[11px] text-[var(--muted-foreground)]">Personaliza tu experiencia en Archii</p>
              </div>
            </div>
            <button
              aria-label="Cerrar"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--af-bg3)] transition-all cursor-pointer border-none bg-transparent"
              onClick={onClose}
            >
              <X size={18} aria-hidden="true"/>
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 px-5 py-2 border-b border-[var(--border)]">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium cursor-pointer transition-all ${
                  activeTab === tab.id
                    ? 'bg-[var(--af-accent)] text-background'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--af-bg3)] hover:text-[var(--foreground)]'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.Icon size={14} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === 'appearance' && <AppearanceTab onThemeChange={onClose} />}
            {activeTab === 'notifications' && <NotificationsTab />}
            {activeTab === 'account' && <AccountTab onClose={onClose} />}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Appearance Tab ─── */
function AppearanceTab({ onThemeChange }: { onThemeChange?: () => void }) {
  const theme = useUIStore(s => s.theme);
  const setTheme = useUIStore(s => s.setTheme);
  const toggleTheme = useUIStore(s => s.toggleTheme);
  const isDark = theme === 'dark' || theme === 'pastel-dark';
  const groups = getThemeGroups();

  return (
    <div className="space-y-6 p-4 md:p-0">
      {/* Quick toggle */}
      <div>
        <div className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Modo rapido</div>
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--af-bg3)] cursor-pointer hover:bg-[var(--af-bg4)] transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            {isDark ? <Sun size={20} className="text-amber-400" aria-hidden="true"/> : <Moon size={20} className="text-blue-400" aria-hidden="true"/>}
            <div>
              <div className="text-sm font-medium">{isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">Tema actual: {THEME_REGISTRY.find(t => t.id === theme)?.label || theme}</div>
            </div>
          </div>
          <div className={`w-12 h-7 rounded-full p-0.5 transition-colors ${isDark ? 'bg-blue-500' : 'bg-amber-400'}`}>
            <div className={`w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${isDark ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
        </button>
      </div>

      {/* Light Themes */}
      <div>
        <div className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Temas claros</div>
        <div className="space-y-2">
          {groups.light.map(t => (
            <ThemeCard
              key={t.id}
              themeDef={t}
              isActive={theme === t.id}
              onSelect={() => { setTheme(t.id); onThemeChange?.(); }}
            />
          ))}
        </div>
      </div>

      {/* Dark Themes */}
      <div>
        <div className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Temas oscuros</div>
        <div className="space-y-2">
          {groups.dark.map(t => (
            <ThemeCard
              key={t.id}
              themeDef={t}
              isActive={theme === t.id}
              onSelect={() => { setTheme(t.id); onThemeChange?.(); }}
            />
          ))}
        </div>
      </div>

      <div className="text-center pt-2 pb-4">
        <p className="text-[11px] text-[var(--af-text3)]">
          La preferencia se guarda automaticamente
        </p>
      </div>
    </div>
  );
}

/** Theme card with color preview swatch */
function ThemeCard({ themeDef, isActive, onSelect }: {
  themeDef: ThemeDefinition;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer text-left ${
        isActive
          ? 'border-[var(--af-accent)] bg-[var(--accent)] shadow-sm'
          : 'border-[var(--border)] bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)] hover:border-[var(--af-accent)]/30 active:scale-[0.98]'
      }`}
    >
      {/* Color Preview Swatch */}
      <div className="flex gap-0.5 flex-shrink-0">
        {themeDef.preview.map((color, i) => (
          <div
            key={i}
            className={`rounded-sm ${i === 0 ? 'w-7 h-7 rounded-l-lg' : i === themeDef.preview.length - 1 ? 'w-3.5 h-7 rounded-r-lg' : 'w-3.5 h-7'}`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm">{themeDef.icon}</span>
          <span className="text-[13px] font-semibold text-[var(--foreground)]">{themeDef.label}</span>
          {isActive && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--af-accent)]/15 text-[var(--af-accent)] border border-[var(--af-accent)]/30">
              ACTIVO
            </span>
          )}
        </div>
        <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5 truncate">{themeDef.description}</p>
      </div>

      {/* Check */}
      {isActive && (
        <div className="w-6 h-6 rounded-full bg-[var(--af-accent)] flex items-center justify-center flex-shrink-0">
          <Check size={14} strokeWidth={3} className="text-background" aria-hidden="true"/>
        </div>
      )}
    </button>
  );
}

/* ─── Notifications Tab ─── */
function NotificationsTab() {
  const {
    notifPrefs, toggleNotifPref, notifSound, setNotifSound,
    notifPermission, requestNotifPermission,
  } = useNotificationsContext();

  const [channelPrefs, setChannelPrefs] = useState({ whatsapp: true, email: true, push: true });
  const [pushSupported, setPushSupported] = useState(false);
  const [pushRegistering, setPushRegistering] = useState(false);

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
      if (registered) toggleChannel('push');
    } catch {}
    setPushRegistering(false);
  }, [toggleChannel]);

  const categories = [
    { key: 'chat', label: 'Chat', Icon: MessageCircle, color: 'blue' },
    { key: 'tasks', label: 'Tareas', Icon: ClipboardList, color: 'purple' },
    { key: 'meetings', label: 'Reuniones', Icon: Calendar, color: 'amber' },
    { key: 'approvals', label: 'Aprobaciones', Icon: CheckCircle, color: 'pink' },
    { key: 'inventory', label: 'Inventario', Icon: Package, color: 'emerald' },
    { key: 'projects', label: 'Proyectos', Icon: Folder, color: 'cyan' },
    { key: 'rfis', label: 'RFIs', Icon: CircleHelp, color: 'orange' },
    { key: 'submittals', label: 'Submittals', Icon: FileCheck, color: 'teal' },
    { key: 'punchList', label: 'Punch List', Icon: ListChecks, color: 'rose' },
  ];

  return (
    <div className="space-y-6 p-4 md:p-0">
      {/* Permission prompt */}
      {notifPermission !== 'granted' && (
        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Bell size={18} className="text-amber-400" aria-hidden="true"/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium">Notificaciones del sistema</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">Activa las notificaciones del navegador para recibir alertas incluso con la app cerrada</div>
            </div>
            <button
              className="px-4 py-2 bg-amber-500 text-white rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-amber-600 transition-colors border-none flex-shrink-0 min-h-[40px]"
              onClick={requestNotifPermission}
            >
              Activar
            </button>
          </div>
        </div>
      )}

      {/* Sound toggle */}
      <div>
        <div className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Sonido</div>
        <button
          onClick={() => setNotifSound(!notifSound)}
          className={`w-full flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all active:scale-[0.98] ${
            notifSound
              ? 'border-[var(--af-accent)]/30 bg-[var(--af-accent)]/5'
              : 'border-[var(--border)] bg-[var(--af-bg3)]'
          }`}
        >
          <div className="flex items-center gap-3">
            {notifSound ? <Volume2 size={18} className="text-[var(--af-accent)]" aria-hidden="true"/> : <VolumeX size={18} className="text-[var(--muted-foreground)]" aria-hidden="true"/>}
            <div className="text-sm font-medium">Sonido de notificaciones</div>
          </div>
          <div className={`w-12 h-7 rounded-full p-0.5 transition-colors ${notifSound ? 'bg-[var(--af-accent)]' : 'bg-[var(--af-bg4)]'}`}>
            <div className={`w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${notifSound ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
        </button>
      </div>

      {/* Category toggles */}
      <div>
        <div className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Categorias de alertas</div>
        <div className="grid grid-cols-1 gap-1.5">
          {categories.map(cat => (
            <button
              key={cat.key}
              onClick={() => toggleNotifPref(cat.key)}
              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all active:scale-[0.98] min-h-[44px] ${
                notifPrefs[cat.key]
                  ? 'bg-[var(--af-accent)]/5 border border-[var(--af-accent)]/20'
                  : 'bg-[var(--af-bg3)] border border-transparent'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                notifPrefs[cat.key] ? 'bg-[var(--af-accent)]/15' : 'bg-[var(--af-bg4)]'
              }`}>
                <cat.Icon size={14} className={notifPrefs[cat.key] ? 'stroke-[var(--af-accent)]' : 'stroke-[var(--muted-foreground)]'} />
              </div>
              <span className="flex-1 text-left text-[13px] font-medium">{cat.label}</span>
              {notifPrefs[cat.key] && <Check size={16} className="stroke-[var(--af-accent)]" strokeWidth={3} aria-hidden="true"/>}
            </button>
          ))}
        </div>
      </div>

      {/* External channels */}
      <div>
        <div className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Canales externos</div>
        <div className="text-[11px] text-[var(--muted-foreground)] mb-3">Recibir alertas fuera de la app:</div>
        <div className="grid grid-cols-1 gap-2">
          <button
            onClick={() => toggleChannel('whatsapp')}
            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all active:scale-[0.98] min-h-[44px] ${
              channelPrefs.whatsapp
                ? 'bg-green-500/5 border border-green-500/20'
                : 'bg-[var(--af-bg3)] border border-transparent'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              channelPrefs.whatsapp ? 'bg-green-500/15' : 'bg-[var(--af-bg4)]'
            }`}>
              <MessageCircle size={14} className={channelPrefs.whatsapp ? 'stroke-green-400' : 'stroke-[var(--muted-foreground)]'} aria-hidden="true"/>
            </div>
            <span className="flex-1 text-left text-[13px] font-medium">WhatsApp</span>
            {channelPrefs.whatsapp && <Check size={16} className="stroke-green-400" strokeWidth={3} aria-hidden="true"/>}
          </button>

          <button
            onClick={() => toggleChannel('email')}
            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all active:scale-[0.98] min-h-[44px] ${
              channelPrefs.email
                ? 'bg-blue-500/5 border border-blue-500/20'
                : 'bg-[var(--af-bg3)] border border-transparent'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              channelPrefs.email ? 'bg-blue-500/15' : 'bg-[var(--af-bg4)]'
            }`}>
              <Mail size={14} className={channelPrefs.email ? 'stroke-blue-400' : 'stroke-[var(--muted-foreground)]'} aria-hidden="true"/>
            </div>
            <span className="flex-1 text-left text-[13px] font-medium">Correo electronico</span>
            {channelPrefs.email && <Check size={16} className="stroke-blue-400" strokeWidth={3} aria-hidden="true"/>}
          </button>

          <button
            onClick={() => {
              if (!channelPrefs.push) togglePush();
              else { unregisterPushSubscription().catch(() => {}); toggleChannel('push'); }
            }}
            disabled={pushRegistering}
            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all active:scale-[0.98] min-h-[44px] ${
              channelPrefs.push
                ? 'bg-purple-500/5 border border-purple-500/20'
                : 'bg-[var(--af-bg3)] border border-transparent'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              channelPrefs.push ? 'bg-purple-500/15' : 'bg-[var(--af-bg4)]'
            }`}>
              {pushRegistering ? <Loader size={14} className="animate-spin stroke-[var(--muted-foreground)]" aria-hidden="true"/> : <Smartphone size={14} className={channelPrefs.push ? 'stroke-purple-400' : 'stroke-[var(--muted-foreground)]'} aria-hidden="true"/>}
            </div>
            <span className="flex-1 text-left text-[13px] font-medium">
              {pushRegistering ? 'Activando...' : 'Push notifications'}
            </span>
            {channelPrefs.push && !pushRegistering && <Check size={16} className="stroke-purple-400" strokeWidth={3} aria-hidden="true"/>}
          </button>

          {!pushSupported && (
            <div className="text-[11px] text-[var(--af-text3)] flex items-center gap-1.5 px-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Push requiere configuracion del servidor (VAPID keys)
            </div>
          )}
        </div>
      </div>

      {/* OS status */}
      <div className="flex items-center gap-2 p-3 bg-[var(--af-bg3)] rounded-xl">
        {notifPermission === 'granted' ? (
          <>
            <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" aria-hidden="true"/>
            <span className="text-[12px] text-[var(--muted-foreground)]">Notificaciones del sistema activas</span>
          </>
        ) : notifPermission === 'denied' ? (
          <>
            <XCircle size={16} className="text-red-400 flex-shrink-0" aria-hidden="true"/>
            <span className="text-[12px] text-[var(--muted-foreground)]">Notificaciones del sistema bloqueadas por el navegador</span>
          </>
        ) : (
          <>
            <Bell size={16} className="text-amber-400 flex-shrink-0" aria-hidden="true"/>
            <span className="text-[12px] text-[var(--muted-foreground)]">Notificaciones del sistema sin activar</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Account Tab ─── */
function AccountTab({ onClose }: { onClose: () => void }) {
  const {
    navigateTo, authUser, userName, activeTenantName, activeTenantRole,
    doLogout, isEmailAdmin, setShowTenantSelector,
  } = useApp();

  return (
    <div className="space-y-6 p-4 md:p-0">
      {/* User card */}
      <div className="p-4 bg-[var(--af-bg3)] rounded-xl border border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold border-2 flex-shrink-0 overflow-hidden ${
            authUser?.photoURL ? '' : 'bg-gradient-to-br from-[var(--af-accent)] to-[var(--af-accent2)]'
          }`}>
            {authUser?.photoURL ? (
              <img src={authUser.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              userName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{userName}</div>
            <div className="text-[11px] text-[var(--muted-foreground)] truncate">{authUser?.email}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--af-accent)]/15 text-[var(--af-accent)]">{activeTenantRole || 'Miembro'}</span>
              {isEmailAdmin && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 flex items-center gap-0.5">
                  <Crown size={8} aria-hidden="true"/> SA
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border)]">
          <Building2 size={12} className="text-[var(--muted-foreground)]" aria-hidden="true"/>
          <span className="text-[11px] text-[var(--muted-foreground)] truncate">{activeTenantName || 'Sin espacio'}</span>
        </div>
      </div>

      {/* Menu items */}
      <div>
        <div className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Acciones rapidas</div>
        <div className="space-y-1.5">
          <button
            onClick={() => { navigateTo('profile'); onClose(); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)] cursor-pointer transition-all active:scale-[0.98] min-h-[48px] border-none text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--af-accent)]/10 flex items-center justify-center flex-shrink-0">
              <User size={14} className="stroke-[var(--af-accent)]" aria-hidden="true"/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium">Mi Perfil</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">Nombre, foto, informacion personal</div>
            </div>
            <ChevronRight size={16} className="text-[var(--muted-foreground)] flex-shrink-0" aria-hidden="true"/>
          </button>

          <button
            onClick={() => { navigateTo('admin'); onClose(); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)] cursor-pointer transition-all active:scale-[0.98] min-h-[48px] border-none text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--af-accent)]/10 flex items-center justify-center flex-shrink-0">
              <Shield size={14} className="stroke-[var(--af-accent)]" aria-hidden="true"/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium">Permisos y Roles</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">Gestionar permisos del equipo</div>
            </div>
            <ChevronRight size={16} className="text-[var(--muted-foreground)] flex-shrink-0" aria-hidden="true"/>
          </button>

          <button
            onClick={() => { setShowTenantSelector(true); onClose(); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)] cursor-pointer transition-all active:scale-[0.98] min-h-[48px] border-none text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--af-accent)]/10 flex items-center justify-center flex-shrink-0">
              <Building2 size={14} className="stroke-[var(--af-accent)]" aria-hidden="true"/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium">Cambiar espacio</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">Seleccionar otro workspace</div>
            </div>
            <ChevronRight size={16} className="text-[var(--muted-foreground)] flex-shrink-0" aria-hidden="true"/>
          </button>
        </div>
      </div>

      {/* Logout */}
      <div className="pt-4 border-t border-[var(--border)]">
        <button
          onClick={() => { doLogout(); onClose(); }}
          className="w-full flex items-center justify-center gap-2 p-3.5 rounded-xl bg-red-500/5 border border-red-500/20 hover:bg-red-500/10 cursor-pointer transition-all active:scale-[0.98] min-h-[48px]"
        >
          <LogOut size={16} className="text-red-400" aria-hidden="true"/>
          <span className="text-[13px] font-medium text-red-400">Cerrar sesion</span>
        </button>
      </div>
    </div>
  );
}
