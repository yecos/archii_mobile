import { create } from 'zustand';
import { THEME_REGISTRY, type ThemeDefinition } from '@/lib/theme-registry';

type ThemeId = string;

interface UIState {
  // AI Panel
  aiChatOpen: boolean;
  quickActionsOpen: boolean;
  setAIChatOpen: (open: boolean) => void;
  toggleAIChat: () => void;
  setQuickActionsOpen: (open: boolean) => void;
  toggleQuickActions: () => void;

  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Theme System
  theme: ThemeId;
  themes: ThemeDefinition[];
  setTheme: (themeId: ThemeId) => void;
  toggleTheme: () => void;
  initTheme: () => void;

  // Command palette
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  toggleCommand: () => void;

  // Settings Panel
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  toggleSettings: () => void;

  // Notifications
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  clearUnread: () => void;

  // Current screen (for mobile optimization)
  currentScreen: string;
  setCurrentScreen: (screen: string) => void;

  // AI Project Context
  aiProjectContext: string;
  setAIProjectContext: (context: string) => void;

  // Kanban Board
  kanbanBoardId: string | null;
  setKanbanBoardId: (id: string | null) => void;
  kanbanEntityType: 'tasks' | 'projects' | 'approvals' | 'invoices' | 'transfers' | 'phases' | 'incidents';
  setKanbanEntityType: (type: 'tasks' | 'projects' | 'approvals' | 'invoices' | 'transfers' | 'phases' | 'incidents') => void;
  kanbanViewMode: 'board' | 'list';
  setKanbanViewMode: (mode: 'board' | 'list') => void;
  kanbanCollapsedSwimlanes: string[];
  toggleKanbanSwimlane: (id: string) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  // AI Panel
  aiChatOpen: false,
  quickActionsOpen: false,
  setAIChatOpen: (open) => set({ aiChatOpen: open, quickActionsOpen: open ? false : undefined }),
  toggleAIChat: () => set((state) => ({ aiChatOpen: !state.aiChatOpen, quickActionsOpen: false })),
  setQuickActionsOpen: (open) => set({ quickActionsOpen: open, aiChatOpen: open ? false : undefined }),
  toggleQuickActions: () => set((state) => ({ quickActionsOpen: !state.quickActionsOpen, aiChatOpen: false })),

  // Sidebar
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  // Theme System
  theme: 'dark',
  themes: THEME_REGISTRY,

  /** Initialize theme from localStorage — called once on mount from ClientProviders */
  initTheme: () => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('archii-theme') || 'dark';
      set({ theme: saved });
      // Apply .dark class + CSS variables
      const themeDef = THEME_REGISTRY.find(t => t.id === saved);
      const isDark = themeDef?.isDark ?? (saved === 'dark');
      document.documentElement.classList.toggle('dark', isDark);
      if (themeDef) {
        Object.entries(themeDef.colors).forEach(([key, value]) => {
          document.documentElement.style.setProperty(key, value);
        });
      }
    } catch {
      // Fallback to dark
      set({ theme: 'dark' });
      document.documentElement.classList.add('dark');
    }
  },

  /** Set a specific theme by ID */
  setTheme: (themeId: ThemeId) => {
    set({ theme: themeId });
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('archii-theme', themeId);
      const themeDef = THEME_REGISTRY.find(t => t.id === themeId);
      const isDark = themeDef?.isDark ?? (themeId === 'dark');
      document.documentElement.classList.toggle('dark', isDark);
      if (themeDef) {
        Object.entries(themeDef.colors).forEach(([key, value]) => {
          document.documentElement.style.setProperty(key, value);
        });
      }
    } catch {}
  },

  /** Toggle between dark and light */
  toggleTheme: () => {
    const { theme } = get();
    const next = theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  // Command palette
  commandOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),
  toggleCommand: () => set((state) => ({ commandOpen: !state.commandOpen })),

  // Settings Panel
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),

  // Notifications
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
  incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  clearUnread: () => set({ unreadCount: 0 }),

  // Current screen (for mobile optimization)
  currentScreen: 'dashboard',
  setCurrentScreen: (screen) => set({ currentScreen: screen }),

  // AI Project Context
  aiProjectContext: '',
  setAIProjectContext: (context) => set({ aiProjectContext: context }),

  // Kanban Board
  kanbanBoardId: null,
  setKanbanBoardId: (id) => set({ kanbanBoardId: id }),
  kanbanEntityType: 'tasks' as const,
  setKanbanEntityType: (type) => set({ kanbanEntityType: type }),
  kanbanViewMode: 'board' as const,
  setKanbanViewMode: (mode) => set({ kanbanViewMode: mode }),
  kanbanCollapsedSwimlanes: [] as string[],
  toggleKanbanSwimlane: (id) => set((state) => ({
    kanbanCollapsedSwimlanes: state.kanbanCollapsedSwimlanes.includes(id)
      ? state.kanbanCollapsedSwimlanes.filter(s => s !== id)
      : [...state.kanbanCollapsedSwimlanes, id]
  })),
}));
