'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ShieldCheck, AlertTriangle, MapPin, Phone, Mail, Building2, Heart, Droplet, Briefcase, Calendar } from 'lucide-react';

const GOLD = '#C9A96E';
const GOLD_DARK = '#A88B52';
const CREAM = '#F8F5F0';

interface CarnetPublicData {
  id: string;
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
  isActive: boolean;
  isValid: boolean;
  tenantId: string;
  tenantName: string;
}

export default function CarnetPublicPage() {
  const params = useParams();
  const employeeCode = params?.id as string;

  const [data, setData] = useState<CarnetPublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!employeeCode) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/carnets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get-by-code', employeeCode }),
        });
        const result = await res.json();
        if (!res.ok) {
          setError(result.error || 'Carnet no encontrado');
          return;
        }
        setData(result);
      } catch (err) {
        setError('Error al cargar el carnet');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [employeeCode]);

  // Font loading
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, ${CREAM} 0%, #EDE8E0 100%)`,
        fontFamily: "'Montserrat', sans-serif",
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48,
            border: `3px solid ${GOLD}`,
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{ color: '#8A8279', fontSize: 14, fontWeight: 500 }}>Verificando carnet...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, ${CREAM} 0%, #EDE8E0 100%)`,
        fontFamily: "'Montserrat', sans-serif",
        padding: 24,
      }}>
        <div style={{
          textAlign: 'center',
          background: CREAM,
          borderRadius: 24,
          padding: '48px 32px',
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 8px 40px rgba(0,0,0,0.06)',
          border: `1.5px solid ${GOLD}`,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Left stripe */}
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            width: 5,
            background: `linear-gradient(180deg, ${GOLD}, ${GOLD_DARK}, ${GOLD})`,
          }} />
          <div style={{
            width: 64, height: 64,
            borderRadius: '50%',
            background: 'rgba(192,57,43,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <AlertTriangle size={32} color="#C0392B" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#2D2A26', marginBottom: 8 }}>
            Carnet no encontrado
          </h1>
          <p style={{ fontSize: 14, color: '#5C564E', marginBottom: 24 }}>
            {error || `No se encontró un carnet con el código "${employeeCode}"`}
          </p>
          <div style={{
            fontSize: 11,
            color: '#8A8279',
            borderTop: '1px solid rgba(201,169,110,0.2)',
            paddingTop: 16,
          }}>
            Powered by <span style={{ fontWeight: 700, color: GOLD }}>Archii</span>
          </div>
        </div>
      </div>
    );
  }

  const formattedValidUntil = data.validUntil
    ? new Date(data.validUntil).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Sin fecha de vencimiento';

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(135deg, ${CREAM} 0%, #EDE8E0 100%)`,
      fontFamily: "'Montserrat', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      {/* Main Card */}
      <div style={{
        background: CREAM,
        borderRadius: 24,
        padding: '40px 36px',
        maxWidth: 460,
        width: '100%',
        boxShadow: '0 8px 40px rgba(0,0,0,0.06), 0 0 0 1px rgba(201,169,110,0.15)',
        border: `1.5px solid ${GOLD}`,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Left gold stripe */}
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: 5,
          background: `linear-gradient(180deg, ${GOLD}, ${GOLD_DARK}, ${GOLD})`,
        }} />

        {/* Curved gold accent (bottom-left) */}
        <svg
          style={{ position: 'absolute', bottom: 0, left: 0, width: 80, height: 120, opacity: 0.08 }}
          viewBox="0 0 80 120"
          fill="none"
        >
          <path d="M0 120 Q0 60 40 40 Q80 20 80 0 L80 120 Z" fill={GOLD} />
        </svg>

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Tenant header */}
          <div style={{
            textAlign: 'center',
            marginBottom: 20,
          }}>
            <div style={{
              fontWeight: 700,
              fontSize: 16,
              color: '#2D2A26',
              letterSpacing: 3,
              textTransform: 'uppercase',
            }}>
              {data.tenantName}
            </div>
            <div style={{ fontSize: 10, color: GOLD, fontWeight: 500, letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>
              Carnet Corporativo
            </div>
            {/* Gold decorative line */}
            <div style={{
              width: 40, height: 1.5,
              background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
              margin: '10px auto 0',
            }} />
          </div>

          {/* Photo + Name */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: 20,
          }}>
            <div style={{
              width: 120, height: 120,
              borderRadius: '50%',
              border: `3px solid ${GOLD}`,
              overflow: 'hidden',
              background: '#EDE8E0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              boxShadow: '0 2px 8px rgba(201,169,110,0.15)',
            }}>
              {data.photoBase64 ? (
                <img
                  src={data.photoBase64.startsWith('data:') ? data.photoBase64 : `data:image/jpeg;base64,${data.photoBase64}`}
                  alt={data.fullName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </div>

            <h1 style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#2D2A26',
              textAlign: 'center',
              marginBottom: 4,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}>
              {data.fullName}
            </h1>

            <div style={{
              fontSize: 13,
              fontWeight: 500,
              color: GOLD_DARK,
              marginBottom: 8,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}>
              {data.position}
            </div>

            {data.area && (
              <div style={{
                fontSize: 11,
                color: '#5C564E',
                background: 'rgba(201,169,110,0.08)',
                padding: '4px 14px',
                borderRadius: 999,
                border: '1px solid rgba(201,169,110,0.15)',
                letterSpacing: 0.5,
              }}>
                {data.area}
              </div>
            )}
          </div>

          {/* Status badge */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 20,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 20px',
              borderRadius: 999,
              background: data.isValid
                ? 'rgba(61,139,94,0.08)'
                : 'rgba(192,57,43,0.08)',
              border: `1px solid ${data.isValid ? 'rgba(61,139,94,0.25)' : 'rgba(192,57,43,0.25)'}`,
            }}>
              {data.isValid ? (
                <ShieldCheck size={18} color="#3D8B5E" />
              ) : (
                <AlertTriangle size={18} color="#C0392B" />
              )}
              <span style={{
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: 1.5,
                color: data.isValid ? '#3D8B5E' : '#C0392B',
              }}>
                {data.isValid ? 'VIGENTE' : 'VENCIDO'}
              </span>
            </div>
          </div>

          {/* Info grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
            marginBottom: 20,
          }}>
            <InfoItem icon={<MapPin size={13} color={GOLD} />} label="Ciudad" value={data.city} />
            <InfoItem icon={<Phone size={13} color={GOLD} />} label="Telefono" value={data.phone} />
            <InfoItem icon={<Mail size={13} color={GOLD} />} label="Email" value={data.email} />
            <InfoItem icon={<Building2 size={13} color={GOLD} />} label="Codigo" value={data.employeeCode} />
          </div>

          {/* Additional details */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
            marginBottom: 16,
            padding: '12px 14px',
            background: 'rgba(201,169,110,0.05)',
            borderRadius: 12,
            border: '1px solid rgba(201,169,110,0.1)',
          }}>
            {data.bloodType && (
              <InfoItem icon={<Droplet size={13} color={GOLD} />} label="Tipo de sangre" value={data.bloodType} />
            )}
            {data.eps && (
              <InfoItem icon={<ShieldCheck size={13} color={GOLD} />} label="EPS" value={data.eps} />
            )}
          </div>

          {/* Emergency contact */}
          {(data.emergencyContact || data.emergencyPhone) && (
            <div style={{
              padding: '12px 14px',
              background: 'rgba(201,169,110,0.06)',
              borderRadius: 12,
              border: '1px solid rgba(201,169,110,0.12)',
              marginBottom: 16,
            }}>
              <div style={{
                fontSize: 9,
                fontWeight: 700,
                color: GOLD_DARK,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <Heart size={11} color={GOLD_DARK} />
                Contacto de emergencia
              </div>
              {data.emergencyContact && (
                <div style={{ fontSize: 13, fontWeight: 500, color: '#2D2A26' }}>
                  {data.emergencyContact}
                </div>
              )}
              {data.emergencyPhone && (
                <div style={{ fontSize: 12, color: '#5C564E', marginTop: 2 }}>
                  {data.emergencyPhone}
                </div>
              )}
            </div>
          )}

          {/* Validity */}
          <div style={{
            textAlign: 'center',
            padding: '12px 0',
            borderTop: '1px solid rgba(201,169,110,0.2)',
            marginBottom: 8,
          }}>
            <div style={{
              fontSize: 9,
              color: '#8A8279',
              fontWeight: 600,
              letterSpacing: 1,
              marginBottom: 4,
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}>
              <Calendar size={11} color={GOLD} />
              Valido hasta
            </div>
            <div style={{
              fontSize: 15,
              fontWeight: 600,
              color: data.isValid ? '#2D2A26' : '#C0392B',
            }}>
              {formattedValidUntil}
            </div>
          </div>

          {/* Tagline */}
          <div style={{
            textAlign: 'center',
            fontSize: 10,
            fontStyle: 'italic',
            color: '#8A8279',
            letterSpacing: 0.3,
          }}>
            Identidad corporativa verificada
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 24,
        textAlign: 'center',
        fontSize: 11,
        color: '#8A8279',
      }}>
        Powered by <span style={{ fontWeight: 700, color: GOLD }}>Archii</span>
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  if (!value) return <div />;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
      <div style={{ marginTop: 2, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 8, fontWeight: 600, color: '#8A8279', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#2D2A26', wordBreak: 'break-all' }}>{value}</div>
      </div>
    </div>
  );
}
