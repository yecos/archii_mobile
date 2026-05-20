'use client';
import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import AppProvider from '@/contexts/AppContext';
import { NotificationProvider } from '@/hooks/useNotifications';
import { ChatProvider } from '@/hooks/useChat';
import { InventoryProvider } from '@/hooks/useInventory';
import { TimeTrackingProvider } from '@/hooks/useTimeTracking';
import { useUIStore } from '@/stores/ui-store';
import { initOfflineSync } from '@/lib/offline-queue';

// Dynamically import CapacitorInit (only needed on client)
const CapacitorInit = dynamic(
  () => import('@/components/archii/CapacitorInit'),
  { ssr: false }
);

/**
 * ClientProviders — Client-side wrapper for layout.tsx
 *
 * Provider hierarchy:
 *   NotificationProvider → AppProvider → ChatProvider → InventoryProvider → TimeTrackingProvider → children
 *
 * NotificationProvider wraps AppProvider so that:
 * - AppProvider can call useNotificationsContext() for detection effects
 * - Components can use useNotificationsContext() for notification UI
 * ChatProvider wraps inside AppProvider so that:
 * - ChatProvider can call useApp() for auth/tenant/project data
 * - Components can use useChatContext() for chat state and functions
 * InventoryProvider wraps inside AppProvider so that:
 * - InventoryProvider can call useApp() for auth/tenant/forms/modals
 * - InventoryProvider can call useNotificationsContext() for inventory notifications
 * - Components can use useInventoryContext() for inventory state and functions
 * TimeTrackingProvider wraps inside InventoryProvider so that:
 * - TimeTrackingProvider can call useApp() for auth/tenant/forms/modals
 * - TimeTrackingProvider can use useNotificationsContext() for time tracking notifications
 */
export default function ClientProviders({ children }: { children: React.ReactNode }) {
  const initTheme = useUIStore(s => s.initTheme);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  // Inicializar offline sync listener (fire-and-forget)
  useEffect(() => {
    const cleanup = initOfflineSync();
    return cleanup;
  }, []);

  return (
    <NotificationProvider>
      <AppProvider>
        <ChatProvider>
          <InventoryProvider>
            <TimeTrackingProvider>
              {/* Initialize Capacitor native plugins (no-op on web) */}
              <CapacitorInit />
              {children}
            </TimeTrackingProvider>
          </InventoryProvider>
        </ChatProvider>
      </AppProvider>
    </NotificationProvider>
  );
}
