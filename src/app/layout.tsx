import type { Metadata, Viewport } from "next";
import Script from "next/script";
import ClientProviders from "./ClientProviders";
import AIFloatingWrapper from "@/components/archii/AIFloatingWrapper";
import KeyboardShortcutsInitializer from "@/components/archii/KeyboardShortcutsInitializer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Archii — Gestión de Proyectos",
    template: "%s | Archii",
  },
  description: "Plataforma integral de gestión de proyectos de arquitectura e interiorismo. Planifica, ejecuta y controla todos tus proyectos en un solo lugar.",
  keywords: ["arquitectura", "interiorismo", "gestión de proyectos", "construcción", "presupuestos", "planificación de obra", "colombia", "diseño", "obras"],
  authors: [{ name: "Archii" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Archii",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "Archii",
    title: "Archii — Gestión de Proyectos de Arquitectura",
    description: "Plataforma integral de gestión de proyectos de arquitectura e interiorismo. Planifica, ejecuta y controla todos tus proyectos en un solo lugar.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Archii — Gestión de Proyectos",
    description: "Plataforma integral de gestión de proyectos de arquitectura e interiorismo.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#d4b87a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* ── Firebase SDK URLs ── */
const FB_APP = "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js";
const FB_AUTH = "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js";
const FB_FS = "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js";
const FB_STORAGE = "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage-compat.js";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=DM+Serif+Display:ital@0;1&display=swap"
          rel="stylesheet"
        />
        {/* Favicon */}
        <link rel="icon" type="image/png" sizes="32x32" href="/icon-96.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icon-48.png" />
        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/icon-152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icon-152.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/icon-128.png" />
        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Archii" />
        {/* PWA Icons */}
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />

        {/* ── Firebase SDK — synchronous scripts, MUST be first in <head> ── */}
        {/* Using native <script> (not Next.js <Script>) to guarantee synchronous loading */}
        {/* These run BEFORE React hydrates, so firebase is always available */}
        <script src={FB_APP} />
        <script src={FB_AUTH} />
        <script src={FB_FS} />
        <script src={FB_STORAGE} />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (typeof firebase !== 'undefined' && (!firebase.apps || firebase.apps.length === 0)) {
              firebase.initializeApp({
                apiKey: "${process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ''}",
                authDomain: "${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || ''}",
                projectId: "${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ''}",
                storageBucket: "${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || ''}",
                messagingSenderId: "${process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || ''}",
                appId: "${process.env.NEXT_PUBLIC_FIREBASE_APP_ID || ''}"
              });
              try { firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(function(){}); } catch(e){}
              try { firebase.setLogLevel && firebase.setLogLevel('error'); } catch(e){}
            }
            window.__AF_FB = true;
          } catch(err) {
            console.error('[Archii] Firebase init failed:', err);
            window.__AF_FB = false;
          }
        ` }} />

        {/* Theme init — prevent FOUC (dark/light only) */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('archii-theme') || 'dark';
            if (t === 'dark') {
              document.documentElement.classList.add('dark');
              document.documentElement.style.colorScheme = 'dark';
            } else {
              document.documentElement.classList.remove('dark');
              document.documentElement.style.colorScheme = 'light';
            }
          } catch(e) {
            document.documentElement.classList.add('dark');
            document.documentElement.style.colorScheme = 'dark';
          }
        ` }} />

        {/* Color theme init — prevent flash on 7 color themes */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var ct = localStorage.getItem('archii-color-theme');
              if (ct && ct !== 'dorado') {
                document.documentElement.setAttribute('data-color-theme', ct);
              }
            } catch(e) {}
          })();
        ` }} />

        {/* Global error handler — catch and log client-side errors */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.onerror = function(msg, url, line, col, err) {
            console.error('[Archii Global Error]', msg, url, line, col, err);
            return false;
          };
          window.addEventListener('unhandledrejection', function(e) {
            console.error('[Archii Unhandled Promise]', e.reason);
          });
        ` }} />
      </head>
      <body className="antialiased bg-background text-foreground" suppressHydrationWarning>
        {/* Skip to content — keyboard accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--af-accent)] focus:text-background focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-none"
        >
          Saltar al contenido
        </a>
        {/* Register Service Worker */}
        <Script id="sw-register" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function() {});
            });
          }
        ` }} />

        {/* Listen for navigation messages from the service worker (notification click) */}
        <Script id="sw-message-listener" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', function(event) {
              if (event.data && event.data.type === 'NAVIGATE') {
                // Dispatch a custom event that React components can listen to
                window.dispatchEvent(new CustomEvent('sw-navigate', {
                  detail: event.data
                }));
              }
            });
          }
        ` }} />
        <ClientProviders>
          {children}
          <AIFloatingWrapper />
          <KeyboardShortcutsInitializer />
        </ClientProviders>
      </body>
    </html>
  );
}
