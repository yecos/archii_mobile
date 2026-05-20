'use client';
import React from 'react';

/* ─── Base Skeleton ─── */
const Skeleton = ({ className = '', rounded = 'lg', style }: { className?: string; rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full'; style?: React.CSSProperties }) => {
  const r: Record<string, string> = { none: 'rounded-none', sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg', full: 'rounded-full' };
  return <div className={`af-skeleton ${r[rounded] || r.lg} ${className}`} style={style} />;
};

/* ─── KPI Card Skeleton ─── */
export const SkeletonKPI = () => (
  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 md:p-5">
    <div className="flex items-center justify-between mb-3">
      <Skeleton className="w-8 h-8" rounded="lg" />
    </div>
    <Skeleton className="h-7 w-14 mb-1.5" rounded="md" />
    <Skeleton className="h-3 w-24" rounded="md" />
  </div>
);

/* ─── List Item Skeleton ─── */
export const SkeletonListItem = ({ hasAvatar = false, hasTag = false, lines = 2 }: { hasAvatar?: boolean; hasTag?: boolean; lines?: number }) => (
  <div className="flex items-start gap-3 py-3 border-b border-[var(--border)] last:border-0">
    {hasAvatar && <Skeleton className="w-8 h-8 flex-shrink-0" rounded="full" />}
    <div className="w-4 h-4 rounded border border-[var(--input)] flex-shrink-0 mt-0.5" />
    <div className="flex-1 space-y-1.5">
      <Skeleton className="h-3.5 w-3/4" />
      {lines > 1 && <Skeleton className="h-2.5 w-1/2" />}
    </div>
    {hasTag && <Skeleton className="h-5 w-16" rounded="full" />}
  </div>
);

/* ─── Card Skeleton ─── */
export const SkeletonCard = () => (
  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-3">
    <div className="flex justify-between">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-5 w-16" rounded="full" />
    </div>
    <Skeleton className="h-4 w-3/4" />
    <div className="flex gap-2">
      <Skeleton className="h-2 w-16" />
      <Skeleton className="h-2 w-20" />
    </div>
    <Skeleton className="h-1.5 w-full" rounded="full" />
  </div>
);

/* ─── Table Row Skeleton ─── */
export const SkeletonTableRow = ({ cols = 5 }: { cols?: number }) => (
  <div className="flex items-center gap-4 py-3 border-b border-[var(--border)]">
    {Array.from({ length: cols }).map((_, i) => (
      <Skeleton key={i} className={`h-3.5 ${i === 0 ? 'w-16' : i === 1 ? 'w-32 flex-1' : 'w-20'}`} />
    ))}
  </div>
);

/* ─── Chart Placeholder Skeleton ─── */
export const SkeletonChart = ({ height = 200 }: { height?: number }) => (
  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
    <Skeleton className="h-4 w-32 mb-4" />
    <div className="flex items-end gap-2" style={{ height }}>
      {[40, 65, 45, 80, 55, 70, 30].map((h, i) => (
        <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  </div>
);

/* ─── Gallery Grid Skeleton ─── */
export const SkeletonGallery = ({ count = 6 }: { count?: number }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <Skeleton key={i} className="aspect-square w-full" />
    ))}
  </div>
);

/* ─── Dashboard Full Skeleton ─── */
export const SkeletonDashboard = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
        <Skeleton className="h-4 w-32 mb-4" />
        {Array.from({ length: 4 }).map((_, i) => <SkeletonListItem key={i} hasTag lines={1} />)}
      </div>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
        <Skeleton className="h-4 w-32 mb-4" />
        {Array.from({ length: 4 }).map((_, i) => <SkeletonListItem key={i} lines={1} />)}
      </div>
    </div>
    <SkeletonChart height={180} />
  </div>
);

/* ─── Projects Grid Skeleton ─── */
export const SkeletonProjects = ({ count = 6 }: { count?: number }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
    {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
  </div>
);

/* ─── Tasks List Skeleton ─── */
export const SkeletonTasks = () => (
  <div className="space-y-4">
    {['Alta', 'Media', 'Baja'].map(prio => (
      <div key={prio} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
        <Skeleton className="h-3 w-24 mb-3" />
        {Array.from({ length: 3 }).map((_, i) => <SkeletonListItem key={i} hasAvatar hasTag lines={1} />)}
      </div>
    ))}
  </div>
);

/* ─── Kanban Board Skeleton ─── */
export const SkeletonKanbanBoard = ({ cols = 4 }: { cols?: number }) => (
  <div className="flex gap-4 overflow-x-auto pb-4">
    {Array.from({ length: cols }).map((_, colIdx) => (
      <div key={colIdx} className="min-w-[260px] w-[260px] flex-shrink-0 space-y-3">
        <Skeleton className="h-5 w-24" rounded="md" />
        <Skeleton className="h-6 w-16" rounded="full" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-4 w-4" rounded="full" />
              <Skeleton className="h-2 w-16" />
            </div>
          </div>
        ))}
      </div>
    ))}
  </div>
);

/* ─── Team Card Skeleton ─── */
export const SkeletonTeamCard = ({ count = 3 }: { count?: number }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-[var(--af-bg3)] rounded-xl p-4 border border-[var(--border)] space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10" rounded="full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
        <Skeleton className="h-2 w-16" rounded="full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" rounded="lg" />
          <Skeleton className="h-8 w-full" rounded="lg" />
        </div>
      </div>
    ))}
  </div>
);

/* ─── File List Skeleton ─── */
export const SkeletonFileList = ({ count = 4 }: { count?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 py-2.5 px-2">
        <Skeleton className="w-5 h-5" rounded="sm" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-2 w-20" />
        </div>
      </div>
    ))}
  </div>
);

/* ─── Tenant Detail Skeleton ─── */
export const SkeletonTenantDetail = () => (
  <div className="p-5 space-y-4">
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      <Skeleton className="w-8 h-8" rounded="lg" />
    </div>
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" rounded="lg" />
      ))}
    </div>
    <div className="space-y-2">
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="w-8 h-8" rounded="full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-40" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default Skeleton;
