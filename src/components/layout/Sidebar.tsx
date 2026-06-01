'use client';
import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { getInitials, avatarColor } from '@/lib/helpers';
import { ROLE_ICONS } from '@/lib/types';
import { useUIStore } from '@/stores/ui-store';
import type { FirebaseUser } from '@/lib/firebase-service';
import { LayoutGrid, User, Folder, ClipboardCheck, MessageCircle, DollarSign, FileText, Camera, Image, Package, Settings, Store, Users, Calendar, Globe, Building2, Download, ChevronLeft, Home, Timer, Receipt, BarChart3, Shield, CircleHelp, ClipboardList, ListChecks, CalendarDays, Search, X, ChevronDown, FolderOpen, ShieldCheck, Briefcase, Wrench, FileEdit, Mail, BookOpen, StickyNote, Puzzle, CreditCard, Palette } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';

interface SidebarProps {
  screen: string;
  navigateTo: (s: string, projId?: string | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  userName: string;
  initials: string;
  authUser: FirebaseUser | null;
  teamUsers: any[];
  isEmailAdmin: boolean;
  projects: any[];
  tasks: any[];
  pendingCount: number;
  galleryPhotos: any[];
  invLowStock: any[];
  isAdmin: boolean;
  activeTenantName: string | null;
  activeTenantRole: string;
  onSwitchTenant: () => void;
  onOpenSettings?: () => void;
}

export default function Sidebar({
  screen, navigateTo, sidebarOpen, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed,
  userName, initials, authUser, teamUsers, isEmailAdmin,
  projects, tasks, pendingCount, galleryPhotos, invLowStock, isAdmin,
  activeTenantName, activeTenantRole, onSwitchTenant,
  onOpenSettings,
}: SidebarProps) {
  const setSettingsOpen = useUIStore(s => s.setSettingsOpen);
  const [navSearch, setNavSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const calendarBadge = useMemo(() => {
    const count = tasks.filter(t => t.data.dueDate && t.data.status !== 'Completado').length;
    return count > 0 ? count : undefined;
  }, [tasks]);

  const agendaTodayBadge = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const count = tasks.filter(t => t.data.agendaMeta?.dayKey === today).length;
    return count > 0 ? count : undefined;
  }, [tasks]);

  // ─── Category definitions ───
  type NavCategory = 'principal' | 'proyecto' | 'calidad' | 'admin' | 'otros';

  const CATEGORY_META: Record<NavCategory, { label: string; icon: React.ReactNode; defaultOpen: boolean }> = {
    principal: { label: 'Principal', icon: <Home size={14} className="stroke-current" aria-hidden="true" />, defaultOpen: true },
    proyecto: { label: 'Proyecto', icon: <FolderOpen size={14} className="stroke-current" aria-hidden="true" />, defaultOpen: true },
    calidad: { label: 'Calidad', icon: <ShieldCheck size={14} className="stroke-current" aria-hidden="true" />, defaultOpen: false },
    admin: { label: 'Administración', icon: <Briefcase size={14} className="stroke-current" aria-hidden="true" />, defaultOpen: false },
    otros: { label: 'Otros', icon: <Wrench size={14} className="stroke-current" aria-hidden="true" />, defaultOpen: false },
  };

  const navItems = [
    // ── Principal ──
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutGrid size={18} className="stroke-current" aria-hidden="true" />, category: 'principal' as NavCategory },
    { id: 'weeklyAgenda', label: 'Agenda Semanal', icon: <CalendarDays size={18} className="stroke-current" aria-hidden="true" />, badge: agendaTodayBadge, category: 'principal' as NavCategory },
    { id: 'profile', label: 'Mi Perfil', icon: <User size={18} className="stroke-current" aria-hidden="true" />, category: 'principal' as NavCategory },
    { id: 'projects', label: 'Proyectos', icon: <Folder size={18} className="stroke-current" aria-hidden="true" />, badge: projects.length, category: 'principal' as NavCategory },
    { id: 'tasks', label: 'Tareas', icon: <ClipboardCheck size={18} className="stroke-current" aria-hidden="true" />, badge: pendingCount > 0 ? pendingCount : undefined, category: 'principal' as NavCategory },
    { id: 'chat', label: 'Chat', icon: <MessageCircle size={18} className="stroke-current" aria-hidden="true" />, category: 'principal' as NavCategory },
    { id: 'directmessages', label: 'Mensajes Directos', icon: <Mail size={18} className="stroke-current" aria-hidden="true" />, category: 'principal' as NavCategory },
    // ── Proyecto ──
    { id: 'timeTracking', label: 'Time Tracking', icon: <Timer size={18} className="stroke-current" aria-hidden="true" />, category: 'proyecto' as NavCategory },
    { id: 'budget', label: 'Presupuestos', icon: <DollarSign size={18} className="stroke-current" aria-hidden="true" />, category: 'proyecto' as NavCategory },
    { id: 'files', label: 'Planos y archivos', icon: <FileText size={18} className="stroke-current" aria-hidden="true" />, category: 'proyecto' as NavCategory },
    { id: 'obra', label: 'Seguimiento obra', icon: <Camera size={18} className="stroke-current" aria-hidden="true" />, category: 'proyecto' as NavCategory },
    { id: 'gallery', label: 'Galería', icon: <Image size={18} className="stroke-current" aria-hidden="true" />, badge: galleryPhotos.length > 0 ? galleryPhotos.length : undefined, category: 'proyecto' as NavCategory },
    { id: 'inventory', label: 'Inventario', icon: <Package size={18} className="stroke-current" aria-hidden="true" />, badge: invLowStock.length > 0 ? invLowStock.length : undefined, category: 'proyecto' as NavCategory },
    { id: 'kanban', label: 'Tablero Kanban', icon: <ListChecks size={18} className="stroke-current" aria-hidden="true" />, category: 'proyecto' as NavCategory },
    // ── Calidad ──
    { id: 'rfis', label: 'RFIs', icon: <CircleHelp size={18} className="stroke-current" aria-hidden="true" />, category: 'calidad' as NavCategory },
    { id: 'submittals', label: 'Submittals', icon: <ClipboardList size={18} className="stroke-current" aria-hidden="true" />, category: 'calidad' as NavCategory },
    { id: 'punchList', label: 'Punch List', icon: <ListChecks size={18} className="stroke-current" aria-hidden="true" />, category: 'calidad' as NavCategory },
    { id: 'changeorders', label: 'Órdenes de Cambio', icon: <FileEdit size={18} className="stroke-current" aria-hidden="true" />, category: 'calidad' as NavCategory },
    { id: 'fieldnotes', label: 'Notas de Campo', icon: <StickyNote size={18} className="stroke-current" aria-hidden="true" />, category: 'calidad' as NavCategory },
    // ── Administración ──
    { id: 'admin', label: 'Panel Admin', icon: <Settings size={18} className="stroke-current" aria-hidden="true" />, category: 'admin' as NavCategory },
    { id: 'suppliers', label: 'Proveedores', icon: <Store size={18} className="stroke-current" aria-hidden="true" />, category: 'admin' as NavCategory },
    { id: 'team', label: 'Equipo', icon: <Users size={18} className="stroke-current" aria-hidden="true" />, badge: teamUsers.length, category: 'admin' as NavCategory },
    { id: 'invoices', label: 'Facturas', icon: <Receipt size={18} className="stroke-current" aria-hidden="true" />, category: 'admin' as NavCategory },
    { id: 'carnets', label: 'Carnets', icon: <CreditCard size={18} className="stroke-current" aria-hidden="true" />, category: 'admin' as NavCategory },
    { id: 'carnet-designer', label: 'Diseñador Carnet', icon: <Palette size={18} className="stroke-current" aria-hidden="true" />, category: 'admin' as NavCategory },
    { id: 'companies', label: 'Empresas', icon: <Building2 size={18} className="stroke-current" aria-hidden="true" />, category: 'admin' as NavCategory },
    { id: 'catalogs', label: 'Catálogos', icon: <BookOpen size={18} className="stroke-current" aria-hidden="true" />, category: 'admin' as NavCategory },
    { id: 'integrations', label: 'Integraciones', icon: <Globe size={18} className="stroke-current" aria-hidden="true" />, category: 'admin' as NavCategory },
    // ── Otros ──
    { id: 'calendar', label: 'Calendario', icon: <Calendar size={18} className="stroke-current" aria-hidden="true" />, badge: calendarBadge, category: 'otros' as NavCategory },
    { id: 'portal', label: 'Portal cliente', icon: <Globe size={18} className="stroke-current" aria-hidden="true" />, category: 'otros' as NavCategory },
    { id: 'reports', label: 'Reportes', icon: <BarChart3 size={18} className="stroke-current" aria-hidden="true" />, category: 'otros' as NavCategory },
    { id: 'install', label: 'Instalar App', icon: <Download size={18} className="stroke-current" aria-hidden="true" />, category: 'otros' as NavCategory },
    ...(isEmailAdmin ? [
      { id: 'adminlog', label: 'Logs del Sistema', icon: <Shield size={18} className="stroke-current" aria-hidden="true" />, category: 'otros' as NavCategory },
      { id: 'superAdmin', label: 'Super Admin', icon: <Shield size={18} className="stroke-red-400" aria-hidden="true" />, isSuperAdmin: true, category: 'otros' as NavCategory },
    ] : []),
  ];

  // ─── Collapsible category state (persisted to localStorage) ───
  const STORAGE_KEY = 'archii-sidebar-collapsed';
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsedCategories)); } catch {}
  }, [collapsedCategories]);

  const toggleCategory = useCallback((cat: string) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  const isCategoryCollapsed = useCallback((cat: string) => {
    if (cat === 'principal') return false; // Principal always open
    const meta = CATEGORY_META[cat as NavCategory];
    if (collapsedCategories[cat] === undefined) return !meta?.defaultOpen;
    return collapsedCategories[cat];
  }, [collapsedCategories]);

  // ─── Group items by category ───
  const groupedItems = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const item of navItems) {
      const cat = (item as any).category || 'otros';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }, [navItems]);

  const categoryOrder: NavCategory[] = ['principal', 'proyecto', 'calidad', 'admin', 'otros'];

  // Filter nav items by search query
  const searchQ = navSearch.toLowerCase().trim();
  const filteredNavItems = searchQ
    ? navItems.filter((n: any) => n.label.toLowerCase().includes(searchQ) || n.id.toLowerCase().includes(searchQ))
    : [];
  const hasResults = filteredNavItems.length > 0;

  const handleNavClick = (navId: string) => {
    navigateTo(navId, null);
    setSidebarOpen(false);
    setNavSearch('');
  };

  const isActive = (n: any) => screen === n.id;
  const userRole = teamUsers.find(u => u.id === authUser?.uid)?.data?.role || 'Miembro';
  const displayRole = isEmailAdmin ? 'Admin' : userRole;

  // ─── Shared: render a nav item row ───
  const renderNavItem = (n: any, variant: 'mobile' | 'desktop') => {
    const isDesktopCollapsed = variant === 'desktop' && sidebarCollapsed;
    const base = variant === 'mobile'
      ? 'flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer text-[15px] mb-0.5 transition-all'
      : 'flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-[13.5px] mb-0.5 transition-all';
    const active = variant === 'mobile'
      ? 'bg-[var(--accent)] text-[var(--af-accent2)] font-medium'
      : 'bg-[var(--accent)] text-[var(--af-accent2)] shadow-sm';
    const inactive = variant === 'mobile'
      ? 'text-[var(--muted-foreground)] hover:bg-[var(--af-bg3)] hover:text-[var(--foreground)] active:bg-[var(--af-bg4)]'
      : 'text-[var(--muted-foreground)] hover:bg-[var(--af-bg3)] hover:text-[var(--foreground)]';
    const badgeBase = variant === 'mobile'
      ? 'text-[11px] font-semibold px-2 py-0.5 rounded-full'
      : 'text-[10px] font-semibold px-1.5 py-0.5 rounded-full';
    const labelClass = variant === 'mobile'
      ? 'flex-1'
      : isDesktopCollapsed ? 'md:hidden' : 'flex-1';

    return (
      <div
        key={n.id}
        className={`${base} ${isActive(n) ? active : inactive}`}
        onClick={() => handleNavClick(n.id)}
        title={isDesktopCollapsed ? n.label : undefined}
      >
        {n.icon}
        <span className={labelClass}>{n.label}</span>
        {n.badge !== undefined && !isDesktopCollapsed && (
          <span className={`${badgeBase} ${n.id === 'tasks' && pendingCount > 0 ? 'bg-red-500 text-white' : 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]'}`}>
            {n.badge}
          </span>
        )}
      </div>
    );
  };

  // ─── Shared: render a collapsible category block ───
  const renderCategory = (cat: NavCategory, variant: 'mobile' | 'desktop') => {
    const items = groupedItems[cat];
    if (!items || items.length === 0) return null;
    const meta = CATEGORY_META[cat];
    const catCollapsed = isCategoryCollapsed(cat);
    const isPrincipal = cat === 'principal';
    const isDesktopCollapsed = variant === 'desktop' && sidebarCollapsed;

    // When desktop sidebar is collapsed: hide non-principal categories entirely,
    // hide headers, show only Principal icons
    if (isDesktopCollapsed && !isPrincipal) return null;

    const headerClass = variant === 'mobile'
      ? 'text-[10px] font-semibold tracking-wider text-[var(--af-text3)] uppercase px-3 mt-4 mb-1'
      : 'text-[10px] font-semibold tracking-wider text-[var(--af-text3)] uppercase px-2 mt-4 mb-1 transition-all duration-200 overflow-hidden';

    return (
      <div key={cat}>
        <button
          className={`w-full flex items-center gap-2 ${headerClass} ${!isPrincipal ? 'cursor-pointer hover:text-[var(--foreground)]' : 'cursor-default'} ${isDesktopCollapsed ? 'md:hidden md:h-0' : ''} bg-transparent border-none text-left`}
          onClick={() => !isPrincipal && toggleCategory(cat)}
          aria-expanded={!catCollapsed}
          aria-label={`${meta.label}${isPrincipal ? '' : catCollapsed ? ' — expandir' : ' — colapsar'}`}
        >
          {!isPrincipal && (
            <ChevronDown size={12} className={`transition-transform duration-200 ${catCollapsed ? '-rotate-90' : ''}`} aria-hidden="true" />
          )}
          {meta.icon}
          <span>{meta.label}</span>
          {!isPrincipal && (
            <span className="ml-auto text-[9px] font-normal normal-case tracking-normal text-[var(--af-text3)]">{items.length}</span>
          )}
        </button>
        {(!catCollapsed || isPrincipal) && items.map((n: any) => renderNavItem(n, variant))}
      </div>
    );
  };

  return (
    <>
      {/* ─── Mobile: BottomSheet-style drawer ─── */}
      <div className="md:hidden">
        <BottomSheet
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          snapPoints={[0.7, 1]}
          className="pb-4"
          contentClassName="rounded-t-3xl max-h-[90vh]"
        >
          {/* Brand header inside sheet */}
          <div className="flex items-center gap-2.5 pb-3 mb-3 border-b border-[var(--border)]">
            <div className="w-9 h-9 bg-gradient-to-br from-[var(--af-accent)] to-[var(--af-accent2)] rounded-xl shadow-sm flex items-center justify-center flex-shrink-0">
              <Home size={20} strokeWidth={2} className="stroke-[var(--primary-foreground)]" />
            </div>
            <div>
              <div style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg flex items-center gap-1.5">
                Archii
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--af-accent)]/15 text-[var(--af-accent)]" style={{ fontFamily: 'system-ui, sans-serif' }}>2.0</span>
              </div>
              <div className="text-[10px] text-[var(--af-text3)]">Premium</div>
            </div>
          </div>

          {/* Navigation */}
          <div className="overflow-y-auto -mx-1 px-1" id="onboarding-sidebar-trigger-mobile" style={{ maxHeight: 'calc(80vh - 180px)', WebkitOverflowScrolling: 'touch' }}>
            {/* Nav search */}
            <div className="relative mx-2 mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <input
                ref={searchInputRef}
                type="text"
                value={navSearch}
                onChange={e => setNavSearch(e.target.value)}
                placeholder="Buscar navegación..."
                className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg pl-8 pr-7 py-2 text-[12px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]/50 transition-colors"
              />
              {navSearch && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[var(--af-bg4)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-accent)]/20 transition-colors border-none" onClick={() => setNavSearch('')}>
                  <X size={10} className="text-[var(--muted-foreground)]" />
                </button>
              )}
            </div>
            {searchQ ? (
              hasResults ? (
                <>
                  <div className="text-[10px] font-semibold tracking-wider text-[var(--af-text3)] uppercase px-3 mb-1">Resultados ({filteredNavItems.length})</div>
                  {filteredNavItems.map((n: any) => renderNavItem(n, 'mobile'))}
                </>
              ) : (
                <div className="text-center py-6 text-[var(--af-text3)] text-[12px]">Sin resultados para "{navSearch}"</div>
              )
            ) : (
              categoryOrder.map(cat => renderCategory(cat, 'mobile'))
            )}
          </div>

          {/* Settings button */}
          <button
            onClick={() => { setSidebarOpen(false); setTimeout(() => setSettingsOpen(true), 200); }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer hover:bg-[var(--af-bg3)] active:bg-[var(--af-bg4)] transition-all bg-transparent border-none text-left mb-1 mt-2"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[var(--af-accent)]/15">
              <Settings size={16} className="stroke-[var(--af-accent)]" />
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-medium">Configuración</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">Temas, notificaciones, cuenta</div>
            </div>
            <ChevronLeft size={14} className="stroke-[var(--muted-foreground)] rotate-180" />
          </button>

          {/* User profile at bottom */}
          <div className="border-t border-[var(--border)] mt-4 pt-3">
            {/* Tenant switch button */}
            <button
              onClick={() => { setSidebarOpen(false); setTimeout(() => onSwitchTenant(), 200); }}
              className="w-full flex items-center gap-3 px-1 py-2 rounded-xl cursor-pointer hover:bg-[var(--af-bg3)] active:bg-[var(--af-bg4)] transition-all bg-transparent border-none text-left mb-2"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-[var(--af-accent)]/20 to-[var(--af-accent2)]/10">
                <Building2 size={16} className="stroke-[var(--af-accent)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium truncate flex items-center gap-1.5">
                  {activeTenantName || 'Espacio'}
                  {activeTenantRole === 'Super Admin' && (
                    <span className="inline-flex items-center text-[10px] font-bold bg-gradient-to-r from-[var(--af-accent)] to-amber-500 text-background px-1 py-0.5 rounded-md">ADMIN</span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--af-accent)]">Cambiar espacio</div>
              </div>
              <ChevronLeft size={14} className="stroke-[var(--muted-foreground)] rotate-180" />
            </button>
            <div className="flex items-center gap-3 px-1 cursor-pointer" onClick={() => handleNavClick('profile')}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 flex-shrink-0 ${authUser?.photoURL ? '' : avatarColor(authUser?.uid ?? '')} overflow-hidden`}>
                {authUser?.photoURL ? <img src={authUser.photoURL} alt="" className="w-full h-full object-cover" /> : initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium truncate">{userName}</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">{ROLE_ICONS[displayRole] || '👤'} {displayRole}</div>
              </div>
            </div>
          </div>
        </BottomSheet>
      </div>

      {/* ─── Desktop/Tablet: Slide-in sidebar ─── */}
      <aside className={`hidden md:flex fixed md:static z-50 h-full af-glass shadow-xl border-r border-[var(--border)] flex-col flex-shrink-0 transition-all duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 ${sidebarCollapsed ? 'w-[68px]' : 'w-[270px]'}`}>
        <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="flex items-center justify-center h-8 w-8 self-end mr-2 mt-2 rounded-lg hover:bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)] text-[var(--muted-foreground)] transition-colors cursor-pointer" title={sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}>
          <ChevronLeft size={16} className="transition-transform" style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none' }} />
        </button>
        <div className="p-4 pb-3 border-b border-[var(--border)] flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-[var(--af-accent)] to-[var(--af-accent2)] rounded-xl shadow-sm flex items-center justify-center flex-shrink-0">
            <Home size={20} strokeWidth={2} className="stroke-background" />
          </div>
          <div className={`transition-all duration-200 overflow-hidden ${sidebarCollapsed ? 'md:hidden md:w-0' : 'md:block'}`}><div style={{ fontFamily: "'DM Serif Display', serif" }} className="text-lg flex items-center gap-1.5">Archii <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--af-accent)]/15 text-[var(--af-accent)]" style={{ fontFamily: 'system-ui, sans-serif' }}>2.0</span></div><div className="text-[10px] text-[var(--af-text3)]">Premium</div></div>
        </div>
        <div className="flex-1 overflow-y-auto py-3 px-3" id="onboarding-sidebar-trigger">
          {/* Desktop nav search — only when expanded */}
          {!sidebarCollapsed && (
            <div className="relative mb-2">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <input
                ref={searchInputRef}
                type="text"
                value={navSearch}
                onChange={e => setNavSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg pl-8 pr-7 py-1.5 text-[12px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)]/50 transition-colors"
              />
              {navSearch && (
                <button className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[var(--af-bg4)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-accent)]/20 transition-colors border-none" onClick={() => setNavSearch('')}>
                  <X size={10} className="text-[var(--muted-foreground)]" />
                </button>
              )}
            </div>
          )}
          {/* When collapsed: show search icon that expands + focuses */}
          {sidebarCollapsed && (
            <button
              className="flex items-center justify-center w-full py-2 mb-1 rounded-lg cursor-pointer hover:bg-[var(--af-bg3)] transition-colors text-[var(--muted-foreground)]"
              onClick={() => { setSidebarCollapsed(false); setTimeout(() => searchInputRef.current?.focus(), 300); }}
              title="Buscar navegación"
            >
              <Search size={18} />
            </button>
          )}
          {searchQ ? (
            <>
              {hasResults ? (
                <>
                  <div className="text-[10px] font-semibold tracking-wider text-[var(--af-text3)] uppercase px-2 mb-1">Resultados ({filteredNavItems.length})</div>
                  {filteredNavItems.map((n: any) => renderNavItem(n, 'desktop'))}
                </>
              ) : (
                <div className="text-center py-6 text-[var(--af-text3)] text-[11px]">Sin resultados</div>
              )}
            </>
          ) : (
            categoryOrder.map(cat => renderCategory(cat, 'desktop'))
          )}
        </div>
        <div className="border-t border-[var(--border)] p-3 flex items-center gap-2.5 cursor-pointer hover:bg-[var(--af-bg3)]" onClick={() => navigateTo('profile')}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border ${authUser?.photoURL ? '' : avatarColor(authUser?.uid ?? '')} overflow-hidden`}>{authUser?.photoURL ? <img src={authUser.photoURL} alt="" className="w-full h-full object-cover" /> : initials}</div>
          <div className={`flex-1 min-w-0 transition-all duration-200 ${sidebarCollapsed ? 'md:hidden md:w-0' : 'md:block'}`}><div className="text-[13px] font-medium truncate">{userName}</div><div className="text-[11px] text-[var(--muted-foreground)]">{ROLE_ICONS[displayRole] || '👤'} {displayRole}</div></div>
        </div>
      </aside>
    </>
  );
}
