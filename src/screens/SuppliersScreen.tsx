'use client';
import React from 'react';
import { useApp } from '@/contexts/AppContext';
import { Store, Plus } from 'lucide-react';
import { SkeletonCard } from '@/components/ui/SkeletonLoaders';

export default function SuppliersScreen() {
  const {
    suppliers, setEditingId, setForms, openModal, deleteSupplier, loading,
  } = useApp();

  return (
    <div className="animate-fadeIn space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Store size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Proveedores
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{suppliers.length} proveedores</p>
        </div>
        <button className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors" onClick={() => { setEditingId(null); openModal('supplier'); }}>
          <Plus size={14} aria-hidden="true"/>Nuevo proveedor
        </button>
      </div>
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}
      {!loading && suppliers.length === 0 ? (
        <div className="text-center py-16 text-[var(--af-text3)]"><div className="text-4xl mb-3">🏪</div><div className="text-[15px] font-medium text-[var(--muted-foreground)] mb-1">Sin proveedores</div><div className="text-[13px]">Agrega tu primer proveedor</div></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map(s => (
            <div key={s.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--input)] transition-all">
              <div className="flex items-start justify-between mb-2">
                <div className="w-11 h-11 bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg flex items-center justify-center text-lg">🏪</div>
                <div className="flex gap-1.5">
                  <button className="px-1.5 py-0.5 rounded bg-[var(--af-bg4)] text-xs cursor-pointer" onClick={() => { setEditingId(s.id); setForms(p => ({ ...p, supName: s.data.name, supCategory: s.data.category, supPhone: s.data.phone, supEmail: s.data.email, supAddress: s.data.address, supWebsite: s.data.website, supNotes: s.data.notes, supRating: String(s.data.rating) })); openModal('supplier'); }}>✏️</button>
                  <button className="px-1.5 py-0.5 rounded bg-red-500/10 text-xs cursor-pointer" onClick={() => deleteSupplier(s.id)}>🗑</button>
                </div>
              </div>
              <div className="text-sm font-semibold mb-0.5">{s.data.name}</div>
              <div className="text-[11px] text-[var(--af-text3)] mb-2">{s.data.category}</div>
              <div className="text-[11px] text-[var(--af-accent)] mb-2">{'★'.repeat(s.data.rating || 5)}{'☆'.repeat(5 - (s.data.rating || 5))}</div>
              <div className="text-xs text-[var(--muted-foreground)] space-y-0.5">
                {s.data.phone && <div>📞 {s.data.phone}</div>}
                {s.data.email && <div>✉️ {s.data.email}</div>}
                {s.data.address && <div>📍 {s.data.address}</div>}
                {s.data.website && <div>🌐 {s.data.website}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
