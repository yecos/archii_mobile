'use client';

import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface OverflowMenuAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  separator?: boolean;
}

export interface OverflowMenuProps {
  actions: OverflowMenuAction[];
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  triggerClassName?: string;
}

export function OverflowMenu({
  actions,
  align = 'end',
  side = 'bottom',
  className,
  triggerClassName,
}: OverflowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer',
            'bg-[var(--af-bg3)] border border-[var(--border)]',
            'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--af-bg4)]',
            'transition-colors duration-150',
            triggerClassName
          )}
          aria-label="Más opciones"
        >
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        sideOffset={4}
        className={cn(
          'min-w-[180px] bg-[var(--card)] border border-[var(--border)] rounded-xl',
          'shadow-lg shadow-black/10 p-1',
          className
        )}
      >
        {actions.map((action, index) => {
          const item = (
            <DropdownMenuItem
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2.5 cursor-pointer',
                'text-[13px] outline-none transition-colors duration-100',
                'min-h-[44px]',
                action.variant === 'danger'
                  ? 'text-red-500 focus:bg-red-500/10 focus:text-red-500'
                  : 'text-[var(--foreground)] focus:bg-[var(--af-bg3)] focus:text-[var(--foreground)]'
              )}
            >
              {action.icon && (
                <span className="flex-shrink-0 [&>svg]:size-4">
                  {action.icon}
                </span>
              )}
              <span className="flex-1">{action.label}</span>
            </DropdownMenuItem>
          );

          return action.separator ? (
            <React.Fragment key={index}>
              {index > 0 && <DropdownMenuSeparator className="bg-[var(--border)] my-1" />}
              {item}
            </React.Fragment>
          ) : (
            item
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
