'use client';
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useUIStore } from '@/stores/ui-store';

/* ===== MODULED IMPORTS ===== */
import type { TeamUser, Project, Task, Expense, Supplier, Approval, WorkPhase, ProjectFile, OneDriveFile, GalleryPhoto, Comment, RFI, Submittal, PunchItem, Company, DailyLog, Meeting } from '@/lib/types';
import { DEFAULT_PHASES, EXPENSE_CATS, SUPPLIER_CATS, PHOTO_CATS, ADMIN_EMAILS, USER_ROLES, ROLE_COLORS, ROLE_ICONS, MESES, DIAS_SEMANA, NAV_ITEMS, SCREEN_TITLES, DEFAULT_ROLE_PERMS } from '@/lib/types';

import { fmtCOP, fmtDate, fmtDateTime, fmtSize, getInitials, statusColor, prioColor, taskStColor, avatarColor, fmtRecTime, fmtDuration, fmtTimer, getWeekStart, fileToBase64, getPlatform, uniqueId, scrubUndefined } from '@/lib/helpers';
import { isOverdue as checkOverdue } from '@/lib/kanban-helpers';

import { getFirebase, getFirebaseIdToken, type FirebaseUser } from '@/lib/firebase-service';
import * as fbActions from '@/lib/firestore-actions';
import { OneDriveProvider } from '@/hooks/useOneDrive';
import { useNotificationsContext } from '@/hooks/useNotifications';

// Custom hooks available for future extraction:
// import { useFirestoreData } from '@/hooks/useFirestoreData';
// import { useVoiceRecording } from '@/hooks/useVoiceRecording';

import { notifyExternal } from '@/lib/notify-unified';

/* ===== APP CONTEXT ===== */
type FormData = Record<string, string | number | boolean | undefined>;
interface AppContextValue {
  forms: Record<string, any>;
  setForms: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  logForm: Record<string, any>;
  setLogForm: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  openModal: (name: string) => void;
  closeModal: (name: string) => void;
  showToast: (msg: string, type?: string) => void;
  editingId: string | null;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  authUser: FirebaseUser | null;
  projects: Project[];
  tasks: Task[];
  expenses: Expense[];
  suppliers: Supplier[];
  companies: Company[];
  teamUsers: TeamUser[];
  meetings: Meeting[];

  galleryPhotos: GalleryPhoto[];
  comments: Comment[];
  dailyLogs: DailyLog[];
  approvals: Approval[];
  rfis: RFI[];
  submittals: Submittal[];
  punchItems: PunchItem[];
  selectedProjectId: string;
  navigateTo: (screen: string, itemId?: string | null) => void;
  saveApproval: () => Promise<void>;
  saveExpense: () => Promise<void>;
  saveMeeting: () => Promise<void>;
}
const AppContext = createContext<AppContextValue & Record<string, any>>(null!);

export default function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [screen, setScreen] = useState('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const [workPhases, setWorkPhases] = useState<WorkPhase[]>([]);
  const [projectPhasesCache, setProjectPhasesCache] = useState<Record<string, WorkPhase[]>>({});
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [loading, setLoading] = useState(true);
  // Toast state removido — ahora usa Sonner directamente

  // Microsoft / OneDrive state — EXTRACTED to useOneDrive hook (see src/hooks/useOneDrive.tsx)
  // These stubs are kept for auth integration within AppProvider;
  // consumers should use `useOneDrive()` from now on.
  const [msAccessToken, setMsAccessToken] = useState<string | null>(null);
  const [msConnected, setMsConnected] = useState(false);
  const [msLoading, setMsLoading] = useState(false);
  // Token refresh state (kept for doMicrosoftLogin auth flow)
  const [msRefreshToken, setMsRefreshToken] = useState<string | null>(null);
  const [msTokenExpiry, setMsTokenExpiry] = useState<number>(0);

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null);
  const [calFilterProject, setCalFilterProject] = useState<string>('all');
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  // Gallery state
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [galleryFilterProject, setGalleryFilterProject] = useState<string>('all');
  const [galleryFilterCat, setGalleryFilterCat] = useState<string>('all');
  const [lightboxPhoto, setLightboxPhoto] = useState<GalleryPhoto | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState<string>('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // Tasks view mode (list / kanban)
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'kanban'>('list');

  // Daily Log state
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);

  // RFIs / Submittals / Punch List state
  const [rfis, setRfis] = useState<RFI[]>([]);
  const [submittals, setSubmittals] = useState<Submittal[]>([]);
  const [punchItems, setPunchItems] = useState<PunchItem[]>([]);
  const [rfiFilterProject, setRfiFilterProject] = useState<string>('');
  const [rfiFilterStatus, setRfiFilterStatus] = useState<string>('');
  const [subFilterProject, setSubFilterProject] = useState<string>('');
  const [subFilterStatus, setSubFilterStatus] = useState<string>('');
  const [punchFilterProject, setPunchFilterProject] = useState<string>('');
  const [punchFilterStatus, setPunchFilterStatus] = useState<string>('');
  const [punchFilterLocation, setPunchFilterLocation] = useState<string>('');
  const [dailyLogTab, setDailyLogTab] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [logForm, setLogForm] = useState<Record<string, any>>({
    date: new Date().toISOString().split('T')[0],
    weather: '',
    temperature: '',
    activities: [''],
    laborCount: '',
    equipment: [''],
    materials: [''],
    observations: '',
    photos: [],
    supervisor: '',
  });

  // Admin state
  const [adminTab, setAdminTab] = useState<'timeline' | 'dashboard' | 'permissions' | 'team'>('timeline');
  const [adminWeekOffset, setAdminWeekOffset] = useState(0);
  const [adminTaskSearch, setAdminTaskSearch] = useState('');
  const [adminFilterAssignee, setAdminFilterAssignee] = useState<string>('all');
  const [adminFilterProject, setAdminFilterProject] = useState<string>('all');
  const [adminFilterPriority, setAdminFilterPriority] = useState<string>('all');
  const [adminTooltipTask, setAdminTooltipTask] = useState<any>(null);
  const [adminTooltipPos, setAdminTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [adminPermSection, setAdminPermSection] = useState<string>('roles');
  const [rolePerms, setRolePerms] = useState<Record<string, string[]>>({
    'Ver Dashboard': ['Admin','Director','Arquitecto','Interventor','Contratista','Cliente','Miembro'],
    'Crear proyectos': ['Admin','Director','Arquitecto'],
    'Editar proyectos': ['Admin','Director','Arquitecto'],
    'Eliminar proyectos': ['Admin','Director'],
    'Crear tareas': ['Admin','Director','Arquitecto','Interventor','Contratista'],
    'Asignar tareas': ['Admin','Director','Arquitecto'],
    'Gestionar equipo': ['Admin','Director'],
    'Cambiar roles': ['Admin'],
    'Ver presupuestos': ['Admin','Director','Arquitecto','Interventor','Cliente'],
    'Ver inventario': ['Admin','Director','Arquitecto','Contratista','Interventor'],
    'Gestionar inventario': ['Admin','Director','Contratista'],
    'Panel Admin': ['Admin','Director'],
    'Chat general': ['Admin','Director','Arquitecto','Interventor','Contratista','Cliente','Miembro'],
    'Portal cliente': ['Admin','Director','Cliente'],
  });
  const toggleRolePerm = (permName: string, role: string) => {
    setRolePerms(prev => {
      const current = prev[permName] || [];
      const has = current.includes(role);
      const updated = { ...prev, [permName]: has ? current.filter(r => r !== role) : [...current, role] };
      // Save to localStorage
      try { localStorage.setItem('archii-role-perms', JSON.stringify(updated)); } catch (err) { console.error("[Archii]", err); }
      return updated;
    });
  };

  const [isSavingTask, setIsSavingTask] = useState(false);

  // Theme state — derived from ui-store (single source of truth)
  const themeId = useUIStore(s => s.theme);
  const themes = useUIStore(s => s.themes);
  const currentThemeDef = themes.find(t => t.id === themeId);
  const darkMode = currentThemeDef?.isDark ?? (themeId === 'dark');
  const toggleTheme = useUIStore(s => s.toggleTheme);

  // PWA Install state
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  // ===== NOTIFICATION CONTEXT (extracted to useNotifications.tsx) =====
  // AppContext consumes the NotificationProvider for detection effects.
  // Components that render notification UI should use useNotificationsContext() directly.
  const notifCtx = useNotificationsContext();

  // Set-based known IDs for O(1) change detection (replaces O(n) array comparison)
  const knownTaskIdsRef = useRef<Set<string>>(new Set());
  const knownApprovalIdsRef = useRef<Set<string>>(new Set());
  const knownMeetingIdsRef = useRef<Set<string>>(new Set());

  const knownProjectIdsRef = useRef<Set<string>>(new Set());
  const knownRfiIdsRef = useRef<Set<string>>(new Set());
  const knownSubmittalIdsRef = useRef<Set<string>>(new Set());
  const knownPunchItemIdsRef = useRef<Set<string>>(new Set());
  const overdueCheckedRef = useRef<string>('');
  // Track first data load to avoid re-notifying existing items
  const firstLoadDoneRef = useRef(false);
  // Guard: AUTO-FIX 1 only runs once per tenant session
  const autoFixMembersDoneRef = useRef(false);
  // Track which collections have hydrated at least once
  const collectionsLoadedRef = useRef<Record<string, boolean>>({
    tasks: false, approvals: false, meetings: false,
    projects: false, rfis: false,
    submittals: false, punchItems: false,
  });
  const allCollectionsLoadedRef = useRef(false);
  // Maps for tracking status changes per entity (for changed-item detection)
  const prevTaskStatusRef = useRef<Map<string, { status: string; priority: string; assigneeId: string }>>(new Map());
  const prevApprovalStatusRef = useRef<Map<string, string>>(new Map());
  const prevProjectStatusRef = useRef<Map<string, string>>(new Map());
  const prevRfiStatusRef = useRef<Map<string, string>>(new Map());
  const prevSubmittalStatusRef = useRef<Map<string, string>>(new Map());
  const prevPunchStatusRef = useRef<Map<string, string>>(new Map());
  // Notification coalescencia buffer (for external channel notifications)
  const notificationBufferRef = useRef<Map<string, { type: string; data: any; count: number }>>(new Map());
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Gate to suppress notifications during tenant switching.
  // Set to true when tenant changes, false only after all onSnapshot listeners
  // have fired at least once for the new tenant.
  const tenantSwitchingRef = useRef(false);
  // Counter: each onSnapshot callback for the 7 tracked collections increments this.
  // When it reaches 7, all collections have loaded → arm notifications.
  const snapshotCountRef = useRef(0);
  // Track which tenant the snapshot counter is for (avoid cross-tenant counting)
  const snapshotTenantRef = useRef<string | null>(null);
  // State trigger: forces re-evaluation of the hydration effect when snapshots arrive
  const [snapshotTrigger, setSnapshotTrigger] = useState(0);

  // ===== TENANT STATE =====
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [activeTenantName, setActiveTenantName] = useState<string | null>(null);
  const [activeTenantRole, setActiveTenantRole] = useState<string>('Miembro'); // 'Super Admin' or 'Miembro'
  const [tenantReady, setTenantReady] = useState(false);
  const [showTenantSelector, setShowTenantSelector] = useState(false);
  const [activeTenantMembers, setActiveTenantMembers] = useState<string[]>([]); // UIDs of tenant members

  // Restore tenant selection from localStorage (will be validated against server after auth)
  useEffect(() => {
    try {
      const savedTenantId = localStorage.getItem('archii-active-tenant');
      const savedTenantName = localStorage.getItem('archii-active-tenant-name');
      const savedTenantRole = localStorage.getItem('archii-active-tenant-role');
      if (savedTenantId && savedTenantName) {
        setActiveTenantId(savedTenantId);
        setActiveTenantName(savedTenantName);
        setActiveTenantRole(savedTenantRole || 'Miembro');
        setTenantReady(true);
      }
    } catch (err) { console.error("[Archii]", err); }

    return () => {};
  }, []);

  // Check if running as standalone app
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);
  }, []);

  // PWA Install prompt handler
  useEffect(() => {
    const isDismissed = localStorage.getItem('archii-install-dismissed');
    const alreadyInstalled = localStorage.getItem('archii-installed');
    if (alreadyInstalled) {
      setIsInstalled(true);
      return;
    }
    // Don't show banner if user already dismissed it within 7 days
    if (isDismissed) {
      const dismissedTime = parseInt(isDismissed);
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      // Show banner after a small delay
      setTimeout(() => setShowInstallBanner(true), 2000);
    };
    const installedHandler = () => {
      setInstallPrompt(null);
      setShowInstallBanner(false);
      setIsInstalled(true);
      localStorage.setItem('archii-installed', 'true');
      showToast('Archii instalado correctamente');
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
      setShowInstallBanner(false);
    }
  };

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('archii-install-dismissed', String(Date.now()));
  };

  // Toast helper (usa Sonner por debajo)
  const showToast = useCallback((msg: string, type = 'success') => {
    const opts = { duration: 3500 };
    if (type === 'error') toast.error(msg, opts);
    else if (type === 'warning') toast.warning(msg, opts);
    else toast.success(msg, opts);
  }, []);

  // Load saved role permissions from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('archii-role-perms');
      if (saved) setRolePerms(JSON.parse(saved));
    } catch (err) { console.error("[Archii]", err); }
  }, []);

  // === NOTIFICATION COALESCENCE (stays in AppContext — for external channel notifications) ===
  // Buffers rapid events of the same type, then dispatches them via notifyExternal.
  const bufferedNotify = useCallback((type: string, data: any) => {
    const existing = notificationBufferRef.current.get(type);
    if (existing) {
      existing.count += 1;
    } else {
      notificationBufferRef.current.set(type, { type, data, count: 1 });
    }
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(async () => {
      const entries = Array.from(notificationBufferRef.current.values());
      notificationBufferRef.current.clear();
      for (const entry of entries) {
        try {
          switch (entry.type) {
            case 'taskAssigned': {
              const d = entry.data;
              await notifyExternal.taskAssigned(d.uid, d.title, d.projName, d.priority, d.dueDate, d.by);
              break;
            }
            case 'taskUpdated': {
              const d = entry.data;
              await notifyExternal.taskUpdated(d.uid, d.title, d.status);
              break;
            }
            case 'meetingReminder': {
              const d = entry.data;
              await notifyExternal.meetingReminder(d.uid, d.title, d.date, d.time, d.projName);
              break;
            }
            case 'approvalPending': {
              const d = entry.data;
              await notifyExternal.approvalPending(d.uid, d.title, d.projName, d.by);
              break;
            }
            case 'approvalResolved': {
              const d = entry.data;
              await notifyExternal.approvalResolved(d.uid, d.title, d.status, d.by);
              break;
            }
            case 'custom': {
              const d = entry.data;
              await notifyExternal.custom(d.uid, d.message);
              break;
            }
            default:
              console.warn('[Archii Notif] Unknown buffered type:', entry.type);
          }
        } catch (err) {
          console.error('[Archii Notif] Error flushing notification:', entry.type, err);
        }
      }
    }, 800);
  }, []);

  // Destructure notification context for detection effects
  const { sendNotif, playNotifSound, vibrateNotif, notifPrefs, isTabVisibleRef, resetNotifOnTenantSwitch } = notifCtx;
  // Alias for backward compat in detection effects
  const sendBrowserNotif = sendNotif;

  // Modals
  const [modals, setModals] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  // Global confirm dialog for deleteCompany (replaces native confirm())
  const [pendingDeleteAction, setPendingDeleteAction] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const openModal = useCallback((n: string) => setModals(p => ({ ...p, [n]: true })), []);
  const closeModal = useCallback((n: string) => { setModals(p => ({ ...p, [n]: false })); setEditingId(null); }, []);

  // Form defaults
  const [forms, setForms] = useState<Record<string, any>>({});

  // Wait for Firebase to be ready (initialized in layout.tsx)
  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 100; // 10 seconds max
    const iv = setInterval(() => {
      attempts++;
      try {
        const fb = getFirebase();
        if (fb && fb.apps && fb.apps.length > 0) {
          clearInterval(iv);
          setReady(true);
        } else if (attempts >= maxAttempts) {
          clearInterval(iv);
          console.error('[Archii] Firebase ready timeout — SDK may not have loaded');
          setReady(true); // Allow auth screen to show even without Firebase
        }
      } catch (e) {
        if (attempts >= maxAttempts) {
          clearInterval(iv);
          console.error('[Archii] Firebase ready timeout — getFirebase() keeps throwing:', e);
          setReady(true); // Allow auth screen to show with Firebase error indicator
        }
      }
    }, 100);
    return () => clearInterval(iv);
  }, []);

  // Auth state
  useEffect(() => {
    if (!ready) return;
    const fb = getFirebase();
    const auth = fb.auth();

    // Handle redirect results (for signInWithRedirect fallback)
    auth.getRedirectResult().then((result: any) => {
      if (result?.credential) {

        // Handle Microsoft redirect tokens
        if (result.credential.accessToken) {
          setMsAccessToken(result.credential.accessToken);
          setMsConnected(true);
          setMsRefreshToken(result.credential.refreshToken || null);
          setMsTokenExpiry(Date.now() + 55 * 60 * 1000);
          localStorage.setItem('msAccessToken', result.credential.accessToken);
          localStorage.setItem('msConnected', 'true');
          if (result.credential.refreshToken) localStorage.setItem('msRefreshToken', result.credential.refreshToken);
        }
      }
    }).catch((err: any) => {
      if (err.code !== 'auth/no-pending-redirect') {
        console.error('[Archii Auth] Redirect result error:', err.code, err.message);
        // Show error after a short delay so Toaster is rendered
        setTimeout(() => showToast(`Error de autenticación: ${err.code || err.message}`, 'error'), 500);
      }
    });

    const unsubscribe = auth.onAuthStateChanged(async (user: any) => {
      try {
        // FIX: Force-refresh auth user to get latest photoURL from identity provider.
        // Firebase Auth persistence sometimes returns null/empty photoURL on reload
        // (stored in IndexedDB), which would overwrite valid Firestore photoURL.
        if (user) {
          try { await user.reload(); } catch (_e) { /* ignore if offline */ }
          // IMPORTANT: Firebase User properties (uid, email, displayName, etc.) are
          // prototype getters — spread operator does NOT copy them. Must extract explicitly.
          setAuthUser(user); // Store the real Firebase User object (not a copy)
        } else {
          setAuthUser(null);
        }
        if (user) {
          const db = fb.firestore();
          // Save user profile
          const ref = db.collection('users').doc(user.uid);
          const snap = await ref.get();
          const isAdminEmail = ADMIN_EMAILS.includes(user.email);

          if (!snap.exists) {
            // ANTI-DUP: Check if another user doc already exists with this email
            // (happens when same person logs in with different providers)
            try {
              const existingByMail = await db.collection('users')
                .where('email', '==', (user.email || '').toLowerCase())
                .limit(1).get();
              if (!existingByMail.empty) {
                const existingDoc = existingByMail.docs[0];
                const existingData = existingDoc.data();

                // The existing doc has better data (from previous login), don't create new one.
                // Instead, update the current doc with existing data so future lookups work
                await ref.set({
                  name: existingData.name || user.displayName || (user.email || '').split('@')[0],
                  email: user.email,
                  photoURL: user.photoURL || existingData.photoURL || '',
                  role: existingData.role || (isAdminEmail ? 'Admin' : 'Miembro'),
                  createdAt: existingData.createdAt || fb.firestore.FieldValue.serverTimestamp(),
                });
                // Now migrate tenant memberships from old UID to new UID
                const allTenants = await db.collection('tenants').get();
                for (const tenantDoc of allTenants.docs) {
                  const tData = tenantDoc.data();
                  const members: string[] = tData.members || [];
                  const superAdmins: string[] = tData.superAdmins || [];
                  const tenantUpdates: Record<string, any> = {};
                  if (members.includes(existingDoc.id) && !members.includes(user.uid)) {
                    tenantUpdates.members = fb.firestore.FieldValue.arrayUnion(user.uid);
                  }
                  // Also migrate Super Admin role if the old UID was Super Admin
                  if (superAdmins.includes(existingDoc.id) && !superAdmins.includes(user.uid)) {
                    tenantUpdates.superAdmins = fb.firestore.FieldValue.arrayUnion(user.uid);

                  }
                  if (Object.keys(tenantUpdates).length > 0) {
                    await db.collection('tenants').doc(tenantDoc.id).update(tenantUpdates);

                  }
                }
              } else {
                await ref.set({ name: user.displayName || (user.email || '').split('@')[0], email: user.email, photoURL: user.photoURL || '', role: isAdminEmail ? 'Admin' : 'Miembro', createdAt: fb.firestore.FieldValue.serverTimestamp() });
              }
            } catch (_dupErr) {
              // Duplicate check failed, creating user doc anyway
              await ref.set({ name: user.displayName || (user.email || '').split('@')[0], email: user.email, photoURL: user.photoURL || '', role: isAdminEmail ? 'Admin' : 'Miembro', createdAt: fb.firestore.FieldValue.serverTimestamp() });
            }
          } else {
            // Existing user: sync photoURL and name from auth provider on every login
            const updates: Record<string, any> = {};
            const existing = snap.data() || {};
            // FIX: Only sync photoURL FROM auth TO Firestore when auth has a NON-EMPTY value.
            // Never overwrite a valid Firestore photoURL with null/empty from auth persistence.
            // This prevents the cycle: reload -> auth photoURL=null -> overwrites Firestore -> photos disappear
            if (user.photoURL && user.photoURL !== (existing.photoURL || '')) {
              updates.photoURL = user.photoURL;
            }
            if ((user.displayName || '') && (user.displayName || '') !== (existing.name || '')) {
              updates.name = user.displayName;
            }
            if (isAdminEmail && existing.role !== 'Admin') {
              updates.role = 'Admin';

            }
            if (Object.keys(updates).length > 0) {
              await ref.update(updates);
            }
            // Always save current UID as lastUid for UID change detection
            if (existing.lastUid !== user.uid) {
              await ref.update({ lastUid: user.uid });
            }
          }
          // RESTORE TENANT FROM FIRESTORE (survives cache clearing)
          // If localStorage was cleared, check if user has a saved tenant in Firestore
          const savedTenantId = localStorage.getItem('archii-active-tenant');
          if (!savedTenantId) {
            try {
              const userData = snap.exists ? snap.data() : null;
              const fsDefaultTenantId = userData?.defaultTenantId;
              if (fsDefaultTenantId) {
                // Verify the user still belongs to this tenant
                const tenantDoc = await db.collection('tenants').doc(fsDefaultTenantId).get();
                if (tenantDoc.exists) {
                  const tData = tenantDoc.data();
                  const members: string[] = tData.members || [];
                  // Check if user is member by ANY UID (current or stored in user doc)
                  const isMember = members.includes(user.uid);
                  const wasMemberWithOldUid = userData?.lastUid && members.includes(userData.lastUid) && userData.lastUid !== user.uid;
                  if (isMember || wasMemberWithOldUid) {
                    // If user has a new UID but was member with old UID, add new UID
                    if (wasMemberWithOldUid && !isMember) {
                      const tenantUpdates: Record<string, any> = { members: fb.firestore.FieldValue.arrayUnion(user.uid) };
                      // Also migrate Super Admin
                      const superAdmins: string[] = tData.superAdmins || [];
                      if (superAdmins.includes(userData.lastUid) && !superAdmins.includes(user.uid)) {
                        tenantUpdates.superAdmins = fb.firestore.FieldValue.arrayUnion(user.uid);
                      }
                      await db.collection('tenants').doc(fsDefaultTenantId).update(tenantUpdates);

                    }
                    // Determine role — trust saved defaultTenantRole first, then verify on tenant doc
                    let role = 'Miembro';
                    if (userData.defaultTenantRole === 'Super Admin') {
                      role = 'Super Admin';
                      // Ensure the Super Admin role is in the tenant doc too
                      const superAdmins: string[] = tData.superAdmins || [];
                      if (!superAdmins.includes(user.uid)) {
                        await db.collection('tenants').doc(fsDefaultTenantId).update({
                          superAdmins: fb.firestore.FieldValue.arrayUnion(user.uid),
                        });

                      }
                    } else if (tData.createdBy === user.uid || (tData.superAdmins || []).includes(user.uid)) {
                      role = 'Super Admin';
                    }
                    const tenantName = userData.defaultTenantName || tData.name || fsDefaultTenantId;

                    setActiveTenantId(fsDefaultTenantId);
                    setActiveTenantName(tenantName);
                    setActiveTenantRole(role);
                    setTenantReady(true);
                    // Also restore localStorage for future fast loads
                    localStorage.setItem('archii-active-tenant', fsDefaultTenantId);
                    localStorage.setItem('archii-active-tenant-name', tenantName);
                    localStorage.setItem('archii-active-tenant-role', role);
                  } else {
                    // Saved tenant no longer has this user as member
                  }
                } else {
                  // Saved tenant no longer exists
                }
              }
            } catch (_restoreErr) {
              // Could not restore tenant from Firestore
            }
          }
      }
      setLoading(false);
      } catch (authErr: any) {
        console.error('[Archii Auth] onAuthStateChanged error:', authErr);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [ready]);

  // ALL users cache (from Firestore) — always up to date via onSnapshot
  // This is the raw list before tenant filtering
  const [allUsersCache, setAllUsersCache] = useState<TeamUser[]>([]);

  // Load ALL users from Firestore (runs once when auth is ready)
  useEffect(() => {
    if (!ready || !authUser) { setAllUsersCache([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('users').onSnapshot(snap => {
      const users = snap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

      setAllUsersCache(users);
    }, (err: any) => {
      console.error('[Archii Team] ERROR loading users collection:', err.code, err.message);
      // If permission denied, try fetching just the current user as fallback
      if (err.code === 'permission-denied') {
        console.warn('[Archii Team] Permission denied on users collection — checking Firestore rules');
        // Fallback: at least show the current user
        db.collection('users').doc(authUser.uid).get().then(doc => {
          if (doc.exists) {
            setAllUsersCache([{ id: doc.id, data: doc.data() }]);
          }
        }).catch(() => {});
      }
    });
    return () => unsub();
  }, [ready, authUser]);

  // Listen to active tenant document for members array + verify role in real-time
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setActiveTenantMembers([]); return; }
    // Reset AUTO-FIX guard when tenant changes
    autoFixMembersDoneRef.current = false;
    const db = getFirebase().firestore();
    const uid = authUser.uid;
    const unsub = db.collection('tenants').doc(activeTenantId).onSnapshot(snap => {
      if (snap.exists) {
        const data = snap.data();
        const members = data?.members || [];

        setActiveTenantMembers(members);
        // VERIFY ROLE: Always re-derive the real role from tenant document
        const isCreator = data?.createdBy === uid;
        const superAdmins: string[] = data?.superAdmins || [];
        const isSuperAdmin = isCreator || superAdmins.includes(uid);
        const realRole = isSuperAdmin ? 'Super Admin' : 'Miembro';


        // ALWAYS update role state from tenant doc (no stale closure comparison)
        setActiveTenantRole(prev => {
          if (prev !== realRole) {

            // Persist corrected role
            try {
              localStorage.setItem('archii-active-tenant-role', realRole);
              db.collection('users').doc(uid).update({ defaultTenantRole: realRole });
            } catch (_) { /* ignore */ }
          }
          return realRole;
        });

        // AUTO-FIX 1: Super Admin exists in superAdmins but missing from members → add to members.
        // Firestore rules check members array for access, so this mismatch causes permission denied.
        // Only runs once per tenant session to avoid unnecessary writes on every snapshot.
        if (isSuperAdmin && !members.includes(uid) && !autoFixMembersDoneRef.current) {
          autoFixMembersDoneRef.current = true;
          db.collection('tenants').doc(activeTenantId).update({
            members: getFirebase().firestore.FieldValue.arrayUnion(uid),
          }).catch(err => {
            console.error('[Archii Team] AUTO-FIX members failed:', err);
          });
        }

        // AUTO-FIX 2: If user was previously Super Admin (stored in user doc) but tenant doesn't reflect it,
        // automatically add to superAdmins + members arrays. This handles UID changes from auth provider switches.
        if (!isSuperAdmin) {
          db.collection('users').doc(uid).get().then(userDoc => {
            if (userDoc.exists) {
              const userData = userDoc.data();
              if (userData?.defaultTenantRole === 'Super Admin' || userData?.defaultTenantId === activeTenantId) {

                db.collection('tenants').doc(activeTenantId).update({
                  superAdmins: getFirebase().firestore.FieldValue.arrayUnion(uid),
                  members: getFirebase().firestore.FieldValue.arrayUnion(uid),
                }).then(() => {

                  localStorage.setItem('archii-active-tenant-role', 'Super Admin');
                  db.collection('users').doc(uid).update({ defaultTenantRole: 'Super Admin' });
                }).catch(err => {
                  console.error('[Archii Team] AUTO-FIX failed:', err);
                });
              }
            }
          }).catch(() => {});
        }
      } else {

        setActiveTenantMembers([]);
      }
    }, (err: any) => {
      console.error('[Archii Team] ERROR loading tenant document:', err.code, err.message);
    });
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // AUTO-FIX: When auth is ready and tenant is loaded, if role is Miembro, call fix-my-role from server
  // This runs once after auth + tenant are ready, and ensures the role is correct in Firestore
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId || activeTenantRole !== 'Miembro') return;
    // Only run once (debounced)
    const timer = setTimeout(async () => {
      try {
        const token = await authUser.getIdToken();

        const res = await fetch('/api/tenants', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'fix-my-role' }),
        });
        const data = await res.json();

        if (data.fixed?.length > 0 || data.addedToMembers?.length > 0) {
          setTimeout(() => window.location.reload(), 2000);
        }
      } catch (err) {
        console.error('[Archii] AUTO-FIX error:', err);
      }
    }, 3000); // Wait 3s to let the tenant onSnapshot listener try first
    return () => clearTimeout(timer);
  }, [ready, authUser, activeTenantId, activeTenantRole]);

  // Derive teamUsers from allUsersCache + activeTenantMembers
  // This REACTS immediately when members change — no race condition
  useEffect(() => {

    if (activeTenantId && activeTenantMembers.length > 0) {
      const filtered = allUsersCache.filter((u: any) => activeTenantMembers.includes(u.id));
      setTeamUsers(filtered);
    } else {
      setTeamUsers(allUsersCache);
    }
  }, [allUsersCache, activeTenantId, activeTenantMembers]);

  // Helper: mark a tracked collection as loaded. Called from each onSnapshot callback.
  // When all 6 tracked collections have loaded, triggers hydration effect.
  // Note: approvals is scoped by selectedProjectId (not tenantId), so it's excluded.
  const markCollectionSnapshot = useCallback(() => {
    if (!tenantSwitchingRef.current) return;
    if (snapshotCountRef.current < 6) {
      snapshotCountRef.current += 1;
      if (snapshotCountRef.current >= 6) {
        setSnapshotTrigger(t => t + 1); // Force re-evaluation of hydration effect
      }
    }
  }, []);

  // Load projects (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setProjects([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('projects').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'desc').onSnapshot(snap => {
      setProjects(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
      markCollectionSnapshot();
    }, (err: any) => {
  console.error('[Archii] Snapshot error:', err.code, err.message);
});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // Load tasks (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setTasks([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('tasks').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'desc').onSnapshot(snap => {
      setTasks(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
      markCollectionSnapshot();
    }, (err: any) => {
  console.error('[Archii] Snapshot error:', err.code, err.message);
});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // Load expenses (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setExpenses([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('expenses').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'desc').onSnapshot(snap => {
      setExpenses(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
    }, (err: any) => {
  console.error('[Archii] Snapshot error:', err.code, err.message);
});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // Load suppliers (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setSuppliers([]); setCompanies([]); return; }
    const db = getFirebase().firestore();
    const unsubs: any[] = [];
    unsubs.push(db.collection('suppliers').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'desc').onSnapshot(snap => {
      setSuppliers(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
    }, (err: any) => {
      console.error('[Archii] Snapshot error:', err.code, err.message);
    }));

    // Companies listener (tenant-filtered)
    unsubs.push(db.collection('companies').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'desc').onSnapshot(snap => {
      setCompanies(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
    }, (err: any) => {
      console.error('[Archii] Snapshot error:', err.code, err.message);
    }));

    return () => unsubs.forEach(u => u());
  }, [ready, authUser, activeTenantId]);



  // Load work phases via Admin SDK (bypass security rules)
  useEffect(() => {
    if (!ready || !selectedProjectId || !activeTenantId) { setWorkPhases([]); return; }
    let cancelled = false;
    const loadPhases = async () => {
      try {
        const token = await getFirebaseIdToken();
        const res = await fetch(`/api/project-phases?projectId=${selectedProjectId}&tenantId=${activeTenantId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) { setWorkPhases([]); return; }
        const data = await res.json();
        const phases = data.phases || [];
        if (!cancelled) {
          setWorkPhases(phases);
          setProjectPhasesCache(prev => ({ ...prev, [selectedProjectId]: phases }));
        }
      } catch (e) { if (!cancelled) setWorkPhases([]); }
    };
    loadPhases();
    // Poll every 5s to keep data fresh
    const interval = setInterval(loadPhases, 5000);
    return () => { cancelled = true; clearInterval(interval); setWorkPhases([]); };
  }, [ready, selectedProjectId, activeTenantId]);

  // Helper: get phases for any project (with cache)
  const getPhasesForProject = useCallback((projectId: string): WorkPhase[] => {
    if (projectPhasesCache[projectId]) return projectPhasesCache[projectId];
    // If not cached and it's the selected project, return current workPhases
    if (projectId === selectedProjectId) return workPhases;
    return [];
  }, [projectPhasesCache, selectedProjectId, workPhases]);

  // Helper: load phases for a project on demand (used by TaskModal)
  const loadPhasesForProject = useCallback(async (projectId: string) => {
    if (!ready || !activeTenantId || !projectId) return;
    if (projectPhasesCache[projectId]) return; // Already cached
    try {
      const token = await getFirebaseIdToken();
      const res = await fetch(`/api/project-phases?projectId=${projectId}&tenantId=${activeTenantId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const phases = data.phases || [];
      setProjectPhasesCache(prev => ({ ...prev, [projectId]: phases }));
    } catch (e) { /* silent */ }
  }, [ready, activeTenantId, projectPhasesCache]);

  // Helper: get phase name by id
  const getPhaseName = useCallback((phaseId: string | undefined, projectId: string | undefined): string => {
    if (!phaseId || !projectId) return '';
    const phases = getPhasesForProject(projectId);
    const phase = phases.find(p => p.id === phaseId);
    return phase ? phase.data.name : '';
  }, [getPhasesForProject]);

  // Load project files
  useEffect(() => {
    if (!ready || !selectedProjectId) return;
    const db = getFirebase().firestore();
    const unsub = db.collection('projects').doc(selectedProjectId).collection('files').orderBy('createdAt', 'desc').onSnapshot(snap => {
      setProjectFiles(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    }, (err: any) => {
  console.error('[Archii] Snapshot error:', err.code, err.message);
});
    return () => { unsub(); setProjectFiles([]); };
  }, [ready, selectedProjectId]);

  // Load approvals
  useEffect(() => {
    if (!ready || !selectedProjectId) return;
    const db = getFirebase().firestore();
    const unsub = db.collection('projects').doc(selectedProjectId).collection('approvals').orderBy('createdAt', 'desc').onSnapshot(snap => {
      setApprovals(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
    }, (err: any) => {
  console.error('[Archii] Snapshot error:', err.code, err.message);
});
    return () => { unsub(); setApprovals([]); };
  }, [ready, selectedProjectId]);

  // Load meetings (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setMeetings([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('meetings').where('tenantId', '==', activeTenantId).orderBy('date', 'asc').onSnapshot(snap => {
      setMeetings(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
      markCollectionSnapshot();
    }, (err: any) => {
  console.error('[Archii] Snapshot error:', err.code, err.message);
});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // Load gallery photos (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setGalleryPhotos([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('galleryPhotos').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'desc').onSnapshot(snap => {
      setGalleryPhotos(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
    }, (err: any) => {
  console.error('[Archii] Snapshot error:', err.code, err.message);
});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // Load comments (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setComments([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('comments').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'asc').limit(300).onSnapshot(snap => {
      setComments(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
    }, (err: any) => {
  console.error('[Archii] Snapshot error:', err.code, err.message);
});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // Load RFIs (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setRfis([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('rfis').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'desc').onSnapshot(snap => {
      setRfis(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
      markCollectionSnapshot();
    }, (err: any) => {
  console.error('[Archii] Snapshot error:', err.code, err.message);
});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // Load Submittals (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setSubmittals([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('submittals').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'desc').onSnapshot(snap => {
      setSubmittals(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
      markCollectionSnapshot();
    }, (err: any) => {
  console.error('[Archii] Snapshot error:', err.code, err.message);
});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // Load Punch Items (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setPunchItems([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('punchItems').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'desc').onSnapshot(snap => {
      setPunchItems(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
      markCollectionSnapshot();
    }, (err: any) => {
  console.error('[Archii] Snapshot error:', err.code, err.message);
});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // Load daily logs for selected project
  useEffect(() => {
    if (!ready || !authUser || !selectedProjectId) return;
    const db = getFirebase().firestore();
    const unsub = db.collection('projects').doc(selectedProjectId).collection('dailyLogs').orderBy('date', 'desc').limit(100).onSnapshot(snap => {
      setDailyLogs(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
    }, (err: any) => {
  console.error('[Archii] Snapshot error:', err.code, err.message);
});
    return () => { unsub(); setDailyLogs([]); };
  }, [ready, authUser, selectedProjectId]);

  /* ===== NOTIFICATION DETECTION EFFECTS ===== */
  // (Notification engine — state, sound, OS notifications — extracted to NotificationProvider)
  // These effects detect domain changes and call sendNotif/sendBrowserNotif from notifCtx.

  // RESET notification tracking when tenant changes.
  // Without this, switching tenants treats all new tenant data as "new/changed"
  // and fires notifications for every task, approval, meeting, etc.
  const prevTenantIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeTenantId && activeTenantId !== prevTenantIdRef.current) {
      prevTenantIdRef.current = activeTenantId;
      // BLOCK all notifications until new tenant data fully loads
      tenantSwitchingRef.current = true;
      // Reset snapshot counter for new tenant
      snapshotCountRef.current = 0;
      snapshotTenantRef.current = activeTenantId;
      // Reset all tracking — new tenant data is a fresh "first load"
      allCollectionsLoadedRef.current = false;
      firstLoadDoneRef.current = false;
      collectionsLoadedRef.current = { tasks: false, approvals: false, meetings: false, projects: false, rfis: false, submittals: false, punchItems: false };
      knownTaskIdsRef.current = new Set();
      knownApprovalIdsRef.current = new Set();
      knownMeetingIdsRef.current = new Set();
      knownProjectIdsRef.current = new Set();
      knownRfiIdsRef.current = new Set();
      knownSubmittalIdsRef.current = new Set();
      knownPunchItemIdsRef.current = new Set();
      prevTaskStatusRef.current = new Map();
      prevApprovalStatusRef.current = new Map();
      prevProjectStatusRef.current = new Map();
      prevRfiStatusRef.current = new Map();
      prevSubmittalStatusRef.current = new Map();
      prevPunchStatusRef.current = new Map();
      overdueCheckedRef.current = ''; // Reset overdue check for new tenant
      // Clear notification buffer
      notificationBufferRef.current.clear();
      if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
      // Clear notification history and panel (from NotificationProvider)
      resetNotifOnTenantSwitch();
    }
  }, [activeTenantId]);

  // Mark collections as hydrated and arm notifications.
  // On initial load: when loading flips false, all onSnapshot have fired.
  // On tenant switch: wait for snapshotCountRef to reach 6 (each onSnapshot
  // callback increments it). This guarantees we seed AFTER real data arrives.
  const TOTAL_TRACKED = 6;
  useEffect(() => {
    if (loading || allCollectionsLoadedRef.current) return;
    // During tenant switching, wait for all 6 onSnapshot callbacks to fire
    // before seeding. This guarantees data is from the NEW tenant.
    if (tenantSwitchingRef.current) {
      if (snapshotCountRef.current < TOTAL_TRACKED) return;
      // All 6 collections have loaded for the new tenant
    }
    // Initial load (first time loading goes false) — all data is fresh
    if (!loading) {
      collectionsLoadedRef.current.tasks = true;
      collectionsLoadedRef.current.approvals = true;
      collectionsLoadedRef.current.meetings = true;
      collectionsLoadedRef.current.projects = true;
      collectionsLoadedRef.current.rfis = true;
      collectionsLoadedRef.current.submittals = true;
      collectionsLoadedRef.current.punchItems = true;
      allCollectionsLoadedRef.current = true;
      // Seed all known ID sets with current data (mark as "seen")
      knownTaskIdsRef.current = new Set(tasks.map(t => t.id));
      knownApprovalIdsRef.current = new Set(approvals.map(a => a.id));
      knownMeetingIdsRef.current = new Set(meetings.map(m => m.id));
      knownProjectIdsRef.current = new Set(projects.map(p => p.id));
      knownRfiIdsRef.current = new Set(rfis.map(r => r.id));
      knownSubmittalIdsRef.current = new Set(submittals.map(s => s.id));
      knownPunchItemIdsRef.current = new Set(punchItems.map(p => p.id));
      // Also seed status maps for change detection
      tasks.forEach(t => { prevTaskStatusRef.current.set(t.id, { status: t.data.status, priority: t.data.priority, assigneeId: t.data.assigneeId }); });
      approvals.forEach(a => { prevApprovalStatusRef.current.set(a.id, a.data.status); });
      projects.forEach(p => { prevProjectStatusRef.current.set(p.id, p.data.status); });
      rfis.forEach(r => { prevRfiStatusRef.current.set(r.id, r.data.status); });
      submittals.forEach(s => { prevSubmittalStatusRef.current.set(s.id, s.data.status); });
      punchItems.forEach(p => { prevPunchStatusRef.current.set(p.id, p.data.status); });
      firstLoadDoneRef.current = true;
      tenantSwitchingRef.current = false;
    }
  }, [loading, tasks, meetings, approvals, projects, rfis, submittals, punchItems, snapshotTrigger]);

  // Safety timeout: arm notifications after 5s even if some collections are empty
  useEffect(() => {
    if (loading || allCollectionsLoadedRef.current) return;
    const timer = setTimeout(() => {
      if (!allCollectionsLoadedRef.current) {
        // Seed known IDs with whatever data we have
        knownTaskIdsRef.current = new Set(tasks.map(t => t.id));
        knownApprovalIdsRef.current = new Set(approvals.map(a => a.id));
        knownMeetingIdsRef.current = new Set(meetings.map(m => m.id));
        knownProjectIdsRef.current = new Set(projects.map(p => p.id));
        knownRfiIdsRef.current = new Set(rfis.map(r => r.id));
        knownSubmittalIdsRef.current = new Set(submittals.map(s => s.id));
        knownPunchItemIdsRef.current = new Set(punchItems.map(p => p.id));
        allCollectionsLoadedRef.current = true;
        firstLoadDoneRef.current = true;
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [loading, tasks, approvals, meetings, projects, rfis, submittals, punchItems]);

  // Detect new/changed tasks assigned to me (Set-based O(1) lookup)
  // Guard: skip during tenant switching to avoid false positives
  useEffect(() => {
    if (!firstLoadDoneRef.current || tenantSwitchingRef.current) return;
    const newTaskIds: string[] = [];
    const changedTaskIds: string[] = [];
    tasks.forEach(t => {
      if (!knownTaskIdsRef.current.has(t.id)) {
        newTaskIds.push(t.id);
      } else {
        const prev = prevTaskStatusRef.current.get(t.id);
        if (prev && (prev.status !== t.data.status || prev.priority !== t.data.priority || prev.assigneeId !== t.data.assigneeId)) {
          changedTaskIds.push(t.id);
        }
      }
    });
    // Update tracking maps
    knownTaskIdsRef.current = new Set(tasks.map(t => t.id));
    tasks.forEach(t => { prevTaskStatusRef.current.set(t.id, { status: t.data.status, priority: t.data.priority, assigneeId: t.data.assigneeId }); });

    if (notifPrefs.tasks) {
      newTaskIds.forEach(id => {
        const t = tasks.find(tt => tt.id === id);
        if (!t) return;
        if (t.data.assigneeId === authUser?.uid) {
          const proj = projects.find(p => p.id === t.data.projectId);
          sendBrowserNotif('📋 Nueva tarea asignada', `"${t.data.title}"${proj ? ` — ${proj.data.name}` : ''}${t.data.dueDate ? ` · Vence: ${fmtDate(t.data.dueDate)}` : ''}`, undefined, `task-${t.id}`, { type: 'task', screen: 'tasks', itemId: t.id });
        }
        if (t.data.assigneeId && t.data.assigneeId !== authUser?.uid) {
          const proj = projects.find(p => p.id === t.data.projectId);
          bufferedNotify('taskAssigned', { uid: t.data.assigneeId, title: t.data.title, projName: proj?.data?.name || 'Proyecto', priority: t.data.priority, dueDate: t.data.dueDate, by: authUser?.displayName || authUser?.email || 'Alguien' });
        }
      });
      changedTaskIds.forEach(id => {
        const t = tasks.find(tt => tt.id === id);
        if (!t) return;
        if (t.data.assigneeId === authUser?.uid) {
          const proj = projects.find(p => p.id === t.data.projectId);
          sendBrowserNotif(t.data.status === 'Completado' ? '✅ Tarea completada' : t.data.status === 'En progreso' ? '🔄 Tarea en progreso' : '📝 Tarea actualizada', `"${t.data.title}"${proj ? ` — ${proj.data.name}` : ''} · ${t.data.status}`, undefined, `task-${t.id}`, { type: 'task', screen: 'tasks', itemId: t.id });
        }
        if (t.data.assigneeId && t.data.assigneeId !== authUser?.uid) {
          bufferedNotify('taskUpdated', { uid: t.data.assigneeId, title: t.data.title, status: t.data.status });
        }
      });
    }
  }, [tasks, notifPrefs.tasks, authUser, projects, sendBrowserNotif, bufferedNotify]);

  // Detect new meetings (Set-based O(1) lookup)
  useEffect(() => {
    if (!firstLoadDoneRef.current || tenantSwitchingRef.current) return;
    const newMeetingIds: string[] = [];
    meetings.forEach(m => { if (!knownMeetingIdsRef.current.has(m.id)) newMeetingIds.push(m.id); });
    knownMeetingIdsRef.current = new Set(meetings.map(m => m.id));
    if (newMeetingIds.length > 0 && notifPrefs.meetings) {
      newMeetingIds.forEach(id => {
        const m = meetings.find(mm => mm.id === id);
        if (!m) return;
        const proj = projects.find(p => p.id === m.data.projectId);
        sendBrowserNotif('📅 Nueva reunión programada', `"${m.data.title}"${m.data.time ? ` a las ${m.data.time}` : ''}${m.data.date ? ` · ${fmtDate(m.data.date)}` : ''}${proj ? ` — ${proj.data.name}` : ''}`, undefined, `meeting-${m.id}`, { type: 'meeting', screen: 'calendar', itemId: m.id });
        if (proj) {
          const teamMemberIds = teamUsers.filter(u => u.id !== authUser?.uid).map(u => u.id);
          teamMemberIds.forEach(uid => { bufferedNotify('meetingReminder', { uid, title: m.data.title, date: m.data.date ? fmtDate(m.data.date) : '', time: m.data.time || '', projName: proj.data.name }); });
        }
      });
    }
  }, [meetings, notifPrefs.meetings, projects, teamUsers, authUser, sendBrowserNotif, bufferedNotify]);

  // Detect new approvals (Set-based O(1) lookup)
  useEffect(() => {
    if (!firstLoadDoneRef.current || tenantSwitchingRef.current) return;
    const newApprovalIds: string[] = [];
    const changedApprovalIds: string[] = [];
    approvals.forEach(a => {
      if (!knownApprovalIdsRef.current.has(a.id)) {
        newApprovalIds.push(a.id);
      } else {
        const prev = prevApprovalStatusRef.current.get(a.id);
        if (prev && prev !== a.data.status) changedApprovalIds.push(a.id);
      }
    });
    knownApprovalIdsRef.current = new Set(approvals.map(a => a.id));
    approvals.forEach(a => { prevApprovalStatusRef.current.set(a.id, a.data.status); });

    if (notifPrefs.approvals) {
      newApprovalIds.forEach(id => {
        const a = approvals.find(aa => aa.id === id);
        if (!a) return;
        sendBrowserNotif('📋 Nueva solicitud de aprobación', `"${a.data.title}" · Pendiente de revisión`, undefined, `approval-${a.id}`, { type: 'approval', screen: 'projectDetail', itemId: selectedProjectId });
        const aData = a.data as any;
        const reviewerId = aData.assignedTo || aData.reviewerId || aData.reviewer;
        if (reviewerId && reviewerId !== authUser?.uid) {
          const proj = projects.find(p => p.id === (aData.projectId || selectedProjectId));
          bufferedNotify('approvalPending', { uid: reviewerId, title: a.data.title, projName: proj?.data?.name || 'Proyecto', by: authUser?.displayName || authUser?.email || 'Alguien' });
        }
      });
      changedApprovalIds.forEach(id => {
        const a = approvals.find(aa => aa.id === id);
        if (!a) return;
        sendBrowserNotif(a.data.status === 'Aprobada' ? '✅ Aprobación aceptada' : a.data.status === 'Rechazada' ? '❌ Aprobación rechazada' : '📝 Aprobación actualizada', `"${a.data.title}" · ${a.data.status}`, undefined, `approval-${a.id}`, { type: 'approval', screen: 'projectDetail', itemId: selectedProjectId });
        if (a.data.status && a.data.status !== 'Pendiente') {
          const aData = a.data as any;
          const creatorId = aData.createdBy || aData.requestedBy;
          const reviewerId = aData.assignedTo || aData.reviewerId || aData.reviewer;
          if (creatorId && creatorId !== authUser?.uid) bufferedNotify('approvalResolved', { uid: creatorId, title: a.data.title, status: a.data.status, by: authUser?.displayName || authUser?.email || 'Alguien' });
          if (reviewerId && reviewerId !== authUser?.uid && reviewerId !== creatorId) bufferedNotify('approvalResolved', { uid: reviewerId, title: a.data.title, status: a.data.status, by: authUser?.displayName || authUser?.email || 'Alguien' });
        }
      });
    }
  }, [approvals, notifPrefs.approvals, selectedProjectId, sendBrowserNotif, bufferedNotify, authUser, projects]);

  // Meeting reminder check (every 60 seconds) — unchanged logic, just guard
  useEffect(() => {
    if (!firstLoadDoneRef.current || tenantSwitchingRef.current) return;
    if (!notifPrefs.meetings || !authUser) return;
    const check = () => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      meetings.forEach(m => {
        if (m.data.date === todayStr && m.data.time) {
          const [h, min] = m.data.time.split(':').map(Number);
          const meetingMinutes = h * 60 + min;
          const diff = meetingMinutes - nowMinutes;
          if (diff === 15 || diff === 5) {
            const proj = projects.find(p => p.id === m.data.projectId);
            sendBrowserNotif(`⏰ Reunión en ${diff} minutos`, `"${m.data.title}" a las ${m.data.time}${proj ? ` — ${proj.data.name}` : ''}`, undefined, `reminder-${m.id}-${diff}`, { type: 'meeting', screen: 'calendar' });
          }
        }
      });
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [meetings, notifPrefs.meetings, authUser, projects, sendBrowserNotif]);

  // Detect project status changes (Set-based O(1) lookup)
  useEffect(() => {
    if (!firstLoadDoneRef.current || tenantSwitchingRef.current) return;
    const changedProjectIds: string[] = [];
    projects.forEach(p => {
      if (!knownProjectIdsRef.current.has(p.id)) return;
      const prev = prevProjectStatusRef.current.get(p.id);
      if (prev && prev !== p.data.status) changedProjectIds.push(p.id);
    });
    knownProjectIdsRef.current = new Set(projects.map(p => p.id));
    projects.forEach(p => { prevProjectStatusRef.current.set(p.id, p.data.status); });
    if (notifPrefs.projects) {
      changedProjectIds.forEach(id => {
        const p = projects.find(pp => pp.id === id);
        if (!p) return;
        const statusEmoji = p.data.status === 'Ejecucion' ? '🏗️' : p.data.status === 'Terminado' ? '🎉' : p.data.status === 'Diseno' ? '🎨' : '📁';
        sendNotif(`${statusEmoji} Proyecto actualizado`, `"${p.data.name}" cambió a: ${p.data.status}`, undefined, `proj-${p.id}`, { type: 'project', screen: 'projects', itemId: p.id });
      });
    }
  }, [projects, notifPrefs.projects, sendNotif]);

  // Overdue tasks reminder (check every 30 min) — unchanged logic, just guard
  useEffect(() => {
    if (!firstLoadDoneRef.current || tenantSwitchingRef.current) return;
    if (!notifPrefs.tasks || !authUser) return;
    const check = () => {
      const today = new Date().toISOString().split('T')[0];
      const checkKey = `overdue-${today}`;
      if (overdueCheckedRef.current === checkKey) return;
      overdueCheckedRef.current = checkKey;
      const myOverdue = tasks.filter(t => t.data.assigneeId === authUser?.uid && t.data.status !== 'Completado' && t.data.dueDate && checkOverdue(t.data.dueDate));
      if (myOverdue.length > 0) {
        sendNotif(`⚠️ ${myOverdue.length} tarea${myOverdue.length > 1 ? 's' : ''} vencida${myOverdue.length > 1 ? 's' : ''}`, myOverdue.slice(0, 3).map(t => `"${t.data.title}"`).join(', '), undefined, 'overdue-daily', { type: 'reminder', screen: 'tasks' });
      }
    };
    check();
    const iv = setInterval(check, 30 * 60 * 1000);
    return () => clearInterval(iv);
  }, [tasks, notifPrefs.tasks, authUser, sendNotif]);

  // Detect new/changed RFIs (Set-based O(1) lookup)
  useEffect(() => {
    if (!firstLoadDoneRef.current || tenantSwitchingRef.current) return;
    const newRfiIds: string[] = [];
    const changedRfiIds: string[] = [];
    rfis.forEach(r => {
      if (!knownRfiIdsRef.current.has(r.id)) newRfiIds.push(r.id);
      else { const prev = prevRfiStatusRef.current.get(r.id); if (prev && prev !== r.data.status) changedRfiIds.push(r.id); }
    });
    knownRfiIdsRef.current = new Set(rfis.map(r => r.id));
    rfis.forEach(r => { prevRfiStatusRef.current.set(r.id, r.data.status); });
    if (notifPrefs.rfis) {
      newRfiIds.forEach(id => {
        const r = rfis.find(rr => rr.id === id);
        if (!r) return;
        const proj = projects.find(p => p.id === r.data.projectId);
        sendNotif('❓ Nuevo RFI', `"${r.data.subject || r.data.number}"${proj ? ` — ${proj.data.name}` : ''}${r.data.priority === 'Alta' ? ' · Prioridad ALTA' : ''}`, undefined, `rfi-${r.id}`, { type: 'rfi', screen: 'rfis', itemId: r.id });
        if (r.data.assignedTo && r.data.assignedTo !== authUser?.uid) bufferedNotify('custom', { uid: r.data.assignedTo, message: `❓ Nuevo RFI: "${r.data.subject || r.data.number}"${proj ? ` — ${proj.data.name}` : ''}${r.data.priority === 'Alta' ? ' · Prioridad ALTA' : ''}` });
      });
      changedRfiIds.forEach(id => {
        const r = rfis.find(rr => rr.id === id);
        if (!r) return;
        const proj = projects.find(p => p.id === r.data.projectId);
        if (r.data.status === 'Respondido' && r.data.assignedTo === authUser?.uid) {
          sendNotif('✅ RFI respondido', `"${r.data.subject || r.data.number}" ha sido respondido${proj ? ` — ${proj.data.name}` : ''}`, undefined, `rfi-${r.id}`, { type: 'rfi', screen: 'rfis', itemId: r.id });
          if (r.data.createdBy && r.data.createdBy !== authUser?.uid) bufferedNotify('custom', { uid: r.data.createdBy, message: `✅ RFI respondido: "${r.data.subject || r.data.number}"` });
        } else if (r.data.status === 'Cerrado' && r.data.createdBy === authUser?.uid) {
          sendNotif('🔒 RFI cerrado', `"${r.data.subject || r.data.number}" ha sido cerrado`, undefined, `rfi-${r.id}`, { type: 'rfi', screen: 'rfis', itemId: r.id });
        }
      });
    }
  }, [rfis, notifPrefs.rfis, authUser, projects, sendNotif, bufferedNotify]);

  // Detect new/changed Submittals (Set-based O(1) lookup)
  useEffect(() => {
    if (!firstLoadDoneRef.current || tenantSwitchingRef.current) return;
    const newSubIds: string[] = [];
    const changedSubIds: string[] = [];
    submittals.forEach(s => {
      if (!knownSubmittalIdsRef.current.has(s.id)) newSubIds.push(s.id);
      else { const prev = prevSubmittalStatusRef.current.get(s.id); if (prev && prev !== s.data.status) changedSubIds.push(s.id); }
    });
    knownSubmittalIdsRef.current = new Set(submittals.map(s => s.id));
    submittals.forEach(s => { prevSubmittalStatusRef.current.set(s.id, s.data.status); });
    if (notifPrefs.submittals) {
      newSubIds.forEach(id => {
        const s = submittals.find(ss => ss.id === id);
        if (!s) return;
        if (s.data.reviewer === authUser?.uid) {
          const proj = projects.find(p => p.id === s.data.projectId);
          sendNotif('📋 Nuevo submittal para revisión', `"${s.data.title || s.data.number}"${proj ? ` — ${proj.data.name}` : ''}`, undefined, `sub-${s.id}`, { type: 'submittal', screen: 'submittals', itemId: s.id });
        }
        if (s.data.reviewer && s.data.reviewer !== authUser?.uid) {
          const proj = projects.find(p => p.id === s.data.projectId);
          bufferedNotify('custom', { uid: s.data.reviewer, message: `📋 Nuevo submittal para revisión: "${s.data.title || s.data.number}"${proj ? ` — ${proj.data.name}` : ''}` });
        }
      });
      changedSubIds.forEach(id => {
        const s = submittals.find(ss => ss.id === id);
        if (!s) return;
        const proj = projects.find(p => p.id === s.data.projectId);
        if (s.data.status === 'Aprobado' && s.data.createdBy === authUser?.uid) {
          sendNotif('✅ Submittal aprobado', `"${s.data.title || s.data.number}" ha sido aprobado${proj ? ` — ${proj.data.name}` : ''}`, undefined, `sub-${s.id}`, { type: 'submittal', screen: 'submittals', itemId: s.id });
        } else if ((s.data.status === 'Rechazado' || s.data.status === 'Devuelto') && s.data.createdBy === authUser?.uid) {
          sendNotif(s.data.status === 'Rechazado' ? '❌ Submittal rechazado' : '↩️ Submittal devuelto', `"${s.data.title || s.data.number}" — ${s.data.reviewNotes || 'Sin notas'}`, undefined, `sub-${s.id}`, { type: 'submittal', screen: 'submittals', itemId: s.id });
        } else if (s.data.status === 'En revisión' && s.data.reviewer === authUser?.uid) {
          sendNotif('⚖️ Submittal listo para revisión', `"${s.data.title || s.data.number}" requiere tu revisión${proj ? ` — ${proj.data.name}` : ''}`, undefined, `sub-${s.id}`, { type: 'submittal', screen: 'submittals', itemId: s.id });
        }
      });
    }
  }, [submittals, notifPrefs.submittals, authUser, projects, sendNotif, bufferedNotify]);

  // Detect new/changed Punch Items (Set-based O(1) lookup)
  useEffect(() => {
    if (!firstLoadDoneRef.current || tenantSwitchingRef.current) return;
    const newPunchIds: string[] = [];
    const changedPunchIds: string[] = [];
    punchItems.forEach(p => {
      if (!knownPunchItemIdsRef.current.has(p.id)) newPunchIds.push(p.id);
      else { const prev = prevPunchStatusRef.current.get(p.id); if (prev && prev !== p.data.status) changedPunchIds.push(p.id); }
    });
    knownPunchItemIdsRef.current = new Set(punchItems.map(p => p.id));
    punchItems.forEach(p => { prevPunchStatusRef.current.set(p.id, p.data.status); });
    if (notifPrefs.punchList) {
      newPunchIds.forEach(id => {
        const p = punchItems.find(pp => pp.id === id);
        if (!p) return;
        if (p.data.assignedTo === authUser?.uid) {
          const proj = projects.find(pr => pr.id === p.data.projectId);
          sendNotif('✅ Nuevo item Punch List', `"${p.data.title}" — ${p.data.location || 'Sin ubicación'}${p.data.priority === 'Alta' ? ' · Prioridad ALTA' : ''}${proj ? ` — ${proj.data.name}` : ''}`, undefined, `punch-${p.id}`, { type: 'punchList', screen: 'punchList', itemId: p.id });
        }
        if (p.data.assignedTo && p.data.assignedTo !== authUser?.uid) {
          const proj = projects.find(pr => pr.id === p.data.projectId);
          bufferedNotify('custom', { uid: p.data.assignedTo, message: `✅ Nuevo Punch List: "${p.data.title}" — ${p.data.location || 'Sin ubicación'}${p.data.priority === 'Alta' ? ' · Prioridad ALTA' : ''}${proj ? ` — ${proj.data.name}` : ''}` });
        }
      });
      changedPunchIds.forEach(id => {
        const p = punchItems.find(pp => pp.id === id);
        if (!p) return;
        if (p.data.status === 'Completado' && p.data.assignedTo === authUser?.uid) {
          sendNotif('✅ Punch item completado', `"${p.data.title}" — ${p.data.location || ''}`, undefined, `punch-${p.id}`, { type: 'punchList', screen: 'punchList', itemId: p.id });
        }
        if (p.data.status === 'Completado' && p.data.assignedTo && p.data.assignedTo !== authUser?.uid) {
          bufferedNotify('custom', { uid: p.data.assignedTo, message: `✅ Punch item completado: "${p.data.title}" — ${p.data.location || ''}` });
        }
      });
    }
  }, [punchItems, notifPrefs.punchList, authUser, projects, sendNotif, bufferedNotify]);

  /* ===== FIREBASE ACTIONS ===== */
  const doLogin = async () => {
    const email = forms.loginEmail || '', pass = forms.loginPass || '';
    if (!email || !pass) { showToast('Completa todos los campos', 'error'); return; }
    try {

      await getFirebase().auth().signInWithEmailAndPassword(email, pass);
    } catch (e: any) {
      console.error('[Archii Auth] Login error:', e.code, e.message);
      const msgs: Record<string, string> = {
        'auth/invalid-credential': 'Correo o contraseña incorrectos',
        'auth/user-not-found': 'No existe cuenta con ese correo',
        'auth/too-many-requests': 'Demasiados intentos. Espera un momento y vuelve a intentar.',
        'auth/user-disabled': 'Esta cuenta ha sido deshabilitada.',
        'auth/invalid-email': 'El formato del correo no es válido.',
        'auth/network-request-failed': 'Error de conexión. Verifica tu internet.',
      };
      showToast(msgs[e.code] || `Error: ${e.code || e.message || 'No se pudo iniciar sesión'}`, 'error');
    }
  };

  const doRegister = async () => {
    const name = forms.regName || '', email = forms.regEmail || '', pass = forms.regPass || '';
    if (!name || !email || !pass) { showToast('Completa todos los campos', 'error'); return; }
    try {

      const cred = await getFirebase().auth().createUserWithEmailAndPassword(email, pass);
      await cred.user.updateProfile({ displayName: name });
      const db = getFirebase().firestore();
      await db.collection('users').doc(cred.user.uid).set({ name, email, photoURL: '', role: 'Miembro', createdAt: getFirebase().firestore.FieldValue.serverTimestamp() });

    } catch (e: any) {
      console.error('[Archii Auth] Register error:', e.code, e.message);
      const msgs: Record<string, string> = {
        'auth/email-already-in-use': 'Ese correo ya está registrado. Intenta iniciar sesión.',
        'auth/weak-password': 'La contraseña es muy débil. Mínimo 6 caracteres.',
        'auth/invalid-email': 'El formato del correo no es válido.',
        'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
        'auth/network-request-failed': 'Error de conexión. Verifica tu internet.',
        'auth/operation-not-allowed': 'Registro con email/contraseña deshabilitado. Verifica Firebase Console.',
      };
      showToast(msgs[e.code] || `Error al registrar: ${e.code || e.message || ''}`, 'error');
    }
  };

  const doGoogleLogin = async () => {
    try {
      const fb = getFirebase();
      const projectId = fb.apps?.[0]?.options?.projectId || 'unknown';

      // IMPORTANT: GoogleAuthProvider is on firebase.auth (namespace), NOT firebase.auth() (instance)
      const provider = new fb.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await fb.auth().signInWithPopup(provider);

    } catch (e: any) {
      console.error('[Archii Auth] Google login error:', e.code, e.message);
      if (e.code === 'auth/popup-closed-by-user') return;
      const msgs: Record<string, string> = {
        'auth/popup-blocked': 'Ventana emergente bloqueada. Permite popups para este sitio.',
        'auth/cancelled-popup-request': 'Se canceló la solicitud de inicio de sesión.',
        'auth/unauthorized-domain': 'Dominio no autorizado en Firebase Console > Authentication > Settings > Authorized domains. Agrega archii-theta.vercel.app',
        'auth/invalid-credential': 'Credenciales de Google inválidas.',
        'auth/account-exists-with-different-credential': 'Este correo ya está registrado con otro método (Microsoft o Email). Intenta con ese método.',
        'auth/network-request-failed': 'Error de conexión. Verifica tu internet.',
        'auth/internal-error': 'Error interno de Firebase. Google puede no estar habilitado como proveedor. Ve a Firebase Console > Authentication > Sign-in method > Google > Habilitar.',
        'auth/invalid-api-key': 'API Key inválida. Verifica la configuración de Firebase.',
      };
      // If popup fails with internal-error, popup-blocked or unauthorized-domain, try redirect as fallback
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/unauthorized-domain' || e.code === 'auth/internal-error') {

        try {
          const fb2 = getFirebase();
          const provider2 = new fb2.auth.GoogleAuthProvider();
          provider2.setCustomParameters({ prompt: 'select_account' });
          await fb2.auth().signInWithRedirect(provider2);
          return;
        } catch (redirectErr: any) {
          console.error('[Archii Auth] Google redirect also failed:', redirectErr.code, redirectErr.message);
        }
      }
      showToast(msgs[e.code] || `Error con Google: ${e.code || e.message || 'Verifica Firebase Console > Authentication > Google'}`, 'error');
    }
  };

  let _msLoginLock = false;
  const doMicrosoftLogin = async () => {
    if (_msLoginLock) {

      return;
    }
    _msLoginLock = true;
    try {

      const fb = getFirebase();
      // IMPORTANT: OAuthProvider is on firebase.auth (namespace), NOT firebase.auth() (instance)
      const authNS = fb.auth;
      const authInstance = fb.auth();
      const currentUser = authInstance.currentUser;

      // If user is already logged in (e.g. with Google), LINK Microsoft to existing account
      if (currentUser) {

        try {
          // First get the Microsoft credential via popup
          const provider = new authNS.OAuthProvider('microsoft.com');
          provider.addScope('Files.ReadWrite.All');
          provider.addScope('Sites.ReadWrite.All');
          provider.addScope('User.Read');
          provider.setCustomParameters({ prompt: 'consent' });

          const linkResult = await currentUser.linkWithPopup(provider);

          const credential = linkResult.credential as any;
          if (credential?.accessToken) {
            setMsAccessToken(credential.accessToken);
            setMsConnected(true);
            setMsRefreshToken(credential.refreshToken || null);
            setMsTokenExpiry(Date.now() + 55 * 60 * 1000);
            localStorage.setItem('msAccessToken', credential.accessToken);
            localStorage.setItem('msConnected', 'true');
            if (credential.refreshToken) localStorage.setItem('msRefreshToken', credential.refreshToken);
            showToast('Microsoft vinculado a tu cuenta. OneDrive conectado!');
          } else {
            showToast('Microsoft vinculado, pero sin acceso a OneDrive', 'warning');
          }
          return;
        } catch (linkErr: any) {
          if (linkErr.code === 'auth/popup-closed-by-user') return;
          if (linkErr.code === 'auth/credential-already-in-use') {
            // Microsoft already linked to this account — try re-auth to get fresh token

            try {
              const provider = new authNS.OAuthProvider('microsoft.com');
              provider.addScope('Files.ReadWrite.All');
              provider.addScope('Sites.ReadWrite.All');
              provider.addScope('User.Read');
              provider.setCustomParameters({ prompt: 'consent' });
              const reauthResult = await currentUser.reauthenticateWithPopup(provider);
              const credential = reauthResult.credential as any;
              if (credential?.accessToken) {
                setMsAccessToken(credential.accessToken);
                setMsConnected(true);
                setMsRefreshToken(credential.refreshToken || null);
                setMsTokenExpiry(Date.now() + 55 * 60 * 1000);
                localStorage.setItem('msAccessToken', credential.accessToken);
                localStorage.setItem('msConnected', 'true');
                if (credential.refreshToken) localStorage.setItem('msRefreshToken', credential.refreshToken);
                showToast('Token de Microsoft renovado. OneDrive conectado!');
                return;
              }
            } catch (_reauthErr) {
              // Microsoft reauth failed, continuing
            }
          }
          if (linkErr.code === 'auth/popup-blocked') {
            showToast('Ventana emergente bloqueada. Permite popups para este sitio.', 'error');
            return;
          }
          // If link with scopes fails, try without scopes
          if (linkErr.code === 'auth/internal-error' || linkErr.code === 'auth/oauth_error') {
            try {
              const basicProvider = new authNS.OAuthProvider('microsoft.com');
              basicProvider.setCustomParameters({ prompt: 'consent' });
              const linkBasic = await currentUser.linkWithPopup(basicProvider);
              const credential = linkBasic.credential as any;
              if (credential?.accessToken) {
                setMsAccessToken(credential.accessToken);
                setMsConnected(true);
                setMsRefreshToken(credential.refreshToken || null);
                setMsTokenExpiry(Date.now() + 55 * 60 * 1000);
                localStorage.setItem('msAccessToken', credential.accessToken);
                localStorage.setItem('msConnected', 'true');
                if (credential.refreshToken) localStorage.setItem('msRefreshToken', credential.refreshToken);
                showToast('Microsoft vinculado (sin scopes OneDrive). Los permisos pueden ser limitados.');
                return;
              }
            } catch (basicLinkErr: any) {
              if (basicLinkErr.code === 'auth/credential-already-in-use') {
                showToast('Microsoft ya está vinculado a tu cuenta. OneDrive debería funcionar.', 'warning');
                return;
              }
              console.error('[Archii Auth] Basic Microsoft link also failed:', basicLinkErr.code);
            }
          }
          throw linkErr;
        }
      }

      // No user logged in — normal sign-in flow
      const provider = new authNS.OAuthProvider('microsoft.com');
      // Permisos para OneDrive y Microsoft Graph
      provider.addScope('Files.ReadWrite.All');
      provider.addScope('Sites.ReadWrite.All');
      provider.addScope('User.Read');
      provider.setCustomParameters({ prompt: 'select_account' });

      let result: any;
      try {
        result = await authInstance.signInWithPopup(provider);
      } catch (popupErr: any) {
        // Si falla con scopes de OneDrive, intentar login básico sin scopes extra
        if (popupErr.code === 'auth/internal-error' || popupErr.code === 'auth/oauth_error') {
          const basicProvider = new authNS.OAuthProvider('microsoft.com');
          basicProvider.setCustomParameters({ prompt: 'select_account' });
          try {
            result = await authInstance.signInWithPopup(basicProvider);
          } catch (basicErr: any) {
            if (basicErr.code === 'auth/popup-blocked' || basicErr.code === 'auth/internal-error') {

              const redirectProvider = new authNS.OAuthProvider('microsoft.com');
              redirectProvider.setCustomParameters({ prompt: 'select_account' });
              await authInstance.signInWithRedirect(redirectProvider);
              return;
            }
            throw basicErr;
          }
        } else if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/internal-error') {

          const redirectProvider = new authNS.OAuthProvider('microsoft.com');
          redirectProvider.setCustomParameters({ prompt: 'select_account' });
          await authInstance.signInWithRedirect(redirectProvider);
          return;
        } else {
          throw popupErr;
        }
      }


      const credential = result.credential as any;
      if (credential?.accessToken) {
        setMsAccessToken(credential.accessToken);
        setMsConnected(true);
        setMsRefreshToken(credential.refreshToken || null);
        setMsTokenExpiry(Date.now() + 55 * 60 * 1000);
        localStorage.setItem('msAccessToken', credential.accessToken);
        localStorage.setItem('msConnected', 'true');
        if (credential.refreshToken) localStorage.setItem('msRefreshToken', credential.refreshToken);
        showToast('Conectado con Microsoft y OneDrive');
      } else {
        showToast('Autenticado con Microsoft, pero sin acceso a OneDrive', 'warning');
      }
    } catch (e: any) {
      if (e.code === 'auth/popup-closed-by-user') return;
      console.error('[Archii Auth] Microsoft login error:', e.code, e.message);
      const msgs: Record<string, string> = {
        'auth/popup-blocked': 'Ventana emergente bloqueada. Permite popups para este sitio.',
        'auth/cancelled-popup-request': 'Se canceló la solicitud de inicio de sesión.',
        'auth/invalid-credential': 'Credenciales de Microsoft inválidas.',
        'auth/unauthorized-domain': 'Dominio no autorizado en Firebase Console > Authentication > Settings > Authorized domains. Agrega archii-theta.vercel.app.',
        'auth/internal-error': 'Error de autenticación Microsoft. Verifica Azure Portal > API permissions.',
        'auth/account-exists-with-different-credential': 'Este correo ya está registrado con Google. Intenta de nuevo — lo vincularemos automáticamente.',
        'auth/network-request-failed': 'Error de conexión. Verifica tu internet.',
        'auth/credential-already-in-use': 'Microsoft ya está vinculado a otra cuenta.',
      };
      showToast(msgs[e.code] || `Microsoft: ${e.code || e.message || 'Verifica Firebase Console > Authentication > Microsoft'}`, 'error');
    } finally {
      _msLoginLock = false;
    }
  };

  const disconnectMicrosoft = () => {
    setMsAccessToken(null);
    setMsConnected(false);
    setMsLoading(false);
    localStorage.removeItem('msAccessToken');
    localStorage.removeItem('msConnected');
    localStorage.removeItem('msRefreshToken');
    window.dispatchEvent(new Event('archii-ms-disconnected'));
    showToast('Microsoft desconectado');
  };

  // Sync MS auth state with OneDriveProvider via custom events
  useEffect(() => {
    if (msConnected && msAccessToken) {
      window.dispatchEvent(new Event('archii-ms-connected'));
    }
  }, [msConnected, msAccessToken]);

  // [OneDrive file operations extracted to src/hooks/useOneDrive.tsx]
  // OneDrive state (msAccessToken, msConnected, msLoading) is kept here for auth integration.
  // File browser state and CRUD operations are now in the OneDriveProvider context.
  // Consumers should use `useOneDrive()` for file operations.

  // Utility: relative time (used by ProjectDetailScreen and other screens)
  const timeAgo = (dateStr: string) => {
    const now = new Date().getTime();
    const date = new Date(dateStr).getTime();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `hace ${days}d`;
    return new Date(dateStr).toLocaleDateString('es');
  };

  // Change user role (admin only) — uses server endpoint to bypass Firestore rules
  const updateUserRole = async (uid: string, newRole: string) => {
    try {
      if (!authUser || !activeTenantId) return;
      const token = await authUser.getIdToken();
      const res = await fetch('/api/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tenantId: activeTenantId, targetUid: uid, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      showToast(`Rol actualizado a ${newRole}`);
    } catch (err: any) { console.error('[Archii]', err); showToast('Error al cambiar rol: ' + (err.message || ''), 'error'); }
  };

  // Change user company (admin only) — uses server endpoint to bypass Firestore rules
  const updateUserCompany = async (uid: string, companyId: string) => {
    try {
      if (!authUser || !activeTenantId) return;
      const token = await authUser.getIdToken();
      const res = await fetch('/api/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tenantId: activeTenantId, targetUid: uid, companyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      showToast(companyId ? 'Empresa asignada' : 'Empresa removida');
    } catch (err: any) { console.error('[Archii]', err); showToast('Error al asignar empresa: ' + (err.message || ''), 'error'); }
  };

  // Get the current user's company ID
  const getMyCompanyId = () => {
    if (!authUser) return null;
    const me = teamUsers.find(u => u.id === authUser.uid);
    return me?.data?.companyId || null;
  };

  // Get current user's role
  const getMyRole = () => {
    if (!authUser) return 'Miembro';
    const me = teamUsers.find(u => u.id === authUser.uid);
    return me?.data?.role || 'Miembro';
  };

  // Filter projects based on company (Admin/Director see all, others see their company only)
  const visibleProjects = () => {
    const myRole = getMyRole();
    const myComp = getMyCompanyId();
    if (myRole === 'Admin' || myRole === 'Director') {
      return projects; // Admin y Director ven todo
    }
    if (myComp) {
      return projects.filter(p => !p.data.companyId || p.data.companyId === myComp);
    }
    return projects; // Si no tiene empresa, ve todo
  };

  const doLogout = () => {
    setPendingDeleteAction({
      open: true,
      title: 'Cerrar sesión',
      description: '¿Estás seguro de que deseas cerrar sesión?',
      onConfirm: () => { setPendingDeleteAction(null); getFirebase().auth().signOut(); },
    });
  };

  // scrubUndefined imported from @/lib/helpers (canonical version)

  const getUserName = (uid: string) => { if (!uid) return 'Sin asignar'; const u = teamUsers.find(x => x.id === uid); return u ? u.data.name : uid.substring(0, 8) + '...'; };

  const saveProject = async () => {
    const name = forms.projName || '';
    if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
    if (!authUser) { showToast('Error: no hay sesión activa', 'error'); return; }
    if (!activeTenantId) { showToast('Error: no hay espacio de trabajo activo. Recarga la página.', 'error'); return; }
    try {
      await fbActions.saveProject({ ...forms, projName: name }, editingId, showToast, authUser, activeTenantId);
      closeModal('project'); setForms(p => ({ ...p, projName: '', projClient: '', projLocation: '', projBudget: '', projDesc: '', projStart: '', projEnd: '', projStatus: 'Concepto', projCompany: '', projType: 'Ejecución', enabledPhases: [] }));
    } catch (err: any) {
      console.error('[Archii] saveProject error:', err);
      const msg = err?.message || '';
      if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
        showToast('Permiso denegado: verifica que eres miembro del espacio de trabajo', 'error');
      } else {
        showToast('Error al guardar proyecto: ' + (msg || 'intenta de nuevo'), 'error');
      }
    }
  };

  const deleteProject = async (id: string) => {
    // Validate tenant ownership before deleting
    const proj = projects.find(p => p.id === id);
    if (proj && activeTenantId && proj.data.tenantId && proj.data.tenantId !== activeTenantId) {
      showToast('Error: proyecto no pertenece a tu espacio', 'error');
      return;
    }
    const projectData = proj ? { ...proj.data } : null;
    try {
      await getFirebase().firestore().collection('projects').doc(id).delete();
      if (projectData) {
        toast.success('Proyecto eliminado', {
          duration: 5000,
          action: {
            label: 'Deshacer',
            onClick: async () => {
              try {
                await getFirebase().firestore().collection('projects').doc(id).set(scrubUndefined({ ...projectData, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                toast.success('Proyecto restaurado');
              } catch (err) { console.error('[Archii] undo deleteProject:', err); toast.error('Error al restaurar'); }
            },
          },
        });
      } else {
        showToast('Proyecto eliminado');
      }
    } catch (err) { console.error('[Archii]', err); showToast('Error', 'error'); }
  };

  const openEditProject = (p: Project) => {
    setEditingId(p.id);
    setForms(f => ({ ...f, projName: p.data.name, projStatus: p.data.status, projClient: p.data.client, projLocation: p.data.location, projBudget: p.data.budget, projDesc: p.data.description, projStart: p.data.startDate, projEnd: p.data.endDate, projCompany: p.data.companyId || '', projType: p.data.projectType || 'Ejecución', _prevType: p.data.projectType || 'Ejecución' }));
    openModal('project');
  };

  const saveTask = async () => {
    if (isSavingTask) return;
    const title = forms.taskTitle || '';
    if (!title) { showToast('El título es obligatorio', 'error'); return; }
    if (!authUser) { showToast('Error: no hay sesión activa', 'error'); return; }
    setIsSavingTask(true);
    const db = getFirebase().firestore();
    const ts = getFirebase().firestore.FieldValue.serverTimestamp();
    const assignees: string[] = Array.isArray(forms.taskAssignees) ? forms.taskAssignees : (forms.taskAssignee ? [forms.taskAssignee] : []);
    const subtasks = Array.isArray(forms.taskSubtasks) ? forms.taskSubtasks.filter((s: any) => s.text && s.text.trim()).map((s: any) => ({ text: String(s.text || ''), done: Boolean(s.done) })) : [];
    const newStatus = forms.taskStatus || 'Por hacer';
    const isNew = newStatus === 'Completado' && !editingId;
    const isCompleting = editingId && newStatus === 'Completado';
    const isUncompleting = editingId && newStatus !== 'Completado';
    const raw: Record<string, unknown> = { title, description: forms.taskDescription || '', projectId: forms.taskProject || '', assigneeId: assignees[0] || '', assigneeIds: assignees, priority: forms.taskPriority || 'Media', status: newStatus, dueDate: forms.taskDue || '', phaseId: forms.taskPhase || '', subtasks, estimatedHours: forms.taskEstimatedHours || null, tags: Array.isArray(forms.taskTags) && forms.taskTags.length > 0 ? forms.taskTags : null, tenantId: activeTenantId || '', updatedAt: ts, updatedBy: authUser.uid };
    if (isNew || isCompleting) raw.completedAt = ts;
    if (isUncompleting) raw.completedAt = getFirebase().firestore.FieldValue.delete();
    const data = scrubUndefined(raw);
    try {
      if (editingId) { await db.collection('tasks').doc(editingId).update(data); showToast('Tarea actualizada'); }
      else {
        const createData = scrubUndefined({ ...raw, createdAt: ts, createdBy: authUser.uid });
        await db.collection('tasks').add(createData);
        showToast('Tarea creada');
        // Notification handled by the centralized detector in the useEffect above
      }
      closeModal('task'); setEditingId(null); setForms((p: Record<string, any>) => ({ ...p, taskTitle: '', taskProject: '', taskPhase: '', taskAssignees: [], taskAssignee: '', taskPriority: 'Media', taskStatus: 'Por hacer', taskDue: new Date().toISOString().split('T')[0], taskSubtasks: [], taskTags: [], taskEstimatedHours: null }));
    } catch (err) { console.error('[Archii] saveTask error:', err); showToast('Error al guardar tarea', 'error'); }
    finally { setIsSavingTask(false); }
  };

  const openEditTask = (t: Task) => {
    setEditingId(t.id);
    const assignees: string[] = Array.isArray((t.data as any).assigneeIds) ? (t.data as any).assigneeIds : ((t.data as any).assigneeId ? [(t.data as any).assigneeId] : []);
    setForms((f: any) => ({ ...f, taskTitle: t.data.title, taskDescription: (t.data as any).description || '', taskProject: t.data.projectId || '', taskPhase: (t.data as any).phaseId || '', taskAssignees: assignees, taskAssignee: t.data.assigneeId || '', taskPriority: t.data.priority || 'Media', taskStatus: t.data.status || 'Por hacer', taskDue: t.data.dueDate || '', taskSubtasks: Array.isArray((t.data as any).subtasks) ? (t.data as any).subtasks : [], taskTags: Array.isArray((t.data as any).tags) ? (t.data as any).tags : [], taskEstimatedHours: (t.data as any).estimatedHours || null }));
    openModal('task');
  };

  const updateProjectProgress = async (val: number) => {
    if (!selectedProjectId) return;
    try { await getFirebase().firestore().collection('projects').doc(selectedProjectId).update({ progress: val, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }); showToast(`Progreso: ${val}%`); } catch (err) { console.error('[Archii]', err); showToast('Error', 'error'); }
  };

  const updateUserName = async (newName: string) => {
    if (!newName || !authUser) return;
    try { await authUser.updateProfile({ displayName: newName }); await getFirebase().firestore().collection('users').doc(authUser.uid).update({ name: newName }); showToast('Nombre actualizado'); setForms(p => ({ ...p, editingName: false })); } catch (err) { console.error('[Archii]', err); showToast('Error', 'error'); }
  };

  const toggleTask = async (id: string, status: string) => {
    const ns = status === 'Completado' ? 'Por hacer' : 'Completado';
    const ts = getFirebase().firestore.FieldValue.serverTimestamp();
    try {
      if (ns === 'Completado') {
        await getFirebase().firestore().collection('tasks').doc(id).update({ status: ns, completedAt: ts, updatedAt: ts });
      } else {
        await getFirebase().firestore().collection('tasks').doc(id).update({ status: ns, completedAt: getFirebase().firestore.FieldValue.delete(), updatedAt: ts });
      }
    } catch (err) { console.error("[Archii]", err); }
  };

  const changeTaskStatus = async (id: string, newStatus: string) => {
    const ts = getFirebase().firestore.FieldValue.serverTimestamp();
    try {
      if (newStatus === 'Completado') {
        await getFirebase().firestore().collection('tasks').doc(id).update({ status: newStatus, completedAt: ts, updatedAt: ts });
      } else {
        // Clear completedAt when moving away from Completado, set new status
        await getFirebase().firestore().collection('tasks').doc(id).update({ status: newStatus, completedAt: getFirebase().firestore.FieldValue.delete(), updatedAt: ts });
      }
    } catch (err) { console.error("[Archii]", err); }
  };

  const deleteTask = async (id: string) => {
    // Find task data for undo
    const task = tasks.find(t => t.id === id);
    const taskData = task ? { ...task.data } : null;
    try {
      await getFirebase().firestore().collection('tasks').doc(id).delete();
      // Show toast with undo option
      if (taskData) {
        const undoId = toast.success('Tarea eliminada', {
          duration: 5000,
          action: {
            label: 'Deshacer',
            onClick: async () => {
              try {
                const db = getFirebase().firestore();
                await db.collection('tasks').doc(id).set(scrubUndefined({ ...taskData, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                toast.success('Tarea restaurada');
              } catch (err) { console.error('[Archii] undo deleteTask:', err); toast.error('Error al restaurar'); }
            },
          },
        });
      } else {
        showToast('Tarea eliminada');
      }
    } catch (err: any) { console.error("[Archii]", err); showToast('Error al eliminar: ' + (err?.message || err?.code || 'sin permiso'), 'error'); }
  };

  const saveExpense = async () => {
    const concept = forms.expConcept || '';
    if (!concept) { showToast('El concepto es obligatorio', 'error'); return; }
    if (!authUser) { showToast('Error: no hay sesión activa', 'error'); return; }
    const db = getFirebase().firestore();
    const amount = Number(forms.expAmount) || 0;
    if (amount <= 0) { showToast('El monto debe ser mayor a 0', 'error'); return; }
    const raw = {
      concept,
      projectId: forms.expProject || '',
      category: forms.expCategory || 'Materiales',
      amount,
      date: forms.expDate || '',
      paymentMethod: forms.expPaymentMethod || 'Efectivo',
      vendor: forms.expVendor || '',
      notes: forms.expNotes || '',
      tenantId: activeTenantId || '',
      updatedBy: authUser.uid,
      updatedAt: getFirebase().firestore.FieldValue.serverTimestamp(),
    };
    const data = scrubUndefined(raw);
    try {
      if (editingId) {
        await db.collection('expenses').doc(editingId).update(data);
        showToast('Gasto actualizado');
        setEditingId(null);
      } else {
        data.createdAt = getFirebase().firestore.FieldValue.serverTimestamp();
        data.createdBy = authUser.uid;
        await db.collection('expenses').add(data);
        showToast('Gasto registrado');
      }
      closeModal('expense'); setForms(p => ({ ...p, expConcept: '', expAmount: '', expDate: new Date().toISOString().split('T')[0], expCategory: 'Materiales', expPaymentMethod: 'Efectivo', expVendor: '', expNotes: '' }));
    } catch (err) { console.error('[Archii]', err); showToast('Error', 'error'); }
  };

  const openEditExpense = (e: Expense) => {
    setEditingId(e.id);
    setForms(p => ({
      ...p,
      expConcept: e.data.concept || '',
      expProject: e.data.projectId || '',
      expCategory: e.data.category || 'Materiales',
      expAmount: String(e.data.amount || ''),
      expDate: e.data.date || '',
      expPaymentMethod: e.data.paymentMethod || 'Efectivo',
      expVendor: e.data.vendor || '',
      expNotes: e.data.notes || '',
    }));
    openModal('expense');
  };

  const deleteExpense = async (id: string) => {
    const expense = expenses.find(e => e.id === id);
    const expenseData = expense ? { ...expense.data } : null;
    setPendingDeleteAction({
      open: true,
      title: 'Eliminar gasto',
      description: '¿Estás seguro de que deseas eliminar este gasto?',
      onConfirm: async () => {
        setPendingDeleteAction(null);
        try {
          await getFirebase().firestore().collection('expenses').doc(id).delete();
          if (expenseData) {
            toast.success('Gasto eliminado', {
              duration: 5000,
              action: {
                label: 'Deshacer',
                onClick: async () => {
                  try {
                    await getFirebase().firestore().collection('expenses').doc(id).set(scrubUndefined({ ...expenseData, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                    toast.success('Gasto restaurado');
                  } catch (err) { console.error('[Archii] undo deleteExpense:', err); toast.error('Error al restaurar'); }
                },
              },
            });
          } else {
            showToast('Eliminado');
          }
        } catch (err) { console.error("[Archii]", err); showToast('Error al eliminar', 'error'); }
      },
    });
  };

  const saveSupplier = async () => {
    const name = forms.supName || '';
    if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
    if (!authUser) { showToast('Error: no hay sesión activa', 'error'); return; }
    const db = getFirebase().firestore();
    const raw = { name, category: forms.supCategory || 'Otro', phone: forms.supPhone || '', email: forms.supEmail || '', address: forms.supAddress || '', website: forms.supWebsite || '', notes: forms.supNotes || '', rating: Number(forms.supRating) || 5, tenantId: activeTenantId || '', createdAt: getFirebase().firestore.FieldValue.serverTimestamp(), createdBy: authUser.uid };
    const data = scrubUndefined(raw);
    try {
      if (editingId) { await db.collection('suppliers').doc(editingId).update(data); showToast('Proveedor actualizado'); }
      else { await db.collection('suppliers').add(data); showToast('Proveedor creado'); }
      closeModal('supplier'); setForms(p => ({ ...p, supName: '', supCategory: '', supPhone: '', supEmail: '', supAddress: '', supWebsite: '', supNotes: '', supRating: '5' }));
    } catch (err) { console.error('[Archii]', err); showToast('Error', 'error'); }
  };

  const deleteSupplier = async (id: string) => {
    const supplier = suppliers.find(s => s.id === id);
    const supplierData = supplier ? { ...supplier.data } : null;
    setPendingDeleteAction({
      open: true,
      title: 'Eliminar proveedor',
      description: '¿Estás seguro de que deseas eliminar este proveedor?',
      onConfirm: async () => {
        setPendingDeleteAction(null);
        try {
          await getFirebase().firestore().collection('suppliers').doc(id).delete();
          if (supplierData) {
            toast.success('Proveedor eliminado', {
              duration: 5000,
              action: {
                label: 'Deshacer',
                onClick: async () => {
                  try {
                    await getFirebase().firestore().collection('suppliers').doc(id).set(scrubUndefined({ ...supplierData, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                    toast.success('Proveedor restaurado');
                  } catch (err) { console.error('[Archii] undo deleteSupplier:', err); toast.error('Error al restaurar'); }
                },
              },
            });
          } else {
            showToast('Eliminado');
          }
        } catch (err) { console.error("[Archii]", err); showToast('Error al eliminar', 'error'); }
      },
    });
  };

  // Company CRUD
  const saveCompany = async () => {
    const name = forms.compName || '';
    if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
    if (!authUser) { showToast('Error: no hay sesión activa', 'error'); return; }
    try {
      const db = getFirebase().firestore();
      const raw = { name, nit: forms.compNit || '', legalName: forms.compLegal || '', address: forms.compAddress || '', phone: forms.compPhone || '', email: forms.compEmail || '', tenantId: activeTenantId || '', createdAt: getFirebase().firestore.FieldValue.serverTimestamp(), updatedAt: getFirebase().firestore.FieldValue.serverTimestamp(), createdBy: authUser.uid };
      const data = scrubUndefined(raw);
      if (editingId) { await db.collection('companies').doc(editingId).update(data); showToast('Empresa actualizada'); }
      else { await db.collection('companies').add(data); showToast('Empresa creada'); }
      closeModal('company'); setEditingId(null);
    } catch (err) { console.error('[Archii] saveCompany error:', err); showToast('Error al guardar', 'error'); }
  };

  const deleteCompany = (id: string) => {
    const company = companies.find(c => c.id === id);
    const companyData = company ? { ...company.data } : null;
    setPendingDeleteAction({
      open: true,
      title: 'Eliminar empresa',
      description: '¿Estás seguro de que deseas eliminar esta empresa?',
      onConfirm: async () => {
        setPendingDeleteAction(null);
        try {
          await getFirebase().firestore().collection('companies').doc(id).delete();
          if (companyData) {
            toast.success('Empresa eliminada', {
              duration: 5000,
              action: {
                label: 'Deshacer',
                onClick: async () => {
                  try {
                    await getFirebase().firestore().collection('companies').doc(id).set(scrubUndefined({ ...companyData, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                    toast.success('Empresa restaurada');
                  } catch (err) { console.error('[Archii] undo deleteCompany:', err); toast.error('Error al restaurar'); }
                },
              },
            });
          } else {
            showToast('Empresa eliminada');
          }
        } catch (err) {
          console.error("[Archii]", err);
          showToast('Error', 'error');
        }
      },
    });
  };

  // fileToBase64 imported from @/lib/helpers (canonical version)

  const uploadFile = async (e: any) => {
    const file = e.target?.files?.[0];
    if (!file || !selectedProjectId || !authUser) return;
    if (file.size > 10 * 1024 * 1024) { showToast('El archivo no puede superar 10 MB', 'error'); return; }
    showToast('Subiendo archivo...');
    try {
      const base64 = await fileToBase64(file);
      const db = getFirebase().firestore();
      await db.collection('projects').doc(selectedProjectId).collection('files').add(scrubUndefined({ name: file.name, type: file.type, size: file.size, data: base64, createdAt: getFirebase().firestore.FieldValue.serverTimestamp(), uploadedBy: authUser.uid }));
      showToast('Archivo subido');
    } catch (err: any) { showToast('Error al subir: ' + (err.message || ''), 'error'); }
    e.target.value = '';
  };

  const deleteFile = async (file: ProjectFile) => {
    const { id: fileId, name: fileName, ...fileRest } = file;
    setPendingDeleteAction({
      open: true,
      title: 'Eliminar archivo',
      description: `¿Estás seguro de que deseas eliminar "${file.name || 'este archivo'}"?`,
      onConfirm: async () => {
        setPendingDeleteAction(null);
        try {
          await getFirebase().firestore().collection('projects').doc(selectedProjectId!).collection('files').doc(file.id).delete();
          toast.success('Archivo eliminado', {
            duration: 5000,
            action: {
              label: 'Deshacer',
              onClick: async () => {
                try {
                  await getFirebase().firestore().collection('projects').doc(selectedProjectId!).collection('files').doc(file.id).set(scrubUndefined({ ...fileRest, name: fileName, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                  toast.success('Archivo restaurado');
                } catch (err) { console.error('[Archii] undo deleteFile:', err); toast.error('Error al restaurar'); }
              },
            },
          });
        } catch (err) { console.error('[Archii] deleteFile error:', err); showToast('Error al eliminar', 'error'); }
      },
    });
  };

  const initDefaultPhases = async () => {
    if (!selectedProjectId || !authUser || !activeTenantId) return;
    try {
      const token = await authUser.getIdToken();
      const res = await fetch('/api/migrate-phases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tenantId: activeTenantId, uid: authUser.uid, projectId: selectedProjectId, projectType: 'Ambos' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      showToast('✅ Fases inicializadas (Diseño + Ejecución)');
      // Immediately reload phases via API
      const reloadRes = await fetch(`/api/project-phases?projectId=${selectedProjectId}&tenantId=${activeTenantId}`, {
        headers: { 'Authorization': `Bearer ${await authUser.getIdToken()}` }
      });
      if (reloadRes.ok) {
        const reloadData = await reloadRes.json();
        setWorkPhases(reloadData.phases || []);
      }
    } catch (err: any) { console.error('[Archii] initDefaultPhases error:', err); showToast('Error al inicializar fases: ' + (err.message || ''), 'error'); }
  };

  // Add missing phases (does NOT delete existing ones)
  const addMissingPhases = async (projType: string = 'Ambos') => {
    if (!selectedProjectId || !authUser || !activeTenantId) return;
    try {
      const token = await authUser.getIdToken();
      const res = await fetch('/api/add-missing-phases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tenantId: activeTenantId, projectId: selectedProjectId, projectType: projType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      if (data.added > 0) {
        showToast(`✅ ${data.added} fase${data.added > 1 ? 's' : ''} agregada${data.added > 1 ? 's' : ''}`);
      } else {
        showToast('ℹ️ No faltan fases por agregar');
      }
      // Reload phases
      const reloadRes = await fetch(`/api/project-phases?projectId=${selectedProjectId}&tenantId=${activeTenantId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (reloadRes.ok) {
        const reloadData = await reloadRes.json();
        setWorkPhases(reloadData.phases || []);
      }
    } catch (err: any) { console.error('[Archii] addMissingPhases error:', err); showToast('Error: ' + (err.message || ''), 'error'); }
  };

  const updatePhaseStatus = async (phaseId: string, status: string) => {
    try { await getFirebase().firestore().collection('projects').doc(selectedProjectId!).collection('workPhases').doc(phaseId).update({ status }); } catch (err) { console.error("[Archii]", err); }
  };

  const updatePhaseDates = async (phaseId: string, field: 'startDate' | 'endDate', value: string) => {
    if (!selectedProjectId) return;
    try { await getFirebase().firestore().collection('projects').doc(selectedProjectId).collection('workPhases').doc(phaseId).update({ [field]: value }); } catch (err) { console.error("[Archii] updatePhaseDates:", err); }
  };

  const doTogglePhaseEnabled = async (phaseId: string, enabled: boolean) => {
    if (!selectedProjectId) return;
    await fbActions.togglePhaseEnabled(selectedProjectId, phaseId, enabled, showToast, activeTenantId);
  };

  const initPhasesByType = async (projType: string) => {
    if (!selectedProjectId) return;
    try {
      const db = getFirebase().firestore();
      const ts = getFirebase().firestore.FieldValue.serverTimestamp();
      await fbActions.initPhasesForProject(db, selectedProjectId, projType, [], ts, activeTenantId);
      // Also update project document
      await db.collection('projects').doc(selectedProjectId).update({ projectType: projType });
      showToast('Fases reinicializadas');
    } catch (err) { console.error('[Archii] initPhasesByType error:', err); }
  };

  /* ===== MIGRACIÓN: Inicializar fases en proyectos existentes ===== */
  const [isMigratingPhases, setIsMigratingPhases] = useState(false);

  const migrateAllProjectPhases = useCallback(async () => {
    if (!ready || !authUser || !activeTenantId) {
      showToast('No hay sesión activa o tenant seleccionado', 'error');
      return;
    }
    setIsMigratingPhases(true);
    try {
      const res = await fetch('/api/migrate-phases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: activeTenantId, uid: authUser.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en migración');
      if (data.migrated > 0) {
        showToast(`✅ ${data.migrated} proyectos migrados con fases nuevas`);
      } else {
        showToast(`ℹ️ ${data.skipped} proyectos ya tenían fases (nada que migrar)`);
      }
      if (data.errors?.length > 0) {
        console.error('[Archii] Errores en migración:', data.errors);
      }
      // Mark as done in localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(`archii_phases_migrated_${activeTenantId}`, new Date().toISOString());
      }
    } catch (err: any) {
      console.error('[Archii] migrateAllProjectPhases error:', err);
      showToast('Error en migración: ' + (err.message || err), 'error');
    } finally {
      setIsMigratingPhases(false);
    }
  }, [ready, authUser, activeTenantId, showToast]);

  // Auto-run migration once when projects load and none have phases
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId || projects.length === 0 || isMigratingPhases) return;
    const migrationKey = `archii_phases_migrated_${activeTenantId}`;
    if (typeof window !== 'undefined' && localStorage.getItem(migrationKey)) return;
    // Check if any project has phases in new format
    const hasPhases = projects.some((p: any) => p.data.projectType);
    if (hasPhases) {
      // Already migrated at least partially
      localStorage.setItem(migrationKey, new Date().toISOString());
      return;
    }
    // Auto-run after a delay
    const timer = setTimeout(() => {

      migrateAllProjectPhases();
    }, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authUser, activeTenantId, projects.length]);

  const saveApproval = async () => {
    const title = forms.appTitle || '';
    if (!title) { showToast('El título es obligatorio', 'error'); return; }
    if (!authUser) { showToast('Error: no hay sesión activa', 'error'); return; }
    try {
      await getFirebase().firestore().collection('projects').doc(selectedProjectId!).collection('approvals').add(scrubUndefined({ title, description: forms.appDesc || '', status: 'Pendiente', createdAt: getFirebase().firestore.FieldValue.serverTimestamp(), createdBy: authUser.uid }));
      showToast('Solicitud creada'); closeModal('approval'); setForms(p => ({ ...p, appTitle: '', appDesc: '' }));
      // Notification handled by the centralized detector in the useEffect above
    } catch (err) { console.error('[Archii]', err); showToast('Error', 'error'); }
  };

  const updateApproval = async (id: string, status: string) => {
    try {
      await getFirebase().firestore().collection('projects').doc(selectedProjectId!).collection('approvals').doc(id).update({ status });
      showToast('Estado actualizado');
      // Notification handled by the centralized detector in the useEffect above
    } catch (err) { console.error("[Archii]", err); }
  };

  const deleteApproval = async (id: string) => {
    const approval = (selectedProjectId ? (await getFirebase().firestore().collection('projects').doc(selectedProjectId).collection('approvals').doc(id).get()).data() : null) as any;
    setPendingDeleteAction({
      open: true,
      title: 'Eliminar aprobación',
      description: '¿Estás seguro de que deseas eliminar esta solicitud de aprobación?',
      onConfirm: async () => {
        setPendingDeleteAction(null);
        try {
          await getFirebase().firestore().collection('projects').doc(selectedProjectId!).collection('approvals').doc(id).delete();
          if (approval) {
            toast.success('Aprobación eliminada', {
              duration: 5000,
              action: {
                label: 'Deshacer',
                onClick: async () => {
                  try {
                    await getFirebase().firestore().collection('projects').doc(selectedProjectId!).collection('approvals').doc(id).set(scrubUndefined({ ...approval, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                    toast.success('Aprobación restaurada');
                  } catch (err) { console.error('[Archii] undo deleteApproval:', err); toast.error('Error al restaurar'); }
                },
              },
            });
          } else {
            showToast('Eliminada');
          }
        } catch (err) { console.error("[Archii]", err); showToast('Error al eliminar', 'error'); }
      },
    });
  };

  // Daily Log CRUD
  const saveDailyLog = async () => {
    if (!selectedProjectId) { showToast('Selecciona un proyecto', 'error'); return; }
    const lf = logForm;
    if (!lf.date) { showToast('La fecha es obligatoria', 'error'); return; }
    const db = getFirebase().firestore();
    const data: Record<string, any> = {
      projectId: selectedProjectId,
      date: lf.date,
      weather: lf.weather || '',
      temperature: Number(lf.temperature) || 0,
      activities: (lf.activities || ['']).filter((a: string) => a.trim()),
      laborCount: Number(lf.laborCount) || 0,
      equipment: (lf.equipment || ['']).filter((e: string) => e.trim()),
      materials: (lf.materials || ['']).filter((m: string) => m.trim()),
      observations: lf.observations || '',
      photos: lf.photos || [],
      supervisor: lf.supervisor || (authUser ? authUser.displayName || authUser.email?.split('@')[0] || '' : ''),
      createdBy: authUser ? authUser.uid : '',
      updatedAt: getFirebase().firestore.FieldValue.serverTimestamp(),
    };
    try {
      if (selectedLogId) {
        await db.collection('projects').doc(selectedProjectId).collection('dailyLogs').doc(selectedLogId).update(data);
        showToast('Bitácora actualizada');
      } else {
        data.createdAt = getFirebase().firestore.FieldValue.serverTimestamp();
        await db.collection('projects').doc(selectedProjectId).collection('dailyLogs').add(data);
        showToast('Bitácora creada');
      }
      setDailyLogTab('list');
      setSelectedLogId(null);
      resetLogForm();
    } catch (err) { console.error('[Archii]', err); showToast('Error al guardar', 'error'); }
  };

  const deleteDailyLog = async (logId: string) => {
    if (!selectedProjectId) return;
    const logData = (await getFirebase().firestore().collection('projects').doc(selectedProjectId).collection('dailyLogs').doc(logId).get()).data();
    try {
      await getFirebase().firestore().collection('projects').doc(selectedProjectId).collection('dailyLogs').doc(logId).delete();
      if (logData) {
        toast.success('Bitácora eliminada', {
          duration: 5000,
          action: {
            label: 'Deshacer',
            onClick: async () => {
              try {
                await getFirebase().firestore().collection('projects').doc(selectedProjectId!).collection('dailyLogs').doc(logId).set(scrubUndefined({ ...logData, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                toast.success('Bitácora restaurada');
              } catch (err) { console.error('[Archii] undo deleteDailyLog:', err); toast.error('Error al restaurar'); }
            },
          },
        });
      } else {
        showToast('Bitácora eliminada');
      }
      if (selectedLogId === logId) {
        setDailyLogTab('list');
        setSelectedLogId(null);
      }
    } catch (err) { console.error('[Archii] deleteDailyLog error:', err); showToast('Error al eliminar', 'error'); }
  };

  const openEditLog = (log: DailyLog) => {
    setSelectedLogId(log.id);
    setLogForm({
      date: log.data.date || '',
      weather: log.data.weather || '',
      temperature: log.data.temperature || '',
      activities: log.data.activities?.length > 0 ? log.data.activities : [''],
      laborCount: log.data.laborCount || '',
      equipment: log.data.equipment?.length > 0 ? log.data.equipment : [''],
      materials: log.data.materials?.length > 0 ? log.data.materials : [''],
      observations: log.data.observations || '',
      photos: log.data.photos || [],
      supervisor: log.data.supervisor || '',
    });
    setDailyLogTab('create');
  };

  const resetLogForm = () => {
    setLogForm({
      date: new Date().toISOString().split('T')[0],
      weather: '',
      temperature: '',
      activities: [''],
      laborCount: '',
      equipment: [''],
      materials: [''],
      observations: '',
      photos: [],
      supervisor: '',
    });
  };

  // ===== ADMIN HELPERS =====
  const GANTT_DAYS = 14;
  const GANTT_DAY_NAMES = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const GANTT_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
    'Por hacer': { label: 'Pendiente', color: '#f59e0b', bg: '#fffbeb' },
    'En progreso': { label: 'En Progreso', color: '#3b82f6', bg: '#eff6ff' },
    'Revision': { label: 'Revisión', color: '#8b5cf6', bg: '#f5f3ff' },
    'Completado': { label: 'Completado', color: '#10b981', bg: '#ecfdf5' },
  };
  const GANTT_PRIO_CFG: Record<string, { label: string; bg: string; color: string }> = {
    'Baja': { label: 'Baja', bg: '#f1f5f9', color: '#475569' },
    'Media': { label: 'Media', bg: '#e0f2fe', color: '#0369a1' },
    'Alta': { label: 'Alta', bg: '#ffedd5', color: '#c2410c' },
  };

  const getMonday = (d: Date) => { const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); return new Date(d.getFullYear(), d.getMonth(), diff); };

  const getGanttDays = () => {
    const base = getMonday(new Date()); base.setHours(0,0,0,0);
    base.setDate(base.getDate() + adminWeekOffset * 7);
    const days = [];
    for (let i = 0; i < GANTT_DAYS; i++) { const day = new Date(base); day.setDate(day.getDate() + i); days.push(day); }
    return days;
  };

  const getTaskBar = (task: Task, days: Date[]) => {
    if (!task.data.dueDate) return null;
    const tStart = task.data.dueDate ? new Date(task.data.startDate || task.data.dueDate) : new Date();
    const tEnd = new Date(task.data.dueDate);
    const rangeStart = days[0]; const rangeEnd = new Date(days[days.length - 1]); rangeEnd.setDate(rangeEnd.getDate() + 1);
    const DAY_MS = 86400000; const rangeSpan = (rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS;
    const leftPct = Math.max(0, (tStart.getTime() - rangeStart.getTime()) / DAY_MS / rangeSpan) * 100;
    const widthPct = Math.max(2, ((tEnd.getTime() - tStart.getTime()) / DAY_MS + 1) / rangeSpan) * 100;
    return { left: leftPct, width: Math.min(widthPct, 100 - leftPct) };
  };

  const buildGanttRows = (memberTasks: Task[]) => {
    const rows: any[][] = [];
    memberTasks.forEach((t: any) => {
      if (!t.data.dueDate) return;
      let placed = false;
      for (const row of rows) {
        const overlaps = row.some((r: any) => {
          if (!r.data.dueDate || !t.data.dueDate) return false;
          return new Date(r.data.startDate || r.data.dueDate) <= new Date(t.data.dueDate) && new Date(t.data.startDate || t.data.dueDate) <= new Date(r.data.dueDate);
        });
        if (!overlaps) { row.push(t); placed = true; break; }
      }
      if (!placed) rows.push([t]);
    });
    return rows;
  };

  const findOverlaps = (memberTasks: Task[]) => {
    const overlapIds = new Set<string>();
    for (let i = 0; i < memberTasks.length; i++) {
      for (let j = i + 1; j < memberTasks.length; j++) {
        const a = memberTasks[i], b = memberTasks[j];
        if (!a.data.dueDate || !b.data.dueDate) continue;
        if (new Date(a.data.startDate || a.data.dueDate) <= new Date(b.data.dueDate) && new Date(b.data.startDate || b.data.dueDate) <= new Date(a.data.dueDate)) {
          overlapIds.add(a.id); overlapIds.add(b.id);
        }
      }
    }
    return overlapIds;
  };

  const getProjectColor = (projId: string) => {
    const colors = ['#3b82f6','#8b5cf6','#f43f5e','#10b981','#f59e0b','#06b6d4','#ec4899','#84cc16','#6366f1','#f97316'];
    const idx = projects.findIndex(p => p.id === projId);
    return colors[Math.abs(idx) % colors.length];
  };

  const getProjectColorLight = (projId: string) => {
    const map: Record<string, string> = { '#3b82f6':'#dbeafe','#8b5cf6':'#ede9fe','#f43f5e':'#ffe4e6','#10b981':'#d1fae5','#f59e0b':'#fef3c7','#06b6d4':'#cffafe','#ec4899':'#fce7f3','#84cc16':'#ecfccb','#6366f1':'#e0e7ff','#f97316':'#ffedd5' };
    return map[getProjectColor(projId)] || '#f5f5f4';
  };

  const getUserRole = (uid: string) => { const u = teamUsers.find(x => x.id === uid); return u?.data?.role || 'Miembro'; };
  const myRole = getUserRole(authUser?.uid || '');
  // Admin check: also consider ADMIN_EMAILS directly in case Firestore update hasn't propagated yet
  const isEmailAdmin = authUser ? ADMIN_EMAILS.includes(authUser.email || '') : false;
  const isAdmin = myRole === 'Admin' || myRole === 'Director' || isEmailAdmin;

  // User display helpers
  const userName = authUser?.displayName || authUser?.email?.split('@')[0] || '';
  const initials = getInitials(userName);
  const screenTitles = SCREEN_TITLES;

  const activeTasks = tasks.filter(t => t.data.status !== 'Completado');
  const completedTasks = tasks.filter(t => t.data.status === 'Completado');
  const overdueTasks = activeTasks.filter(t => t.data.dueDate && checkOverdue(t.data.dueDate));
  const urgentTasks = activeTasks.filter(t => t.data.priority === 'Alta');

  const adminFilteredTasks = activeTasks.filter(t => {
    const ms = !adminTaskSearch || t.data.title.toLowerCase().includes(adminTaskSearch.toLowerCase());
    const ma = adminFilterAssignee === 'all' || t.data.assigneeId === adminFilterAssignee;
    const mp = adminFilterProject === 'all' || t.data.projectId === adminFilterProject;
    const mpr = adminFilterPriority === 'all' || t.data.priority === adminFilterPriority;
    return ms && ma && mp && mpr;
  });

  const pendingCount = tasks.filter(t => t.data.status !== 'Completado').length;
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectExpenses = expenses.filter(e => e.data.projectId === selectedProjectId);
  const projectTasks = tasks.filter(t => t.data.projectId === selectedProjectId);
  const projectBudget = currentProject?.data.budget || 0;
  const projectSpent = projectExpenses.reduce((s, e) => s + (Number(e.data.amount) || 0), 0);

  // Actualizar contexto del proyecto para la IA cuando se selecciona uno
  useEffect(() => {
    if (currentProject) {
      const ctx = [
        `Proyecto: ${currentProject.data.name}`,
        currentProject.data.description ? `Descripción: ${currentProject.data.description}` : '',
        currentProject.data.client ? `Cliente: ${currentProject.data.client}` : '',
        currentProject.data.location ? `Ubicación: ${currentProject.data.location}` : '',
        currentProject.data.status ? `Estado: ${currentProject.data.status}` : '',
        currentProject.data.budget ? `Presupuesto: ${fmtCOP(currentProject.data.budget)}` : '',
        currentProject.data.progress !== undefined ? `Progreso: ${currentProject.data.progress}%` : '',
        projectTasks.length > 0 ? `Tareas: ${projectTasks.length} (${projectTasks.filter(t => t.data.status === 'Completado').length} completadas)` : '',
        projectExpenses.length > 0 ? `Gastos registrados: ${fmtCOP(projectSpent)} de ${fmtCOP(projectBudget)}` : '',
      ].filter(Boolean).join('\n');
      useUIStore.getState().setAIProjectContext(ctx);
    } else {
      useUIStore.getState().setAIProjectContext('');
    }
  }, [currentProject, projectTasks.length, projectSpent, projectBudget]);

  const navigateTo = (s: string, projId?: string | null) => {
    setScreen(s);
    setSelectedProjectId(projId ?? selectedProjectId);
    setSidebarOpen(false);
    useUIStore.getState().setCurrentScreen(s);
  };
  // Wire navigate function to NotificationProvider (for OS notification click navigation)
  notifCtx.setNavigateFn(navigateTo);

  // Listen for service worker navigation messages (push notification clicks)
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.screen) {
        navigateTo(detail.screen, detail.itemId || undefined);
      }
    };
    window.addEventListener('sw-navigate', handler);
    return () => window.removeEventListener('sw-navigate', handler);
  }, [navigateTo]);

  // Meeting functions
  const saveMeeting = async () => {
    const title = forms.meetTitle || '';
    if (!title) { showToast('El título es obligatorio', 'error'); return; }
    if (!authUser) { showToast('Error: no hay sesión activa', 'error'); return; }
    try {
      const db = getFirebase().firestore();
      const ts = getFirebase().firestore.FieldValue.serverTimestamp();
      const baseFields = { title, description: forms.meetDesc || '', projectId: forms.meetProject || '', time: forms.meetTime || '09:00', duration: Number(forms.meetDuration) || 60, attendees: forms.meetAttendees ? forms.meetAttendees.split(',').map((s: string) => s.trim()).filter(Boolean) : [], createdBy: authUser.uid, tenantId: activeTenantId || '' };
      const isRecurring = forms.meetRecurring === 'weekly';
      const recurringDay = Number(forms.meetRecurringDayOfWeek);
      const recurringEndDate = forms.meetRecurringEndDate || '';
      const groupId = editingId && forms._meetRecurringGroupId ? forms._meetRecurringGroupId : db.collection('_').doc().id;

      if (editingId) {
        // Edit single instance
        const raw = { ...baseFields, date: forms.meetDate || '', recurring: isRecurring ? 'weekly' : 'none', recurringDayOfWeek: isRecurring ? recurringDay : undefined, recurringEndDate: isRecurring ? recurringEndDate : undefined, recurringGroupId: isRecurring ? groupId : undefined };
        await db.collection('meetings').doc(editingId).update(scrubUndefined(raw));
        showToast('Reunión actualizada');
      } else if (isRecurring) {
        // Create recurring instances
        const startDate = new Date((forms.meetDate || '') + 'T12:00:00');
        const endDate = recurringEndDate ? new Date(recurringEndDate + 'T12:00:00') : new Date(startDate.getTime() + 52 * 7 * 86400000);
        const recurringFields = { recurring: 'weekly' as const, recurringDayOfWeek: recurringDay, recurringEndDate: recurringEndDate || undefined, recurringGroupId: groupId };
        let count = 0;
        const current = new Date(startDate);
        // Set current day to the target day of week
        current.setDate(current.getDate() + ((recurringDay - current.getDay() + 7) % 7));
        // If the first occurrence would be before the start date, move to next week
        if (current < startDate) current.setDate(current.getDate() + 7);
        while (current <= endDate && count < 104) {
          const dateStr = current.toISOString().split('T')[0];
          const raw = { ...baseFields, date: dateStr, ...recurringFields, createdAt: ts };
          await db.collection('meetings').add(scrubUndefined(raw));
          current.setDate(current.getDate() + 7);
          count++;
        }
        showToast(`Reunión recurrente creada (${count} instancias)`);
      } else {
        // Single meeting
        const raw = { ...baseFields, date: forms.meetDate || '', createdAt: ts };
        await db.collection('meetings').add(scrubUndefined(raw));
        showToast('Reunión creada');
      }
      closeModal('meeting'); setEditingId(null); setForms(p => ({ ...p, meetTitle: '', meetProject: '', meetDate: '', meetTime: '09:00', meetDuration: '60', meetDesc: '', meetAttendees: '', meetRecurring: 'none', meetRecurringDayOfWeek: undefined, meetRecurringEndDate: '', _meetRecurringGroupId: undefined }));
    } catch (err) { console.error('[Archii] saveMeeting error:', err); showToast('Error al guardar reunión', 'error'); }
  };
  const deleteMeeting = async (id: string, meetingData?: Meeting) => {
    const isRecurring = meetingData?.data?.recurring === 'weekly' && meetingData?.data?.recurringGroupId;
    const groupId = meetingData?.data?.recurringGroupId;
    const meetingDate = meetingData?.data?.date;
    const mData = meetingData ? { ...meetingData.data } : null;
    if (isRecurring) {
      // For recurring meetings, ask which scope to delete
      setPendingDeleteAction({
        open: true,
        title: 'Eliminar reunión recurrente',
        description: '¿Eliminar todas las instancias futuras de esta reunión recurrente? Cancela para eliminar solo esta instancia.',
        confirmLabel: 'Eliminar todas',
        onConfirm: async () => {
          setPendingDeleteAction(null);
          try {
            const db = getFirebase().firestore();
            const snap = await db.collection('meetings')
              .where('tenantId', '==', activeTenantId)
              .where('recurringGroupId', '==', groupId)
              .where('date', '>=', meetingDate || '')
              .get();
            const batch = db.batch();
            snap.docs.forEach((d: any) => batch.delete(d.ref));
            await batch.commit();
            toast.success(`${snap.size} reuniones recurrentes eliminadas`, {
              duration: 5000,
              action: {
                label: 'Deshacer',
                onClick: async () => {
                  try {
                    // Restore all deleted meetings from the snapshot
                    const db = getFirebase().firestore();
                    const batch = db.batch();
                    snap.docs.forEach((d: any) => {
                      batch.set(db.collection('meetings').doc(d.id), scrubUndefined({ ...d.data(), updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                    });
                    await batch.commit();
                    toast.success('Reuniones recurrentes restauradas');
                  } catch (err) { console.error('[Archii] undo deleteMeeting recurring:', err); toast.error('Error al restaurar'); }
                },
              },
            });
          } catch (err) { console.error('[Archii]', err); showToast('Error al eliminar', 'error'); }
        },
      });
    } else {
      setPendingDeleteAction({
        open: true,
        title: 'Eliminar reunión',
        description: '¿Estás seguro de que deseas eliminar esta reunión?',
        onConfirm: async () => {
          setPendingDeleteAction(null);
          try {
            await getFirebase().firestore().collection('meetings').doc(id).delete();
            if (mData) {
              toast.success('Reunión eliminada', {
                duration: 5000,
                action: {
                  label: 'Deshacer',
                  onClick: async () => {
                    try {
                      await getFirebase().firestore().collection('meetings').doc(id).set(scrubUndefined({ ...mData, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                      toast.success('Reunión restaurada');
                    } catch (err) { console.error('[Archii] undo deleteMeeting:', err); toast.error('Error al restaurar'); }
                  },
                },
              });
            } else {
              showToast('Reunión eliminada');
            }
          } catch (err) { console.error('[Archii]', err); showToast('Error al eliminar', 'error'); }
        },
      });
    }
  };
  const openEditMeeting = (m: Meeting) => {
    setEditingId(m.id);
    setForms(f => ({ ...f,
      meetTitle: m.data.title, meetProject: m.data.projectId || '', meetDate: m.data.date || '',
      meetTime: m.data.time || '09:00', meetDuration: String(m.data.duration || 60),
      meetDesc: m.data.description || '', meetAttendees: (m.data.attendees || []).join(', '),
      meetRecurring: m.data.recurring || 'none',
      meetRecurringDayOfWeek: m.data.recurringDayOfWeek !== undefined ? String(m.data.recurringDayOfWeek) : undefined,
      meetRecurringEndDate: m.data.recurringEndDate || '',
      _meetRecurringGroupId: m.data.recurringGroupId || undefined,
    }));
    openModal('meeting');
  };
  const openProject = (id: string) => { setSelectedProjectId(id); setScreen('projectDetail'); useUIStore.getState().setCurrentScreen('projectDetail'); };

  // Gallery functions
  const saveGalleryPhoto = async () => {
    const imageData = forms.galleryImageData || '';
    if (!imageData) { showToast('Selecciona una foto', 'error'); return; }
    if (!authUser) { showToast('Error: no hay sesión activa', 'error'); return; }
    try {
      const db = getFirebase().firestore();
      const ts = getFirebase().firestore.FieldValue.serverTimestamp();
      const raw = { projectId: forms.galleryProject || '', categoryName: forms.galleryCategory || 'Otro', caption: forms.galleryCaption || '', imageData, tenantId: activeTenantId || '', createdAt: ts, createdBy: authUser.uid };
      const data = scrubUndefined(raw);
      if (editingId) { await db.collection('galleryPhotos').doc(editingId).update(data); showToast('Foto actualizada'); }
      else { await db.collection('galleryPhotos').add(data); showToast('Foto agregada a galería'); }
      closeModal('gallery'); setEditingId(null); setForms(p => ({ ...p, galleryImageData: '', galleryProject: '', galleryCategory: 'Otro', galleryCaption: '' }));
    } catch (err) { console.error('[Archii] saveGalleryPhoto error:', err); showToast('Error al guardar foto', 'error'); }
  };

  const deleteGalleryPhoto = async (id: string) => {
    const photo = galleryPhotos.find(p => p.id === id);
    const photoData = photo ? { ...photo.data } : null;
    setPendingDeleteAction({
      open: true,
      title: 'Eliminar foto',
      description: '¿Estás seguro de que deseas eliminar esta foto de la galería?',
      onConfirm: async () => {
        setPendingDeleteAction(null);
        try {
          await getFirebase().firestore().collection('galleryPhotos').doc(id).delete();
          if (photoData) {
            toast.success('Foto eliminada', {
              duration: 5000,
              action: {
                label: 'Deshacer',
                onClick: async () => {
                  try {
                    await getFirebase().firestore().collection('galleryPhotos').doc(id).set(scrubUndefined({ ...photoData, updatedAt: getFirebase().firestore.FieldValue.serverTimestamp() }));
                    toast.success('Foto restaurada');
                  } catch (err) { console.error('[Archii] undo deleteGalleryPhoto:', err); toast.error('Error al restaurar'); }
                },
              },
            });
          } else {
            showToast('Foto eliminada');
          }
        } catch (err) { console.error("[Archii]", err); showToast('Error al eliminar', 'error'); }
      },
    });
  };

  const handleGalleryImageSelect = async (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Solo se permiten imágenes', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('La imagen no puede superar 5 MB', 'error'); return; }
    try {
      const base64 = await fileToBase64(file);
      setForms(p => ({ ...p, galleryImageData: base64 }));
    } catch { showToast('Error al procesar imagen', 'error'); }
  };

  const openLightbox = (photo: GalleryPhoto, idx: number) => { setLightboxPhoto(photo); setLightboxIndex(idx); };
  const closeLightbox = () => { setLightboxPhoto(null); setLightboxIndex(0); };
  const lightboxPrev = () => {
    const filtered = getFilteredGalleryPhotos();
    if (filtered.length === 0) return;
    setLightboxIndex(prev => {
      const next = (prev - 1 + filtered.length) % filtered.length;
      setLightboxPhoto(filtered[next]);
      return next;
    });
  };
  const lightboxNext = () => {
    const filtered = getFilteredGalleryPhotos();
    if (filtered.length === 0) return;
    setLightboxIndex(prev => {
      const next = (prev + 1) % filtered.length;
      setLightboxPhoto(filtered[next]);
      return next;
    });
  };

  const getFilteredGalleryPhotos = () => {
    let photos = galleryPhotos;
    if (galleryFilterProject !== 'all') photos = photos.filter(p => p.data.projectId === galleryFilterProject);
    if (galleryFilterCat !== 'all') photos = photos.filter(p => p.data.categoryName === galleryFilterCat);
    return photos;
  };

  // Get platform info for install guide
  const getPlatform = () => {
    if (typeof window === 'undefined') return 'other';
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    if (/Windows/.test(ua)) return 'windows';
    if (/Mac/.test(ua)) return 'mac';
    return 'other';
  };
  const platform = getPlatform();

  /* ===== RFI / SUBMITTAL / PUNCH LIST FUNCTIONS ===== */

  const saveRFI = async () => {
    const result = await fbActions.saveRFI(forms, editingId, showToast, authUser, activeTenantId);
    if (result !== null) {
      closeModal('rfi'); setEditingId(null);
      setForms(p => ({ ...p, rfiSubject: '', rfiQuestion: '', rfiResponse: '', rfiPriority: 'Media', rfiAssignedTo: '', rfiDueDate: '', rfiStatus: 'Abierto', rfiProject: '' }));
    }
  };

  const openEditRFI = (r: RFI) => {
    setEditingId(r.id);
    setForms(f => ({ ...f, rfiSubject: r.data.subject, rfiQuestion: r.data.question, rfiResponse: r.data.response || '', rfiPriority: r.data.priority || 'Media', rfiAssignedTo: r.data.assignedTo || '', rfiDueDate: r.data.dueDate || '', rfiStatus: r.data.status || 'Abierto', rfiProject: r.data.projectId || '' }));
    openModal('rfi');
  };

  const saveSubmittal = async () => {
    const result = await fbActions.saveSubmittal(forms, editingId, showToast, authUser, activeTenantId);
    if (result !== null) {
      closeModal('submittal'); setEditingId(null);
      setForms(p => ({ ...p, subTitle: '', subDescription: '', subSpecification: '', subStatus: 'Borrador', subReviewer: '', subDueDate: '', subReviewNotes: '', subProject: '' }));
    }
  };

  const openEditSubmittal = (s: Submittal) => {
    setEditingId(s.id);
    setForms(f => ({ ...f, subTitle: s.data.title, subDescription: s.data.description || '', subSpecification: s.data.specification || '', subStatus: s.data.status || 'Borrador', subReviewer: s.data.reviewer || '', subDueDate: s.data.dueDate || '', subReviewNotes: s.data.reviewNotes || '', subProject: s.data.projectId || '' }));
    openModal('submittal');
  };

  const savePunchItem = async () => {
    const result = await fbActions.savePunchItem(forms, editingId, showToast, authUser, activeTenantId);
    if (result !== null) {
      closeModal('punchItem'); setEditingId(null);
      setForms(p => ({ ...p, punchTitle: '', punchDescription: '', punchLocation: 'Otro', punchStatus: 'Pendiente', punchPriority: 'Media', punchAssignedTo: '', punchDueDate: '', punchProject: '' }));
    }
  };

  const openEditPunchItem = (p: PunchItem) => {
    setEditingId(p.id);
    setForms(f => ({ ...f, punchTitle: p.data.title, punchDescription: p.data.description || '', punchLocation: p.data.location || 'Otro', punchStatus: p.data.status || 'Pendiente', punchPriority: p.data.priority || 'Media', punchAssignedTo: p.data.assignedTo || '', punchDueDate: p.data.dueDate || '', punchProject: p.data.projectId || '' }));
    openModal('punchItem');
  };

  /* ===== COMMENT FUNCTIONS ===== */
  const postComment = (taskId: string, projectId: string) => {
    if (!commentText.trim()) return;
    const mentions: string[] = [];
    const mentionRegex = /@(\w+)/g;
    let match;
    while ((match = mentionRegex.exec(commentText)) !== null) {
      const mentionedName = match[1];
      const mentionedUser = teamUsers.find(u => u.data.name.toLowerCase().includes(mentionedName.toLowerCase()));
      if (mentionedUser) mentions.push(mentionedUser.id);
    }
    fbActions.saveComment({ taskId, projectId, text: commentText.trim(), mentions, parentId: replyingTo }, showToast, authUser, activeTenantId);
    setCommentText('');
    setReplyingTo(null);
  };

  /* ===== GANTT HELPER ===== */
  const calcGanttDays = (startDate: string, endDate: string): number => {
    if (!startDate || !endDate) return 0;
    return Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)));
  };

  const calcGanttOffset = (phaseStart: string, timelineStart: string): number => {
    if (!phaseStart || !timelineStart) return 0;
    return Math.max(0, Math.ceil((new Date(phaseStart).getTime() - new Date(timelineStart).getTime()) / (1000 * 60 * 60 * 24)));
  };


  /* ===== AUTO DEDUP — runs silently on app open for Super Admins ===== */
  useEffect(() => {
    if (!ready || !authUser || !tenantReady || !activeTenantId || activeTenantRole !== 'Super Admin') return;

    // Run at most once per session
    const dedupDone = sessionStorage.getItem('archii-dedup-done');
    if (dedupDone) return;

    // Debounce: run 10 seconds after app loads (don't block startup)
    const timer = setTimeout(async () => {
      try {
        const idToken = await authUser.getIdToken();
        const res = await fetch('/api/dedup-users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
          body: JSON.stringify({ action: 'dedup-tenant', tenantId: activeTenantId }),
        });
        const result = await res.json();
        if (result.duplicatesRemoved && result.duplicatesRemoved > 0) {

          showToast(`Limpieza automática: ${result.duplicatesRemoved} duplicados eliminados`);
        }
      } catch (_err) {
        // Silent fail — this is a background task
      }
      sessionStorage.setItem('archii-dedup-done', 'true');
    }, 10000); // 10 seconds after app loads

    return () => clearTimeout(timer);
  }, [ready, authUser, tenantReady, activeTenantId, activeTenantRole]);

  // ===== TENANT MANAGEMENT =====
  const switchTenant = useCallback((tenantId: string, tenantName: string, role: string = 'Miembro') => {
    setActiveTenantId(tenantId);
    setActiveTenantName(tenantName);
    setActiveTenantRole(role);
    setTenantReady(true);
    setShowTenantSelector(false);
    try {
      localStorage.setItem('archii-active-tenant', tenantId);
      localStorage.setItem('archii-active-tenant-name', tenantName);
      localStorage.setItem('archii-active-tenant-role', role);
    } catch (err) { console.error("[Archii]", err); }
    // Persist tenant preference to Firestore (survives cache clearing)
    if (authUser) {
      try {
        const db = getFirebase().firestore();
        db.collection('users').doc(authUser.uid).update({
          defaultTenantId: tenantId,
          defaultTenantName: tenantName,
          defaultTenantRole: role,
        }).catch(() => { /* Firestore pref save failed silently */ });
      } catch (_e) { /* silent */ }
    }
    const roleLabel = role === 'Super Admin' ? ' (Super Admin)' : '';
    showToast(`Espacio de trabajo: ${tenantName}${roleLabel}`);
  }, [showToast, authUser]);

  // ===== CONTEXT VALUE =====
  const ctx = {
    screen,
    navigateTo,
    selectedProjectId,
    setSelectedProjectId,
    authUser,
    userName,
    initials,
    isAdmin,
    myRole,
    isEmailAdmin,
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    openModal,
    closeModal,
    showToast,
    darkMode,
    toggleTheme,
    projects,
    tasks,
    teamUsers,
    expenses,
    suppliers,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    activeTenantId,
    activeTenantName,
    activeTenantRole,
    tenantReady,
    switchTenant,
    showTenantSelector,
    setShowTenantSelector,
    currentProject,
    pendingCount,
    doLogin,
    doRegister,
    doGoogleLogin,
    doMicrosoftLogin,
    doLogout,
    forms,
    setForms,
    modals,
    editingId,
    setEditingId,
    ready,
    loading,
    workPhases,
    getPhasesForProject,
    loadPhasesForProject,
    getPhaseName,
    projectPhasesCache,
    setWorkPhases,
    projectFiles,
    setProjectFiles,
    approvals,
    setApprovals,
    calMonth,
    setCalMonth,
    calYear,
    setCalYear,
    calSelectedDate,
    setCalSelectedDate,
    calFilterProject,
    setCalFilterProject,
    meetings,
    setMeetings,
    galleryPhotos,
    setGalleryPhotos,
    galleryFilterProject,
    setGalleryFilterProject,
    galleryFilterCat,
    setGalleryFilterCat,
    lightboxPhoto,
    setLightboxPhoto,
    lightboxIndex,
    setLightboxIndex,
    comments,
    setComments,
    commentText,
    setCommentText,
    replyingTo,
    setReplyingTo,
    taskViewMode,
    setTaskViewMode,
    adminTab,
    setAdminTab,
    adminWeekOffset,
    setAdminWeekOffset,
    adminTaskSearch,
    setAdminTaskSearch,
    adminFilterAssignee,
    setAdminFilterAssignee,
    adminFilterProject,
    setAdminFilterProject,
    adminFilterPriority,
    setAdminFilterPriority,
    adminTooltipTask,
    setAdminTooltipTask,
    adminTooltipPos,
    setAdminTooltipPos,
    adminPermSection,
    setAdminPermSection,
    rolePerms,
    setRolePerms,
    toggleRolePerm,
    isSavingTask,
    setIsSavingTask,
    installPrompt,
    setInstallPrompt,
    showInstallBanner,
    setShowInstallBanner,
    isInstalled,
    setIsInstalled,
    showInstallGuide,
    setShowInstallGuide,
    isStandalone,
    handleInstall,
    dismissInstallBanner,
    platform,
    msConnected,
    msLoading,
    disconnectMicrosoft,
    timeAgo,
    updateUserRole,
    updateUserCompany,
    getMyCompanyId,
    getMyRole,
    visibleProjects,
    getUserName,
    saveProject,
    deleteProject,
    openEditProject,
    saveTask,
    openEditTask,
    updateProjectProgress,
    updateUserName,
    toggleTask,
    changeTaskStatus,
    deleteTask,
    saveExpense,
    openEditExpense,
    deleteExpense,
    saveSupplier,
    deleteSupplier,
    saveCompany,
    deleteCompany,
    pendingDeleteAction,
    setPendingDeleteAction,
    uploadFile,
    deleteFile,
    initDefaultPhases,
    addMissingPhases,
    updatePhaseStatus,
    updatePhaseDates,
    doTogglePhaseEnabled,
    initPhasesByType,
    saveApproval,
    updateApproval,
    deleteApproval,
    GANTT_DAYS,
    GANTT_DAY_NAMES,
    GANTT_STATUS_CFG,
    GANTT_PRIO_CFG,
    getMonday,
    getGanttDays,
    getTaskBar,
    buildGanttRows,
    findOverlaps,
    getProjectColor,
    getProjectColorLight,
    getUserRole,
    activeTasks,
    completedTasks,
    overdueTasks,
    urgentTasks,
    adminFilteredTasks,
    projectExpenses,
    projectTasks,
    projectBudget,
    projectSpent,
    saveMeeting,
    deleteMeeting,
    openEditMeeting,
    openProject,
    saveGalleryPhoto,
    deleteGalleryPhoto,
    handleGalleryImageSelect,
    openLightbox,
    closeLightbox,
    lightboxPrev,
    lightboxNext,
    getFilteredGalleryPhotos,
    postComment,
    calcGanttDays,
    calcGanttOffset,
    screenTitles,
    dailyLogs,
    dailyLogTab,
    setDailyLogTab,
    selectedLogId,
    setSelectedLogId,
    logForm,
    setLogForm,
    saveDailyLog,
    deleteDailyLog,
    openEditLog,
    resetLogForm,
    rfis, setRfis, submittals, setSubmittals, punchItems, setPunchItems,
    rfiFilterProject, setRfiFilterProject, rfiFilterStatus, setRfiFilterStatus,
    subFilterProject, setSubFilterProject, subFilterStatus, setSubFilterStatus,
    punchFilterProject, setPunchFilterProject, punchFilterStatus, setPunchFilterStatus,
    punchFilterLocation, setPunchFilterLocation,
    saveRFI, openEditRFI,
    saveSubmittal, openEditSubmittal,
    savePunchItem, openEditPunchItem,
    isMigratingPhases,
    migrateAllProjectPhases,
  };

  return (
    <AppContext.Provider value={ctx as any}>
      <OneDriveProvider showToast={showToast} selectedProjectId={selectedProjectId}>
        {children}
      </OneDriveProvider>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
