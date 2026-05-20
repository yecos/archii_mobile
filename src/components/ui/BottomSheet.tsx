'use client';

import React from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerPortal, DrawerOverlay } from '@/components/ui/drawer';
import { Drawer as DrawerPrimitive } from 'vaul';

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  snapPoints?: (string | number)[];
  className?: string;
  contentClassName?: string;
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  snapPoints,
  className,
  contentClassName,
}: BottomSheetProps) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={snapPoints}
      dismissible
      handleOnly
    >
      <DrawerPortal>
        <DrawerOverlay className="bg-black/50 backdrop-blur-sm" />
        <DrawerPrimitive.Content
          data-slot="drawer-content"
          className={`group/drawer-content bg-[var(--card)] fixed z-50 flex h-auto flex-col inset-x-0 bottom-0 mt-24 rounded-t-2xl border-t border-[var(--border)] shadow-[0_-4px_30px_rgba(0,0,0,0.12)] ${
            contentClassName || ''
          }`}
        >
          {/* iOS-style drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-[var(--muted-foreground)]/30 group-active/drawer-content:bg-[var(--muted-foreground)]/50 transition-colors" />
          </div>

          {/* Title area */}
          {(title || description) && (
            <DrawerHeader className="px-5 pb-2 pt-1 text-left">
              {title && (
                <DrawerTitle className="text-base font-semibold text-[var(--foreground)]">
                  {title}
                </DrawerTitle>
              )}
              {description && (
                <DrawerDescription className="text-xs text-[var(--muted-foreground)]">
                  {description}
                </DrawerDescription>
              )}
            </DrawerHeader>
          )}

          {/* Content */}
          <div className={`flex-1 overflow-y-auto px-5 pb-6 ${className || ''}`}>
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPortal>
    </Drawer>
  );
}
