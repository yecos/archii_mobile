'use client';

/**
 * PresenceAvatars.tsx
 * Displays a horizontal row of overlapping avatar circles showing
 * who is currently viewing/editing a collaborative document.
 *
 * Features:
 *   - Shows up to 5 avatars + "+N more" indicator
 *   - Stacked from right (most recent on the right)
 *   - Green dot for online status
 *   - Color-coded border by role (ROLE_COLORS palette)
 *   - Pulsing animation for the currently typing user
 *   - Tooltip with user name on hover
 *
 * Props:
 *   documentId  – ID of the collaborative document
 *   tenantId    – Tenant ID for scoping
 *   className   – Optional CSS class
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { ROLE_COLORS } from '@/lib/types';
import {
  getCollaborationService,
  destroyCollaborationService,
  type PresenceEntry,
} from '@/lib/collaboration-service';

/* ---- Types ---- */

interface PresenceAvatarsProps {
  documentId: string;
  tenantId: string;
  className?: string;
}

/** Role color map for avatar borders (Tailwind ring classes) */
const ROLE_RING_COLORS: Record<string, string> = {
  Admin: 'ring-red-400',
  Director: 'ring-sky-400',
  Arquitecto: 'ring-blue-400',
  Interventor: 'ring-purple-400',
  Contratista: 'ring-amber-400',
  Cliente: 'ring-emerald-400',
  Miembro: 'ring-slate-400',
};

const MAX_VISIBLE = 5;

/* ---- Component ---- */

export default function PresenceAvatars({
  documentId,
  tenantId,
  className,
}: PresenceAvatarsProps) {
  const [presences, setPresences] = useState<PresenceEntry[]>([]);
  const mountedRef = useRef(true);

  // Subscribe to presence updates
  useEffect(() => {
    mountedRef.current = true;

    const collab = getCollaborationService();
    const unsub = collab.subscribeToPresence((updated) => {
      if (mountedRef.current) {
        setPresences(updated);
      }
    });

    // Auto-join session if not already active
    if (!collab.active) {
      // We need current user info — this is typically provided by AppContext
      // For now, we rely on the parent to have called joinSession already.
      // The subscription above will still work if joined externally.
    }

    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, [documentId, tenantId]);

  // Show only the first MAX_VISIBLE + overflow count
  const visibleUsers = presences.slice(0, MAX_VISIBLE);
  const overflowCount = Math.max(0, presences.length - MAX_VISIBLE);

  // Find a user that is currently typing (for pulsing indicator)
  const typingUser = presences.find((p) => p.isTyping);

  if (presences.length === 0) {
    return null;
  }

  return (
    <div
      className={cn('flex items-center', className)}
      role="group"
      aria-label={`${presences.length} usuario(s) en línea`}
    >
      {/* Avatar stack — rendered right to left so first user appears on the right */}
      <div className="flex items-center -space-x-2.5">
        {[...visibleUsers].reverse().map((presence) => {
          const isTyping = typingUser?.userId === presence.userId;
          const ringColor =
            ROLE_RING_COLORS[presence.userRole || 'Miembro'] ||
            ROLE_RING_COLORS.Miembro;

          return (
            <div
              key={presence.userId}
              className="relative"
              title={`${presence.userName}${isTyping ? ' (escribiendo...)' : ''}`}
            >
              {/* Pulsing ring animation for typing user */}
              {isTyping && (
                <span className="absolute inset-0 rounded-full animate-ping opacity-30 bg-emerald-400" />
              )}

              <div
                className={cn(
                  'relative size-8 rounded-full ring-2 ring-background overflow-hidden',
                  ringColor,
                  isTyping && 'ring-offset-2 ring-offset-background'
                )}
              >
                {presence.userPhoto ? (
                  <img
                    src={presence.userPhoto}
                    alt={presence.userName}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="size-full flex items-center justify-center bg-muted text-xs font-semibold text-muted-foreground">
                    {getInitials(presence.userName)}
                  </div>
                )}
              </div>

              {/* Green online dot */}
              <span className="absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
            </div>
          );
        })}

        {/* "+N more" overflow indicator */}
        {overflowCount > 0 && (
          <div
            className="relative size-8 rounded-full ring-2 ring-background bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground"
            title={`${overflowCount} usuario(s) más en línea`}
          >
            +{overflowCount}
          </div>
        )}
      </div>

      {/* Typing indicator text */}
      {typingUser && (
        <span className="ml-2 text-xs text-muted-foreground animate-pulse">
          {typingUser.userName} está escribiendo...
        </span>
      )}
    </div>
  );
}

/* ---- Helpers ---- */

/**
 * Extract initials from a display name.
 * Handles "First Last" and compound names.
 */
function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
