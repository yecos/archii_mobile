'use client';
import React, { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { fmtCOP } from '@/lib/helpers';
import { toDate } from '@/lib/types';
import { Building2, Search, ArrowUpDown, Briefcase, Eye, Plus, ChevronDown, DollarSign, Pencil, Trash2 } from 'lucide-react';
import type { Company } from '@/lib/types';

type SortKey = 'name-asc' | 'name-desc' | 'projects-desc' | 'date-desc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name-asc', label: 'Nombre A–Z' },
  { value: 'name-desc', label: 'Nombre Z–A' },
  { value: 'projects-desc', label: 'Más proyectos' },
  { value: 'date-desc', label: 'Más recientes' },
];

export default function CompaniesScreen() {
  const {
    companies, projects, deleteCompany, setEditingId, setForms, openModal, showToast,
    navigateTo,
  } = useApp();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name-asc');

  /* ── Derived data: projects per company ── */
  const companyStats = useMemo(() => {
    const stats: Record<string, { count: number; totalBudget: number }> = {};
    companies.forEach(c => { stats[c.id] = { count: 0, totalBudget: 0 }; });
    projects.forEach(p => {
      const cid = p.data.companyId;
      if (cid && stats[cid]) {
        stats[cid].count += 1;
        stats[cid].totalBudget += Number(p.data.budget) || 0;
      }
    });
    return stats;
  }, [companies, projects]);

  /* ── KPI summary ── */
  const summary = useMemo(() => {
    let totalProjects = 0;
    let totalBudget = 0;
    companies.forEach(c => {
      const s = companyStats[c.id];
      if (s) {
        totalProjects += s.count;
        totalBudget += s.totalBudget;
      }
    });
    return { totalProjects, totalBudget, companiesWithProjects: companies.filter(c => (companyStats[c.id]?.count || 0) > 0).length };
  }, [companies, companyStats]);

  /* ── Filtered + sorted list ── */
  const filtered = useMemo(() => {
    let list = [...companies];
    // Search
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter((c: Company) =>
        (c.data.name || '').toLowerCase().includes(q) ||
        (c.data.nit || '').toLowerCase().includes(q) ||
        (c.data.legalName || '').toLowerCase().includes(q)
      );
    }
    // Sort
    list.sort((a: Company, b: Company) => {
      switch (sortBy) {
        case 'name-asc':
          return (a.data.name || '').localeCompare(b.data.name || '');
        case 'name-desc':
          return (b.data.name || '').localeCompare(a.data.name || '');
        case 'projects-desc': {
          const diff = (companyStats[b.id]?.count || 0) - (companyStats[a.id]?.count || 0);
          return diff !== 0 ? diff : (a.data.name || '').localeCompare(b.data.name || '');
        }
        case 'date-desc': {
          const da = toDate(a.data.createdAt).getTime();
          const db = toDate(b.data.createdAt).getTime();
          return db - da;
        }
        default:
          return 0;
      }
    });
    return list;
  }, [companies, search, sortBy, companyStats]);

  /* ── Handlers ── */
  const handleNewCompany = () => {
    setEditingId(null);
    setForms(p => ({
      ...p,
      compName: '',
      compNit: '',
      compAddress: '',
      compPhone: '',
      compEmail: '',
      compLegal: '',
    }));
    openModal('company');
  };

  const handleEditCompany = (c: Company) => {
    setEditingId(c.id);
    setForms(p => ({
      ...p,
      compName: c.data.name || '',
      compNit: c.data.nit || '',
      compAddress: c.data.address || '',
      compPhone: c.data.phone || '',
      compEmail: c.data.email || '',
      compLegal: c.data.legalName || '',
    }));
    openModal('company');
  };

  const handleViewProjects = () => {
    navigateTo('projects');
  };

  return (
    <div className="animate-fadeIn space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Building2 size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Empresas
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {companies.length} empresa{companies.length !== 1 ? 's' : ''} registrada{companies.length !== 1 ? 's' : ''}
            {filtered.length !== companies.length && ` · ${filtered.length} encontrada${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity"
          onClick={handleNewCompany}
        >
          <Plus size={14} aria-hidden="true"/>
          Nueva empresa
        </button>
      </div>

      {/* ── Search + Sort bar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true"/>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o NIT..."
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] transition-colors placeholder:text-[var(--muted-foreground)]"
          />
        </div>
        <div className="relative">
          <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] pointer-events-none" aria-hidden="true"/>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            className="bg-[var(--card)] border border-[var(--border)] rounded-lg pl-9 pr-6 py-2 text-[13px] text-[var(--foreground)] outline-none cursor-pointer appearance-none focus:border-[var(--af-accent)] transition-colors"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] pointer-events-none" aria-hidden="true"/>
        </div>
      </div>

      {/* ── KPI summary cards ── */}
      {companies.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
              <Building2 size={11} className="text-[var(--af-accent)]" aria-hidden="true"/>
              Total empresas
            </div>
            <div className="text-lg font-bold text-[var(--af-accent)]">{companies.length}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">
              {summary.companiesWithProjects} con proyectos
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
              <Briefcase size={11} className="text-blue-400" aria-hidden="true"/>
              Total proyectos
            </div>
            <div className="text-lg font-bold text-blue-400">{summary.totalProjects}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">vinculados a empresas</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
              <DollarSign size={11} className="text-emerald-400" aria-hidden="true"/>
              Presupuesto total
            </div>
            <div className="text-lg font-bold text-emerald-400">{fmtCOP(summary.totalBudget)}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">suma de presupuestos</div>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!search && filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🏢</div>
          <div className="text-[15px] font-medium text-[var(--muted-foreground)] mb-1">No hay empresas registradas</div>
          <div className="text-[13px] text-[var(--af-text3)]">Crea tu primera empresa para organizar proyectos</div>
        </div>
      )}

      {/* ── No results state ── */}
      {search && filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🔍</div>
          <div className="text-[15px] font-medium text-[var(--muted-foreground)] mb-1">Sin resultados</div>
          <div className="text-[13px] text-[var(--af-text3)]">
            No se encontraron empresas para &quot;{search}&quot;
          </div>
          <button
            className="mt-3 text-[12px] text-[var(--af-accent)] cursor-pointer hover:underline"
            onClick={() => setSearch('')}
          >
            Limpiar búsqueda
          </button>
        </div>
      )}

      {/* ── Companies grid ── */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c: Company) => {
            const stats = companyStats[c.id] || { count: 0, totalBudget: 0 };

            return (
              <div
                key={c.id}
                className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--af-accent)]/30 transition-colors"
              >
                {/* Top: avatar + name + actions */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--af-accent)]/10 border border-[var(--af-accent)]/20 flex items-center justify-center text-lg flex-shrink-0">
                      🏢
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{c.data.name || 'Sin nombre'}</div>
                      {c.data.nit && (
                        <div className="text-[10px] text-[var(--muted-foreground)]">NIT: {c.data.nit}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer border-none bg-[var(--af-bg3)] hover:bg-[var(--af-bg4)] transition-colors"
                      onClick={() => handleEditCompany(c)}
                      title="Editar"
                    >
                      <Pencil size={12} aria-hidden="true"/>
                    </button>
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer border-none bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                      onClick={() => deleteCompany(c.id)}
                      title="Eliminar"
                    >
                      <Trash2 size={12} aria-hidden="true"/>
                    </button>
                  </div>
                </div>

                {/* Contact info */}
                <div className="space-y-1 mb-3">
                  {c.data.address && (
                    <div className="text-[11px] text-[var(--muted-foreground)] truncate">📍 {c.data.address}</div>
                  )}
                  {c.data.phone && (
                    <div className="text-[11px] text-[var(--muted-foreground)]">📞 {c.data.phone}</div>
                  )}
                  {c.data.email && (
                    <div className="text-[11px] text-[var(--muted-foreground)] truncate">✉️ {c.data.email}</div>
                  )}
                </div>

                {/* Stats: projects + budget */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-[var(--af-bg3)] rounded-lg px-3 py-2">
                    <div className="text-[10px] text-[var(--muted-foreground)] mb-0.5">Proyectos</div>
                    <div className="text-sm font-bold flex items-center gap-1">
                      <Briefcase size={12} className="text-blue-400" aria-hidden="true"/>
                      {stats.count}
                    </div>
                  </div>
                  <div className="bg-[var(--af-bg3)] rounded-lg px-3 py-2">
                    <div className="text-[10px] text-[var(--muted-foreground)] mb-0.5">Presupuesto</div>
                    <div className="text-sm font-bold text-emerald-400">
                      {stats.totalBudget > 0 ? fmtCOP(stats.totalBudget) : '—'}
                    </div>
                  </div>
                </div>

                {/* Footer: status badge + view projects */}
                <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${stats.count > 0 ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)]' : 'bg-[var(--af-bg4)] text-[var(--muted-foreground)]'}`}>
                    {stats.count > 0 ? `${stats.count} proyecto${stats.count !== 1 ? 's' : ''}` : 'Sin proyectos'}
                  </span>
                  {stats.count > 0 && (
                    <button
                      className="flex items-center gap-1 text-[11px] text-[var(--af-accent)] cursor-pointer hover:underline font-medium"
                      onClick={handleViewProjects}
                    >
                      <Eye size={12} aria-hidden="true"/>
                      Ver proyectos
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
