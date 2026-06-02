'use client';
import React, { useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { CarnetTemplate, TemplateElement, TextTemplateElement, PhotoTemplateElement, QRTemplateElement, ShapeTemplateElement, ImageTemplateElement } from '@/lib/carnet-template-types';

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
  tenantSubtitle?: string;
  tenantNit?: string;
}

interface CarnetCardProps {
  data: CarnetData;
  tenantName?: string;
  tenantSubtitle?: string;
  tenantNit?: string;
  /** If true, renders at higher resolution for export */
  forExport?: boolean;
  /** Template for front side */
  frontTemplate?: CarnetTemplate;
  /** Template for back side */
  backTemplate?: CarnetTemplate;
  /** @deprecated Use frontTemplate / backTemplate instead */
  template?: CarnetTemplate;
}

/* ─── Design tokens ─── */
const GOLD = '#C9A96E';
const GOLD_LIGHT = '#D4B87A';
const GOLD_DARK = '#A88B52';
const CREAM = '#F8F5F0';
const CREAM_DARK = '#EDE8E0';
const TEXT_PRIMARY = '#2D2A26';
const TEXT_SECONDARY = '#5C564E';
const TEXT_MUTED = '#8A8279';
const QR_BASE_URL = 'https://archii-theta.vercel.app/carnet';

/* ─── Montserrat font import (only once) ─── */
let fontLoaded = false;
function ensureFont() {
  if (fontLoaded || typeof document === 'undefined') return;
  fontLoaded = true;
  const link = document.createElement('link');
  link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&display=swap';
  link.rel = 'stylesheet';
  document.head.appendChild(link);
}

/* ─── Card dimensions (Portrait) ─── */
// Standard ID card rotated portrait: 53.98mm × 85.6mm
// At 300 DPI: ~638 × 1004 px (export 2×)
// Display: 319 × 502 px
const CARD_W = 319;
const CARD_H = 502;

/* ═══════════════════════════════════════
   SVG ICONS (small, gold-colored)
   ═══════════════════════════════════════ */
function PhoneIcon({ size = 10, color = GOLD }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function MailIcon({ size = 10, color = GOLD }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function MapPinIcon({ size = 10, color = GOLD }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IdBadgeIcon({ size = 10, color = GOLD }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M12 9v4" />
      <path d="M8 2h8v3H8z" />
    </svg>
  );
}

function BriefcaseIcon({ size = 10, color = GOLD }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function DropletIcon({ size = 10, color = GOLD }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  );
}

function ShieldIcon({ size = 10, color = GOLD }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function HeartIcon({ size = 10, color = GOLD }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

/* ─── Sub-components ─── */

function ContactLine({ icon, value, scale }: { icon: React.ReactNode; value: string; scale: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 * scale }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {icon}
      </div>
      <span style={{
        fontSize: 7.5 * scale,
        color: TEXT_SECONDARY,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontWeight: 400,
      }}>
        {value}
      </span>
    </div>
  );
}

function BackDetailRow({ icon, label, value, scale, highlight }: { icon: React.ReactNode; label: string; value: string; scale: number; highlight?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 * scale }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', marginTop: 2 * scale }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 5.5 * scale, fontWeight: 600, color: TEXT_MUTED, letterSpacing: 0.8 * scale, textTransform: 'uppercase', marginBottom: 0.5 * scale }}>
          {label}
        </div>
        <div style={{
          fontSize: 8.5 * scale,
          fontWeight: 500,
          color: highlight || TEXT_PRIMARY,
          lineHeight: 1.3,
        }}>
          {value}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   HARDCODED FRONT CARD
   ═══════════════════════════════════════ */
function HardcodedFrontCard({ data, tenantName, tenantSubtitle, tenantNit, forExport }: {
  data: CarnetData;
  tenantName?: string;
  tenantSubtitle?: string;
  tenantNit?: string;
  forExport?: boolean;
}) {
  const displayName = tenantName || data.tenantName || 'ARCHII';
  const displaySubtitle = tenantSubtitle || data.tenantSubtitle || '';
  const displayNit = tenantNit || data.tenantNit || '';

  const isValid = data.validUntil ? new Date(data.validUntil) >= new Date() : true;
  const statusColor = isValid ? '#3D8B5E' : '#C0392B';
  const statusText = isValid ? 'VIGENTE' : 'VENCIDO';

  const s = forExport ? 2 : 1;

  const cardBase: React.CSSProperties = {
    width: CARD_W * s,
    height: CARD_H * s,
    fontFamily: "'Montserrat', sans-serif",
    position: 'relative',
    overflow: 'hidden',
    background: CREAM,
    borderRadius: 12 * s,
    border: `1.5px solid ${GOLD}`,
    boxShadow: forExport ? 'none' : `0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)`,
  };

  return (
    <div id="carnet-front" style={cardBase}>
      {/* Left vertical gold stripe */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: 5 * s,
        background: `linear-gradient(180deg, ${GOLD}, ${GOLD_DARK}, ${GOLD})`,
      }} />

      {/* Curved gold accent (bottom-left) */}
      <svg
        style={{ position: 'absolute', bottom: 0, left: 0, width: 80 * s, height: 120 * s, opacity: 0.12 }}
        viewBox="0 0 80 120"
        fill="none"
      >
        <path d="M0 120 Q0 60 40 40 Q80 20 80 0 L80 120 Z" fill={GOLD} />
      </svg>

      {/* Content area (with left padding for stripe) */}
      <div style={{
        padding: `${18 * s}px ${18 * s}px ${14 * s}px ${20 * s}px`,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Tenant name */}
        <div style={{
          fontWeight: 700,
          fontSize: 14 * s,
          color: TEXT_PRIMARY,
          letterSpacing: 3 * s,
          textTransform: 'uppercase',
          textAlign: 'center',
          lineHeight: 1.2,
        }}>
          {displayName}
        </div>

        {/* Tenant subtitle */}
        {displaySubtitle && (
          <div style={{
            fontSize: 7 * s,
            fontWeight: 500,
            color: GOLD,
            letterSpacing: 2 * s,
            textTransform: 'uppercase',
            marginTop: 2 * s,
            textAlign: 'center',
          }}>
            {displaySubtitle}
          </div>
        )}

        {/* Gold decorative line */}
        <div style={{
          width: 40 * s,
          height: 1.5 * s,
          background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
          marginTop: 8 * s,
          marginBottom: 4 * s,
        }} />

        {/* Photo */}
        <div style={{
          width: 96 * s,
          height: 96 * s,
          borderRadius: '50%',
          border: `${2.5 * s}px solid ${GOLD}`,
          overflow: 'hidden',
          flexShrink: 0,
          background: CREAM_DARK,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 4 * s,
          boxShadow: `0 2px 8px rgba(201,169,110,0.15)`,
        }}>
          {data.photoBase64 ? (
            <img
              src={data.photoBase64.startsWith('data:') ? data.photoBase64 : `data:image/jpeg;base64,${data.photoBase64}`}
              alt={data.fullName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <svg width={32 * s} height={32 * s} viewBox="0 0 24 24" fill="none" stroke={GOLD_LIGHT} strokeWidth="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
        </div>

        {/* Full name */}
        <div style={{
          fontWeight: 700,
          fontSize: 11 * s,
          color: TEXT_PRIMARY,
          textTransform: 'uppercase',
          textAlign: 'center',
          lineHeight: 1.3,
          marginTop: 8 * s,
          letterSpacing: 0.8 * s,
          maxWidth: 250 * s,
        }}>
          {data.fullName}
        </div>

        {/* Position */}
        <div style={{
          fontSize: 8 * s,
          fontWeight: 500,
          color: GOLD_DARK,
          textTransform: 'uppercase',
          letterSpacing: 1 * s,
          marginTop: 2 * s,
          textAlign: 'center',
        }}>
          {data.position}
        </div>

        {/* ID number box */}
        <div style={{
          marginTop: 8 * s,
          padding: `${3 * s}px ${14 * s}px`,
          border: `${1.5 * s}px solid ${GOLD}`,
          borderRadius: 4 * s,
          background: 'rgba(201,169,110,0.06)',
        }}>
          <span style={{
            fontSize: 9 * s,
            fontWeight: 600,
            color: TEXT_PRIMARY,
            letterSpacing: 1.5 * s,
          }}>
            ID: {data.employeeCode}
          </span>
        </div>

        {/* Contact details */}
        <div style={{
          marginTop: 8 * s,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 3.5 * s,
          paddingLeft: 20 * s,
        }}>
          {data.phone && (
            <ContactLine icon={<PhoneIcon size={9 * s} />} value={data.phone} scale={s} />
          )}
          {data.email && (
            <ContactLine icon={<MailIcon size={9 * s} />} value={data.email} scale={s} />
          )}
          {data.city && (
            <ContactLine icon={<MapPinIcon size={9 * s} />} value={data.city} scale={s} />
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Footer: Tagline + Status */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          marginTop: 6 * s,
          paddingTop: 5 * s,
          borderTop: `1px solid rgba(201,169,110,0.2)`,
        }}>
          <span style={{
            fontSize: 5.5 * s,
            fontStyle: 'italic',
            color: TEXT_MUTED,
            letterSpacing: 0.3 * s,
          }}>
            Identidad corporativa verificada
          </span>
          <span style={{
            fontSize: 6 * s,
            fontWeight: 700,
            color: statusColor,
            letterSpacing: 1 * s,
          }}>
            {statusText}
          </span>
        </div>
      </div>

      {/* Top-right gold corner accent */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 24 * s, height: 24 * s,
        background: `linear-gradient(225deg, rgba(201,169,110,0.08) 50%, transparent 50%)`,
      }} />
    </div>
  );
}

/* ═══════════════════════════════════════
   HARDCODED BACK CARD
   ═══════════════════════════════════════ */
function HardcodedBackCard({ data, tenantName, tenantSubtitle, tenantNit, forExport }: {
  data: CarnetData;
  tenantName?: string;
  tenantSubtitle?: string;
  tenantNit?: string;
  forExport?: boolean;
}) {
  const displayName = tenantName || data.tenantName || 'ARCHII';
  const displaySubtitle = tenantSubtitle || data.tenantSubtitle || '';
  const displayNit = tenantNit || data.tenantNit || '';
  const qrUrl = `${QR_BASE_URL}/${data.employeeCode}`;

  const isValid = data.validUntil ? new Date(data.validUntil) >= new Date() : true;

  const formattedValidUntil = data.validUntil
    ? new Date(data.validUntil).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Sin fecha';

  const formattedStartDate = data.startDate
    ? new Date(data.startDate).toLocaleDateString('es-CO', { year: 'numeric', month: 'short' })
    : '';

  const formattedStartEnd = data.startDate && data.validUntil
    ? `${formattedStartDate} – ${new Date(data.validUntil).toLocaleDateString('es-CO', { year: 'numeric', month: 'short' })}`
    : formattedValidUntil;

  const s = forExport ? 2 : 1;

  const cardBase: React.CSSProperties = {
    width: CARD_W * s,
    height: CARD_H * s,
    fontFamily: "'Montserrat', sans-serif",
    position: 'relative',
    overflow: 'hidden',
    background: CREAM,
    borderRadius: 12 * s,
    border: `1.5px solid ${GOLD}`,
    boxShadow: forExport ? 'none' : `0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)`,
  };

  return (
    <div id="carnet-back" style={cardBase}>
      {/* Left vertical gold stripe */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: 5 * s,
        background: `linear-gradient(180deg, ${GOLD}, ${GOLD_DARK}, ${GOLD})`,
      }} />

      {/* Subtle geometric pattern (right side) */}
      <svg
        style={{ position: 'absolute', top: 0, right: 0, width: 120 * s, height: '100%', opacity: 0.05 }}
        viewBox="0 0 120 500"
        fill="none"
      >
        <line x1="20" y1="0" x2="120" y2="200" stroke={GOLD} strokeWidth="1" />
        <line x1="40" y1="0" x2="120" y2="160" stroke={GOLD} strokeWidth="0.5" />
        <line x1="60" y1="0" x2="120" y2="120" stroke={GOLD} strokeWidth="0.5" />
        <line x1="0" y1="500" x2="120" y2="300" stroke={GOLD} strokeWidth="0.5" />
        <line x1="0" y1="450" x2="100" y2="300" stroke={GOLD} strokeWidth="0.5" />
      </svg>

      {/* Content */}
      <div style={{
        padding: `${16 * s}px ${16 * s}px ${12 * s}px ${20 * s}px`,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Header */}
        <div style={{ marginBottom: 8 * s }}>
          <div style={{
            fontWeight: 700,
            fontSize: 10 * s,
            color: TEXT_PRIMARY,
            letterSpacing: 2 * s,
            textTransform: 'uppercase',
          }}>
            {displayName}
          </div>
          {displaySubtitle && (
            <div style={{
              fontSize: 6.5 * s,
              fontWeight: 500,
              color: GOLD,
              letterSpacing: 1.5 * s,
              textTransform: 'uppercase',
              marginTop: 1 * s,
            }}>
              {displaySubtitle}
            </div>
          )}
        </div>

        {/* Gold decorative line */}
        <div style={{
          width: 30 * s,
          height: 1 * s,
          background: GOLD,
          marginBottom: 8 * s,
        }} />

        {/* Employee details with icons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 * s }}>
          {data.position && (
            <BackDetailRow icon={<BriefcaseIcon size={9 * s} />} label="Cargo" value={data.position} scale={s} />
          )}
          {data.area && (
            <BackDetailRow icon={<IdBadgeIcon size={9 * s} />} label="Area" value={data.area} scale={s} />
          )}
          {data.bloodType && (
            <BackDetailRow icon={<DropletIcon size={9 * s} />} label="Tipo de sangre" value={data.bloodType} scale={s} />
          )}
          {data.eps && (
            <BackDetailRow icon={<ShieldIcon size={9 * s} />} label="EPS" value={data.eps} scale={s} />
          )}
          {(data.startDate || data.validUntil) && (
            <BackDetailRow icon={<ShieldIcon size={9 * s} />} label="Vigencia" value={formattedStartEnd} scale={s} highlight={isValid ? GOLD_DARK : '#C0392B'} />
          )}
        </div>

        {/* QR Code */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: 8 * s,
        }}>
          <div style={{
            padding: 5 * s,
            border: `${1.5 * s}px solid ${GOLD}`,
            borderRadius: 6 * s,
            background: '#ffffff',
            boxShadow: `0 1px 4px rgba(201,169,110,0.1)`,
          }}>
            <QRCodeSVG
              value={qrUrl}
              size={68 * s}
              level="M"
              fgColor={TEXT_PRIMARY}
              bgColor="#ffffff"
            />
          </div>
          <span style={{
            fontSize: 5 * s,
            color: TEXT_MUTED,
            textAlign: 'center',
            letterSpacing: 0.3 * s,
            marginTop: 3 * s,
            fontWeight: 500,
          }}>
            Escanea para verificar identidad
          </span>
        </div>

        {/* Emergency Contact */}
        {(data.emergencyContact || data.emergencyPhone) && (
          <div style={{
            marginTop: 6 * s,
            padding: `${6 * s}px ${10 * s}px`,
            background: 'rgba(201,169,110,0.06)',
            borderRadius: 6 * s,
            border: `1px solid rgba(201,169,110,0.12)`,
          }}>
            <div style={{
              fontSize: 6 * s,
              fontWeight: 700,
              color: GOLD_DARK,
              letterSpacing: 1.5 * s,
              textTransform: 'uppercase',
              marginBottom: 2 * s,
              display: 'flex',
              alignItems: 'center',
              gap: 3 * s,
            }}>
              <HeartIcon size={8 * s} color={GOLD_DARK} />
              Contacto de emergencia
            </div>
            {data.emergencyContact && (
              <div style={{ fontSize: 8 * s, fontWeight: 500, color: TEXT_PRIMARY }}>
                {data.emergencyContact}
              </div>
            )}
            {data.emergencyPhone && (
              <div style={{ fontSize: 7.5 * s, color: TEXT_SECONDARY, marginTop: 1 * s }}>
                {data.emergencyPhone}
              </div>
            )}
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Footer: Company legal info */}
        <div style={{
          textAlign: 'center',
          marginTop: 4 * s,
          paddingTop: 5 * s,
          borderTop: `1px solid rgba(201,169,110,0.15)`,
        }}>
          {displayNit && (
            <div style={{
              fontSize: 5.5 * s,
              fontWeight: 500,
              color: TEXT_MUTED,
              letterSpacing: 0.5 * s,
            }}>
              NIT. {displayNit}
            </div>
          )}
        </div>
      </div>

      {/* Bottom-right gold corner accent */}
      <div style={{
        position: 'absolute', bottom: 0, right: 0,
        width: 32 * s, height: 32 * s,
        background: `linear-gradient(225deg, transparent 50%, rgba(201,169,110,0.06) 50%)`,
      }} />
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════ */
export default function CarnetCard({ data, tenantName, tenantSubtitle, tenantNit, forExport, template, frontTemplate, backTemplate }: CarnetCardProps) {
  useEffect(() => { ensureFont(); }, []);

  // Resolve effective templates: explicit front/back take priority, then fallback to deprecated template prop
  const effectiveFront = frontTemplate || (template?.side === 'front' ? template : undefined);
  const effectiveBack = backTemplate || (template?.side === 'back' ? template : undefined);

  // If any custom template exists, render with template support
  const hasAnyTemplate = !!(effectiveFront || effectiveBack);

  return (
    <div style={{ display: 'flex', flexDirection: 'row', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>
      {/* ═══════ FRONT ═══════ */}
      {effectiveFront ? (
        <TemplateCarnetCard data={data} template={effectiveFront} tenantName={tenantName} forExport={forExport} forceId="carnet-front" />
      ) : (
        <HardcodedFrontCard data={data} tenantName={tenantName} tenantSubtitle={tenantSubtitle} tenantNit={tenantNit} forExport={forExport} />
      )}

      {/* ═══════ BACK ═══════ */}
      {effectiveBack ? (
        <TemplateCarnetCard data={data} template={effectiveBack} tenantName={tenantName} forExport={forExport} forceId="carnet-back" />
      ) : (
        <HardcodedBackCard data={data} tenantName={tenantName} tenantSubtitle={tenantSubtitle} tenantNit={tenantNit} forExport={forExport} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   TEMPLATE-BASED RENDERING
   ═══════════════════════════════════════ */

function TemplateCarnetCard({ data, template, tenantName, forExport, forceId }: {
  data: CarnetData;
  template: CarnetTemplate;
  tenantName?: string;
  forExport?: boolean;
  /** Override the DOM id for the root element (useful for export functions that look for specific ids) */
  forceId?: string;
}) {
  const s = forExport ? 2 : 1;
  const qrUrl = `${QR_BASE_URL}/${data.employeeCode}`;

  const isValid = data.validUntil ? new Date(data.validUntil) >= new Date() : true;
  const statusText = isValid ? 'VIGENTE' : 'VENCIDO';

  // Field resolver
  const resolveField = (field?: string): string => {
    if (!field || field === 'custom') return '';
    const fieldMap: Record<string, string> = {
      fullName: data.fullName,
      employeeCode: data.employeeCode,
      position: data.position,
      area: data.area,
      phone: data.phone,
      email: data.email,
      city: data.city,
      bloodType: data.bloodType,
      eps: data.eps,
      emergencyContact: data.emergencyContact,
      emergencyPhone: data.emergencyPhone,
      startDate: data.startDate ? new Date(data.startDate).toLocaleDateString('es-CO', { year: 'numeric', month: 'short' }) : '',
      validUntil: data.validUntil ? new Date(data.validUntil).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
      tenantName: tenantName || data.tenantName || '',
      statusText,
    };
    return fieldMap[field] || '';
  };

  const cardStyle: React.CSSProperties = {
    width: template.width * s,
    height: template.height * s,
    position: 'relative',
    overflow: 'hidden',
    background: template.backgroundColor || '#F8F5F0',
    borderRadius: 12 * s,
    border: `1.5px solid ${GOLD}`,
    fontFamily: "'Montserrat', sans-serif",
    boxShadow: forExport ? 'none' : '0 4px 24px rgba(0,0,0,0.08)',
  };

  const renderEl = (el: TemplateElement) => {
    if (!el.visible) return null;
    const base: React.CSSProperties = {
      position: 'absolute',
      left: el.x * s,
      top: el.y * s,
      width: el.width * s,
      height: el.height * s,
      opacity: el.opacity ?? 1,
      zIndex: el.zIndex ?? 1,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    };

    switch (el.type) {
      case 'text': {
        const tel = el as TextTemplateElement;
        const text = tel.field && tel.field !== 'custom' ? resolveField(tel.field) : (tel.text || '');
        if (!text) return null;
        return (
          <div key={el.id} style={{
            ...base,
            fontFamily: `'${tel.fontFamily}', sans-serif`,
            fontSize: tel.fontSize * s,
            fontWeight: tel.fontWeight,
            color: tel.fontColor,
            textAlign: tel.textAlign,
            letterSpacing: tel.letterSpacing * s,
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
          <div key={el.id} style={{
            ...base,
            borderRadius: pel.shape === 'circle' ? '50%' : 4 * s,
            border: `${pel.borderWidth * s}px solid ${pel.borderColor}`,
            overflow: 'hidden',
            background: '#EDE8E0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {data.photoBase64 ? (
              <img
                src={data.photoBase64.startsWith('data:') ? data.photoBase64 : `data:image/jpeg;base64,${data.photoBase64}`}
                alt={data.fullName}
                style={{ width: '100%', height: '100%', objectFit: pel.objectFit }}
              />
            ) : (
              <svg width={32 * s} height={32 * s} viewBox="0 0 24 24" fill="none" stroke={GOLD_LIGHT} strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </div>
        );
      }
      case 'qr': {
        const qel = el as QRTemplateElement;
        return (
          <div key={el.id} style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 * s }}>
            <div style={{
              padding: 3 * s,
              border: `${qel.borderWidth * s}px solid ${qel.borderColor}`,
              borderRadius: 4 * s,
              background: qel.bgColor,
            }}>
              <QRCodeSVG
                value={qrUrl}
                size={Math.min((qel.width - 8) * s, (qel.height - (qel.labelText ? 20 : 8)) * s)}
                level="M"
                fgColor={qel.fgColor}
                bgColor={qel.bgColor}
              />
            </div>
            {qel.labelText && (
              <span style={{
                fontSize: (qel.labelFontSize || 5) * s,
                color: qel.labelColor || '#8A8279',
                textAlign: 'center',
              }}>
                {qel.labelText}
              </span>
            )}
          </div>
        );
      }
      case 'shape': {
        const sel = el as ShapeTemplateElement;
        return (
          <div key={el.id} style={{
            ...base,
            background: sel.fillColor,
            border: sel.borderWidth > 0 ? `${sel.borderWidth * s}px solid ${sel.borderColor}` : 'none',
            borderRadius: sel.shapeType === 'circle' ? '50%' : sel.shapeType === 'line' ? 0 : sel.borderRadius * s,
          }} />
        );
      }
      case 'image': {
        const iel = el as ImageTemplateElement;
        return (
          <div key={el.id} style={{
            ...base,
            borderRadius: iel.borderRadius * s,
            overflow: 'hidden',
            background: '#EDE8E0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {iel.image ? (
              <img src={iel.image} alt="" style={{ width: '100%', height: '100%', objectFit: iel.objectFit }} />
            ) : null}
          </div>
        );
      }
      default: return null;
    }
  };

  return (
    <div style={cardStyle} id={forceId || `carnet-${template.side}`}>
      {/* Background image */}
      {template.backgroundImage && (
        <img src={template.backgroundImage} alt="" style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          objectFit: (template.backgroundFit || 'cover') as any, zIndex: 0,
        }} />
      )}
      {/* Logo */}
      {template.logo?.visible && template.logo.image && (
        <img src={template.logo.image} alt="Logo" style={{
          position: 'absolute',
          left: template.logo.x * s,
          top: template.logo.y * s,
          width: template.logo.width * s,
          height: template.logo.height * s,
          objectFit: 'contain',
          zIndex: 10,
          opacity: template.logo.opacity ?? 1,
        }} />
      )}
      {/* Elements sorted by zIndex */}
      {template.elements
        .sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1))
        .map(renderEl)}
    </div>
  );
}

/* ═══════════════════════════════════════
   EXPORT UTILITIES
   ═══════════════════════════════════════ */

export async function exportPDF(data: CarnetData, tenantName?: string, tenantSubtitle?: string, tenantNit?: string): Promise<void> {
  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  const frontEl = document.getElementById('carnet-front');
  const backEl = document.getElementById('carnet-back');

  if (!frontEl || !backEl) {
    throw new Error('Carnet elements not found');
  }

  // Temporarily set export mode (double dimensions)
  const origFrontStyle = frontEl.style.cssText;
  const origBackStyle = backEl.style.cssText;

  frontEl.style.width = `${CARD_W * 2}px`;
  frontEl.style.height = `${CARD_H * 2}px`;
  backEl.style.width = `${CARD_W * 2}px`;
  backEl.style.height = `${CARD_H * 2}px`;

  try {
    const [frontCanvas, backCanvas] = await Promise.all([
      html2canvas(frontEl, { scale: 2, useCORS: true, backgroundColor: CREAM }),
      html2canvas(backEl, { scale: 2, useCORS: true, backgroundColor: CREAM }),
    ]);

    // PDF: Letter size, landscape — both portrait cards side by side
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // Card dimensions in mm (portrait: 54mm × 85.6mm)
    const cardWmm = 54;
    const cardHmm = 85.6;

    // Center vertically, position front and back side by side
    const gap = 12;
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
    pdf.setFontSize(7);
    pdf.setTextColor('#8A8279');
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
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: CREAM });
    const link = document.createElement('a');
    link.download = `carnet-${data.employeeCode}-${side}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } finally {
    el.style.cssText = origStyle;
  }
}
