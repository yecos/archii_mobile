'use client';
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '@/contexts/AppContext';
import { useNotificationsContext } from '@/hooks/useNotifications';
import { useInventoryContext } from '@/hooks/useInventory';
import { Toaster } from 'sonner';
import { Bell, X } from 'lucide-react';

/* ─── Layout ─── */
import LoadingScreen from '@/components/layout/LoadingScreen';
import AuthScreen from '@/components/layout/AuthScreen';
import TenantSelectionScreen from '@/components/layout/TenantSelectionScreen';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import BottomNav from '@/components/layout/BottomNav';
import InstallBanner from '@/components/layout/InstallBanner';
import NotifPanel from '@/components/layout/NotifPanel';
import SettingsPanel from '@/components/layout/SettingsPanel';

/* ─── Features ─── */
import LightboxViewer from '@/components/features/LightboxViewer';

/* ─── Modals ─── */
import ProjectModal from '@/components/modals/ProjectModal';
import TaskModal from '@/components/modals/TaskModal';
import ExpenseModal from '@/components/modals/ExpenseModal';
import SupplierModal from '@/components/modals/SupplierModal';
import TimeEntryModal from '@/components/modals/TimeEntryModal';
import ApprovalModal from '@/components/modals/ApprovalModal';
import MeetingModal from '@/components/modals/MeetingModal';
import GalleryModal from '@/components/modals/GalleryModal';
import InvProductModal from '@/components/modals/InvProductModal';
import InvCategoryModal from '@/components/modals/InvCategoryModal';
import InvMovementModal from '@/components/modals/InvMovementModal';
import InvTransferModal from '@/components/modals/InvTransferModal';
import CompanyModal from '@/components/modals/CompanyModal';
import RFIModal from '@/components/modals/RFIModal';
import SubmittalModal from '@/components/modals/SubmittalModal';
import PunchItemModal from '@/components/modals/PunchItemModal';

import ErrorBoundary from '@/components/common/ErrorBoundary';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import AIFloatingWrapper from '@/components/archii/AIFloatingWrapper';
import KeyboardShortcutsInitializer from '@/components/archii/KeyboardShortcutsInitializer';
import OnboardingProvider from '@/components/onboarding/OnboardingProvider';
import FeedbackWidget from '@/components/beta/FeedbackWidget';

/* ─── Screens — core screens loaded directly ─── */
import DashboardScreen from '@/screens/DashboardScreen';
import ProjectsScreen from '@/screens/ProjectsScreen';
import ProjectDetailScreen from '@/screens/ProjectDetailScreen';
import TasksScreen from '@/screens/TasksScreen';
import ChatScreen from '@/screens/ChatScreen';
import BudgetScreen from '@/screens/BudgetScreen';
import ProfileScreen from '@/screens/ProfileScreen';

/* ─── Screens — lazy loaded (heavy / rarely used) ─── */
import dynamic from 'next/dynamic';
const FilesScreen = dynamic(() => import('@/screens/FilesScreen'), { ssr: false });
const ObraScreen = dynamic(() => import('@/screens/ObraScreen'), { ssr: false });
const SuppliersScreen = dynamic(() => import('@/screens/SuppliersScreen'), { ssr: false });
const TeamScreen = dynamic(() => import('@/screens/TeamScreen'), { ssr: false });
const CompaniesScreen = dynamic(() => import('@/screens/CompaniesScreen'), { ssr: false });
const CalendarScreen = dynamic(() => import('@/screens/CalendarScreen'), { ssr: false });
const PortalScreen = dynamic(() => import('@/screens/PortalScreen'), { ssr: false });
const GalleryScreen = dynamic(() => import('@/screens/GalleryScreen'), { ssr: false });
const InventoryScreen = dynamic(() => import('@/screens/InventoryScreen'), { ssr: false });
const AdminScreen = dynamic(() => import('@/screens/AdminScreen'), { ssr: false });
const InstallScreen = dynamic(() => import('@/screens/InstallScreen'), { ssr: false });
const TimeTrackingScreen = dynamic(() => import('@/screens/TimeTrackingScreen'), { ssr: false });
const InvoicesScreen = dynamic(() => import('@/screens/InvoicesScreen'), { ssr: false });
const ReportsScreen = dynamic(() => import('@/screens/ReportsScreen'), { ssr: false });
const SuperAdminScreen = dynamic(() => import('@/screens/SuperAdminScreen'), { ssr: false });
const RFIsScreen = dynamic(() => import('@/screens/RFIsScreen'), { ssr: false });
const SubmittalsScreen = dynamic(() => import('@/screens/SubmittalsScreen'), { ssr: false });
const PunchListScreen = dynamic(() => import('@/screens/PunchListScreen'), { ssr: false });
const KanbanBoardScreen = dynamic(() => import('@/screens/KanbanBoardScreen'), { ssr: false });
const WeeklyAgendaScreen = dynamic(() => import('@/screens/WeeklyAgendaScreen'), { ssr: false });

function AppContent() {
  const {
    ready, loading, authUser, screen, navigateTo,
    sidebarOpen, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed,
    closeModal,
    projects, tasks, teamUsers, companies,
    currentProject, pendingCount, isAdmin, isEmailAdmin,
    userName, initials,
    doLogin, doRegister, doGoogleLogin, doMicrosoftLogin,
    forms, setForms,
    modals,
    galleryPhotos,
    screenTitles,
    pendingDeleteAction, setPendingDeleteAction,
    tenantReady, activeTenantName, activeTenantRole, showTenantSelector, setShowTenantSelector,
  } = useApp();
  const {
    showNotifBanner, requestNotifPermission, dismissNotifBanner,
    inAppNotifs, setInAppNotifs, markNotifRead,
  } = useNotificationsContext();
  const { invLowStock } = useInventoryContext();

  if (!ready || loading) return <LoadingScreen />;
  if (!authUser) return (
    <>
      {/* Toaster MUST be rendered here too — otherwise auth errors are invisible */}
      <Toaster
        position="top-center"
        toastOptions={{
          unstyled: false,
          classNames: {
            toast: 'af-sonner-toast',
            title: 'af-sonner-title',
            description: 'af-sonner-desc',
            actionButton: 'af-sonner-action',
            cancelButton: 'af-sonner-cancel',
            success: '!bg-emerald-600 !text-white !border-emerald-500',
            error: '!bg-red-500 !text-white !border-red-400',
            warning: '!bg-amber-500 !text-white !border-amber-400',
          },
        }}
        richColors
        closeButton
        duration={3500}
      />
      <AuthScreen
        forms={forms}
        setForms={setForms}
        doLogin={doLogin}
        doRegister={doRegister}
        doGoogleLogin={doGoogleLogin}
        doMicrosoftLogin={doMicrosoftLogin}
        showToast={() => {}}
      />
    </>
  );

  // Block app until tenant is selected
  if (!tenantReady) return <TenantSelectionScreen />;

  // Local screen title overrides (dynamic titles like projectDetail)
  const localScreenTitles: Record<string, string> = {
    dashboard: 'Dashboard', projects: 'Proyectos', tasks: 'Tareas', chat: 'Mensajes',
    budget: 'Presupuestos', files: 'Planos y archivos', gallery: 'Galería', inventory: 'Inventario',
    admin: 'Panel Admin', superAdmin: 'Super Admin', obra: 'Seguimiento obra', suppliers: 'Proveedores', team: 'Equipo',
    calendar: 'Calendario', portal: 'Portal cliente', profile: 'Mi Perfil', install: 'Instalar App',
    companies: 'Empresas', rfis: 'RFIs', submittals: 'Submittals', punchList: 'Punch List', projectDetail: currentProject?.data.name || 'Proyecto',
  };

  return (
    <div className="flex h-dvh overflow-hidden af-noise" style={{ height: '100dvh' }}>
      {/* Ambient background — premium depth effect (dark mode only) */}
      <div className="af-ambient-bg" />
      {/* Sonner Toaster — premium toast system */}
      <Toaster
        position="top-center"
        toastOptions={{
          unstyled: false,
          classNames: {
            toast: 'af-sonner-toast',
            title: 'af-sonner-title',
            description: 'af-sonner-desc',
            actionButton: 'af-sonner-action',
            cancelButton: 'af-sonner-cancel',
            success: '!bg-emerald-600 !text-white !border-emerald-500',
            error: '!bg-red-500 !text-white !border-red-400',
            warning: '!bg-amber-500 !text-white !border-amber-400',
          },
        }}
        richColors
        closeButton
        duration={3500}
      />

      <InstallBanner />
      <Sidebar
        screen={screen}
        navigateTo={navigateTo}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        userName={userName}
        initials={initials}
        authUser={authUser}
        teamUsers={teamUsers}
        isEmailAdmin={isEmailAdmin}
        projects={projects}
        tasks={tasks}
        pendingCount={pendingCount}
        galleryPhotos={galleryPhotos}
        invLowStock={invLowStock}
        isAdmin={isAdmin}
        activeTenantName={activeTenantName}
        activeTenantRole={activeTenantRole}
        onSwitchTenant={() => setShowTenantSelector(true)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />

        {/* Notification Permission Banner — small inline */}
        {showNotifBanner && (
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-[var(--af-accent)]/10 via-[var(--af-accent)]/5 to-transparent border-b border-[var(--af-accent)]/20 animate-fadeIn">
            <Bell size={20} className="stroke-[var(--af-accent)] flex-shrink-0" aria-hidden="true"/>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium">Activar notificaciones</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">Recibe alertas de chat, tareas, reuniones, inventario y más — incluso cuando la app esté cerrada</div>
            </div>
            <button className="px-4 py-2 bg-[var(--af-accent)] text-background rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-[var(--af-accent2)] transition-colors border-none flex-shrink-0" onClick={requestNotifPermission}>
              Activar ahora
            </button>
            <button aria-label="Descartar" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--af-bg4)] text-[var(--muted-foreground)] cursor-pointer flex-shrink-0 border-none bg-transparent" onClick={dismissNotifBanner}>
              <X size={16} className="stroke-current" aria-hidden="true"/>
            </button>
          </div>
        )}

        {/* In-App Notification Toasts — small inline */}
        <div aria-live="polite" aria-atomic="true" className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-auto z-[100] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: '380px' }}>
          {inAppNotifs.map((n: any) => (
            <div key={n.id} className="pointer-events-auto bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 shadow-2xl flex items-start gap-3 animate-slideUp cursor-pointer hover:border-[var(--af-accent)]/30 transition-all" style={{ width: '340px', maxWidth: 'calc(100vw - 32px)' }} onClick={() => { markNotifRead(n.id); if (n.screen) navigateTo(n.screen, n.itemId); }}>
              <div className="text-lg flex-shrink-0 mt-0.5">{n.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium leading-tight">{n.title}</div>
                <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5 line-clamp-2 leading-snug">{n.body}</div>
              </div>
              <button className="w-5 h-5 flex items-center justify-center rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex-shrink-0 bg-transparent border-none cursor-pointer mt-0.5" onClick={(e) => { e.stopPropagation(); setInAppNotifs((prev: any) => prev.filter((x: any) => x.id !== n.id)); }}>
                <svg viewBox="0 0 24 24" className="w-3 h-3 stroke-current fill-none" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>

        <NotifPanel />
        <SettingsPanel />

        {/* Main content with screen rendering */}
        <main
          id="main-content"
          className={`flex-1 flex flex-col overflow-hidden ${screen === 'chat' ? 'p-0' : 'overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8 pb-[calc(60px+env(safe-area-inset-bottom,0px))] md:pb-6'}`}
          style={{ maxHeight: screen === 'chat' ? 'calc(100dvh - 60px)' : undefined }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="flex-1 flex flex-col min-h-0"
            >
              <ErrorBoundary>
              {screen === 'dashboard' && <DashboardScreen />}
              {screen === 'projects' && <ProjectsScreen />}
              {screen === 'projectDetail' && <ProjectDetailScreen />}
              {screen === 'tasks' && <TasksScreen />}
              {screen === 'kanban' && <KanbanBoardScreen />}
              {screen === 'chat' && <ChatScreen />}
              {screen === 'budget' && <BudgetScreen />}
              {screen === 'files' && <FilesScreen />}
              {screen === 'obra' && <ObraScreen />}
              {screen === 'suppliers' && <SuppliersScreen />}
              {screen === 'team' && <TeamScreen />}
              {screen === 'companies' && <CompaniesScreen />}
              {screen === 'calendar' && <CalendarScreen />}
              {screen === 'weeklyAgenda' && <WeeklyAgendaScreen />}
              {screen === 'portal' && <PortalScreen />}
              {screen === 'gallery' && <GalleryScreen />}
              {screen === 'inventory' && <InventoryScreen />}
              {screen === 'admin' && <AdminScreen />}
              {screen === 'profile' && <ProfileScreen />}
              {screen === 'install' && <InstallScreen />}
              {screen === 'timeTracking' && <TimeTrackingScreen />}
              {screen === 'invoices' && <InvoicesScreen />}
              {screen === 'reports' && <ReportsScreen />}
              {screen === 'superAdmin' && <SuperAdminScreen />}
              {screen === 'rfis' && <RFIsScreen />}
              {screen === 'submittals' && <SubmittalsScreen />}
              {screen === 'punchList' && <PunchListScreen />}
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <BottomNav />

      {/* AI Assistant - Floating wrapper (MUST be inside AppProvider) */}
      <AIFloatingWrapper />
      {/* Keyboard Shortcuts - Global initialization (MUST be inside AppProvider) */}
      <KeyboardShortcutsInitializer />
      {/* Onboarding - Wizard, Spotlight, Help (auto-triggers for first-time users) */}
      <OnboardingProvider />
      {/* Beta - Feedback widget */}
      <FeedbackWidget />

      {/* ===== Modals — each self-contained ===== */}
      <ProjectModal open={!!modals.project} onClose={() => closeModal('project')} />
      <TaskModal open={!!modals.task} onClose={() => closeModal('task')} />
      <ExpenseModal open={!!modals.expense} onClose={() => closeModal('expense')} />
      <SupplierModal open={!!modals.supplier} onClose={() => closeModal('supplier')} />
      <TimeEntryModal open={!!modals.timeEntry} onClose={() => closeModal('timeEntry')} />
      <ApprovalModal open={!!modals.approval} onClose={() => closeModal('approval')} />
      <MeetingModal open={!!modals.meeting} onClose={() => closeModal('meeting')} />
      <GalleryModal open={!!modals.gallery} onClose={() => closeModal('gallery')} />
      <InvProductModal open={!!modals.invProduct} onClose={() => closeModal('invProduct')} />
      <InvCategoryModal open={!!modals.invCategory} onClose={() => closeModal('invCategory')} />
      <InvMovementModal open={!!modals.invMovement} onClose={() => closeModal('invMovement')} />
      <InvTransferModal open={!!modals.invTransfer} onClose={() => closeModal('invTransfer')} />
      <CompanyModal open={!!modals.company} onClose={() => closeModal('company')} />
      <RFIModal open={!!modals.rfi} onClose={() => closeModal('rfi')} />
      <SubmittalModal open={!!modals.submittal} onClose={() => closeModal('submittal')} />
      <PunchItemModal open={!!modals.punchItem} onClose={() => closeModal('punchItem')} />

      <LightboxViewer />

      {/* Global Confirm Dialog — for deleteCompany and future destructive actions */}
      <ConfirmDialog
        open={!!pendingDeleteAction?.open}
        onOpenChange={(open) => { if (!open) setPendingDeleteAction(null); }}
        title={pendingDeleteAction?.title || ''}
        description={pendingDeleteAction?.description}
        confirmLabel={(pendingDeleteAction as any)?.confirmLabel || 'Eliminar'}
        cancelLabel="Cancelar"
        destructive
        onConfirm={() => { pendingDeleteAction?.onConfirm(); }}
      />

      {/* Tenant switcher overlay */}
      {showTenantSelector && <TenantSelectionScreen />}
    </div>
  );
}

/* ─── Entry point — AppProvider is now in layout.tsx via ClientProviders ─── */

export default function Home() {
  return <AppContent />;
}
