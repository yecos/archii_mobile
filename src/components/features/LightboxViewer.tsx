'use client';
import React from 'react';
import { useApp } from '@/contexts/AppContext';
import { useOneDrive } from '@/hooks/useOneDrive';
import { X, Download, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';

export default function LightboxViewer() {
  const {
    lightboxPhoto, closeLightbox, lightboxIndex, setLightboxIndex, setLightboxPhoto,
    lightboxPrev, lightboxNext, getFilteredGalleryPhotos, projects,
  } = useApp();
  const { odGalleryPhotos, downloadOneDriveFile, msAccessToken } = useOneDrive();

  if (!lightboxPhoto) return null;

  return (
    <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center animate-fadeIn" onClick={closeLightbox}>
      <div className="relative w-full h-full flex flex-col items-center justify-center p-4" onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button aria-label="Cerrar" className="absolute top-3 right-3 pt-[env(safe-area-inset-top,0px)] z-10 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center text-lg hover:bg-white/20 transition-colors" onClick={closeLightbox}><X size={20} aria-hidden="true"/></button>
        {/* OneDrive photo lightbox */}
        {lightboxPhoto.thumbnailLarge || lightboxPhoto.thumbnailUrl ? (
          <>
            {/* Download button */}
            <button aria-label="Descargar" className="absolute top-3 left-3 z-10 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors" onClick={() => downloadOneDriveFile(lightboxPhoto.id, lightboxPhoto.name)} title="Descargar"><Download size={18} aria-hidden="true"/></button>
            {/* Image */}
            <img src={lightboxPhoto.thumbnailLarge || lightboxPhoto.webUrl} className="max-w-full max-h-[80dvh] object-contain rounded-lg" alt={lightboxPhoto.name || ''} />
            {/* Navigation */}
            <div className="flex items-center gap-4 mt-4 pb-[env(safe-area-inset-bottom,0px)]">
              <button aria-label="Imagen anterior" className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors" onClick={() => {
                const prev = (lightboxIndex - 1 + odGalleryPhotos.length) % odGalleryPhotos.length;
                setLightboxIndex(prev); setLightboxPhoto(odGalleryPhotos[prev]);
              }}>
                <ChevronLeft size={20} className="stroke-current" aria-hidden="true"/>
              </button>
              <span className="text-white/60 text-sm">{lightboxIndex + 1} / {odGalleryPhotos.length}</span>
              <button aria-label="Imagen siguiente" className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors" onClick={() => {
                const next = (lightboxIndex + 1) % odGalleryPhotos.length;
                setLightboxIndex(next); setLightboxPhoto(odGalleryPhotos[next]);
              }}>
                <ChevronRight size={20} className="stroke-current" aria-hidden="true"/>
              </button>
            </div>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/50 text-[11px] mt-2">{lightboxPhoto.name || ''}</div>
          </>
        ) : (
          <>
            {/* Main gallery photo lightbox */}
            <div className="absolute top-3 left-3 z-10 text-left">
              {lightboxPhoto.data.caption && <div className="text-white text-sm font-medium">{lightboxPhoto.data.caption}</div>}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded bg-white/15 text-white/80">{lightboxPhoto.data.categoryName}</span>
                {(() => { const proj = projects.find(p => p.id === lightboxPhoto.data.projectId); return proj ? <span className="text-xs text-white/60">{proj.data.name}</span> : null; })()}
              </div>
            </div>
            {/* Image */}
            <img src={lightboxPhoto.data.imageData} alt={lightboxPhoto.data.caption || 'Foto'} className="max-w-full max-h-[80dvh] object-contain rounded-lg" />
            {/* Navigation */}
            <div className="flex items-center gap-4 mt-4 pb-[env(safe-area-inset-bottom,0px)]">
              <button aria-label="Imagen anterior" className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors" onClick={lightboxPrev}>
                <ChevronLeft size={20} className="stroke-current" aria-hidden="true"/>
              </button>
              <span className="text-white/60 text-sm">{lightboxIndex + 1} / {getFilteredGalleryPhotos().length}</span>
              <button aria-label="Imagen siguiente" className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors" onClick={lightboxNext}>
                <ChevronRight size={20} className="stroke-current" aria-hidden="true"/>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
