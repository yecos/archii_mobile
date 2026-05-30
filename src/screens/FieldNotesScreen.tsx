'use client';
import React, { useMemo, useState, useCallback, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { fmtDate, fmtDateTime, fileToBase64 } from '@/lib/helpers';
import {
  FIELD_NOTE_CATEGORIES,
  FIELD_NOTE_STATUSES,
  FIELD_NOTE_PRIORITIES,
  FIELD_NOTE_STATUS_COLORS,
  FIELD_NOTE_CATEGORY_COLORS,
} from '@/lib/types';
import { PRIO_COLORS } from '@/lib/constants/colors';
import { getFirebase } from '@/lib/firebase-service';
import { useEntityResolvers } from '@/lib/useEntityResolvers';
import { OverflowMenu } from '@/components/ui/OverflowMenu';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { showUndoToast } from '@/lib/undo-helpers';
import FilterBar from '@/components/common/FilterBar';
import EmptyState from '@/components/common/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { NotebookPen, Plus, Pencil, Trash2, Camera, MapPin, X, Eye, ChevronRight } from 'lucide-react';

/* ===== Local form state ===== */
interface FormState {
  fnTitle: string;
  fnProject: string;
  fnCategory: string;
  fnPriority: string;
  fnStatus: string;
  fnLocation: string;
  fnContent: string;
  fnPhotos: string[];
}

const EMPTY_FORM: FormState = {
  fnTitle: '',
  fnProject: '',
  fnCategory: 'Observación',
  fnPriority: 'Media',
  fnStatus: 'Abierta',
  fnLocation: '',
  fnContent: '',
  fnPhotos: [],
};

export default function FieldNotesScreen() {
  const {
    fieldNotes, projects, teamUsers, loading,
    showToast, authUser, activeTenantId,
  } = useApp();

  const { getProjectName, getUserName } = useEntityResolvers(projects, teamUsers);
  const confirmDialog = useConfirmDialog();

  /* --- Filters --- */
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  /* --- Modals --- */
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);

  /* --- Form state --- */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [detailNote, setDetailNote] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* --- Filtered notes --- */
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return fieldNotes.filter((n: any) => {
      if (filterProject && n.data.projectId !== filterProject) return false;
      if (filterStatus && n.data.status !== filterStatus) return false;
      if (filterCategory && n.data.category !== filterCategory) return false;
      if (filterPriority && n.data.priority !== filterPriority) return false;
      if (q && !n.data.title.toLowerCase().includes(q) && !(n.data.content || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [fieldNotes, filterProject, filterStatus, filterCategory, filterPriority, searchQuery]);

  /* --- Stats --- */
  const stats = useMemo(() => {
    const total = fieldNotes.length;
    const abierta = fieldNotes.filter((n: any) => n.data.status === 'Abierta').length;
    const enSeguimiento = fieldNotes.filter((n: any) => n.data.status === 'En seguimiento').length;
    const resuelta = fieldNotes.filter((n: any) => n.data.status === 'Resuelta').length;
    const cerrada = fieldNotes.filter((n: any) => n.data.status === 'Cerrada').length;
    return { total, abierta, enSeguimiento, resuelta, cerrada };
  }, [fieldNotes]);

  /* --- Next status workflow --- */
  const NEXT_STATUS: Record<string, string | null> = {
    'Abierta': 'En seguimiento',
    'En seguimiento': 'Resuelta',
    'Resuelta': 'Cerrada',
    'Cerrada': null,
  };

  const handleStatusAdvance = async (noteId: string, currentStatus: string) => {
    const next = NEXT_STATUS[currentStatus];
    if (!next) return;
    try {
      const fb = getFirebase();
      await fb.firestore().collection('fieldNotes').doc(noteId).update({
        status: next,
        updatedAt: fb.firestore.FieldValue.serverTimestamp(),
      });
      showToast(`Nota actualizada a "${next}"`);
    } catch (err) {
      console.error('[Archii] Error updating field note status:', err);
      showToast('Error al actualizar estado', 'error');
    }
  };

  /* --- Create / Edit --- */
  const handleCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowFormModal(true);
  };

  const handleEdit = (note: any) => {
    setEditingId(note.id);
    setForm({
      fnTitle: note.data.title || '',
      fnProject: note.data.projectId || '',
      fnCategory: note.data.category || 'Observación',
      fnPriority: note.data.priority || 'Media',
      fnStatus: note.data.status || 'Abierta',
      fnLocation: note.data.location || '',
      fnContent: note.data.content || '',
      fnPhotos: note.data.photos || [],
    });
    setShowFormModal(true);
  };

  const handleSave = async () => {
    if (!form.fnTitle.trim()) {
      showToast('El título es obligatorio', 'warning');
      return;
    }
    if (!form.fnProject) {
      showToast('Selecciona un proyecto', 'warning');
      return;
    }
    setSaving(true);
    try {
      const fb = getFirebase();
      const db = fb.firestore();
      const ts = fb.firestore.FieldValue.serverTimestamp();
      const userName = authUser?.displayName || authUser?.email || 'Usuario';

      if (editingId) {
        await db.collection('fieldNotes').doc(editingId).update({
          title: form.fnTitle.trim(),
          projectId: form.fnProject,
          category: form.fnCategory,
          priority: form.fnPriority,
          status: form.fnStatus,
          location: form.fnLocation.trim(),
          content: form.fnContent.trim(),
          photos: form.fnPhotos,
          updatedAt: ts,
        });
        showToast('Nota actualizada');
      } else {
        await db.collection('fieldNotes').add({
          tenantId: activeTenantId || '',
          projectId: form.fnProject,
          title: form.fnTitle.trim(),
          content: form.fnContent.trim(),
          category: form.fnCategory,
          priority: form.fnPriority,
          status: form.fnStatus,
          location: form.fnLocation.trim(),
          photos: form.fnPhotos,
          createdBy: authUser?.uid || '',
          createdByName: userName,
          createdAt: ts,
          updatedAt: ts,
        });
        showToast('✅ Nota de campo creada');
      }
      setShowFormModal(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
    } catch (err) {
      console.error('[Archii] Error saving field note:', err);
      showToast('Error al guardar la nota', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* --- Delete --- */
  const handleDelete = async (note: any) => {
    const ok = await confirmDialog.confirm({
      title: 'Eliminar nota',
      description: '¿Estás seguro de eliminar esta nota de campo?',
    });
    if (!ok) return;
    try {
      const snapshot = { ...note.data };
      await getFirebase().firestore().collection('fieldNotes').doc(note.id).delete();
      showToast('Nota eliminada');
      showUndoToast({ collection: 'fieldNotes', docId: note.id, snapshot, label: 'Nota', gender: 'a' });
    } catch (err) {
      console.error('[Archii] Error deleting field note:', err);
      showToast('Error al eliminar la nota', 'error');
    }
  };

  /* --- Photo handling --- */
  const handleAddPhoto = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newPhotos: string[] = [...form.fnPhotos];
    for (let i = 0; i < files.length; i++) {
      if (newPhotos.length >= 5) break; // max 5 photos
      try {
        const b64 = await fileToBase64(files[i]);
        newPhotos.push(b64);
      } catch (err) {
        console.error('[Archii] Error converting photo:', err);
      }
    }
    setForm(f => ({ ...f, fnPhotos: newPhotos }));
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [form.fnPhotos]);

  const handleRemovePhoto = (idx: number) => {
    setForm(f => ({
      ...f,
      fnPhotos: f.fnPhotos.filter((_, i) => i !== idx),
    }));
  };

  /* --- View detail --- */
  const handleViewDetail = (note: any) => {
    setDetailNote(note);
    setShowDetailModal(true);
  };

  const handleOpenLightbox = (photos: string[], idx: number) => {
    setLightboxPhotos(photos);
    setLightboxIndex(idx);
    setShowLightbox(true);
  };

  /* --- Select class helper --- */
  const selectCls = 'bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none w-full';
  const inputCls = 'bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none w-full';

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <NotebookPen size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Notas de Campo
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{fieldNotes.length} notas</p>
        </div>
        <button
          className="flex items-center gap-1.5 bg-[var(--af-accent)] text-background px-3.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer border-none hover:bg-[var(--af-accent2)] transition-colors"
          onClick={handleCreate}
        >
          <Plus size={14} aria-hidden="true"/>
          Nueva Nota
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'bg-[var(--af-bg4)]' },
          { label: 'Abiertas', value: stats.abierta, color: 'bg-blue-500/10 text-blue-400' },
          { label: 'En seguimiento', value: stats.enSeguimiento, color: 'bg-amber-500/10 text-amber-400' },
          { label: 'Resueltas', value: stats.resuelta, color: 'bg-emerald-500/10 text-emerald-400' },
          { label: 'Cerradas', value: stats.cerrada, color: 'bg-gray-500/10 text-gray-400' },
        ].map((s) => (
          <div key={s.label} className={`${s.color} rounded-xl p-3 text-center`}>
            <div className="text-xl font-bold">{s.value}</div>
            <div className="text-[11px] opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <FilterBar
        statuses={FIELD_NOTE_STATUSES}
        activeStatus={filterStatus}
        onStatusChange={setFilterStatus}
        projectFilter={{
          value: filterProject,
          onChange: setFilterProject,
          projects: projects.filter((p: any) => p.data.status !== 'Terminado').map((p: any) => ({ id: p.id, name: p.data.name })),
        }}
        filters={[
          {
            key: 'category',
            label: 'Todas las categorías',
            value: filterCategory,
            options: FIELD_NOTE_CATEGORIES.map(c => ({ value: c, label: c })),
            onChange: setFilterCategory,
          },
          {
            key: 'priority',
            label: 'Todas las prioridades',
            value: filterPriority,
            options: FIELD_NOTE_PRIORITIES.map(p => ({ value: p, label: p })),
            onChange: setFilterPriority,
          },
        ]}
        className="mb-2"
      />

      {/* Search bar */}
      <div className="relative">
        <input
          type="text"
          placeholder="Buscar por título o contenido..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`${inputCls} pl-9`}
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </div>

      {/* List */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-[var(--af-bg4)] rounded w-3/4 mb-3" />
              <div className="h-3 bg-[var(--af-bg4)] rounded w-1/2 mb-2" />
              <div className="h-3 bg-[var(--af-bg4)] rounded w-2/3" />
            </div>
          ))}
        </div>
      )}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          emoji="🗒️"
          title="Sin notas de campo"
          description="Registra tu primera observación en obra"
          actionLabel="Nueva Nota"
          onAction={handleCreate}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((note: any) => {
            const statusCls = FIELD_NOTE_STATUS_COLORS[note.data.status] || 'bg-[var(--af-bg4)] text-[var(--muted-foreground)] border-[var(--border)]';
            const catCls = FIELD_NOTE_CATEGORY_COLORS[note.data.category] || FIELD_NOTE_CATEGORY_COLORS['Otro'];
            const prioCls = PRIO_COLORS[note.data.priority] || PRIO_COLORS['Media'];
            const projName = getProjectName(note.data.projectId);
            const nextStatus = NEXT_STATUS[note.data.status];

            return (
              <div key={note.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--input)] transition-all">
                {/* Badges row */}
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusCls}`}>
                    {note.data.status}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${catCls}`}>
                    {note.data.category}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${prioCls}`}>
                    {note.data.priority}
                  </span>
                  {note.data.photos && note.data.photos.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--af-bg4)] text-[var(--muted-foreground)] flex items-center gap-0.5">
                      <Camera size={10} className="stroke-current" aria-hidden="true"/> {note.data.photos.length}
                    </span>
                  )}
                </div>

                {/* Title */}
                <div className="text-[14px] font-semibold mb-1 cursor-pointer hover:text-[var(--af-accent)] transition-colors" onClick={() => handleViewDetail(note)}>
                  {note.data.title}
                </div>

                {/* Content preview */}
                {note.data.content && (
                  <div className="text-[12px] text-[var(--muted-foreground)] mb-2 line-clamp-2">{note.data.content}</div>
                )}

                {/* Location */}
                {note.data.location && (
                  <div className="text-[11px] text-[var(--af-text3)] mb-2 flex items-center gap-1">
                    <MapPin size={10} className="stroke-current flex-shrink-0" aria-hidden="true"/>
                    <span className="truncate">{note.data.location}</span>
                  </div>
                )}

                {/* Meta */}
                <div className="flex flex-wrap gap-2 text-[11px] text-[var(--af-text3)] mb-3">
                  {projName && <span>📁 {projName}</span>}
                  {note.data.createdByName && <span>👤 {note.data.createdByName}</span>}
                  <span>📅 {fmtDate(note.data.createdAt)}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {nextStatus && (
                    <button
                      className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer border transition-colors"
                      style={{
                        backgroundColor: nextStatus === 'En seguimiento' ? 'rgba(245,158,11,0.1)' :
                          nextStatus === 'Resuelta' ? 'rgba(16,185,129,0.1)' :
                          'rgba(107,114,128,0.1)',
                        color: nextStatus === 'En seguimiento' ? '#f59e0b' :
                          nextStatus === 'Resuelta' ? '#10b981' :
                          '#9ca3af',
                        borderColor: nextStatus === 'En seguimiento' ? 'rgba(245,158,11,0.3)' :
                          nextStatus === 'Resuelta' ? 'rgba(16,185,129,0.3)' :
                          'rgba(107,114,128,0.3)',
                      }}
                      onClick={() => handleStatusAdvance(note.id, note.data.status)}
                    >
                      <ChevronRight size={10} className="inline mr-0.5" aria-hidden="true"/>
                      {nextStatus}
                    </button>
                  )}
                  <button aria-label="Ver detalle" className="px-1.5 py-1.5 rounded bg-[var(--af-bg4)] text-xs cursor-pointer border-none" onClick={() => handleViewDetail(note)}>
                    <Eye size={12} aria-hidden="true"/>
                  </button>
                  <button aria-label="Editar" className="hidden md:block px-1.5 py-1.5 rounded bg-[var(--af-bg4)] text-xs cursor-pointer border-none" onClick={() => handleEdit(note)}>
                    <Pencil size={12} aria-hidden="true"/>
                  </button>
                  <button aria-label="Eliminar" className="hidden md:block px-1.5 py-1.5 rounded bg-red-500/10 text-xs cursor-pointer border-none" onClick={() => handleDelete(note)}>
                    <Trash2 size={12} aria-hidden="true"/>
                  </button>
                  <div className="md:hidden">
                    <OverflowMenu
                      actions={[
                        { label: 'Editar nota', icon: <Pencil size={14} aria-hidden="true"/>, onClick: () => handleEdit(note) },
                        { label: 'Eliminar nota', icon: <Trash2 size={14} aria-hidden="true"/>, variant: 'danger' as const, separator: true, onClick: () => handleDelete(note) },
                      ]}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog {...confirmDialog} />

      {/* ===== CREATE / EDIT MODAL ===== */}
      <Dialog open={showFormModal} onOpenChange={setShowFormModal}>
        <DialogContent className="bg-[var(--card)] border-[var(--border)] max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[var(--foreground)]">
              {editingId ? 'Editar Nota de Campo' : 'Nueva Nota de Campo'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Title */}
            <div>
              <label className="text-[12px] font-medium text-[var(--muted-foreground)] mb-1 block">Título *</label>
              <input
                type="text"
                className={inputCls}
                placeholder="Descripción breve de la observación"
                value={form.fnTitle}
                onChange={(e) => setForm(f => ({ ...f, fnTitle: e.target.value }))}
              />
            </div>

            {/* Project */}
            <div>
              <label className="text-[12px] font-medium text-[var(--muted-foreground)] mb-1 block">Proyecto *</label>
              <select
                className={selectCls}
                value={form.fnProject}
                onChange={(e) => setForm(f => ({ ...f, fnProject: e.target.value }))}
              >
                <option value="">Seleccionar proyecto</option>
                {projects.filter((p: any) => p.data.status !== 'Terminado').map((p: any) => (
                  <option key={p.id} value={p.id}>{p.data.name}</option>
                ))}
              </select>
            </div>

            {/* Category + Priority row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium text-[var(--muted-foreground)] mb-1 block">Categoría</label>
                <select
                  className={selectCls}
                  value={form.fnCategory}
                  onChange={(e) => setForm(f => ({ ...f, fnCategory: e.target.value }))}
                >
                  {FIELD_NOTE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-[var(--muted-foreground)] mb-1 block">Prioridad</label>
                <select
                  className={selectCls}
                  value={form.fnPriority}
                  onChange={(e) => setForm(f => ({ ...f, fnPriority: e.target.value }))}
                >
                  {FIELD_NOTE_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Status (only when editing) */}
            {editingId && (
              <div>
                <label className="text-[12px] font-medium text-[var(--muted-foreground)] mb-1 block">Estado</label>
                <select
                  className={selectCls}
                  value={form.fnStatus}
                  onChange={(e) => setForm(f => ({ ...f, fnStatus: e.target.value }))}
                >
                  {FIELD_NOTE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            {/* Location */}
            <div>
              <label className="text-[12px] font-medium text-[var(--muted-foreground)] mb-1 block">Ubicación en obra</label>
              <input
                type="text"
                className={inputCls}
                placeholder="Ej: Piso 3, Fachada norte, Zona de estacionamiento"
                value={form.fnLocation}
                onChange={(e) => setForm(f => ({ ...f, fnLocation: e.target.value }))}
              />
            </div>

            {/* Content */}
            <div>
              <label className="text-[12px] font-medium text-[var(--muted-foreground)] mb-1 block">Contenido</label>
              <textarea
                className={`${inputCls} min-h-[100px] resize-y`}
                placeholder="Describe la observación en detalle..."
                value={form.fnContent}
                onChange={(e) => setForm(f => ({ ...f, fnContent: e.target.value }))}
              />
            </div>

            {/* Photos */}
            <div>
              <label className="text-[12px] font-medium text-[var(--muted-foreground)] mb-1 block">Fotos (máx. 5)</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.fnPhotos.map((photo: string, idx: number) => (
                  <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[var(--border)] group">
                    <img src={photo} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-none"
                      onClick={() => handleRemovePhoto(idx)}
                      aria-label="Eliminar foto"
                    >
                      <X size={10} aria-hidden="true"/>
                    </button>
                  </div>
                ))}
                {form.fnPhotos.length < 5 && (
                  <button
                    type="button"
                    className="w-16 h-16 rounded-lg border-2 border-dashed border-[var(--border)] flex items-center justify-center cursor-pointer bg-transparent hover:border-[var(--af-accent)]/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Agregar foto"
                  >
                    <Camera size={18} className="text-[var(--muted-foreground)]" aria-hidden="true"/>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={handleAddPhoto}
              />
            </div>
          </div>

          <DialogFooter>
            <button
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--af-bg3)] text-[var(--foreground)] border-none cursor-pointer hover:bg-[var(--af-bg4)] transition-colors"
              onClick={() => setShowFormModal(false)}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--af-accent)] text-background border-none cursor-pointer hover:bg-[var(--af-accent2)] transition-colors disabled:opacity-50"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear Nota'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DETAIL MODAL ===== */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="bg-[var(--card)] border-[var(--border)] max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {detailNote && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[var(--foreground)] pr-6">
                  {detailNote.data.title}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                {/* Badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${FIELD_NOTE_STATUS_COLORS[detailNote.data.status] || ''}`}>
                    {detailNote.data.status}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${FIELD_NOTE_CATEGORY_COLORS[detailNote.data.category] || ''}`}>
                    {detailNote.data.category}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${PRIO_COLORS[detailNote.data.priority] || ''}`}>
                    {detailNote.data.priority}
                  </span>
                </div>

                {/* Location */}
                {detailNote.data.location && (
                  <div className="flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)]">
                    <MapPin size={14} className="stroke-current flex-shrink-0" aria-hidden="true"/>
                    {detailNote.data.location}
                  </div>
                )}

                {/* Project */}
                <div className="text-[13px]">
                  <span className="text-[var(--muted-foreground)]">Proyecto: </span>
                  <span className="font-medium">{getProjectName(detailNote.data.projectId)}</span>
                </div>

                {/* Content */}
                {detailNote.data.content && (
                  <div className="bg-[var(--af-bg3)] rounded-lg p-3 text-[13px] text-[var(--foreground)] whitespace-pre-wrap">
                    {detailNote.data.content}
                  </div>
                )}

                {/* Photos */}
                {detailNote.data.photos && detailNote.data.photos.length > 0 && (
                  <div>
                    <div className="text-[12px] font-medium text-[var(--muted-foreground)] mb-2">Fotos</div>
                    <div className="grid grid-cols-3 gap-2">
                      {detailNote.data.photos.map((photo: string, idx: number) => (
                        <div
                          key={idx}
                          className="aspect-square rounded-lg overflow-hidden border border-[var(--border)] cursor-pointer hover:border-[var(--af-accent)]/50 transition-colors"
                          onClick={() => handleOpenLightbox(detailNote.data.photos, idx)}
                        >
                          <img src={photo} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Meta */}
                <div className="flex flex-wrap gap-3 text-[11px] text-[var(--af-text3)] pt-2 border-t border-[var(--border)]">
                  <span>👤 {detailNote.data.createdByName || getUserName(detailNote.data.createdBy)}</span>
                  <span>📅 Creada: {fmtDateTime(detailNote.data.createdAt)}</span>
                  {detailNote.data.updatedAt && <span>🔄 Actualizada: {fmtDateTime(detailNote.data.updatedAt)}</span>}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {NEXT_STATUS[detailNote.data.status] && (
                    <button
                      className="flex-1 px-3 py-2 rounded-lg text-[12px] font-semibold bg-[var(--af-accent)] text-background border-none cursor-pointer hover:bg-[var(--af-accent2)] transition-colors"
                      onClick={async () => {
                        await handleStatusAdvance(detailNote.id, detailNote.data.status);
                        // Refresh detail note
                        const fresh = fieldNotes.find((n: any) => n.id === detailNote.id);
                        if (fresh) setDetailNote(fresh);
                      }}
                    >
                      Avanzar a &quot;{NEXT_STATUS[detailNote.data.status]}&quot;
                    </button>
                  )}
                  <button
                    className="px-3 py-2 rounded-lg text-[12px] font-medium bg-[var(--af-bg3)] text-[var(--foreground)] border-none cursor-pointer hover:bg-[var(--af-bg4)] transition-colors"
                    onClick={() => { setShowDetailModal(false); handleEdit(detailNote); }}
                  >
                    <Pencil size={12} className="inline mr-1" aria-hidden="true"/>
                    Editar
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== LIGHTBOX ===== */}
      {showLightbox && lightboxPhotos.length > 0 && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center"
          onClick={() => setShowLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center cursor-pointer border-none hover:bg-white/20 transition-colors"
            onClick={() => setShowLightbox(false)}
            aria-label="Cerrar"
          >
            <X size={20} aria-hidden="true"/>
          </button>
          {/* Prev button */}
          {lightboxPhotos.length > 1 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center cursor-pointer border-none hover:bg-white/20 transition-colors"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => (i - 1 + lightboxPhotos.length) % lightboxPhotos.length); }}
              aria-label="Anterior"
            >
              ‹
            </button>
          )}
          <img
            src={lightboxPhotos[lightboxIndex]}
            alt={`Foto ${lightboxIndex + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {/* Next button */}
          {lightboxPhotos.length > 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center cursor-pointer border-none hover:bg-white/20 transition-colors"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => (i + 1) % lightboxPhotos.length); }}
              aria-label="Siguiente"
            >
              ›
            </button>
          )}
          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-[13px]">
            {lightboxIndex + 1} / {lightboxPhotos.length}
          </div>
        </div>
      )}
    </div>
  );
}
