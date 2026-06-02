'use client';
import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { ZoomIn, ZoomOut, RotateCcw, Check, X } from 'lucide-react';
import { toast } from 'sonner';

/**
 * PhotoCropperModal — Modal de recorte de foto para carnets.
 * Muestra la imagen con un área de recorte circular para encuadrar la cara.
 * Permite zoom, paneo y rotación.
 * Genera una imagen cuadrada recortada (lista para mostrarse en círculo).
 *
 * Renders via React Portal at document.body level to ensure it appears
 * above any Radix Dialog / CenterModal that might be open underneath.
 */

interface PhotoCropperModalProps {
  /** Data URL de la imagen original a recortar */
  imageSrc: string;
  /** Callback con la imagen recortada en formato base64 (JPEG) */
  onCropComplete: (croppedBase64: string) => void;
  /** Callback para cancelar */
  onCancel: () => void;
  /** Tamaño de salida en px (default 400) */
  outputSize?: number;
}

export default function PhotoCropperModal({
  imageSrc,
  onCropComplete,
  onCancel,
  outputSize = 400,
}: PhotoCropperModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropChange = useCallback((newCrop: Point) => {
    setCrop(newCrop);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const handleCropComplete = useCallback((_croppedArea: Area, croppedAreaPx: Area) => {
    setCroppedAreaPixels(croppedAreaPx);
  }, []);

  const handleConfirm = useCallback(async () => {
    try {
      setProcessing(true);
      const result = await getCroppedImg(imageSrc, croppedAreaPixels!, rotation, outputSize);
      if (!result || result.length < 100) {
        toast.error('Error al recortar la foto. Intenta de nuevo.');
        return;
      }
      onCropComplete(result);
      toast.success('Foto actualizada');
    } catch (err) {
      console.error('Error cropping image:', err);
      toast.error('Error al procesar la foto. Intenta de nuevo.');
    } finally {
      setProcessing(false);
    }
  }, [imageSrc, croppedAreaPixels, rotation, outputSize, onCropComplete]);

  const modal = (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center animate-fadeIn">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-[95vw] max-w-[520px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Encuadrar foto</h3>
          <button
            onClick={onCancel}
            className="w-7 h-7 rounded-lg hover:bg-[var(--af-bg3)] flex items-center justify-center cursor-pointer bg-transparent border-none"
          >
            <X size={16} className="text-[var(--muted-foreground)]" />
          </button>
        </div>

        {/* Cropper Area */}
        <div className="relative w-full bg-black" style={{ height: 380 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            cropShape="round"
            cropSize={{ width: 260, height: 260 }}
            showGrid={false}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={handleCropComplete}
            style={{
              containerStyle: { background: '#000' },
              cropAreaStyle: { border: '2px solid rgba(255,255,255,0.3)' },
            }}
          />
        </div>

        {/* Controls */}
        <div className="px-5 py-3 space-y-3">
          {/* Zoom slider */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setZoom(z => Math.max(1, z - 0.1))}
              className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg4)] transition-colors flex-shrink-0"
            >
              <ZoomOut size={14} className="text-[var(--muted-foreground)]" />
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="flex-1 accent-[var(--af-accent)]"
            />
            <button
              onClick={() => setZoom(z => Math.min(3, z + 0.1))}
              className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg4)] transition-colors flex-shrink-0"
            >
              <ZoomIn size={14} className="text-[var(--muted-foreground)]" />
            </button>
          </div>

          {/* Rotation */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setRotation(r => r - 90)}
              className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg4)] transition-colors flex-shrink-0"
            >
              <RotateCcw size={14} className="text-[var(--muted-foreground)]" />
            </button>
            <div className="flex-1 text-[11px] text-[var(--muted-foreground)]">
              Arrastra la imagen para centrar la cara en el círculo. Usa el zoom para ajustar el tamaño.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
          <button
            onClick={onCancel}
            className="af-btn-secondary text-[12px] px-4 py-2 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={processing || !croppedAreaPixels}
            className="af-btn-primary flex items-center gap-2 text-[12px] px-4 py-2 disabled:opacity-50 cursor-pointer"
          >
            {processing ? (
              <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Procesando...</>
            ) : (
              <><Check size={14} /> Aplicar</>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // Render via Portal so this always appears above any Radix Dialog / CenterModal
  if (typeof window === 'undefined') return null;
  return createPortal(modal, document.body);
}

/**
 * rotateSize — Calcula el bounding box de una imagen rotada.
 * Basado en la documentación oficial de react-easy-crop.
 */
function rotateSize(width: number, height: number, rotation: number): { width: number; height: number } {
  const rotRad = (rotation * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(rotRad)) * width + Math.abs(Math.sin(rotRad)) * height,
    height: Math.abs(Math.sin(rotRad)) * width + Math.abs(Math.cos(rotRad)) * height,
  };
}

/**
 * getCroppedImg — Genera la imagen recortada usando canvas.
 * Implementación basada en la documentación oficial de react-easy-crop.
 *
 * Pasos:
 * 1. Dibuja la imagen rotada en un canvas del tamaño del bounding box
 * 2. Extrae los datos de imagen del canvas
 * 3. Crea un canvas del tamaño del recorte y usa putImageData con offset
 *    para posicionar la región seleccionada en (0,0)
 * 4. Redimensiona al tamaño de salida deseado
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number = 0,
  outputSize: number = 400
): Promise<string> {
  const image = new Image();
  image.src = imageSrc;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load image'));
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const rotRad = (rotation * Math.PI) / 180;

  // Calcular el bounding box de la imagen rotada
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation);

  // Dibujar la imagen rotada en un canvas del tamaño del bounding box
  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, bBoxWidth, bBoxHeight);
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  // Extraer los datos de la imagen completa rotada
  const data = ctx.getImageData(0, 0, bBoxWidth, bBoxHeight);

  // Crear canvas del tamaño del recorte y posicionar los datos
  // putImageData coloca los datos empezando en (dx, dy), así que
  // con offset (-pixelCrop.x, -pixelCrop.y) la región del recorte
  // queda posicionada en (0, 0)
  const cropCanvas = document.createElement('canvas');
  const cropCtx = cropCanvas.getContext('2d')!;
  cropCanvas.width = pixelCrop.width;
  cropCanvas.height = pixelCrop.height;

  cropCtx.putImageData(
    data,
    Math.round(-pixelCrop.x),
    Math.round(-pixelCrop.y)
  );

  // Redimensionar al tamaño de salida deseado
  const outputCanvas = document.createElement('canvas');
  const outputCtx = outputCanvas.getContext('2d')!;
  outputCanvas.width = outputSize;
  outputCanvas.height = outputSize;

  outputCtx.drawImage(
    cropCanvas,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize
  );

  return outputCanvas.toDataURL('image/jpeg', 0.9);
}
