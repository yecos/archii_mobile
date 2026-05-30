'use client';
import React, { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { fmtCOP, fmtDate } from '@/lib/helpers';
import {
  CATALOG_TYPES, CATALOG_STATUSES, CATALOG_STATUS_COLORS, CATALOG_TYPE_COLORS,
  INV_UNITS,
  type Catalog, type CatalogItem,
} from '@/lib/types';
import { toDate } from '@/lib/types';
import { SkeletonCard } from '@/components/ui/SkeletonLoaders';
import { getFirebase } from '@/lib/firebase-service';
import { BookOpen, Plus, Pencil, Trash2, ChevronDown, ChevronUp, X, Search } from 'lucide-react';
import { OverflowMenu } from '@/components/ui/OverflowMenu';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import FilterBar from '@/components/common/FilterBar';
import EmptyState from '@/components/common/EmptyState';
import CenterModal from '@/components/common/CenterModal';
import { useEntityResolvers } from '@/lib/useEntityResolvers';

/* ─── Empty catalog item ─── */
const EMPTY_ITEM: CatalogItem = { name: '', code: '', unit: 'Unidad', unitPrice: 0, brand: '', supplier: '', notes: '' };

export default function CatalogsScreen() {
  const {
    catalogs, projects, loading,
    showToast, authUser, activeTenantId,
  } = useApp();

  const { getProjectName } = useEntityResolvers(projects, []);
  const confirmDialog = useConfirmDialog();

  /* ─── Local filter state ─── */
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterProject, setFilterProject] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  /* ─── Modal state ─── */
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<string>(CATALOG_TYPES[0]);
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatus] = useState<string>('Activo');
  const [formProject, setFormProject] = useState<string>('');
  const [saving, setSaving] = useState(false);

  /* ─── Detail modal state ─── */
  const [selectedCatalog, setSelectedCatalog] = useState<Catalog | null>(null);
  const [expandedItems, setExpandedItems] = useState(false);

  /* ─── Item editing state ─── */
  const [editItems, setEditItems] = useState<CatalogItem[]>([]);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState<CatalogItem>({ ...EMPTY_ITEM });
  const [itemEditIdx, setItemEditIdx] = useState<number | null>(null);

  /* ─── Filtered list ─── */
  const filtered = useMemo(() => {
    return catalogs.filter((c: Catalog) => {
      const d = c.data;
      if (filterStatus && d.status !== filterStatus) return false;
      if (filterType && d.type !== filterType) return false;
      if (filterProject && d.projectId !== filterProject) return false;
      if (searchQuery && !d.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [catalogs, filterStatus, filterType, filterProject, searchQuery]);

  /* ─── Stats ─── */
  const stats = useMemo(() => ({
    total: catalogs.length,
    activos: catalogs.filter((c: Catalog) => c.data.status === 'Activo').length,
    inactivos: catalogs.filter((c: Catalog) => c.data.status === 'Inactivo').length,
    enRevision: catalogs.filter((c: Catalog) => c.data.status === 'En revisión').length,
  }), [catalogs]);

  /* ─── Open create form ─── */
  const handleCreate = () => {
    setEditingId(null);
    setFormName('');
    setFormType(CATALOG_TYPES[0]);
    setFormDescription('');
    setFormStatus('Activo');
    setFormProject('');
    setShowForm(true);
  };

  /* ─── Open edit form ─── */
  const handleEdit = (c: Catalog) => {
    setEditingId(c.id);
    setFormName(c.data.name);
    setFormType(c.data.type);
    setFormDescription(c.data.description || '');
    setFormStatus(c.data.status);
    setFormProject(c.data.projectId || '');
    setShowForm(true);
  };

  /* ─── Save catalog (create or update) ─── */
  const handleSave = async () => {
    if (!formName.trim()) { showToast('El nombre es obligatorio', 'error'); return; }
    if (!activeTenantId) { showToast('Sin tenant activo', 'error'); return; }
    setSaving(true);
    try {
      const fb = getFirebase();
      const db = fb.firestore();
      if (editingId) {
        await db.collection('catalogs').doc(editingId).update({
          name: formName.trim(),
          type: formType,
          description: formDescription.trim(),
          status: formStatus,
          projectId: formProject || fb.firestore.FieldValue.delete(),
          updatedAt: fb.firestore.FieldValue.serverTimestamp(),
        });
        showToast('Catálogo actualizado');
      } else {
        await db.collection('catalogs').add({
          tenantId: activeTenantId,
          name: formName.trim(),
          type: formType,
          description: formDescription.trim(),
          status: formStatus,
          projectId: formProject || null,
          items: [],
          createdBy: authUser?.uid || '',
          createdAt: fb.firestore.FieldValue.serverTimestamp(),
        });
        showToast('Catálogo creado');
      }
      setShowForm(false);
    } catch (err: any) {
      console.error('[Archii] Error saving catalog:', err);
      showToast('Error al guardar catálogo', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Delete catalog ─── */
  const handleDelete = async (c: Catalog) => {
    const ok = await confirmDialog.confirm({
      title: 'Eliminar catálogo',
      description: `¿Estás seguro de eliminar "${c.data.name}"? Esta acción no se puede deshacer.`,
    });
    if (!ok) return;
    try {
      const fb = getFirebase();
      await fb.firestore().collection('catalogs').doc(c.id).delete();
      showToast('Catálogo eliminado');
      if (selectedCatalog?.id === c.id) setSelectedCatalog(null);
    } catch (err: any) {
      console.error('[Archii] Error deleting catalog:', err);
      showToast('Error al eliminar catálogo', 'error');
    }
  };

  /* ─── Open detail view ─── */
  const handleOpenDetail = (c: Catalog) => {
    setSelectedCatalog(c);
    setExpandedItems(false);
    setEditItems([...(c.data.items || [])]);
  };

  /* ─── Item management ─── */
  const handleAddItem = () => {
    setItemForm({ ...EMPTY_ITEM });
    setItemEditIdx(null);
    setShowItemForm(true);
  };

  const handleEditItem = (idx: number) => {
    setItemForm({ ...editItems[idx] });
    setItemEditIdx(idx);
    setShowItemForm(true);
  };

  const handleDeleteItem = (idx: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveItem = () => {
    if (!itemForm.name.trim()) { showToast('El nombre del ítem es obligatorio', 'error'); return; }
    if (itemEditIdx !== null) {
      setEditItems(prev => prev.map((it, i) => i === itemEditIdx ? { ...itemForm } : it));
    } else {
      setEditItems(prev => [...prev, { ...itemForm }]);
    }
    setShowItemForm(false);
  };

  const handleSaveItems = async () => {
    if (!selectedCatalog) return;
    setSaving(true);
    try {
      const fb = getFirebase();
      await fb.firestore().collection('catalogs').doc(selectedCatalog.id).update({
        items: editItems,
        updatedAt: fb.firestore.FieldValue.serverTimestamp(),
      });
      showToast('Ítems guardados');
      setSelectedCatalog(null);
    } catch (err: any) {
      console.error('[Archii] Error saving items:', err);
      showToast('Error al guardar ítems', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Input classes ─── */
  const inputCls = 'w-full bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] transition-colors';
  const labelCls = 'text-[12px] font-medium text-[var(--muted-foreground)] mb-1';

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen size={20} className="text-[var(--af-accent)]" aria-hidden="true" />
            Catálogos
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{catalogs.length} catálogos</p>
        </div>
        <button
          className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors"
          onClick={handleCreate}
        >
          <Plus size={14} aria-hidden="true" />
          Nuevo Catálogo
        </button>
      </div>

      {/* Stats */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-lg font-bold">{stats.total}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">Total</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-emerald-400">{stats.activos}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">Activos</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-amber-400">{stats.enRevision}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">En revisión</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-gray-400">{stats.inactivos}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">Inactivos</div>
          </div>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true" />
          <input
            type="text"
            placeholder="Buscar catálogo por nombre..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg pl-9 pr-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--af-accent)] transition-colors"
          />
        </div>

        {/* Filter bar */}
        <FilterBar
          statuses={[...CATALOG_STATUSES]}
          activeStatus={filterStatus}
          onStatusChange={setFilterStatus}
          projectFilter={{
            value: filterProject,
            onChange: setFilterProject,
            projects: projects.filter((p: any) => p.data.status !== 'Terminado').map((p: any) => ({ id: p.id, name: p.data.name })),
          }}
          filters={[{
            key: 'type',
            label: 'Todos los tipos',
            value: filterType,
            options: CATALOG_TYPES.map(t => ({ value: t, label: t })),
            onChange: setFilterType,
          }]}
          className="mb-0"
        />
      </div>

      {/* Grid */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          emoji="📚"
          title="Sin catálogos"
          description="Crea tu primer catálogo de materiales o acabados"
          actionLabel="Nuevo Catálogo"
          onAction={handleCreate}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c: Catalog) => {
            const statusCls = CATALOG_STATUS_COLORS[c.data.status] || 'bg-[var(--af-bg4)] text-[var(--muted-foreground)] border-[var(--border)]';
            const typeCls = CATALOG_TYPE_COLORS[c.data.type] || CATALOG_TYPE_COLORS['Otro'];
            const projName = c.data.projectId ? getProjectName(c.data.projectId) : '';
            const itemCount = c.data.items?.length || 0;
            const totalValue = (c.data.items || []).reduce((sum: number, it: CatalogItem) => sum + (it.unitPrice || 0), 0);
            return (
              <div
                key={c.id}
                className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--input)] transition-all cursor-pointer"
                onClick={() => handleOpenDetail(c)}
              >
                {/* Badges row */}
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${typeCls}`}>
                    {c.data.type}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusCls}`}>
                    {c.data.status}
                  </span>
                </div>

                {/* Title */}
                <div className="text-[14px] font-semibold mb-1">{c.data.name}</div>
                {c.data.description && (
                  <div className="text-[12px] text-[var(--muted-foreground)] mb-3 line-clamp-2">{c.data.description}</div>
                )}

                {/* Meta */}
                <div className="flex flex-wrap gap-2 text-[11px] text-[var(--af-text3)] mb-3">
                  <span>📦 {itemCount} ítems</span>
                  {totalValue > 0 && <span>💰 {fmtCOP(totalValue)}</span>}
                  {projName && <span>📁 {projName}</span>}
                  <span>📅 {fmtDate(c.data.createdAt)}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <button
                    aria-label="Editar"
                    className="hidden md:block px-1.5 py-1.5 rounded bg-[var(--af-bg4)] text-xs cursor-pointer hover:bg-[var(--af-bg3)] transition-colors"
                    onClick={() => handleEdit(c)}
                  >
                    <Pencil size={12} aria-hidden="true" />
                  </button>
                  <button
                    aria-label="Eliminar"
                    className="hidden md:block px-1.5 py-1.5 rounded bg-red-500/10 text-red-400 text-xs cursor-pointer hover:bg-red-500/20 transition-colors"
                    onClick={() => handleDelete(c)}
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                  <div className="md:hidden">
                    <OverflowMenu
                      actions={[
                        { label: 'Editar catálogo', icon: <Pencil size={14} aria-hidden="true" />, onClick: () => handleEdit(c) },
                        { label: 'Eliminar catálogo', icon: <Trash2 size={14} aria-hidden="true" />, variant: 'danger' as const, separator: true, onClick: () => handleDelete(c) },
                      ]}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Create / Edit Modal ===== */}
      <CenterModal open={showForm} onClose={() => setShowForm(false)} maxWidth={520}>
        <div className="space-y-4">
          <div className="text-[16px] font-semibold">{editingId ? 'Editar Catálogo' : 'Nuevo Catálogo'}</div>

          {/* Name */}
          <div>
            <label className={labelCls}>Nombre *</label>
            <input className={inputCls} placeholder="Ej: Catálogo de Acabados" value={formName} onChange={e => setFormName(e.target.value)} />
          </div>

          {/* Type */}
          <div>
            <label className={labelCls}>Tipo</label>
            <select className={inputCls} value={formType} onChange={e => setFormType(e.target.value)}>
              {CATALOG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className={labelCls}>Estado</label>
            <select className={inputCls} value={formStatus} onChange={e => setFormStatus(e.target.value)}>
              {CATALOG_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Descripción</label>
            <textarea className={`${inputCls} min-h-[70px] resize-y`} placeholder="Descripción del catálogo..." value={formDescription} onChange={e => setFormDescription(e.target.value)} />
          </div>

          {/* Project (optional) */}
          <div>
            <label className={labelCls}>Proyecto (opcional)</label>
            <select className={inputCls} value={formProject} onChange={e => setFormProject(e.target.value)}>
              <option value="">Global (sin proyecto)</option>
              {projects.filter((p: any) => p.data.status !== 'Terminado').map((p: any) => (
                <option key={p.id} value={p.id}>{p.data.name}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              className="flex-1 px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--af-bg4)] text-[var(--foreground)] cursor-pointer border-none hover:bg-[var(--af-bg3)] transition-colors"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>
            <button
              className="flex-1 px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--af-accent)] text-background cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors disabled:opacity-50"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Guardando...' : editingId ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </div>
      </CenterModal>

      {/* ===== Detail Modal (with items management) ===== */}
      <CenterModal open={!!selectedCatalog} onClose={() => setSelectedCatalog(null)} maxWidth={720}>
        {selectedCatalog && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[16px] font-semibold">{selectedCatalog.data.name}</div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${CATALOG_TYPE_COLORS[selectedCatalog.data.type] || CATALOG_TYPE_COLORS['Otro']}`}>
                    {selectedCatalog.data.type}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${CATALOG_STATUS_COLORS[selectedCatalog.data.status] || 'bg-[var(--af-bg4)] text-[var(--muted-foreground)] border-[var(--border)]'}`}>
                    {selectedCatalog.data.status}
                  </span>
                </div>
                {selectedCatalog.data.description && (
                  <div className="text-[12px] text-[var(--muted-foreground)] mt-1">{selectedCatalog.data.description}</div>
                )}
              </div>
              <button
                aria-label="Cerrar"
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--af-bg4)] text-[var(--muted-foreground)] cursor-pointer flex-shrink-0 border-none bg-transparent"
                onClick={() => setSelectedCatalog(null)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-3 text-[11px] text-[var(--af-text3)]">
              {selectedCatalog.data.projectId && <span>📁 {getProjectName(selectedCatalog.data.projectId)}</span>}
              <span>📅 Creado: {fmtDate(selectedCatalog.data.createdAt)}</span>
              {selectedCatalog.data.updatedAt && <span>✏️ Actualizado: {fmtDate(selectedCatalog.data.updatedAt)}</span>}
            </div>

            {/* Items section */}
            <div className="border-t border-[var(--border)] pt-3">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[13px] font-semibold flex items-center gap-2">
                  Ítems del Catálogo
                  <span className="text-[11px] font-normal text-[var(--muted-foreground)]">({editItems.length})</span>
                </div>
                <button
                  className="flex items-center gap-1 bg-[var(--af-accent)] text-background px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors"
                  onClick={handleAddItem}
                >
                  <Plus size={12} aria-hidden="true" />
                  Agregar ítem
                </button>
              </div>

              {/* Item form inline */}
              {showItemForm && (
                <div className="bg-[var(--af-bg2)] border border-[var(--border)] rounded-xl p-3 mb-3 space-y-3">
                  <div className="text-[12px] font-semibold text-[var(--af-accent)]">
                    {itemEditIdx !== null ? 'Editar ítem' : 'Nuevo ítem'}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Nombre *</label>
                      <input className={inputCls} placeholder="Nombre del ítem" value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls}>Código</label>
                      <input className={inputCls} placeholder="Ej: AC-001" value={itemForm.code} onChange={e => setItemForm(f => ({ ...f, code: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls}>Unidad</label>
                      <select className={inputCls} value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))}>
                        {INV_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Precio unitario (COP)</label>
                      <input type="number" className={inputCls} placeholder="0" value={itemForm.unitPrice || ''} onChange={e => setItemForm(f => ({ ...f, unitPrice: Number(e.target.value) || 0 }))} />
                    </div>
                    <div>
                      <label className={labelCls}>Marca</label>
                      <input className={inputCls} placeholder="Marca" value={itemForm.brand} onChange={e => setItemForm(f => ({ ...f, brand: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls}>Proveedor</label>
                      <input className={inputCls} placeholder="Proveedor" value={itemForm.supplier} onChange={e => setItemForm(f => ({ ...f, supplier: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Notas</label>
                    <input className={inputCls} placeholder="Notas adicionales..." value={itemForm.notes} onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--af-bg4)] text-[var(--foreground)] cursor-pointer border-none hover:bg-[var(--af-bg3)] transition-colors"
                      onClick={() => setShowItemForm(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--af-accent)] text-background cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors"
                      onClick={handleSaveItem}
                    >
                      {itemEditIdx !== null ? 'Guardar' : 'Agregar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Items list */}
              {editItems.length === 0 ? (
                <div className="text-center py-6 text-[var(--muted-foreground)] text-[12px]">
                  Sin ítems. Agrega el primer ítem al catálogo.
                </div>
              ) : (
                <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                  {/* Desktop header */}
                  <div className="hidden md:grid grid-cols-[1fr_80px_80px_100px_100px_60px] gap-2 text-[10px] text-[var(--muted-foreground)] font-semibold px-2 py-1 border-b border-[var(--border)]">
                    <span>Nombre</span>
                    <span>Código</span>
                    <span>Unidad</span>
                    <span>Precio</span>
                    <span>Marca</span>
                    <span></span>
                  </div>
                  {editItems.map((item, idx) => (
                    <div key={idx} className="group">
                      {/* Desktop row */}
                      <div className="hidden md:grid grid-cols-[1fr_80px_80px_100px_100px_60px] gap-2 items-center text-[12px] px-2 py-1.5 rounded-lg hover:bg-[var(--af-bg2)] transition-colors">
                        <span className="font-medium truncate">{item.name}</span>
                        <span className="text-[var(--muted-foreground)] font-mono text-[11px]">{item.code || '—'}</span>
                        <span className="text-[var(--muted-foreground)]">{item.unit}</span>
                        <span className="text-emerald-400 font-medium">{fmtCOP(item.unitPrice)}</span>
                        <span className="text-[var(--muted-foreground)] truncate">{item.brand || '—'}</span>
                        <span className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button aria-label="Editar ítem" className="p-1 rounded hover:bg-[var(--af-bg4)] cursor-pointer bg-transparent border-none" onClick={() => handleEditItem(idx)}>
                            <Pencil size={11} className="text-[var(--muted-foreground)]" aria-hidden="true" />
                          </button>
                          <button aria-label="Eliminar ítem" className="p-1 rounded hover:bg-red-500/10 cursor-pointer bg-transparent border-none" onClick={() => handleDeleteItem(idx)}>
                            <Trash2 size={11} className="text-red-400" aria-hidden="true" />
                          </button>
                        </span>
                      </div>
                      {/* Mobile card */}
                      <div className="md:hidden bg-[var(--af-bg2)] rounded-lg p-2.5 space-y-1">
                        <div className="flex items-start justify-between">
                          <div className="text-[12px] font-medium">{item.name}</div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button aria-label="Editar ítem" className="p-1 rounded hover:bg-[var(--af-bg4)] cursor-pointer bg-transparent border-none" onClick={() => handleEditItem(idx)}>
                              <Pencil size={11} className="text-[var(--muted-foreground)]" aria-hidden="true" />
                            </button>
                            <button aria-label="Eliminar ítem" className="p-1 rounded hover:bg-red-500/10 cursor-pointer bg-transparent border-none" onClick={() => handleDeleteItem(idx)}>
                              <Trash2 size={11} className="text-red-400" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--muted-foreground)]">
                          {item.code && <span className="font-mono">{item.code}</span>}
                          <span>{item.unit}</span>
                          <span className="text-emerald-400 font-medium">{fmtCOP(item.unitPrice)}</span>
                          {item.brand && <span>🏷️ {item.brand}</span>}
                          {item.supplier && <span>🏪 {item.supplier}</span>}
                        </div>
                        {item.notes && <div className="text-[11px] text-[var(--muted-foreground)] italic">{item.notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Items total */}
              {editItems.length > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                  <span className="text-[12px] text-[var(--muted-foreground)]">Total: {editItems.length} ítems</span>
                  <span className="text-[13px] font-semibold text-emerald-400">
                    {fmtCOP(editItems.reduce((sum, it) => sum + (it.unitPrice || 0), 0))}
                  </span>
                </div>
              )}
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-3 pt-2 border-t border-[var(--border)]">
              <button
                className="flex-1 px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--af-bg4)] text-[var(--foreground)] cursor-pointer border-none hover:bg-[var(--af-bg3)] transition-colors"
                onClick={() => setSelectedCatalog(null)}
              >
                Cancelar
              </button>
              <button
                className="flex-1 px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--af-accent)] text-background cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors disabled:opacity-50"
                onClick={handleSaveItems}
                disabled={saving}
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        )}
      </CenterModal>

      <ConfirmDialog {...confirmDialog} />
    </div>
  );
}
