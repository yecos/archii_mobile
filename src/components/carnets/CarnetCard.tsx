'use client';
import React, { useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';

/* ─── Types ─── */
export interface CarnetData {
  id?: string;
  employeeCode: string;
  fullName: string;
  position: string;
  area: string;
  phone: string;
  email: string;
  bloodType: string;
  eps: string;
  emergencyContact: string;
  emergencyPhone: string;
  startDate: string;
  validUntil: string;
  photoBase64: string;
  city: string;
  isActive?: boolean;
  tenantName?: string;
}

interface CarnetCardProps {
  data: CarnetData;
  tenantName?: string;
  /** If true, renders at higher resolution for export */
  forExport?: boolean;
}

const GOLD = '#B8945E';
const QR_BASE_URL = 'https://archii-theta.vercel.app/carnet';

/* ─── Montserrat font import (only once) ─── */
let fontLoaded = false;
function ensureFont() {
  if (fontLoaded || typeof document === 'undefined') return;
  fontLoaded = true;
  const link = document.createElement('link');
  link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap';
  link.rel = 'stylesheet';
  document.head.appendChild(link);
}

/* ─── Card dimensions ─── */
// 8.5cm x 5.4cm at 300 DPI → 1004px x 638px
// We render at 502px x 319px (2x for retina) and CSS scales to display size
const CARD_W = 502;
const CARD_H = 319;

export default function CarnetCard({ data, tenantName, forExport }: CarnetCardProps) {
  React.useEffect(() => { ensureFont(); }, []);

  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  const displayName = tenantName || data.tenantName || 'ARCHII';
  const qrUrl = `${QR_BASE_URL}/${data.employeeCode}`;

  const isValid = data.validUntil ? new Date(data.validUntil) >= new Date() : true;
  const statusColor = isValid ? '#2d8f5e' : '#dc3545';
  const statusText = isValid ? 'VIGENTE' : 'VENCIDO';

  const formattedValidUntil = data.validUntil
    ? new Date(data.validUntil).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Sin fecha';

  /* ─── Shared style base ─── */
  const cardBase: React.CSSProperties = {
    width: forExport ? CARD_W * 2 : CARD_W,
    height: forExport ? CARD_H * 2 : CARD_H,
    fontFamily: "'Montserrat', sans-serif",
    position: 'relative',
    overflow: 'hidden',
    background: '#ffffff',
    borderRadius: forExport ? 24 : 12,
    border: `2px solid ${GOLD}`,
  };

  const scaleFactor = forExport ? 2 : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
      {/* ═══════ FRONT ═══════ */}
      <div ref={frontRef} id="carnet-front" style={cardBase}>
        {/* Gold top accent line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 4 * scaleFactor,
          background: `linear-gradient(90deg, ${GOLD}, #d4b87a, ${GOLD})`,
        }} />

        {/* Content */}
        <div style={{
          padding: `${16 * scaleFactor}px ${20 * scaleFactor}px`,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Header: Tenant name + code */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 * scaleFactor }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 * scaleFactor }}>
              {/* Logo placeholder */}
              <div style={{
                width: 22 * scaleFactor, height: 22 * scaleFactor,
                borderRadius: 4 * scaleFactor,
                background: `linear-gradient(135deg, ${GOLD}, #d4b87a)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700,
                fontSize: 9 * scaleFactor,
              }}>
                A
              </div>
              <span style={{
                fontWeight: 700,
                fontSize: 11 * scaleFactor,
                color: '#1a1a1a',
                letterSpacing: 1.5 * scaleFactor,
              }}>
                {displayName}
              </span>
            </div>
            <span style={{
              fontSize: 8 * scaleFactor,
              fontWeight: 600,
              color: GOLD,
              letterSpacing: 0.5 * scaleFactor,
            }}>
              {data.employeeCode}
            </span>
          </div>

          {/* Main content: Photo + Info */}
          <div style={{ display: 'flex', gap: 16 * scaleFactor, flex: 1 }}>
            {/* Photo */}
            <div style={{
              width: 88 * scaleFactor, height: 88 * scaleFactor,
              borderRadius: '50%',
              border: `${2.5 * scaleFactor}px solid ${GOLD}`,
              overflow: 'hidden',
              flexShrink: 0,
              background: '#f0ece4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {data.photoBase64 ? (
                <img
                  src={data.photoBase64.startsWith('data:') ? data.photoBase64 : `data:image/jpeg;base64,${data.photoBase64}`}
                  alt={data.fullName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: 28 * scaleFactor, color: '#c4b07e' }}>
                  👤
                </span>
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 * scaleFactor }}>
              <div style={{
                fontWeight: 700,
                fontSize: 15 * scaleFactor,
                color: '#1a1a1a',
                lineHeight: 1.2,
                marginBottom: 2 * scaleFactor,
              }}>
                {data.fullName}
              </div>
              <div style={{
                fontSize: 9 * scaleFactor,
                fontWeight: 500,
                color: GOLD,
                marginBottom: 4 * scaleFactor,
              }}>
                {data.position}
              </div>

              {/* Detail grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 * scaleFactor }}>
                <InfoRow icon="📞" value={data.phone} scale={scaleFactor} />
                <InfoRow icon="📧" value={data.email} scale={scaleFactor} />
                <InfoRow icon="📍" value={data.city} scale={scaleFactor} />
                <InfoRow icon="🆔" value={data.employeeCode} scale={scaleFactor} />
              </div>
            </div>
          </div>

          {/* Footer: Tagline + status */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 6 * scaleFactor,
            paddingTop: 6 * scaleFactor,
            borderTop: `1px solid rgba(184,148,94,0.2)`,
          }}>
            <span style={{
              fontSize: 6.5 * scaleFactor,
              fontStyle: 'italic',
              color: '#8a7a5e',
              letterSpacing: 0.3 * scaleFactor,
            }}>
              Identidad corporativa verificada
            </span>
            <span style={{
              fontSize: 6.5 * scaleFactor,
              fontWeight: 700,
              color: statusColor,
              letterSpacing: 1 * scaleFactor,
            }}>
              {statusText}
            </span>
          </div>
        </div>

        {/* Gold corner accents */}
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 32 * scaleFactor, height: 32 * scaleFactor,
          background: `linear-gradient(135deg, transparent 50%, rgba(184,148,94,0.08) 50%)`,
        }} />
      </div>

      {/* ═══════ BACK ═══════ */}
      <div ref={backRef} id="carnet-back" style={{ ...cardBase, background: '#faf9f6' }}>
        {/* Gold top accent line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 4 * scaleFactor,
          background: `linear-gradient(90deg, ${GOLD}, #d4b87a, ${GOLD})`,
        }} />

        <div style={{
          padding: `${14 * scaleFactor}px ${20 * scaleFactor}px`,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 * scaleFactor }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 * scaleFactor }}>
              <div style={{
                width: 16 * scaleFactor, height: 16 * scaleFactor,
                borderRadius: 3 * scaleFactor,
                background: `linear-gradient(135deg, ${GOLD}, #d4b87a)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700,
                fontSize: 7 * scaleFactor,
              }}>
                A
              </div>
              <span style={{
                fontWeight: 600,
                fontSize: 8 * scaleFactor,
                color: '#8a7a5e',
                letterSpacing: 1 * scaleFactor,
              }}>
                {displayName}
              </span>
            </div>
            <span style={{ fontSize: 7 * scaleFactor, color: '#8a7a5e', fontWeight: 500 }}>
              {data.position}{data.area ? ` · ${data.area}` : ''}
            </span>
          </div>

          {/* Main content: Info + QR */}
          <div style={{ display: 'flex', gap: 16 * scaleFactor, flex: 1 }}>
            {/* Left: Info */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 * scaleFactor }}>
              <BackInfoRow label="Tipo de sangre" value={data.bloodType || '—'} scale={scaleFactor} />
              <BackInfoRow label="EPS" value={data.eps || '—'} scale={scaleFactor} />
              <BackInfoRow label="Válido hasta" value={formattedValidUntil} scale={scaleFactor} highlight={isValid ? GOLD : '#dc3545'} />
              <BackInfoRow label="Contacto emergencia" value={data.emergencyContact || '—'} scale={scaleFactor} />
              <BackInfoRow label="Teléfono emergencia" value={data.emergencyPhone || '—'} scale={scaleFactor} />
            </div>

            {/* Right: QR Code */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4 * scaleFactor,
            }}>
              <div style={{
                padding: 4 * scaleFactor,
                border: `1.5px solid ${GOLD}`,
                borderRadius: 8 * scaleFactor,
                background: '#ffffff',
              }}>
                <QRCodeSVG
                  value={qrUrl}
                  size={64 * scaleFactor}
                  level="M"
                  fgColor="#1a1a1a"
                  bgColor="#ffffff"
                />
              </div>
              <span style={{
                fontSize: 5.5 * scaleFactor,
                color: '#8a7a5e',
                textAlign: 'center',
                letterSpacing: 0.3 * scaleFactor,
              }}>
                Escanea para conocer el perfil
              </span>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            marginTop: 6 * scaleFactor,
            paddingTop: 6 * scaleFactor,
            borderTop: `1px solid rgba(184,148,94,0.15)`,
          }}>
            <span style={{
              fontSize: 6 * scaleFactor,
              fontWeight: 600,
              color: GOLD,
              letterSpacing: 2 * scaleFactor,
            }}>
              {displayName}
            </span>
          </div>
        </div>

        {/* Gold corner accent */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0,
          width: 32 * scaleFactor, height: 32 * scaleFactor,
          background: `linear-gradient(225deg, transparent 50%, rgba(184,148,94,0.08) 50%)`,
        }} />
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */
function InfoRow({ icon, value, scale }: { icon: string; value: string; scale: number }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 * scale }}>
      <span style={{ fontSize: 7 * scale }}>{icon}</span>
      <span style={{
        fontSize: 7.5 * scale,
        color: '#4a4a4a',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {value}
      </span>
    </div>
  );
}

function BackInfoRow({ label, value, scale, highlight }: { label: string; value: string; scale: number; highlight?: string }) {
  return (
    <div>
      <div style={{ fontSize: 6 * scale, fontWeight: 600, color: '#8a7a5e', letterSpacing: 0.5 * scale, marginBottom: 1 * scale }}>
        {label}
      </div>
      <div style={{
        fontSize: 9 * scale,
        fontWeight: 500,
        color: highlight || '#1a1a1a',
      }}>
        {value}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   EXPORT UTILITIES
   ═══════════════════════════════════════ */

export async function exportPDF(data: CarnetData, tenantName?: string): Promise<void> {
  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  const frontEl = document.getElementById('carnet-front');
  const backEl = document.getElementById('carnet-back');

  if (!frontEl || !backEl) {
    throw new Error('Carnet elements not found');
  }

  // Temporarily set export mode
  const origFrontStyle = frontEl.style.cssText;
  const origBackStyle = backEl.style.cssText;

  frontEl.style.width = `${CARD_W * 2}px`;
  frontEl.style.height = `${CARD_H * 2}px`;
  backEl.style.width = `${CARD_W * 2}px`;
  backEl.style.height = `${CARD_H * 2}px`;

  try {
    const [frontCanvas, backCanvas] = await Promise.all([
      html2canvas(frontEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' }),
      html2canvas(backEl, { scale: 2, useCORS: true, backgroundColor: '#faf9f6' }),
    ]);

    // PDF: Letter size, landscape, both sides on one page
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // Card dimensions in mm (8.5cm x 5.4cm)
    const cardWmm = 85;
    const cardHmm = 54;

    // Center vertically, position front and back side by side
    const gap = 10;
    const totalW = cardWmm * 2 + gap;
    const startX = (pageW - totalW) / 2;
    const startY = (pageH - cardHmm) / 2;

    // Front
    const frontImg = frontCanvas.toDataURL('image/png');
    pdf.addImage(frontImg, 'PNG', startX, startY, cardWmm, cardHmm);

    // Back
    const backImg = backCanvas.toDataURL('image/png');
    pdf.addImage(backImg, 'PNG', startX + cardWmm + gap, startY, cardWmm, cardHmm);

    // Labels
    pdf.setFontSize(8);
    pdf.setTextColor('#8a7a5e');
    pdf.text('FRENTE', startX + cardWmm / 2, startY - 3, { align: 'center' });
    pdf.text('REVERSO', startX + cardWmm + gap + cardWmm / 2, startY - 3, { align: 'center' });

    pdf.save(`carnet-${data.employeeCode}.pdf`);
  } finally {
    // Restore original styles
    frontEl.style.cssText = origFrontStyle;
    backEl.style.cssText = origBackStyle;
  }
}

export async function exportPNG(side: 'front' | 'back', data: CarnetData): Promise<void> {
  const html2canvas = (await import('html2canvas')).default;

  const el = document.getElementById(side === 'front' ? 'carnet-front' : 'carnet-back');
  if (!el) throw new Error('Carnet element not found');

  // Temporarily enlarge for better quality
  const origStyle = el.style.cssText;
  el.style.width = `${CARD_W * 2}px`;
  el.style.height = `${CARD_H * 2}px`;

  try {
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: side === 'front' ? '#ffffff' : '#faf9f6' });
    const link = document.createElement('a');
    link.download = `carnet-${data.employeeCode}-${side}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } finally {
    el.style.cssText = origStyle;
  }
}
