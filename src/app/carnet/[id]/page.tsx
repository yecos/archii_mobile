'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ShieldCheck, AlertTriangle, MapPin, Phone, Mail, Building2 } from 'lucide-react';

const GOLD = '#B8945E';

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
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap';
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
        background: 'linear-gradient(135deg, #f8f7f4 0%, #f0ece4 100%)',
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
          <p style={{ color: '#8a7a5e', fontSize: 14 }}>Verificando carnet...</p>
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
        background: 'linear-gradient(135deg, #f8f7f4 0%, #f0ece4 100%)',
        fontFamily: "'Montserrat', sans-serif",
        padding: 24,
      }}>
        <div style={{
          textAlign: 'center',
          background: '#ffffff',
          borderRadius: 24,
          padding: '48px 32px',
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
          border: `2px solid rgba(184,148,94,0.2)`,
        }}>
          <div style={{
            width: 64, height: 64,
            borderRadius: '50%',
            background: 'rgba(220,53,69,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <AlertTriangle size={32} color="#dc3545" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>
            Carnet no encontrado
          </h1>
          <p style={{ fontSize: 14, color: '#737373', marginBottom: 24 }}>
            {error || `No se encontró un carnet con el código "${employeeCode}"`}
          </p>
          <div style={{
            fontSize: 11,
            color: '#8a7a5e',
            borderTop: '1px solid rgba(184,148,94,0.15)',
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
      background: 'linear-gradient(135deg, #f8f7f4 0%, #f0ece4 100%)',
      fontFamily: "'Montserrat', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      {/* Main Card */}
      <div style={{
        background: '#ffffff',
        borderRadius: 24,
        padding: '40px 32px',
        maxWidth: 480,
        width: '100%',
        boxShadow: '0 8px 40px rgba(0,0,0,0.08), 0 0 0 1px rgba(184,148,94,0.1)',
        border: `2px solid ${GOLD}`,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Gold top accent */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${GOLD}, #d4b87a, ${GOLD})`,
        }} />

        {/* Tenant header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 24,
        }}>
          <div style={{
            width: 32, height: 32,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${GOLD}, #d4b87a)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
          }}>
            A
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a', letterSpacing: 1 }}>
              {data.tenantName}
            </div>
            <div style={{ fontSize: 10, color: '#8a7a5e' }}>
              Carnet Corporativo
            </div>
          </div>
        </div>

        {/* Photo + Name */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 24,
        }}>
          <div style={{
            width: 120, height: 120,
            borderRadius: '50%',
            border: `3px solid ${GOLD}`,
            overflow: 'hidden',
            background: '#f0ece4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}>
            {data.photoBase64 ? (
              <img
                src={data.photoBase64.startsWith('data:') ? data.photoBase64 : `data:image/jpeg;base64,${data.photoBase64}`}
                alt={data.fullName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: 48, color: '#c4b07e' }}>👤</span>
            )}
          </div>

          <h1 style={{
            fontSize: 24,
            fontWeight: 700,
            color: '#1a1a1a',
            textAlign: 'center',
            marginBottom: 4,
          }}>
            {data.fullName}
          </h1>

          <div style={{
            fontSize: 14,
            fontWeight: 500,
            color: GOLD,
            marginBottom: 8,
          }}>
            {data.position}
          </div>

          {data.area && (
            <div style={{
              fontSize: 12,
              color: '#737373',
              background: 'rgba(184,148,94,0.08)',
              padding: '4px 12px',
              borderRadius: 999,
              border: '1px solid rgba(184,148,94,0.15)',
            }}>
              {data.area}
            </div>
          )}
        </div>

        {/* Status badge */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: 24,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 20px',
            borderRadius: 999,
            background: data.isValid
              ? 'rgba(45,143,94,0.08)'
              : 'rgba(220,53,69,0.08)',
            border: `1px solid ${data.isValid ? 'rgba(45,143,94,0.25)' : 'rgba(220,53,69,0.25)'}`,
          }}>
            {data.isValid ? (
              <ShieldCheck size={18} color="#2d8f5e" />
            ) : (
              <AlertTriangle size={18} color="#dc3545" />
            )}
            <span style={{
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: 1,
              color: data.isValid ? '#2d8f5e' : '#dc3545',
            }}>
              {data.isValid ? 'VIGENTE' : 'VENCIDO'}
            </span>
          </div>
        </div>

        {/* Info grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 24,
        }}>
          <InfoItem icon={<MapPin size={14} />} label="Ciudad" value={data.city} />
          <InfoItem icon={<Phone size={14} />} label="Teléfono" value={data.phone} />
          <InfoItem icon={<Mail size={14} />} label="Email" value={data.email} />
          <InfoItem icon={<Building2 size={14} />} label="Código" value={data.employeeCode} />
        </div>

        {/* Validity */}
        <div style={{
          textAlign: 'center',
          padding: '12px 0',
          borderTop: '1px solid rgba(184,148,94,0.15)',
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 10, color: '#8a7a5e', fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>
            VÁLIDO HASTA
          </div>
          <div style={{
            fontSize: 16,
            fontWeight: 600,
            color: data.isValid ? '#1a1a1a' : '#dc3545',
          }}>
            {formattedValidUntil}
          </div>
        </div>

        {/* Tagline */}
        <div style={{
          textAlign: 'center',
          fontSize: 10,
          fontStyle: 'italic',
          color: '#8a7a5e',
          letterSpacing: 0.3,
        }}>
          Identidad corporativa verificada
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 24,
        textAlign: 'center',
        fontSize: 11,
        color: '#8a7a5e',
      }}>
        Powered by <span style={{ fontWeight: 700, color: GOLD }}>Archii</span>
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  if (!value) return <div />;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <div style={{ color: '#B8945E', marginTop: 2, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 9, fontWeight: 600, color: '#8a7a5e', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#1a1a1a', wordBreak: 'break-all' }}>{value}</div>
      </div>
    </div>
  );
}
