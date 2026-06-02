'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Rnd } from 'react-rnd';
import { useApp } from '@/contexts/AppContext';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft, Save, Plus, Type, Image, QrCode, Square, Circle,
  Trash2, Copy, Eye, EyeOff, Lock, Unlock, ZoomIn, ZoomOut,
  Upload, Move, Palette, Layout, ChevronDown, ChevronRight,
  User, FileText, RotateCcw,
} from 'lucide-react';
import {
  type CarnetTemplate,
  type TemplateElement,
  type TextTemplateElement,
  type PhotoTemplateElement,
  type QRTemplateElement,
  type ShapeTemplateElement,
  type ImageTemplateElement,
  FONT_FAMILIES,
  CARD_FIELDS,
  createDefaultPortraitTemplate,
  createDefaultBackTemplate,
  compressImage,
  compressBase64Image,
} from '@/lib/carnet-template-types';

const QR_BASE_URL = 'https://archii-theta.vercel.app/carnet';

/* ─── Font loading helper ─── */
const loadedFonts = new Set<string>();
function ensureFont(fontFamily: string) {
  if (loadedFonts.has(fontFamily) || typeof document === 'undefined') return;
  loadedFonts.add(fontFamily);
  const link = document.createElement('link');
  link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/ /g, '+')}:wght@300;400;500;600;700&display=swap`;
  link.rel = 'stylesheet';
  document.head.appendChild(link);
}
FONT_FAMILIES.forEach(ensureFont);

/* ─── Sample data for preview ─── */
const SAMPLE_DATA: Record<string, string> = {
  fullName: 'MARÍA ALEJANDRA GÓMEZ',
  employeeCode: 'TPL-0247',
  position: 'Diseñadora de Interiores',
  area: 'Diseño y Proyectos',
  phone: '+57 300 123 4567',
  email: 'maria@empresa.com',
  city: 'Medellín, Colombia',
  bloodType: 'O+',
  eps: 'Sanitas',
  emergencyContact: 'Ana Restrepo',
  emergencyPhone: '300 456 7890',
  startDate: 'Jun 2025',
  validUntil: 'Jun 2027',
  tenantName: 'TEMPLO',
  statusText: 'VIGENTE',
};

/* ─── Unique ID generator ─── */
let idCounter = 0;
function uid() {
  return `el-${Date.now()}-${++idCounter}`;
}

export default function CarnetTemplateEditor() {
  const { activeTenantId, activeTenantName, authUser, setScreen } = useApp() as any;

  // Template state
  const [templates, setTemplates] = useState<CarnetTemplate[]>([]);
  const [currentTemplate, setCurrentTemplate] = useState<CarnetTemplate | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1.2);
  const [showPreview, setShowPreview] = useState(false);
  const [side, setSide] = useState<'front' | 'back'>('front');

  // Canvas ref for scrolling
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const selectedElement = currentTemplate?.elements.find(e => e.id === selectedId) || null;

  /* ─── Deep clone helper ─── */
  const deepClone = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj));

  /* ─── Fetch templates ─── */
  // `preserveCurrent` — if true, only updates the template list without replacing
  // the current working template. Used after save to avoid position jumps.
  const fetchTemplates = useCallback(async (preserveCurrent = false) => {
    if (!activeTenantId || !authUser) return;
    try {
      const token = await authUser.getIdToken();
      const res = await fetch('/api/carnet-templates', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', tenantId: activeTenantId }),
      });
      const data = await res.json();
      if (data.templates) {
        setTemplates(data.templates);
        if (preserveCurrent) {
          // After save: only sync the template id and metadata, keep user's working state
          setCurrentTemplate(prev => {
            if (!prev) {
              // No template loaded — auto-load the default
              const defaultTpl = data.templates.find((t: CarnetTemplate) => t.isDefault && t.side === side);
              return defaultTpl || data.templates[0] || null;
            }
            // Keep current working state, just update id if it was a new template
            const serverVersion = data.templates.find((t: CarnetTemplate) => t.id === prev.id);
            if (serverVersion) {
              return { ...prev, id: serverVersion.id, updatedAt: serverVersion.updatedAt };
            }
            // Check if this was a newly created template (no id before save)
            if (!prev.id) {
              // Find the most recently created template for this tenant and side
              const newTpl = data.templates
                .filter((t: CarnetTemplate) => t.side === prev.side)
                .sort((a: CarnetTemplate, b: CarnetTemplate) => {
                  const aTime = a.createdAt?.toMillis?.() || 0;
                  const bTime = b.createdAt?.toMillis?.() || 0;
                  return bTime - aTime;
                })[0];
              if (newTpl) return { ...prev, id: newTpl.id };
            }
            return prev;
          });
        } else {
          // Initial load: auto-load the default template
          setCurrentTemplate(prev => {
            if (prev) return prev; // Don't overwrite if already editing
            const defaultFront = data.templates.find((t: CarnetTemplate) => t.isDefault && t.side === 'front');
            const defaultBack = data.templates.find((t: CarnetTemplate) => t.isDefault && t.side === 'back');
            if (side === 'front' && defaultFront) return defaultFront;
            if (side === 'back' && defaultBack) return defaultBack;
            if (data.templates.length > 0) return data.templates[0];
            return null;
          });
        }
      }
    } catch (err) {
      console.error('[TemplateEditor] fetch error:', err);
    }
  }, [activeTenantId, authUser, side]);

  // Initial load only — don't re-fetch on side change while editing
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  useEffect(() => {
    if (!initialLoadDone && activeTenantId && authUser) {
      fetchTemplates().then(() => setInitialLoadDone(true));
    }
  }, [activeTenantId, authUser, initialLoadDone]);

  /* ─── Upload a base64 image to Firebase Storage, returns the public URL ─── */
  const uploadImageToStorage = async (
    imageData: string,
    storagePath: string
  ): Promise<string> => {
    if (!authUser || !activeTenantId) throw new Error('No autenticado');
    // If it's already a Storage URL, no need to re-upload
    if (imageData.startsWith('https://') || imageData.startsWith('http://')) {
      return imageData;
    }
    const token = await authUser.getIdToken();
    const res = await fetch('/api/upload-image', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: activeTenantId, imageData, path: storagePath }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error subiendo imagen a Storage');
    return data.url;
  };

  /* ─── Aggressively compress a base64 image to fit within Firestore's ~1MB field limit ─── */
  const compressToFitFirestore = async (
    imageData: string,
    maxWidth: number,
    maxHeight: number,
    label: string
  ): Promise<string | undefined> => {
    const FIRESTORE_FIELD_LIMIT = 900000; // ~900KB safe limit for base64 string length
    if (!imageData || !imageData.startsWith('data:')) return imageData;

    // If already small enough, return as-is
    if (imageData.length <= FIRESTORE_FIELD_LIMIT) return imageData;

    let current = imageData;
    const qualities = [0.7, 0.5, 0.35, 0.25, 0.15];
    const scales = [1, 0.8, 0.6, 0.5];

    for (const scale of scales) {
      const w = Math.round(maxWidth * scale);
      const h = Math.round(maxHeight * scale);
      for (const quality of qualities) {
        try {
          current = await compressBase64Image(current, w, h, quality);
          console.log(`[compressToFitFirestore] ${label}: ${w}x${h} q=${quality} → ${current.length} chars`);
          if (current.length <= FIRESTORE_FIELD_LIMIT) {
            return current;
          }
        } catch (e) {
          console.warn(`[compressToFitFirestore] Failed at ${w}x${h} q=${quality}:`, e);
        }
      }
    }

    // Last resort: try very small
    try {
      current = await compressBase64Image(imageData, Math.round(maxWidth * 0.3), Math.round(maxHeight * 0.3), 0.1);
      if (current.length <= FIRESTORE_FIELD_LIMIT) return current;
    } catch (e) { /* give up */ }

    console.warn(`[compressToFitFirestore] ${label}: Could not compress below ${FIRESTORE_FIELD_LIMIT} chars (got ${current.length}). Removing image.`);
    return undefined;
  };

  /* ─── Process an image: try Storage first, fall back to aggressive compression ─── */
  const processImageForSave = async (
    imageData: string | undefined,
    maxWidth: number,
    maxHeight: number,
    storagePath: string,
    label: string
  ): Promise<string | undefined> => {
    if (!imageData) return undefined;
    // If already a URL, keep it
    if (imageData.startsWith('https://') || imageData.startsWith('http://')) return imageData;
    // If not base64, keep as-is
    if (!imageData.startsWith('data:')) return imageData;

    // Strategy 1: Try uploading to Firebase Storage
    try {
      let compressed = imageData;
      if (compressed.length > 200000) {
        compressed = await compressBase64Image(compressed, maxWidth, maxHeight, 0.75);
      }
      const url = await uploadImageToStorage(compressed, storagePath);
      console.log(`[Editor] ${label}: uploaded to Storage → ${url.substring(0, 80)}...`);
      return url;
    } catch (storageErr: any) {
      console.warn(`[Editor] ${label}: Storage upload failed (${storageErr.message}), falling back to compression`);
    }

    // Strategy 2: Aggressive compression to fit in Firestore
    const compressed = await compressToFitFirestore(imageData, maxWidth, maxHeight, label);
    if (compressed) {
      console.log(`[Editor] ${label}: compressed to ${compressed.length} chars for Firestore`);
    } else {
      toast.warning(`Imagen de ${label} muy grande y Storage no disponible. Se removió.`);
    }
    return compressed;
  };

  /* ─── Save template (upload images to Storage, fallback to compression) ─── */
  const handleSave = async () => {
    if (!currentTemplate || !authUser) return;
    try {
      setSaving(true);

      // Deep clone to avoid mutating the current working state
      const templateToSave = deepClone({ ...currentTemplate, side });

      // Process background image
      if (templateToSave.backgroundImage) {
        templateToSave.backgroundImage = await processImageForSave(
          templateToSave.backgroundImage, 638, 1004, 'carnet-templates/backgrounds', 'fondo'
        );
      }

      // Process logo image
      if (templateToSave.logo?.image) {
        const logoImage = await processImageForSave(
          templateToSave.logo.image, 300, 300, 'carnet-templates/logos', 'logo'
        );
        templateToSave.logo = { ...templateToSave.logo, image: logoImage || '' };
      }

      // Process element images (only modify the image field, preserve all positions)
      for (let i = 0; i < templateToSave.elements.length; i++) {
        const el = templateToSave.elements[i];
        if (el.type === 'image') {
          const imgEl = el as ImageTemplateElement;
          if (imgEl.image) {
            const img = await processImageForSave(
              imgEl.image, 500, 500, 'carnet-templates/elements', 'elemento'
            );
            // Only update the image field — keep x, y, width, height, etc. intact
            (templateToSave.elements[i] as ImageTemplateElement).image = img || '';
          }
        }
      }

      // Save to Firestore
      const token = await authUser.getIdToken();
      const res = await fetch('/api/carnet-templates', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          tenantId: activeTenantId,
          template: templateToSave,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success('Template guardado');

      // Update current template with the saved ID (if newly created)
      // and any processed image URLs, but DON'T replace element positions
      setCurrentTemplate(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          id: data.id || prev.id,
          backgroundImage: templateToSave.backgroundImage ?? prev.backgroundImage,
          logo: templateToSave.logo && prev.logo ? { ...prev.logo, image: templateToSave.logo.image || prev.logo.image } : prev.logo,
        } as CarnetTemplate;
      });

      // Refresh template list in sidebar (preserve current working state)
      fetchTemplates(true);
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Update element in template ─── */
  const updateElement = (id: string, updates: Partial<TemplateElement>) => {
    setCurrentTemplate(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        elements: prev.elements.map(el => el.id === id ? { ...el, ...updates } as TemplateElement : el),
      };
    });
  };

  /* ─── Delete element ─── */
  const deleteElement = (id: string) => {
    setCurrentTemplate(prev => {
      if (!prev) return prev;
      return { ...prev, elements: prev.elements.filter(el => el.id !== id) };
    });
    if (selectedId === id) setSelectedId(null);
  };

  /* ─── Duplicate element ─── */
  const duplicateElement = (id: string) => {
    setCurrentTemplate(prev => {
      if (!prev) return prev;
      const el = prev.elements.find(e => e.id === id);
      if (!el) return prev;
      const newEl = { ...el, id: uid(), x: el.x + 10, y: el.y + 10 } as TemplateElement;
      return { ...prev, elements: [...prev.elements, newEl] };
    });
  };

  /* ─── Add element ─── */
  const addElement = (type: TemplateElement['type']) => {
    const newId = uid();
    let newEl: TemplateElement;

    switch (type) {
      case 'text':
        newEl = {
          id: newId, type: 'text', field: 'custom', text: 'Texto',
          x: 40, y: 200, width: 120, height: 20,
          fontFamily: 'Montserrat', fontSize: 10, fontWeight: 500,
          fontColor: '#2D2A26', textAlign: 'center', letterSpacing: 0,
          textTransform: 'none', fontStyle: 'normal', lineHeight: 1.3,
          rotation: 0, opacity: 1, zIndex: 5, visible: true, locked: false,
        } as TextTemplateElement;
        break;
      case 'photo':
        newEl = {
          id: newId, type: 'photo', x: 120, y: 60, width: 80, height: 80,
          shape: 'circle', borderColor: '#C9A96E', borderWidth: 2,
          objectFit: 'cover', rotation: 0, opacity: 1, zIndex: 5,
          visible: true, locked: false,
        } as PhotoTemplateElement;
        break;
      case 'qr':
        newEl = {
          id: newId, type: 'qr', x: 120, y: 250, width: 70, height: 70,
          borderColor: '#C9A96E', borderWidth: 1.5, fgColor: '#2D2A26',
          bgColor: '#ffffff', labelText: 'Escanea', labelFontSize: 5,
          labelColor: '#8A8279', rotation: 0, opacity: 1, zIndex: 5,
          visible: true, locked: false,
        } as QRTemplateElement;
        break;
      case 'shape':
        newEl = {
          id: newId, type: 'shape', shapeType: 'rect', x: 40, y: 300,
          width: 100, height: 30, fillColor: '#C9A96E', borderColor: 'transparent',
          borderWidth: 0, borderRadius: 4, rotation: 0, opacity: 1, zIndex: 1,
          visible: true, locked: false,
        } as ShapeTemplateElement;
        break;
      case 'image':
        newEl = {
          id: newId, type: 'image', x: 40, y: 300, width: 60, height: 60,
          image: '', objectFit: 'cover', borderRadius: 0,
          rotation: 0, opacity: 1, zIndex: 4, visible: true, locked: false,
        } as ImageTemplateElement;
        break;
      default:
        return;
    }

    setCurrentTemplate(prev => {
      if (!prev) return prev;
      return { ...prev, elements: [...prev.elements, newEl] };
    });
    setSelectedId(newId);
  };

  /* ─── Upload handlers (with compression to fit Firestore 1MB limit) ─── */
  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Compress: background images at card resolution, JPEG 70% quality
      const compressed = await compressImage(file, 638, 1004, 0.7);
      setCurrentTemplate(prev => prev ? { ...prev, backgroundImage: compressed } : prev);
    } catch (err) {
      console.error('[Editor] Background upload error:', err);
      toast.error('Error al procesar imagen de fondo');
    }
  };

  const handleImageElementUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    try {
      // Compress: element images smaller, JPEG 75% quality
      const compressed = await compressImage(file, 400, 400, 0.75);
      updateElement(selectedId, { image: compressed } as Partial<ImageTemplateElement>);
    } catch (err) {
      console.error('[Editor] Image upload error:', err);
      toast.error('Error al procesar imagen');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Compress: logos small, JPEG 80% quality
      const compressed = await compressImage(file, 200, 200, 0.8);
      setCurrentTemplate(prev => prev ? {
        ...prev,
        logo: { x: 20, y: 8, width: 28, height: 28, image: compressed, visible: true, opacity: 1 },
      } : prev);
    } catch (err) {
      console.error('[Editor] Logo upload error:', err);
      toast.error('Error al procesar logo');
    }
  };

  /* ─── New template from default ─── */
  const handleNewTemplate = () => {
    const tpl = side === 'front'
      ? createDefaultPortraitTemplate(activeTenantId)
      : createDefaultBackTemplate(activeTenantId);
    tpl.name = `Mi Template ${templates.length + 1}`;
    tpl.isDefault = false;
    tpl.id = undefined;
    setCurrentTemplate(tpl);
    setSelectedId(null);
  };

  /* ─── Reset to default ─── */
  const handleResetDefault = () => {
    const tpl = side === 'front'
      ? createDefaultPortraitTemplate(activeTenantId)
      : createDefaultBackTemplate(activeTenantId);
    tpl.name = currentTemplate?.name || tpl.name;
    tpl.id = currentTemplate?.id;
    setCurrentTemplate(tpl);
    setSelectedId(null);
  };

  /* ─── Resolve text value for preview ─── */
  const resolveText = (el: TextTemplateElement): string => {
    if (el.field && el.field !== 'custom' && SAMPLE_DATA[el.field]) {
      return SAMPLE_DATA[el.field];
    }
    return el.text || '';
  };

  /* Actually render the element content properly inside Rnd */
  const renderElementContent = (el: TemplateElement, isSelected: boolean) => {
    if (!el.visible) return null;

    let inner: React.ReactNode = null;

    switch (el.type) {
      case 'text': {
        const tel = el as TextTemplateElement;
        inner = (
          <div style={{
            width: '100%', height: '100%',
            fontFamily: `'${tel.fontFamily}', sans-serif`,
            fontSize: tel.fontSize,
            fontWeight: tel.fontWeight,
            color: tel.fontColor,
            textAlign: tel.textAlign,
            letterSpacing: tel.letterSpacing,
            textTransform: tel.textTransform as any,
            fontStyle: tel.fontStyle,
            lineHeight: tel.lineHeight,
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {resolveText(tel)}
          </div>
        );
        break;
      }
      case 'photo': {
        const pel = el as PhotoTemplateElement;
        inner = (
          <div style={{
            width: '100%', height: '100%',
            borderRadius: pel.shape === 'circle' ? '50%' : 4,
            border: `${pel.borderWidth}px solid ${pel.borderColor}`,
            overflow: 'hidden',
            background: '#EDE8E0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <User size={Math.min(el.width, el.height) * 0.35} color="#C9A96E" />
          </div>
        );
        break;
      }
      case 'qr': {
        const qel = el as QRTemplateElement;
        inner = (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <div style={{
              padding: 3,
              border: `${qel.borderWidth}px solid ${qel.borderColor}`,
              borderRadius: 4,
              background: qel.bgColor,
            }}>
              <QRCodeSVG
                value={`${QR_BASE_URL}/TPL-0247`}
                size={Math.min(qel.width - 8, qel.height - (qel.labelText ? 20 : 8))}
                level="M"
                fgColor={qel.fgColor}
                bgColor={qel.bgColor}
              />
            </div>
            {qel.labelText && (
              <span style={{
                fontSize: qel.labelFontSize || 5,
                color: qel.labelColor || '#8A8279',
                textAlign: 'center',
              }}>
                {qel.labelText}
              </span>
            )}
          </div>
        );
        break;
      }
      case 'shape': {
        const sel = el as ShapeTemplateElement;
        inner = (
          <div style={{
            width: '100%', height: '100%',
            background: sel.fillColor,
            border: sel.borderWidth > 0 ? `${sel.borderWidth}px solid ${sel.borderColor}` : 'none',
            borderRadius: sel.shapeType === 'circle' ? '50%' : sel.shapeType === 'line' ? 0 : sel.borderRadius,
          }} />
        );
        break;
      }
      case 'image': {
        const iel = el as ImageTemplateElement;
        inner = (
          <div style={{
            width: '100%', height: '100%',
            borderRadius: iel.borderRadius,
            overflow: 'hidden',
            background: '#EDE8E0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {iel.image ? (
              <img src={iel.image} alt="" style={{ width: '100%', height: '100%', objectFit: iel.objectFit }} />
            ) : (
              <Image size={20} color="#C9A96E" />
            )}
          </div>
        );
        break;
      }
    }

    return (
      <Rnd
        key={el.id}
        position={{ x: el.x, y: el.y }}
        size={{ width: el.width, height: el.height }}
        scale={zoom}
        onDragStop={(e, d) => updateElement(el.id, { x: d.x, y: d.y })}
        onResizeStop={(e, dir, ref, delta, pos) => {
          updateElement(el.id, {
            x: pos.x, y: pos.y,
            width: parseFloat(ref.style.width),
            height: parseFloat(ref.style.height),
          });
        }}
        disableDragging={el.locked}
        enableResizing={!el.locked}
        style={{ zIndex: (el.zIndex ?? 1) + (isSelected ? 100 : 0) }}
        onClick={(_e: any) => { _e.stopPropagation(); setSelectedId(el.id); }}
        onDoubleClick={() => {
          updateElement(el.id, { locked: !el.locked });
          toast.info(el.locked ? 'Elemento desbloqueado' : 'Elemento bloqueado');
        }}
      >
        <div style={{
          width: '100%', height: '100%',
          outline: isSelected ? '2px solid #4F8EF7' : 'none',
          outlineOffset: '1px',
          borderRadius: 2,
          cursor: el.locked ? 'default' : 'move',
          position: 'relative',
        }}>
          {inner}
        </div>
      </Rnd>
    );
  };

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--af-accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] animate-fadeIn">
      {/* ═══ Top Bar ═══ */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setScreen('carnets')}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--af-bg3)] cursor-pointer bg-transparent border-none"
          >
            <ArrowLeft size={18} className="text-[var(--muted-foreground)]" />
          </button>
          <div>
            <h1 className="text-base font-bold text-[var(--foreground)]" style={{ fontFamily: "'DM Serif Display', serif" }}>
              Diseñador de Carnet
            </h1>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              {currentTemplate?.name || 'Sin template'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Side toggle */}
          <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
            {(['front', 'back'] as const).map(s => (
              <button
                key={s}
                onClick={() => {
                  if (s !== side) {
                    setSide(s);
                    // Load the template for the new side
                    const tplForSide = templates.find(t => t.side === s && t.isDefault)
                      || templates.find(t => t.side === s);
                    if (tplForSide) {
                      setCurrentTemplate(tplForSide);
                      setSelectedId(null);
                    }
                  }
                }}
                className={`px-3 py-1.5 text-[11px] font-medium cursor-pointer border-none transition-all ${
                  side === s
                    ? 'bg-[var(--af-accent)] text-white'
                    : 'bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--af-bg3)]'
                }`}
              >
                {s === 'front' ? 'Frente' : 'Reverso'}
              </button>
            ))}
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border)]">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="w-6 h-6 flex items-center justify-center cursor-pointer bg-transparent border-none text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              <ZoomOut size={14} />
            </button>
            <span className="text-[11px] font-mono text-[var(--muted-foreground)] w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="w-6 h-6 flex items-center justify-center cursor-pointer bg-transparent border-none text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              <ZoomIn size={14} />
            </button>
          </div>

          <button
            onClick={() => setShowPreview(!showPreview)}
            className="af-btn-secondary flex items-center gap-1.5 text-[12px] px-3 py-1.5"
          >
            <Eye size={14} /> Vista previa
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="af-btn-primary flex items-center gap-1.5 text-[12px] px-3 py-1.5"
          >
            <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* ═══ Main Content ═══ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Left Panel: Element Palette + Template List ─── */}
        <div className="w-56 border-r border-[var(--border)] bg-[var(--card)] flex flex-col overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {/* Template selector */}
          <div className="p-3 border-b border-[var(--border)]">
            <label className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1.5 block">Templates</label>
            <select
              value={currentTemplate?.id || ''}
              onChange={e => {
                const tpl = templates.find(t => t.id === e.target.value);
                if (tpl) { setCurrentTemplate(tpl); setSelectedId(null); }
              }}
              className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--foreground)] outline-none"
            >
              <option value="">Seleccionar...</option>
              {templates.filter(t => t.side === side).map(t => (
                <option key={t.id} value={t.id}>{t.name} {t.isDefault ? '(default)' : ''}</option>
              ))}
            </select>
            <div className="flex gap-1.5 mt-2">
              <button onClick={handleNewTemplate} className="flex-1 text-[10px] px-2 py-1 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer">Nuevo</button>
              <button onClick={handleResetDefault} className="flex-1 text-[10px] px-2 py-1 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer">Reset</button>
            </div>
          </div>

          {/* Add element */}
          <div className="p-3 border-b border-[var(--border)]">
            <label className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 block">Agregar elemento</label>
            <div className="grid grid-cols-2 gap-1.5">
              <PaletteBtn icon={<Type size={14} />} label="Texto" onClick={() => addElement('text')} />
              <PaletteBtn icon={<User size={14} />} label="Foto" onClick={() => addElement('photo')} />
              <PaletteBtn icon={<QrCode size={14} />} label="QR" onClick={() => addElement('qr')} />
              <PaletteBtn icon={<Square size={14} />} label="Forma" onClick={() => addElement('shape')} />
              <PaletteBtn icon={<Image size={14} />} label="Imagen" onClick={() => addElement('image')} />
              <PaletteBtn icon={<Upload size={14} />} label="Logo" onClick={() => document.getElementById('logo-upload')?.click()} />
            </div>
            <input id="logo-upload" type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          </div>

          {/* Background */}
          <div className="p-3 border-b border-[var(--border)]">
            <label className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 block">Fondo</label>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="color"
                value={currentTemplate?.backgroundColor || '#F8F5F0'}
                onChange={e => setCurrentTemplate(prev => prev ? { ...prev, backgroundColor: e.target.value } : prev)}
                className="w-7 h-7 rounded border border-[var(--border)] cursor-pointer"
              />
              <span className="text-[11px] text-[var(--muted-foreground)] font-mono">{currentTemplate?.backgroundColor}</span>
            </div>
            <label className="af-btn-secondary flex items-center gap-1.5 text-[10px] px-2 py-1 cursor-pointer justify-center">
              <Upload size={12} /> Subir fondo
              <input type="file" accept="image/*" className="hidden" onChange={handleBackgroundUpload} />
            </label>
            {currentTemplate?.backgroundImage && (
              <button
                onClick={() => setCurrentTemplate(prev => prev ? { ...prev, backgroundImage: undefined } : prev)}
                className="w-full mt-1 text-[10px] text-red-400 hover:underline cursor-pointer bg-transparent border-none"
              >
                Quitar fondo
              </button>
            )}
          </div>

          {/* Elements list */}
          <div className="p-3 flex-1">
            <label className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 block">
              Elementos ({currentTemplate?.elements.length || 0})
            </label>
            <div className="space-y-0.5">
              {(currentTemplate?.elements || [])
                .sort((a, b) => (b.zIndex ?? 1) - (a.zIndex ?? 1))
                .map(el => (
                <div
                  key={el.id}
                  onClick={() => setSelectedId(el.id)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] cursor-pointer transition-all ${
                    selectedId === el.id
                      ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)]'
                      : 'text-[var(--muted-foreground)] hover:bg-[var(--af-bg3)]'
                  }`}
                >
                  <ElementTypeIcon type={el.type} size={12} />
                  <span className="flex-1 truncate">{getElementLabel(el)}</span>
                  <button
                    onClick={(_e: any) => { _e.stopPropagation(); updateElement(el.id, { visible: !el.visible }); }}
                    className="w-4 h-4 flex items-center justify-center bg-transparent border-none cursor-pointer"
                  >
                    {el.visible ? <Eye size={10} /> : <EyeOff size={10} className="text-red-400" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Center: Canvas ─── */}
        <div
          ref={canvasContainerRef}
          className="flex-1 overflow-auto bg-[var(--af-bg3)] flex items-start justify-center p-8"
          onClick={() => setSelectedId(null)}
        >
          <div
            style={{
              width: (currentTemplate?.width || 319) * zoom,
              height: (currentTemplate?.height || 502) * zoom,
              transform: `scale(1)`,
              position: 'relative',
              flexShrink: 0,
            }}
          >
            {/* Scaled wrapper */}
            <div style={{
              width: currentTemplate?.width || 319,
              height: currentTemplate?.height || 502,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              position: 'relative',
              background: currentTemplate?.backgroundColor || '#F8F5F0',
              borderRadius: 12,
              border: `1.5px solid #C9A96E`,
              overflow: 'hidden',
              boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
            }}
              onClick={(_e: any) => _e.stopPropagation()}
            >
              {/* Background image */}
              {currentTemplate?.backgroundImage && (
                <img
                  src={currentTemplate.backgroundImage}
                  alt=""
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    objectFit: (currentTemplate.backgroundFit || 'cover') as any,
                    zIndex: 0,
                  }}
                />
              )}

              {/* Logo */}
              {currentTemplate?.logo?.visible && currentTemplate.logo.image && (
                <img
                  src={currentTemplate.logo.image}
                  alt="Logo"
                  style={{
                    position: 'absolute',
                    left: currentTemplate.logo.x,
                    top: currentTemplate.logo.y,
                    width: currentTemplate.logo.width,
                    height: currentTemplate.logo.height,
                    opacity: currentTemplate.logo.opacity,
                    objectFit: 'contain',
                    zIndex: 10,
                  }}
                />
              )}

              {/* Elements */}
              {currentTemplate?.elements.map(el => renderElementContent(el, el.id === selectedId))}
            </div>
          </div>
        </div>

        {/* ─── Right Panel: Properties ─── */}
        <div className="w-64 border-l border-[var(--border)] bg-[var(--card)] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {selectedElement ? (
            <PropertiesPanel
              element={selectedElement}
              onUpdate={(updates) => updateElement(selectedId!, updates)}
              onDelete={() => deleteElement(selectedId!)}
              onDuplicate={() => duplicateElement(selectedId!)}
              onImageUpload={handleImageElementUpload}
            />
          ) : (
            <div className="p-4 text-center">
              <Layout size={32} className="mx-auto text-[var(--af-text3)] mb-3" />
              <p className="text-[12px] text-[var(--muted-foreground)]">
                Selecciona un elemento en el canvas para editar sus propiedades
              </p>
              <p className="text-[11px] text-[var(--muted-foreground)] mt-2">
                Doble clic para bloquear/desbloquear
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Preview Modal ═══ */}
      {showPreview && currentTemplate && (
        <PreviewModal template={currentTemplate} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════ */

function PaletteBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 p-2 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--af-accent)]/30 cursor-pointer transition-all"
    >
      {icon}
      <span className="text-[9px]">{label}</span>
    </button>
  );
}

function ElementTypeIcon({ type, size = 14 }: { type: string; size?: number }) {
  switch (type) {
    case 'text': return <Type size={size} />;
    case 'photo': return <User size={size} />;
    case 'qr': return <QrCode size={size} />;
    case 'shape': return <Square size={size} />;
    case 'image': return <Image size={size} />;
    default: return <FileText size={size} />;
  }
}

function getElementLabel(el: TemplateElement): string {
  switch (el.type) {
    case 'text': {
      const tel = el as TextTemplateElement;
      if (tel.field && tel.field !== 'custom') {
        const field = CARD_FIELDS.find(f => f.value === tel.field);
        return field?.label || tel.field;
      }
      return tel.text?.slice(0, 15) || 'Texto';
    }
    case 'photo': return 'Foto';
    case 'qr': return 'Código QR';
    case 'shape': return `Forma (${(el as ShapeTemplateElement).shapeType})`;
    case 'image': return 'Imagen';
    default: return 'Elemento';
  }
}

/* ─── Properties Panel ─── */
function PropertiesPanel({
  element,
  onUpdate,
  onDelete,
  onDuplicate,
  onImageUpload,
}: {
  element: TemplateElement;
  onUpdate: (updates: Partial<TemplateElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ElementTypeIcon type={element.type} size={14} />
          <span className="text-[12px] font-semibold text-[var(--foreground)]">
            {getElementLabel(element)}
          </span>
        </div>
        <div className="flex gap-1">
          <button onClick={onDuplicate} title="Duplicar" className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--af-bg3)] cursor-pointer bg-transparent border-none text-[var(--muted-foreground)]">
            <Copy size={12} />
          </button>
          <button onClick={onDelete} title="Eliminar" className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/10 cursor-pointer bg-transparent border-none text-red-400">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Position & Size */}
      <PropSection title="Posición y tamaño">
        <div className="grid grid-cols-2 gap-1.5">
          <PropInput label="X" type="number" value={element.x} onChange={v => onUpdate({ x: v })} />
          <PropInput label="Y" type="number" value={element.y} onChange={v => onUpdate({ y: v })} />
          <PropInput label="Ancho" type="number" value={element.width} onChange={v => onUpdate({ width: v })} />
          <PropInput label="Alto" type="number" value={element.height} onChange={v => onUpdate({ height: v })} />
        </div>
        <PropInput label="Rotación" type="number" value={element.rotation || 0} onChange={v => onUpdate({ rotation: v })} />
      </PropSection>

      {/* Visibility & Lock */}
      <div className="flex gap-1.5">
        <button
          onClick={() => onUpdate({ visible: !element.visible })}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium cursor-pointer border transition-all ${
            element.visible
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
              : 'bg-red-500/10 text-red-400 border-red-500/30'
          }`}
        >
          {element.visible ? <Eye size={11} /> : <EyeOff size={11} />}
          {element.visible ? 'Visible' : 'Oculto'}
        </button>
        <button
          onClick={() => onUpdate({ locked: !element.locked })}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium cursor-pointer border transition-all ${
            element.locked
              ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
              : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)]'
          }`}
        >
          {element.locked ? <Lock size={11} /> : <Unlock size={11} />}
          {element.locked ? 'Bloqueado' : 'Libre'}
        </button>
      </div>

      {/* Opacity */}
      <PropSection title="Opacidad">
        <PropInput label="%" type="number" value={Math.round((element.opacity ?? 1) * 100)} onChange={v => onUpdate({ opacity: v / 100 })} min={0} max={100} />
      </PropSection>

      {/* Z-index */}
      <PropSection title="Capa (Z-index)">
        <PropInput label="Z" type="number" value={element.zIndex ?? 1} onChange={v => onUpdate({ zIndex: v })} />
      </PropSection>

      {/* Type-specific properties */}
      {element.type === 'text' && <TextProps element={element as TextTemplateElement} onUpdate={onUpdate} />}
      {element.type === 'photo' && <PhotoProps element={element as PhotoTemplateElement} onUpdate={onUpdate} />}
      {element.type === 'qr' && <QRProps element={element as QRTemplateElement} onUpdate={onUpdate} />}
      {element.type === 'shape' && <ShapeProps element={element as ShapeTemplateElement} onUpdate={onUpdate} />}
      {element.type === 'image' && <ImageProps element={element as ImageTemplateElement} onUpdate={onUpdate} onImageUpload={onImageUpload} />}
    </div>
  );
}

/* ─── Text Properties ─── */
function TextProps({ element, onUpdate }: { element: TextTemplateElement; onUpdate: (u: Partial<TemplateElement>) => void }) {
  return (
    <>
      <PropSection title="Campo / Texto">
        <select
          value={element.field || 'custom'}
          onChange={e => onUpdate({ field: e.target.value } as Partial<TextTemplateElement>)}
          className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--foreground)] outline-none"
        >
          {CARD_FIELDS.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        {element.field === 'custom' && (
          <input
            type="text"
            value={element.text || ''}
            onChange={e => onUpdate({ text: e.target.value } as Partial<TextTemplateElement>)}
            className="w-full mt-1 bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] text-[var(--foreground)] outline-none"
            placeholder="Texto personalizado"
          />
        )}
      </PropSection>

      <PropSection title="Tipografía">
        <select
          value={element.fontFamily}
          onChange={e => { onUpdate({ fontFamily: e.target.value } as Partial<TextTemplateElement>); ensureFont(e.target.value); }}
          className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--foreground)] outline-none mb-1.5"
        >
          {FONT_FAMILIES.map(f => (
            <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-1.5">
          <PropInput label="Tamaño" type="number" value={element.fontSize} onChange={v => onUpdate({ fontSize: v } as Partial<TextTemplateElement>)} />
          <PropInput label="Peso" type="number" value={element.fontWeight} onChange={v => onUpdate({ fontWeight: v } as Partial<TextTemplateElement>)} min={100} max={900} step={100} />
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <label className="text-[9px] text-[var(--muted-foreground)]">Color</label>
          <input
            type="color"
            value={element.fontColor}
            onChange={e => onUpdate({ fontColor: e.target.value } as Partial<TextTemplateElement>)}
            className="w-6 h-6 rounded border border-[var(--border)] cursor-pointer"
          />
          <span className="text-[10px] font-mono text-[var(--muted-foreground)]">{element.fontColor}</span>
        </div>
      </PropSection>

      <PropSection title="Alineación">
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map(a => (
            <button
              key={a}
              onClick={() => onUpdate({ textAlign: a } as Partial<TextTemplateElement>)}
              className={`flex-1 px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer border transition-all ${
                element.textAlign === a
                  ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30'
                  : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)]'
              }`}
            >
              {a === 'left' ? 'Izq' : a === 'center' ? 'Centro' : 'Der'}
            </button>
          ))}
        </div>
      </PropSection>

      <PropSection title="Estilo">
        <div className="grid grid-cols-2 gap-1.5">
          <PropInput label="Espaciado" type="number" value={element.letterSpacing} onChange={v => onUpdate({ letterSpacing: v } as Partial<TextTemplateElement>)} step={0.5} />
          <PropInput label="Altura línea" type="number" value={element.lineHeight} onChange={v => onUpdate({ lineHeight: v } as Partial<TextTemplateElement>)} step={0.1} />
        </div>
        <div className="flex gap-1 mt-1.5">
          {(['none', 'uppercase', 'lowercase'] as const).map(t => (
            <button
              key={t}
              onClick={() => onUpdate({ textTransform: t } as Partial<TextTemplateElement>)}
              className={`flex-1 px-1 py-1 rounded-lg text-[9px] font-medium cursor-pointer border transition-all ${
                element.textTransform === t
                  ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30'
                  : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)]'
              }`}
            >
              {t === 'none' ? 'Normal' : t === 'uppercase' ? 'MAYÚS' : 'minús'}
            </button>
          ))}
          <button
            onClick={() => onUpdate({ fontStyle: element.fontStyle === 'italic' ? 'normal' : 'italic' } as Partial<TextTemplateElement>)}
            className={`px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer border transition-all ${
              element.fontStyle === 'italic'
                ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30'
                : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)]'
            }`}
            style={{ fontStyle: 'italic' }}
          >
            I
          </button>
        </div>
      </PropSection>
    </>
  );
}

/* ─── Photo Properties ─── */
function PhotoProps({ element, onUpdate }: { element: PhotoTemplateElement; onUpdate: (u: Partial<TemplateElement>) => void }) {
  return (
    <>
      <PropSection title="Forma de foto">
        <div className="flex gap-1">
          {(['rect', 'circle'] as const).map(s => (
            <button
              key={s}
              onClick={() => onUpdate({ shape: s } as Partial<PhotoTemplateElement>)}
              className={`flex-1 px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer border transition-all ${
                element.shape === s
                  ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30'
                  : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)]'
              }`}
            >
              {s === 'rect' ? 'Rectángulo' : 'Círculo'}
            </button>
          ))}
        </div>
      </PropSection>
      <PropSection title="Borde">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={element.borderColor}
            onChange={e => onUpdate({ borderColor: e.target.value } as Partial<PhotoTemplateElement>)}
            className="w-6 h-6 rounded border border-[var(--border)] cursor-pointer"
          />
          <PropInput label="Ancho" type="number" value={element.borderWidth} onChange={v => onUpdate({ borderWidth: v } as Partial<PhotoTemplateElement>)} />
        </div>
      </PropSection>
    </>
  );
}

/* ─── QR Properties ─── */
function QRProps({ element, onUpdate }: { element: QRTemplateElement; onUpdate: (u: Partial<TemplateElement>) => void }) {
  return (
    <>
      <PropSection title="Colores QR">
        <div className="flex items-center gap-2 mb-1">
          <label className="text-[9px] text-[var(--muted-foreground)] w-10">Frente</label>
          <input type="color" value={element.fgColor} onChange={e => onUpdate({ fgColor: e.target.value } as Partial<QRTemplateElement>)} className="w-6 h-6 rounded border border-[var(--border)] cursor-pointer" />
          <span className="text-[10px] font-mono text-[var(--muted-foreground)]">{element.fgColor}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[9px] text-[var(--muted-foreground)] w-10">Fondo</label>
          <input type="color" value={element.bgColor} onChange={e => onUpdate({ bgColor: e.target.value } as Partial<QRTemplateElement>)} className="w-6 h-6 rounded border border-[var(--border)] cursor-pointer" />
          <span className="text-[10px] font-mono text-[var(--muted-foreground)]">{element.bgColor}</span>
        </div>
      </PropSection>
      <PropSection title="Borde QR">
        <div className="flex items-center gap-2">
          <input type="color" value={element.borderColor} onChange={e => onUpdate({ borderColor: e.target.value } as Partial<QRTemplateElement>)} className="w-6 h-6 rounded border border-[var(--border)] cursor-pointer" />
          <PropInput label="Ancho" type="number" value={element.borderWidth} onChange={v => onUpdate({ borderWidth: v } as Partial<QRTemplateElement>)} />
        </div>
      </PropSection>
      <PropSection title="Etiqueta">
        <input
          type="text"
          value={element.labelText || ''}
          onChange={e => onUpdate({ labelText: e.target.value } as Partial<QRTemplateElement>)}
          className="w-full bg-[var(--af-bg3)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] text-[var(--foreground)] outline-none"
          placeholder="Texto bajo QR"
        />
        <div className="flex items-center gap-2 mt-1">
          <PropInput label="Tamaño" type="number" value={element.labelFontSize || 5} onChange={v => onUpdate({ labelFontSize: v } as Partial<QRTemplateElement>)} />
          <input type="color" value={element.labelColor || '#8A8279'} onChange={e => onUpdate({ labelColor: e.target.value } as Partial<QRTemplateElement>)} className="w-6 h-6 rounded border border-[var(--border)] cursor-pointer" />
        </div>
      </PropSection>
    </>
  );
}

/* ─── Shape Properties ─── */
function ShapeProps({ element, onUpdate }: { element: ShapeTemplateElement; onUpdate: (u: Partial<TemplateElement>) => void }) {
  return (
    <>
      <PropSection title="Tipo de forma">
        <div className="flex gap-1">
          {(['rect', 'line', 'circle'] as const).map(s => (
            <button
              key={s}
              onClick={() => onUpdate({ shapeType: s } as Partial<ShapeTemplateElement>)}
              className={`flex-1 px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer border transition-all ${
                element.shapeType === s
                  ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30'
                  : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)]'
              }`}
            >
              {s === 'rect' ? 'Rect' : s === 'line' ? 'Línea' : 'Círculo'}
            </button>
          ))}
        </div>
      </PropSection>
      <PropSection title="Relleno y borde">
        <div className="flex items-center gap-2 mb-1">
          <label className="text-[9px] text-[var(--muted-foreground)] w-10">Relleno</label>
          <input type="color" value={element.fillColor.startsWith('rgba') ? '#C9A96E' : element.fillColor} onChange={e => onUpdate({ fillColor: e.target.value } as Partial<ShapeTemplateElement>)} className="w-6 h-6 rounded border border-[var(--border)] cursor-pointer" />
          <input type="text" value={element.fillColor} onChange={e => onUpdate({ fillColor: e.target.value } as Partial<ShapeTemplateElement>)} className="flex-1 bg-[var(--af-bg3)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[10px] font-mono text-[var(--foreground)] outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[9px] text-[var(--muted-foreground)] w-10">Borde</label>
          <input type="color" value={element.borderColor === 'transparent' ? '#C9A96E' : element.borderColor} onChange={e => onUpdate({ borderColor: e.target.value } as Partial<ShapeTemplateElement>)} className="w-6 h-6 rounded border border-[var(--border)] cursor-pointer" />
          <PropInput label="Ancho" type="number" value={element.borderWidth} onChange={v => onUpdate({ borderWidth: v } as Partial<ShapeTemplateElement>)} />
          <PropInput label="Radio" type="number" value={element.borderRadius} onChange={v => onUpdate({ borderRadius: v } as Partial<ShapeTemplateElement>)} />
        </div>
      </PropSection>
    </>
  );
}

/* ─── Image Properties ─── */
function ImageProps({ element, onUpdate, onImageUpload }: { element: ImageTemplateElement; onUpdate: (u: Partial<TemplateElement>) => void; onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <>
      <PropSection title="Imagen">
        <label className="af-btn-secondary flex items-center gap-1.5 text-[10px] px-2 py-1.5 cursor-pointer justify-center w-full">
          <Upload size={12} /> Subir imagen
          <input type="file" accept="image/*" className="hidden" onChange={onImageUpload} />
        </label>
        {element.image && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="w-10 h-10 rounded border border-[var(--border)] overflow-hidden bg-[var(--af-bg3)]">
              <img src={element.image} alt="" className="w-full h-full object-cover" />
            </div>
            <button onClick={() => onUpdate({ image: '' } as Partial<ImageTemplateElement>)} className="text-[10px] text-red-400 hover:underline cursor-pointer bg-transparent border-none">Quitar</button>
          </div>
        )}
      </PropSection>
      <PropSection title="Ajuste">
        <div className="flex gap-1">
          {(['cover', 'contain'] as const).map(f => (
            <button
              key={f}
              onClick={() => onUpdate({ objectFit: f } as Partial<ImageTemplateElement>)}
              className={`flex-1 px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer border transition-all ${
                element.objectFit === f
                  ? 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30'
                  : 'bg-[var(--af-bg3)] text-[var(--muted-foreground)] border-[var(--border)]'
              }`}
            >
              {f === 'cover' ? 'Cubrir' : 'Contener'}
            </button>
          ))}
        </div>
        <PropInput label="Borde radio" type="number" value={element.borderRadius} onChange={v => onUpdate({ borderRadius: v } as Partial<ImageTemplateElement>)} />
      </PropSection>
    </>
  );
}

/* ─── Preview Modal ─── */
function PreviewModal({ template, onClose }: { template: CarnetTemplate; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--card)] rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={(_e: any) => _e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-4 text-[var(--foreground)]">Vista previa — {template.name}</h3>
        <div
          style={{
            width: template.width,
            height: template.height,
            position: 'relative',
            background: template.backgroundColor,
            borderRadius: 12,
            border: '1.5px solid #C9A96E',
            overflow: 'hidden',
            margin: '0 auto',
          }}
        >
          {template.backgroundImage && (
            <img src={template.backgroundImage} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: (template.backgroundFit || 'cover') as any, zIndex: 0 }} />
          )}
          {template.logo?.visible && template.logo.image && (
            <img src={template.logo.image} alt="" style={{ position: 'absolute', left: template.logo.x, top: template.logo.y, width: template.logo.width, height: template.logo.height, objectFit: 'contain', zIndex: 10 }} />
          )}
          {template.elements.filter(e => e.visible).sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1)).map(el => (
            <PreviewElement key={el.id} element={el} />
          ))}
        </div>
        <button onClick={onClose} className="mt-4 w-full af-btn-secondary text-[12px] py-2">Cerrar</button>
      </div>
    </div>
  );
}

function PreviewElement({ element: el }: { element: TemplateElement }) {
  const base: React.CSSProperties = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    opacity: el.opacity ?? 1,
    zIndex: el.zIndex ?? 1,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
  };

  switch (el.type) {
    case 'text': {
      const tel = el as TextTemplateElement;
      const text = tel.field && tel.field !== 'custom' ? (SAMPLE_DATA[tel.field] || '') : (tel.text || '');
      return (
        <div style={{
          ...base,
          fontFamily: `'${tel.fontFamily}', sans-serif`,
          fontSize: tel.fontSize,
          fontWeight: tel.fontWeight,
          color: tel.fontColor,
          textAlign: tel.textAlign,
          letterSpacing: tel.letterSpacing,
          textTransform: tel.textTransform as any,
          fontStyle: tel.fontStyle,
          lineHeight: tel.lineHeight,
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {text}
        </div>
      );
    }
    case 'photo': {
      const pel = el as PhotoTemplateElement;
      return (
        <div style={{
          ...base,
          borderRadius: pel.shape === 'circle' ? '50%' : 4,
          border: `${pel.borderWidth}px solid ${pel.borderColor}`,
          background: '#EDE8E0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <User size={Math.min(el.width, el.height) * 0.35} color="#C9A96E" />
        </div>
      );
    }
    case 'qr': {
      const qel = el as QRTemplateElement;
      return (
        <div style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <div style={{ padding: 3, border: `${qel.borderWidth}px solid ${qel.borderColor}`, borderRadius: 4, background: qel.bgColor }}>
            <QRCodeSVG value={`${QR_BASE_URL}/TPL-0247`} size={Math.min(qel.width - 8, qel.height - (qel.labelText ? 20 : 8))} level="M" fgColor={qel.fgColor} bgColor={qel.bgColor} />
          </div>
          {qel.labelText && <span style={{ fontSize: qel.labelFontSize || 5, color: qel.labelColor || '#8A8279', textAlign: 'center' }}>{qel.labelText}</span>}
        </div>
      );
    }
    case 'shape': {
      const sel = el as ShapeTemplateElement;
      return (
        <div style={{
          ...base,
          background: sel.fillColor,
          border: sel.borderWidth > 0 ? `${sel.borderWidth}px solid ${sel.borderColor}` : 'none',
          borderRadius: sel.shapeType === 'circle' ? '50%' : sel.shapeType === 'line' ? 0 : sel.borderRadius,
        }} />
      );
    }
    case 'image': {
      const iel = el as ImageTemplateElement;
      return (
        <div style={{ ...base, borderRadius: iel.borderRadius, overflow: 'hidden', background: '#EDE8E0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {iel.image ? <img src={iel.image} alt="" style={{ width: '100%', height: '100%', objectFit: iel.objectFit }} /> : <Image size={20} color="#C9A96E" />}
        </div>
      );
    }
    default: return null;
  }
}

/* ─── Reusable UI helpers ─── */
function PropSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[9px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1 block">{title}</label>
      {children}
    </div>
  );
}

function PropInput({ label, type, value, onChange, min, max, step }: {
  label: string; type: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] text-[var(--muted-foreground)] w-10 flex-shrink-0">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        className="flex-1 bg-[var(--af-bg3)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[11px] text-[var(--foreground)] outline-none font-mono"
      />
    </div>
  );
}
