/**
 * VirtualizedList.tsx
 * Componente reutilizable de lista virtualizada para Archii.
 *
 * Usa @tanstack/react-virtual para renderizar solo los items visibles,
 * mejorando rendimiento en listas de 50+ items.
 *
 * Gated por feature flag 'virtualized_lists' — si está desactivada,
 * renderiza como lista normal (fallback seguro).
 *
 * Uso:
 *   <VirtualizedList
 *     items={tasks}
 *     estimateSize={80}
 *     renderItem={({ item, index }) => <TaskCard key={item.id} task={item} />}
 *   />
 */

'use client';

import { useRef, useCallback, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { isFlagEnabled } from '@/lib/feature-flags';

/* ---- Types ---- */

interface VirtualizedListProps<T> {
  /** Array de items a renderizar */
  items: T[];
  /** Altura estimada de cada item en px */
  estimateSize?: number;
  /** Clase CSS para el contenedor scrollable */
  containerClassName?: string;
  /** Altura fija del contenedor (ej: '500px', '60vh'). Necesaria para virtualización. */
  height?: string;
  /** Render function para cada item */
  renderItem: (props: { item: T; index: number; style: React.CSSProperties }) => ReactNode;
  /** Espaciado vertical entre items */
  gap?: number;
  /** Overscan: cuántos items extra renderizar fuera del viewport (default 5) */
  overscan?: number;
  /** Texto cuando la lista está vacía */
  emptyText?: string;
  /** Clase CSS para el item wrapper */
  itemClassName?: string;
}

/* ---- Component ---- */

export function VirtualizedList<T>({
  items,
  estimateSize = 72,
  containerClassName = '',
  height = '60vh',
  renderItem,
  gap = 2,
  overscan = 5,
  emptyText,
  itemClassName = '',
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Si la feature flag está desactivada o hay pocos items, renderizar normal
  const shouldVirtualize = isFlagEnabled('virtualized_lists') && items.length > 30;

  if (!shouldVirtualize) {
    // Fallback: render normal sin virtualización
    return (
      <div className={containerClassName}>
        {items.length === 0 && emptyText ? (
          <div className="flex items-center justify-center py-12 text-[var(--muted-foreground)]">
            {emptyText}
          </div>
        ) : (
          <div className={`flex flex-col gap-${gap} ${itemClassName}`}>
            {items.map((item, index) => (
              <div key={index}>
                {renderItem({
                  item,
                  index,
                  style: {} as React.CSSProperties,
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize + gap,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={`overflow-y-auto ${containerClassName}`}
      style={{ height, contain: 'strict' }}
    >
      {items.length === 0 && emptyText ? (
        <div className="flex items-center justify-center py-12 text-[var(--muted-foreground)]">
          {emptyText}
        </div>
      ) : (
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualItem) => {
            const item = items[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                  padding: `${gap / 2}px 0`,
                }}
                data-index={virtualItem.index}
              >
                {renderItem({
                  item,
                  index: virtualItem.index,
                  style: {} as React.CSSProperties,
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---- Hook para uso directo sin componente ---- */

/**
 * Hook para virtualización personalizada.
 * Útil cuando necesitas control total sobre el layout del contenedor.
 *
 * @example
 *   const { parentRef, virtualizer, virtualItems } = useVirtualizedList(items.length, 80);
 *   return (
 *     <div ref={parentRef} style={{ height: '60vh', overflow: 'auto' }}>
 *       <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
 *         {virtualItems.map(vi => (
 *           <div key={vi.key} style={{ position: 'absolute', top: vi.start, left: 0, width: '100%' }}>
 *             {renderItem(items[vi.index])}
 *           </div>
 *         ))}
 *       </div>
 *     </div>
 *   );
 */
export function useVirtualizedList(count: number, estimateSize: number, overscan = 5) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  return {
    parentRef,
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
  };
}
