'use client';

import React from 'react';
import { FolderOpen } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  emoji?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon,
  emoji,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="text-center py-16 text-[var(--af-text3)]">
      {icon ? (
        <div className="flex justify-center mb-3 text-[var(--muted-foreground)]">{icon}</div>
      ) : emoji ? (
        <div className="text-4xl mb-3">{emoji}</div>
      ) : (
        <div className="flex justify-center mb-3 text-[var(--muted-foreground)]">
          <FolderOpen size={40} strokeWidth={1.5} aria-hidden="true" />
        </div>
      )}
      <div className="text-[15px] font-medium text-[var(--muted-foreground)] mb-1">{title}</div>
      {description && <div className="text-[13px]">{description}</div>}
      {actionLabel && onAction && (
        <button
          className="mt-4 px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--af-accent)] text-background border-none cursor-pointer hover:bg-[var(--af-accent2)] transition-colors"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
