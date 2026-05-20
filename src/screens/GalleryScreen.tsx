'use client';
import React from 'react';
import { useApp } from '@/contexts/AppContext';
import { SkeletonGallery } from '@/components/ui/SkeletonLoaders';
import { PHOTO_CATS } from '@/lib/types';
import { Camera, Plus } from 'lucide-react';

export default function GalleryScreen() {
  const {
    projects, galleryFilterProject, setGalleryFilterProject, galleryLoading,
    galleryFilterCat, setGalleryFilterCat,
    setEditingId, setForms, openModal,
    getFilteredGalleryPhotos, openLightbox, deleteGalleryPhoto,
  } = useApp();

  return (
    <div className="animate-fadeIn p-4 sm:p-6 space-y-4">
  {/* Header */}
  <div className="flex items-center justify-between flex-wrap gap-3">
    <div>
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Camera size={20} className="text-[var(--af-accent)]" aria-hidden="true"/> Galería de proyectos
      </h2>
      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{getFilteredGalleryPhotos().length} foto{getFilteredGalleryPhotos().length !== 1 ? 's' : ''}</p>
    </div>
    <button className="px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer bg-[var(--af-accent)] text-background border-none hover:bg-[var(--af-accent2)] transition-colors flex items-center gap-2 self-start" onClick={() => { setEditingId(null); setForms(p => ({ ...p, galleryImageData: '', galleryProject: '', galleryCategory: 'Otro', galleryCaption: '' })); openModal('gallery'); }}>
      <Plus size={16} aria-hidden="true"/>
      Agregar foto
    </button>
  </div>

  {/* Filters */}
  <div className="flex flex-col sm:flex-row gap-2">
    <select className="flex-1 bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" value={galleryFilterProject} onChange={e => setGalleryFilterProject(e.target.value)}>
      <option value="all">Todos los proyectos</option>
      {projects.map(p => <option key={p.id} value={p.id}>{p.data.name}</option>)}
    </select>
    <select className="flex-1 bg-[var(--af-bg3)] border border-[var(--input)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] outline-none" value={galleryFilterCat} onChange={e => setGalleryFilterCat(e.target.value)}>
      <option value="all">Todas las categorías</option>
      {PHOTO_CATS.map(c => <option key={c} value={c}>{c}</option>)}
    </select>
  </div>

  {/* Loading skeleton */}
  {galleryLoading && <SkeletonGallery />}

  {/* Photo Grid */}
  {!galleryLoading && getFilteredGalleryPhotos().length === 0 ? (
    <div className="text-center py-16">
      <div className="text-4xl mb-3">🖼️</div>
      <div className="text-[var(--muted-foreground)]">No hay fotos en la galería</div>
      <div className="text-xs text-[var(--muted-foreground)] mt-1">Agrega fotos de tus proyectos para documentar el progreso</div>
    </div>
  ) : (
    <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 140px), 1fr))' }}>
      {getFilteredGalleryPhotos().map((photo: any, idx: any) => {
        const proj = projects.find(p => p.id === photo.data.projectId);
        return (
          <div key={photo.id} className="group relative aspect-square rounded-xl overflow-hidden bg-[var(--af-bg3)] border border-[var(--border)] cursor-pointer hover:border-[var(--af-accent)]/50 transition-all" onClick={() => openLightbox(photo, idx)}>
            <img src={photo.data.imageData} alt={photo.data.caption || 'Foto'} className="w-full h-full object-cover opacity-0 transition-opacity duration-300" loading="lazy" onLoad={e => { (e.target as HTMLImageElement).style.opacity = '1' }} />
            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-2">
                {photo.data.caption && <div className="text-xs text-white font-medium truncate">{photo.data.caption}</div>}
                <div className="flex items-center gap-1 mt-0.5">
                  {proj && <span className="text-[10px] text-white/70 truncate">{proj.data.name}</span>}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 text-white/90">{photo.data.categoryName}</span>
                </div>
              </div>
              <div className="absolute top-1.5 right-1.5 flex gap-1">
                <button className="w-6 h-6 rounded-full bg-red-500/80 text-white flex items-center justify-center text-xs hover:bg-red-500 transition-colors" onClick={e => { e.stopPropagation(); deleteGalleryPhoto(photo.id); }}>✕</button>
              </div>
            </div>
            {/* Category badge always visible */}
            <div className="absolute top-1.5 left-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-black/40 text-white/90 backdrop-blur-sm">{photo.data.categoryName}</span>
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>
  );
}
