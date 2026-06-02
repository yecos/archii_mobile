'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { toast } from 'sonner';
import type { NotifEntry } from '@/lib/types';
import { getAuthHeaders } from '@/lib/firebase-service';

/* ===== Context value interface ===== */
export interface NotificationContextValue {
  sendNotif: (
    title: string,
    body: string,
    icon?: string,
    tag?: string,
    data?: any,
  ) => void;
  playNotifSound: (type?: string) => void;
  vibrateNotif: () => void;
  notifPermission: NotificationPermission;
  requestNotifPermission: () => Promise<void>;
  dismissNotifBanner: () => void;
  notifPrefs: Record<string, boolean>;
  toggleNotifPref: (key: string) => void;
  notifSound: boolean;
  setNotifSound: (v: boolean) => void;
  showNotifBanner: boolean;
  inAppNotifs: (NotifEntry & { ts: number })[];
  setInAppNotifs: React.Dispatch<
    React.SetStateAction<(NotifEntry & { ts: number })[]>
  >;
  notifHistory: NotifEntry[];
  unreadCount: number;
  markNotifRead: (id: string) => void;
  markAllNotifRead: () => void;
  clearNotifHistory: () => void;
  resetNotifOnTenantSwitch: () => void;
  notifFilterCat: string;
  setNotifFilterCat: (v: string) => void;
  showNotifPanel: boolean;
  setShowNotifPanel: (v: boolean) => void;
  /** Register navigate function from AppContext (for OS notification clicks) */
  setNavigateFn: (
    fn: (screen: string, itemId?: string | null) => void,
  ) => void;
  navigateToRef: React.MutableRefObject<
    (screen: string, itemId?: string | null) => void
  >;
  isTabVisibleRef: React.MutableRefObject<boolean>;
}

/* ===== Context ===== */
const NotificationContext = createContext<NotificationContextValue | null>(null);

/* ===== Provider ===== */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  /* ---------- State ---------- */
  const [notifPermission, setNotifPermission] =
    useState<NotificationPermission>('default');
  const [notifHistory, setNotifHistory] = useState<NotifEntry[]>([]);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    chat: true,
    tasks: true,
    meetings: true,
    approvals: true,
    inventory: true,
    projects: true,
    rfis: true,
    submittals: true,
    punchList: true,
    agenda: true,
  });
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifSound, setNotifSound] = useState(true);
  const [inAppNotifs, setInAppNotifs] = useState<(NotifEntry & { ts: number })[]>(
    [],
  );
  const [notifFilterCat, setNotifFilterCat] = useState<string>('all');
  const [showNotifBanner, setShowNotifBanner] = useState(false);

  /* ---------- Refs ---------- */
  const navigateToRef = useRef<
    (screen: string, itemId?: string | null) => void
  >(() => {});
  const isTabVisibleRef = useRef(true);

  /* ---------- setNavigateFn (exposed so AppContext can wire navigation) ---------- */
  const setNavigateFn = useCallback(
    (fn: (screen: string, itemId?: string | null) => void) => {
      navigateToRef.current = fn;
    },
    [],
  );

  /* ---------- showToast: thin wrapper over sonner ---------- */
  const showToast = useCallback((msg: string, type = 'success') => {
    const opts = { duration: 3500 };
    if (type === 'error') toast.error(msg, opts);
    else if (type === 'warning') toast.warning(msg, opts);
    else toast.success(msg, opts);
  }, []);

  /* ---------- vibrateNotif ---------- */
  const vibrateNotif = useCallback(() => {
    try {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } catch (err) {
      console.error('[Archii]', err);
    }
  }, []);

  /* ---------- requestNotifPermission ---------- */
  const requestNotifPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      showToast('Tu navegador no soporta notificaciones', 'error');
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    setShowNotifBanner(false);
    if (perm === 'granted') {
      showToast('🔔 Notificaciones activadas');
      try {
        localStorage.setItem('archii-notif-perm', 'granted');
        localStorage.setItem('archii-notif-dismissed', String(Date.now()));
      } catch (err) {
        console.error('[Archii]', err);
      }
    } else {
      showToast('Notificaciones bloqueadas por el navegador', 'error');
    }
  }, [showToast]);

  /* ---------- dismissNotifBanner ---------- */
  const dismissNotifBanner = useCallback(() => {
    setShowNotifBanner(false);
    try {
      localStorage.setItem('archii-notif-dismissed', String(Date.now()));
    } catch (err) {
      console.error('[Archii]', err);
    }
  }, []);

  /* ---------- playNotifSound: Web Audio API with 7 distinct tones ---------- */
  const playNotifSound = useCallback(
    (type?: string) => {
      if (!notifSound) return;
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0.07;
        // Different tones for different notification types
        const tones: Record<string, [number, number]> = {
          chat: [587.33, 880],
          task: [659.25, 783.99],
          meeting: [523.25, 659.25],
          approval: [698.46, 880],
          inventory: [440, 554.37],
          project: [493.88, 659.25],
          reminder: [880, 1046.5],
          agenda: [783.99, 987.77],
        };
        const [f1, f2] = tones[type || ''] || [587.33, 880];
        osc.frequency.value = f1;
        osc.start();
        setTimeout(() => {
          osc.frequency.value = f2;
        }, 100);
        setTimeout(() => {
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
          osc.stop(ctx.currentTime + 0.25);
        }, 200);
      } catch (err) {
        console.error('[Archii]', err);
      }
    },
    [notifSound],
  );

  /* ---------- Firestore persistence helpers ---------- */
  const persistNotifToFirestore = useCallback(async (entry: NotifEntry) => {
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders['Authorization']) return; // Not authenticated
      await fetch('/api/notifications/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          title: entry.title,
          body: entry.body,
          icon: entry.icon,
          type: entry.type,
          screen: entry.screen,
          itemId: entry.itemId,
        }),
      });
    } catch (err) {
      // Silently fail — don't block the notification
      console.warn('[Archii Notif] Firestore persist failed:', err);
    }
  }, []);

  const loadNotifHistoryFromFirestore = useCallback(async () => {
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders['Authorization']) return;
      const res = await fetch('/api/notifications/history?limit=50', {
        headers: authHeaders,
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.notifications && Array.isArray(data.notifications)) {
        const entries: NotifEntry[] = data.notifications.map((n: any) => ({
          id: n.id,
          title: n.title,
          body: n.body || '',
          icon: n.icon || '🔔',
          type: n.type || 'info',
          read: n.read || false,
          timestamp: new Date(n.timestamp),
          screen: n.screen || null,
          itemId: n.itemId || null,
        }));
        setNotifHistory(entries);
      }
    } catch (err) {
      console.warn('[Archii Notif] Firestore load failed:', err);
    }
  }, []);

  /* ---------- sendNotif: UNIFIED notification ---------- */
  const sendNotif = useCallback(
    (title: string, body: string, icon?: string, tag?: string, data?: any) => {
      const type = data?.type || 'info';
      const notifEntry = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        body,
        icon: icon || '🔔',
        type,
        read: false,
        timestamp: new Date(),
        screen: data?.screen || null,
        itemId: data?.itemId || null,
      };

      // ALWAYS add to history (local state)
      setNotifHistory((prev) => [notifEntry, ...prev].slice(0, 100));

      // Persist to Firestore (async, non-blocking)
      persistNotifToFirestore(notifEntry);

      // ALWAYS show in-app toast (even when tab is active)
      setInAppNotifs((prev) => [...prev, { ...notifEntry, ts: Date.now() }]);
      setTimeout(
        () =>
          setInAppNotifs((prev) =>
            prev.filter((n) => Date.now() - n.ts < 5000),
          ),
        5500,
      );

      // ALWAYS play sound + vibrate
      playNotifSound(type);
      vibrateNotif();

      // Send OS/Browser notification (when permission granted)
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification(title, {
            body,
            icon: icon || '/icon-192.png',
            badge: '/icon-192.png',
            tag: tag || `archii-${Date.now()}`,
            requireInteraction: false,
            silent: true, // We play our own sound
            data,
          });
          n.onclick = () => {
            window.focus();
            n.close();
            if (data?.screen) navigateToRef.current(data.screen, data.itemId);
          };
          setTimeout(() => n.close(), 8000);
        } catch {
          /* OS notification not available */
        }
      }
    },
    [playNotifSound, vibrateNotif, persistNotifToFirestore],
  );

  /* ---------- toggleNotifPref ---------- */
  const toggleNotifPref = useCallback((key: string) => {
    setNotifPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /* ---------- markNotifRead ---------- */
  const markNotifRead = useCallback((id: string) => {
    setNotifHistory((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    // Persist to Firestore
    (async () => {
      try {
        const authHeaders = await getAuthHeaders();
        if (!authHeaders['Authorization']) return;
        await fetch('/api/notifications/history', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ ids: [id] }),
        });
      } catch {}
    })();
  }, []);

  /* ---------- markAllNotifRead ---------- */
  const markAllNotifRead = useCallback(() => {
    setNotifHistory((prev) => prev.map((n) => ({ ...n, read: true })));
    // Persist to Firestore
    (async () => {
      try {
        const authHeaders = await getAuthHeaders();
        if (!authHeaders['Authorization']) return;
        await fetch('/api/notifications/history', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ markAll: true }),
        });
      } catch {}
    })();
  }, []);

  /* ---------- clearNotifHistory ---------- */
  const clearNotifHistory = useCallback(() => {
    setNotifHistory([]);
    setInAppNotifs([]);
    setUnreadCount(0);
    showToast('Historial de notificaciones limpiado');
    // Clear from Firestore
    (async () => {
      try {
        const authHeaders = await getAuthHeaders();
        if (!authHeaders['Authorization']) return;
        await fetch('/api/notifications/history', {
          method: 'DELETE',
          headers: authHeaders,
        });
      } catch {}
    })();
  }, [showToast]);

  /* ---------- resetNotifOnTenantSwitch: clear history + banners silently ---------- */
  const resetNotifOnTenantSwitch = useCallback(() => {
    setNotifHistory([]);
    setInAppNotifs([]);
    setUnreadCount(0);
    setShowNotifPanel(false);
    setShowNotifBanner(false);
  }, []);

  /* ========================================
     EFFECTS
     ======================================== */

  /* 1. Init notification permission + restore prefs + load history from Firestore + auto-show banner after 5s (3-day dismiss cooldown) */
  useEffect(() => {
    if (!('Notification' in window)) return;
    setNotifPermission(Notification.permission);
    // Restore notification prefs
    try {
      const savedPrefs = localStorage.getItem('archii-notif-prefs');
      if (savedPrefs) setNotifPrefs(JSON.parse(savedPrefs));
      const savedSound = localStorage.getItem('archii-notif-sound');
      if (savedSound !== null) setNotifSound(savedSound === 'true');
    } catch (err) {
      console.error('[Archii]', err);
    }
    // Load persisted notification history from Firestore
    loadNotifHistoryFromFirestore();
    // Auto-show permission banner after 5 seconds if not granted and not recently dismissed
    if (Notification.permission === 'default') {
      const dismissed = localStorage.getItem('archii-notif-dismissed');
      if (dismissed) {
        const diff = Date.now() - parseInt(dismissed);
        if (diff < 3 * 24 * 60 * 60 * 1000) return; // Don't show if dismissed within 3 days
      }
      const timer = setTimeout(() => {
        if (Notification.permission === 'default') setShowNotifBanner(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [loadNotifHistoryFromFirestore]);

  /* 2. Persist sound pref to localStorage */
  useEffect(() => {
    try {
      localStorage.setItem('archii-notif-sound', String(notifSound));
    } catch (err) {
      console.error('[Archii]', err);
    }
  }, [notifSound]);

  /* 3. Persist notification preferences to localStorage */
  useEffect(() => {
    try {
      localStorage.setItem(
        'archii-notif-prefs',
        JSON.stringify(notifPrefs),
      );
    } catch (err) {
      console.error('[Archii]', err);
    }
  }, [notifPrefs]);

  /* 4. Track document visibility (visibilitychange) */
  useEffect(() => {
    const handler = () => {
      isTabVisibleRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handler);
    isTabVisibleRef.current = document.visibilityState === 'visible';
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  /* 5. Calculate unread count from notifHistory */
  useEffect(() => {
    setUnreadCount(notifHistory.filter((n) => !n.read).length);
  }, [notifHistory]);

  /* ---------- Context value ---------- */
  const value: NotificationContextValue = {
    sendNotif,
    playNotifSound,
    vibrateNotif,
    notifPermission,
    requestNotifPermission,
    dismissNotifBanner,
    notifPrefs,
    toggleNotifPref,
    notifSound,
    setNotifSound,
    showNotifBanner,
    inAppNotifs,
    setInAppNotifs,
    notifHistory,
    unreadCount,
    markNotifRead,
    markAllNotifRead,
    clearNotifHistory,
    resetNotifOnTenantSwitch,
    notifFilterCat,
    setNotifFilterCat,
    showNotifPanel,
    setShowNotifPanel,
    setNavigateFn,
    navigateToRef,
    isTabVisibleRef,
  };

  return React.createElement(NotificationContext.Provider, { value }, children);
}

/* ===== Hook ===== */
export function useNotificationsContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      'useNotificationsContext must be used within a <NotificationProvider>',
    );
  }
  return ctx;
}
