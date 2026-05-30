'use client';
import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { SUPPLIER_CATS } from '@/lib/types';
import { Store, Plus, Phone, Mail, MapPin, Globe, Star, ExternalLink, Search, ChevronDown, ChevronUp, ArrowUpDown, X } from 'lucide-react';
import { SkeletonCard } from '@/components/ui/SkeletonLoaders';

type SortKey = 'name' | 'rating' | 'category';
type SortDir = 'asc' | 'desc';

export default function SuppliersScreen() {
  const {
    suppliers, setEditingId, setForms, openModal, deleteSupplier, loading,
  } = useApp();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('Todos');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { Todos: suppliers.length };
    for (const s of suppliers) {
      const cat = s.data.category || 'Otro';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [suppliers]);

  // Filtered + sorted suppliers
  const filtered = useMemo(() => {
    let list = [...suppliers];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(s =>
        (s.data.name || '').toLowerCase().includes(q) ||
        (s.data.category || '').toLowerCase().includes(q) ||
        (s.data.email || '').toLowerCase().includes(q)
      );
    }

    // Category filter
    if (activeCategory !== 'Todos') {
      list = list.filter(s => (s.data.category || 'Otro') === activeCategory);
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = (a.data.name || '').localeCompare(b.data.name || '');
      } else if (sortKey === 'rating') {
        cmp = (a.data.rating || 0) - (b.data.rating || 0);
      } else if (sortKey === 'category') {
        cmp = (a.data.category || '').localeCompare(b.data.category || '');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [suppliers, search, activeCategory, sortKey, sortDir]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  const handleEdit = useCallback((s: any) => {
    setEditingId(s.id);
    setForms(p => ({
      ...p,
      supName: s.data.name,
      supCategory: s.data.category,
      supPhone: s.data.phone,
      supEmail: s.data.email,
      supAddress: s.data.address,
      supWebsite: s.data.website,
      supNotes: s.data.notes,
      supRating: String(s.data.rating),
    }));
    openModal('supplier');
  }, [setEditingId, setForms, openModal]);

  const handleDelete = useCallback((id: string) => {
    deleteSupplier(id);
    if (expandedId === id) setExpandedId(null);
  }, [deleteSupplier, expandedId]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const renderSortBtn = (label: string, sortField: SortKey) => (
    <button
      key={sortField}
      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-[var(--af-bg4)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer border-none"
      onClick={() => toggleSort(sortField)}
    >
      {label}
      <ArrowUpDown size={10} className={sortKey === sortField ? 'text-[var(--af-accent)]' : ''} />
      {sortKey === sortField && (
        <span className="text-[9px] text-[var(--af-accent)]">{sortDir === 'asc' ? '↑' : '↓'}</span>
      )}
    </button>
  );

  // All categories that exist in data (even if not in SUPPLIER_CATS)
  const allCategories = useMemo(() => {
    const inData = new Set(suppliers.map(s => s.data.category || 'Otro'));
    const ordered = SUPPLIER_CATS.filter(c => inData.has(c));
    // Add any categories in data but not in SUPPLIER_CATS
    for (const c of inData) {
      if (!ordered.includes(c)) ordered.push(c);
    }
    return ordered;
  }, [suppliers]);

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Store size={20} className="text-[var(--af-accent)]" aria-hidden="true" />
            Proveedores
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {filtered.length === suppliers.length
              ? `${suppliers.length} proveedores`
              : `${filtered.length} de ${suppliers.length} proveedores`}
          </p>
        </div>
        <button
          className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors"
          onClick={() => { setEditingId(null); openModal('supplier'); }}
        >
          <Plus size={14} aria-hidden="true" />
          Nuevo proveedor
        </button>
      </div>

      {/* Search + Sort bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, categoría o email…"
            className="w-full pl-9 pr-9 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[var(--af-accent)] transition-colors"
          />
          {search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer bg-transparent border-none p-0.5"
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[11px] text-[var(--muted-foreground)] mr-1">Ordenar:</span>
          {renderSortBtn('Nombre', 'name')}
          {renderSortBtn('Calificación', 'rating')}
          {renderSortBtn('Categoría', 'category')}
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          className={`px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer border transition-colors ${
            activeCategory === 'Todos'
              ? 'bg-[var(--af-accent)] text-background border-[var(--af-accent)]'
              : 'bg-[var(--af-bg4)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--af-accent)] hover:text-[var(--foreground)]'
          }`}
          onClick={() => setActiveCategory('Todos')}
        >
          Todos <span className="ml-1 opacity-70">({categoryCounts['Todos'] || 0})</span>
        </button>
        {allCategories.map(cat => (
          <button
            key={cat}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer border transition-colors ${
              activeCategory === cat
                ? 'bg-[var(--af-accent)] text-background border-[var(--af-accent)]'
                : 'bg-[var(--af-bg4)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--af-accent)] hover:text-[var(--foreground)]'
            }`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat} <span className="ml-1 opacity-70">({categoryCounts[cat] || 0})</span>
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty state — no suppliers at all */}
      {!loading && suppliers.length === 0 && (
        <div className="text-center py-16 text-[var(--af-text3)]">
          <div className="text-4xl mb-3">🏪</div>
          <div className="text-[15px] font-medium text-[var(--muted-foreground)] mb-1">Sin proveedores</div>
          <div className="text-[13px]">Agrega tu primer proveedor</div>
        </div>
      )}

      {/* Empty search results */}
      {!loading && suppliers.length > 0 && filtered.length === 0 && (
        <div className="text-center py-16 text-[var(--af-text3)]">
          <Search size={36} className="mx-auto mb-3 text-[var(--muted-foreground)] opacity-50" />
          <div className="text-[15px] font-medium text-[var(--muted-foreground)] mb-1">Sin resultados</div>
          <div className="text-[13px] mb-4">No se encontraron proveedores con &quot;{search}&quot;</div>
          <button
            className="text-[12px] text-[var(--af-accent)] hover:underline cursor-pointer bg-transparent border-none"
            onClick={() => { setSearch(''); setActiveCategory('Todos'); }}
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* Supplier cards */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => {
            const isExpanded = expandedId === s.id;
            const rating = s.data.rating || 0;
            const hasDetails = s.data.notes || s.data.address || s.data.website;

            return (
              <div
                key={s.id}
                className={`bg-[var(--card)] border rounded-xl transition-all ${
                  isExpanded ? 'border-[var(--af-accent)] shadow-lg shadow-[var(--af-accent)]/5' : 'border-[var(--border)] hover:border-[var(--input)]'
                }`}
              >
                {/* Card header */}
                <div className="p-4 pb-0">
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-11 h-11 bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg flex items-center justify-center text-lg flex-shrink-0">
                      🏪
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        className="p-1.5 rounded-md bg-[var(--af-bg4)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer border-none transition-colors"
                        onClick={() => handleEdit(s)}
                        aria-label="Editar proveedor"
                      >
                        ✏️
                      </button>
                      <button
                        className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer border-none transition-colors"
                        onClick={() => handleDelete(s.id)}
                        aria-label="Eliminar proveedor"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* Name + Category */}
                  <div className="text-sm font-semibold mb-0.5 text-[var(--foreground)]">{s.data.name}</div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--af-text3)] border border-[var(--border)]">
                      {s.data.category || 'Otro'}
                    </span>
                  </div>

                  {/* Rating */}
                  <div className="flex items-center gap-1 mb-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        size={13}
                        className={i < rating ? 'text-amber-400 fill-amber-400' : 'text-[var(--border)]'}
                        aria-hidden="true"
                      />
                    ))}
                    <span className="text-[11px] text-[var(--muted-foreground)] ml-1">{rating}/5</span>
                  </div>
                </div>

                {/* Contact info (always visible) */}
                <div className="px-4 pb-2 space-y-1.5">
                  {s.data.phone && (
                    <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                      <Phone size={12} className="flex-shrink-0 text-[var(--af-accent)]" aria-hidden="true" />
                      <span className="truncate">{s.data.phone}</span>
                    </div>
                  )}
                  {s.data.email && (
                    <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                      <Mail size={12} className="flex-shrink-0 text-[var(--af-accent)]" aria-hidden="true" />
                      <span className="truncate">{s.data.email}</span>
                    </div>
                  )}
                </div>

                {/* Expand/collapse toggle */}
                {hasDetails && (
                  <div className="px-4 pb-1">
                    <button
                      className="flex items-center gap-1 text-[11px] text-[var(--af-accent)] hover:underline cursor-pointer bg-transparent border-none p-0"
                      onClick={() => toggleExpand(s.id)}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? 'Ver menos' : 'Ver más detalles'}
                    >
                      {isExpanded ? (
                        <>Ver menos <ChevronUp size={12} /></>
                      ) : (
                        <>Ver más <ChevronDown size={12} /></>
                      )}
                    </button>
                  </div>
                )}

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-[var(--border)] mt-2 space-y-2 animate-fadeIn">
                    {s.data.address && (
                      <div className="flex items-start gap-2 text-xs text-[var(--muted-foreground)]">
                        <MapPin size={12} className="flex-shrink-0 mt-0.5 text-[var(--af-accent)]" aria-hidden="true" />
                        <span>{s.data.address}</span>
                      </div>
                    )}
                    {s.data.website && (
                      <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                        <Globe size={12} className="flex-shrink-0 text-[var(--af-accent)]" aria-hidden="true" />
                        <a
                          href={s.data.website.startsWith('http') ? s.data.website : `https://${s.data.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--af-accent)] hover:underline flex items-center gap-1 truncate"
                        >
                          {s.data.website}
                          <ExternalLink size={10} className="flex-shrink-0" />
                        </a>
                      </div>
                    )}
                    {s.data.notes && (
                      <div className="mt-2">
                        <div className="text-[11px] font-medium text-[var(--muted-foreground)] mb-1">Notas</div>
                        <div className="text-xs text-[var(--foreground)] bg-[var(--af-bg3)] rounded-lg p-2.5 border border-[var(--border)] whitespace-pre-wrap">
                          {s.data.notes}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Bottom padding if not expanded and no details */}
                {!isExpanded && !hasDetails && <div className="pb-4" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
