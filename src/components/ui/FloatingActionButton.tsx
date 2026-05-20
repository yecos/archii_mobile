'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FloatingActionButtonProps {
  onClick?: () => void;
  icon?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function FloatingActionButton({
  onClick,
  icon,
  className,
  ariaLabel = 'Nueva acción',
}: FloatingActionButtonProps) {
  return (
    <button
      className={cn(
        'md:hidden fixed bottom-20 right-4 z-30 w-14 h-14 rounded-2xl',
        'bg-[var(--af-accent)] text-[var(--primary-foreground)]',
        'flex items-center justify-center cursor-pointer border-none',
        'shadow-lg shadow-[var(--af-accent)]/25',
        'transition-all duration-200 ease-out',
        'hover:scale-110 hover:shadow-xl hover:shadow-[var(--af-accent)]/30',
        'active:scale-95 active:shadow-md',
        className
      )}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {icon || <Plus size={24} strokeWidth={2.5} />}
    </button>
  );
}
