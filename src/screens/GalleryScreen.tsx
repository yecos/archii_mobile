'use client';
import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { SkeletonGallery } from '@/components/ui/SkeletonLoaders';
import { PHOTO_CATS } from '@/lib/types';
import { fmtDateTime } from '@/lib/helpers';
import { Camera, Plus, Search, LayoutGrid, List, CheckSquare, Square, Trash2, X, ImageOff, Calendar, FolderOpen, Tag } from 'lucide-react';

type ViewMode = 'grid' | 'list';

export default function GalleryScreen() {
  const {
    projects, galleryFilterProject, setGalleryFilterProject, galleryLoading,
    galleryFilterCat, setGalleryFilterCat,
    setEditingId, setForms, openModal,
    getFilteredGalleryPhotos, openLightbox, deleteGalleryPhoto,
  } = useApp();

  /* ===== Local state ===== */
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /* ===== Filtered + search ===== */
  const filteredPhotos = useMemo(() => {
    const base = getFilteredGalleryPhotos();
    const q = searchQuery.toLowerCase().trim();
    if (!q) return base;
    return base.filter((photo: any) => {
      const caption = (photo.data.caption || '').toLowerCase();
      const category = (photo.data.categoryName || '').toLowerCase();
      const proj = projects.find((p: any) => p.id === photo.data.projectId);
      const projName = proj ? proj.data.name.toLowerCase() : '';
      return caption.includes(q) || category.includes(q) || projName.includes(q);
    });
  }, [getFilteredGalleryPhotos, searchQuery, projects]);

  const photoCount = filteredPhotos.length;

  /* ===== Selection helpers ===== */
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredPhotos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPhotos.map((p: any) => p.id)));
    }
  }, [selectedIds.size, filteredPhotos]);

  const handleDeleteSelected = useCallback(() => {
    selectedIds.forEach(id => deleteGalleryPhoto(id));
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [selectedIds, deleteGalleryPhoto]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  /* ===== Add photo handler ===== */
  const handleAddPhoto = () => {
    setEditingId(null);
    setForms(p => ({ ...p, galleryImageData: '', galleryProject: '', galleryCategory: 'Otro', galleryCaption: '' }));
    openModal('gallery');
  };

  /* ===== Photo click handler ===== */
  const handlePhotoClick = (photo: any, idx: number) => {
    if (selectMode) {
      toggleSelect(photo.id);
    } else {
      openLightbox(photo, idx);
    }
  };

  /* ===== Has active filters ===== */
  const hasActiveFilters = galleryFilterProject !== 'all' || galleryFilterCat !== 'all' || searchQuery.trim() !== '';

  return (
    <div className="animate-fadeIn p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Camera size={20} className="text-[var(--af-accent)]" aria-hidden="true"/>
            Galería de proyectos
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {photoCount} foto{photoCount !== 1 ? 's' : ''}
            {hasActiveFilters && photoCount !== getFilteredGalleryPhotos().length && (
              <span> de {getFilteredGalleryPhotos().length} totales</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {/* Batch select toggle */}
          <button
            className={`px-3 py-2 rounded-lg text-[13px] font-medium cursor-pointer border transition-colors flex items-center gap-1.5 ${
              selectMode
                ? 'bg-[var(--af-accent)] text-background border-[var(--af-accent)]'
                : 'bg-[var(--af-bg3)] text-[var(--foreground)] border-[var(--border)] hover:border-[var(--af-accent)]/50'
            }`}
            onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
            aria-label={selectMode ? 'Salir de selección' : 'Modo selección'}
          >
            {selectMode ? <X size={14} aria-hidden="true"/> : <CheckSquare size={14} aria-hidden="true"/>}
            <span className="hidden sm:inline">{selectMode ? 'Cancelar' : 'Seleccionar'}</span>
          </button>
          {/* Add photo button */}
          <button
            className="px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer bg-[var(--af-accent)] text-background border-none hover:bg-[var(--af-accent2)] transition-colors flex items-center gap-2"
            onClick={handleAddPhoto}
          >
            <Plus size={16} aria-hidden="true"/>
            Agregar foto
          </button>
        </div>
      </div>

      {/* Batch select bar */}
      {selectMode && (
        <div className="flex items-center gap-3 bg-[var(--af-bg3)] border border-[var(--border)] rounded-xl px-4 py-2.5 animate-fadeIn">
          <button
            className="text-[12px] font-medium text-[var(--af-accent)] cursor-pointer bg-transparent border-none flex items-center gap-1.5 hover:underline"
            onClick={toggleSelectAll}
          >
            {selectedIds.size === filteredPhotos.length && filteredPhotos.length > 0 ? (
              <><Square size={14} className="fill-current" aria-hidden="true"/> Deseleccionar todo</>
            ) : (
              <><CheckSquare size={14} aria-hidden="true"/> Seleccionar todo</>
            )}
          </button>
          <div className="flex-1" />
          <span className="text-[12px] text-[var(--muted-foreground)]">
            {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}
          </span>
          {selectedIds.size > 0 && (
            <button
              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-red-500/10 text-red-400 border border-red-500/30 cursor-pointer hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
              onClick={handleDeleteSelected}
            >
              <Trash2 size={12} aria-hidden="true"/>
              Eliminar seleccionadas
            </button>
          )}
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search input */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true"/>
          <input
            type="text"
            placeholder="Buscar por título, categoría o proyecto..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg pl-9 pr-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
          />
          {searchQuery && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer bg-transparent border-none"
              onClick={() => setSearchQuery('')}
              aria-label="Limpiar búsqueda"
            >
              <X size={14} aria-hidden="true"/>
            </button>
          )}
        </div>
        {/* Project filter */}
        <select
          className="flex-1 bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none"
          value={galleryFilterProject}
          onChange={e => setGalleryFilterProject(e.target.value)}
        >
          <option value="all">Todos los proyectos</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.data.name}</option>)}
        </select>
        {/* Category filter */}
        <select
          className="flex-1 bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none"
          value={galleryFilterCat}
          onChange={e => setGalleryFilterCat(e.target.value)}
        >
          <option value="all">Todas las categorías</option>
          {PHOTO_CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {/* View mode toggle */}
        <div className="flex bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg overflow-hidden">
          <button
            className={`px-3 py-2 text-sm cursor-pointer border-none transition-colors flex items-center gap-1.5 ${
              viewMode === 'grid'
                ? 'bg-[var(--af-accent)] text-background'
                : 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
            onClick={() => setViewMode('grid')}
            aria-label="Vista cuadrícula"
          >
            <LayoutGrid size={14} aria-hidden="true"/>
          </button>
          <button
            className={`px-3 py-2 text-sm cursor-pointer border-none transition-colors flex items-center gap-1.5 ${
              viewMode === 'list'
                ? 'bg-[var(--af-accent)] text-background'
                : 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
            onClick={() => setViewMode('list')}
            aria-label="Vista lista"
          >
            <List size={14} aria-hidden="true"/>
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {galleryLoading && <SkeletonGallery />}

      {/* Empty state */}
      {!galleryLoading && filteredPhotos.length === 0 && (
        <div className="text-center py-16">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-[var(--af-bg3)] flex items-center justify-center">
              <ImageOff size={28} className="text-[var(--muted-foreground)]" aria-hidden="true"/>
            </div>
          </div>
          <div className="text-[15px] font-medium text-[var(--muted-foreground)] mb-1">
            {hasActiveFilters ? 'Sin resultados' : 'No hay fotos en la galería'}
          </div>
          <div className="text-[13px] text-[var(--af-text3)] max-w-xs mx-auto space-y-1">
            {hasActiveFilters ? (
              <>
                <p>No se encontraron fotos con los filtros actuales.</p>
                <p>Intenta cambiar los filtros o el texto de búsqueda.</p>
              </>
            ) : (
              <>
                <p>Agrega fotos de tus proyectos para documentar el progreso.</p>
                <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-2 text-[12px]">
                  <span className="flex items-center gap-1"><Camera size={12} aria-hidden="true"/> Fachadas e interiores</span>
                  <span className="flex items-center gap-1"><FolderOpen size={12} aria-hidden="true"/> Progreso de obra</span>
                  <span className="flex items-center gap-1"><Tag size={12} aria-hidden="true"/> Planos y renders</span>
                </p>
              </>
            )}
          </div>
          {hasActiveFilters ? (
            <button
              className="mt-4 px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--af-bg3)] text-[var(--foreground)] border border-[var(--border)] cursor-pointer hover:bg-[var(--af-bg4)] transition-colors"
              onClick={() => { setSearchQuery(''); setGalleryFilterProject('all'); setGalleryFilterCat('all'); }}
            >
              Limpiar filtros
            </button>
          ) : (
            <button
              className="mt-4 px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--af-accent)] text-background border-none cursor-pointer hover:bg-[var(--af-accent2)] transition-colors"
              onClick={handleAddPhoto}
            >
              Agregar foto
            </button>
          )}
        </div>
      )}

      {/* Photo Grid View */}
      {!galleryLoading && filteredPhotos.length > 0 && viewMode === 'grid' && (
        <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 140px), 1fr))' }}>
          {filteredPhotos.map((photo: any, idx: number) => {
            const proj = projects.find((p: any) => p.id === photo.data.projectId);
            const isSelected = selectedIds.has(photo.id);
            return (
              <div
                key={photo.id}
                className={`group relative aspect-square rounded-xl overflow-hidden bg-[var(--af-bg3)] cursor-pointer transition-all ${
                  isSelected
                    ? 'border-2 border-[var(--af-accent)] ring-2 ring-[var(--af-accent)]/30'
                    : 'border border-[var(--border)] hover:border-[var(--af-accent)]/50'
                }`}
                onClick={() => handlePhotoClick(photo, idx)}
              >
                <img
                  src={photo.data.imageData}
                  alt={photo.data.caption || 'Foto'}
                  className={`w-full h-full object-cover transition-all duration-300 ${selectMode && isSelected ? 'opacity-60' : 'opacity-0'}`}
                  loading="lazy"
                  onLoad={e => { (e.target as HTMLImageElement).style.opacity = selectMode && isSelected ? '0.6' : '1'; }}
                />

                {/* Selection checkbox overlay */}
                {selectMode && (
                  <div className="absolute top-1.5 left-1.5 z-10">
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-[var(--af-accent)] text-background'
                        : 'bg-black/40 text-white/70 backdrop-blur-sm'
                    }`}>
                      {isSelected ? <CheckSquare size={12} aria-hidden="true"/> : <Square size={12} aria-hidden="true"/>}
                    </div>
                  </div>
                )}

                {/* Overlay */}
                <div className={`absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent transition-opacity ${
                  selectMode ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
                }`}>
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    {photo.data.caption && <div className="text-xs text-white font-medium truncate">{photo.data.caption}</div>}
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {proj && <span className="text-[10px] text-white/70 truncate">{proj.data.name}</span>}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 text-white/90">{photo.data.categoryName}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Calendar size={8} className="text-white/50 flex-shrink-0" aria-hidden="true"/>
                      <span className="text-[9px] text-white/50">{fmtDateTime(photo.data.createdAt)}</span>
                    </div>
                  </div>
                  {!selectMode && (
                    <div className="absolute top-1.5 right-1.5 flex gap-1">
                      <button
                        className="w-6 h-6 rounded-full bg-red-500/80 text-white flex items-center justify-center text-xs hover:bg-red-500 transition-colors cursor-pointer border-none"
                        onClick={e => { e.stopPropagation(); deleteGalleryPhoto(photo.id); }}
                        aria-label="Eliminar foto"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                {/* Category badge always visible (only when not in select mode) */}
                {!selectMode && (
                  <div className="absolute top-1.5 left-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-black/40 text-white/90 backdrop-blur-sm">
                      {photo.data.categoryName}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Photo List View */}
      {!galleryLoading && filteredPhotos.length > 0 && viewMode === 'list' && (
        <div className="space-y-2">
          {filteredPhotos.map((photo: any, idx: number) => {
            const proj = projects.find((p: any) => p.id === photo.data.projectId);
            const isSelected = selectedIds.has(photo.id);
            return (
              <div
                key={photo.id}
                className={`flex items-center gap-3 bg-[var(--card)] rounded-xl overflow-hidden border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[var(--af-accent)] ring-2 ring-[var(--af-accent)]/30'
                    : 'border-[var(--border)] hover:border-[var(--af-accent)]/50'
                }`}
                onClick={() => handlePhotoClick(photo, idx)}
              >
                {/* Selection checkbox */}
                {selectMode && (
                  <div className="pl-3 flex-shrink-0">
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-[var(--af-accent)] text-background'
                        : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border border-[var(--border)]'
                    }`}>
                      {isSelected ? <CheckSquare size={12} aria-hidden="true"/> : <Square size={12} aria-hidden="true"/>}
                    </div>
                  </div>
                )}

                {/* Thumbnail */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0">
                  <img
                    src={photo.data.imageData}
                    alt={photo.data.caption || 'Foto'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 py-2 pr-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    {photo.data.caption && (
                      <span className="text-[13px] font-medium text-[var(--foreground)] truncate">
                        {photo.data.caption}
                      </span>
                    )}
                    {!photo.data.caption && (
                      <span className="text-[13px] text-[var(--muted-foreground)] italic truncate">
                        Sin título
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-[var(--af-text3)]">
                    <span className="px-1.5 py-0.5 rounded bg-[var(--af-bg3)] text-[var(--muted-foreground)]">
                      {photo.data.categoryName}
                    </span>
                    {proj && (
                      <span className="flex items-center gap-0.5 truncate">
                        <FolderOpen size={10} className="flex-shrink-0" aria-hidden="true"/>
                        {proj.data.name}
                      </span>
                    )}
                    <span className="flex items-center gap-0.5 flex-shrink-0">
                      <Calendar size={10} className="flex-shrink-0" aria-hidden="true"/>
                      {fmtDateTime(photo.data.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="pr-3 flex-shrink-0 flex items-center gap-1">
                  {!selectMode && (
                    <button
                      className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-colors cursor-pointer border-none"
                      onClick={e => { e.stopPropagation(); deleteGalleryPhoto(photo.id); }}
                      aria-label="Eliminar foto"
                    >
                      <Trash2 size={13} aria-hidden="true"/>
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
