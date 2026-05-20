'use client';
import dynamic from 'next/dynamic';

/**
 * page.tsx — Entry point
 *
 * Carga HomeContent dinámicamente SIN SSR para evitar
 * errores de Turbopack con Firebase.
 * La pantalla de carga la maneja LoadingScreen dentro de AppContext.
 */

const HomeContent = dynamic(() => import('./HomeContent'), {
  ssr: false,
});

export default function Home() {
  return <HomeContent />;
}
