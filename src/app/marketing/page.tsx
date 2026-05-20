import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Archii — Gestión de Proyectos de Construcción',
  description: 'Plataforma integral de gestión de proyectos de construcción con IA integrada, multi-tenant, y soporte offline. 27 pantallas, Kanban, presupuestos, inventarios, chat y más.',
  keywords: ['construction management', 'project management', 'ai', 'multi-tenant', 'kanban', 'budget'],
  openGraph: {
    title: 'Archii — Gestión de Proyectos de Construcción',
    description: 'Plataforma premium de gestión de proyectos de construcción potenciada por IA.',
    type: 'website',
    locale: 'es_CO',
  },
};

export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-[#0e0f11] text-[#f0f0ee] overflow-x-hidden">
      {/* Hero Section */}
      <header className="relative px-6 py-20 md:py-32 max-w-6xl mx-auto text-center">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] rounded-full bg-[#c8a96e]/5 blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-[#5b9bd5]/3 blur-[100px]" />
        </div>

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#c8a96e]/20 bg-[#c8a96e]/5 mb-8">
            <span className="w-2 h-2 rounded-full bg-[#c8a96e] animate-pulse" />
            <span className="text-[13px] text-[#c8a96e] font-medium">Beta abierta</span>
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Gestiona tus obras
            <br />
            <span className="bg-gradient-to-r from-[#c8a96e] via-[#e2c898] to-[#c8a96e] bg-clip-text text-transparent">
              con inteligencia
            </span>
          </h1>

          <p className="text-lg md:text-xl text-[#9a9b9e] max-w-2xl mx-auto mb-10 leading-relaxed">
            27 pantallas. IA integrada. Multi-tenant. La plataforma todo-en-uno para
            la gestión profesional de proyectos de construcción.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/"
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#c8a96e] to-[#e2c898] text-[#0e0f11] text-base font-semibold hover:shadow-lg hover:shadow-[#c8a96e]/25 transition-all hover:-translate-y-0.5"
            >
              Comenzar gratis
            </a>
            <a
              href="https://github.com/yecos/archii"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 rounded-2xl border border-[#252830] text-[#f0f0ee] text-base font-medium hover:bg-[#16181c] transition-all"
            >
              Ver en GitHub
            </a>
          </div>
        </div>
      </header>

      {/* Stats */}
      <section className="px-6 py-16 border-y border-[#252830]">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: '27', label: 'Pantallas' },
            { value: '38', label: 'API Routes' },
            { value: '90+', label: 'Componentes' },
            { value: '50+', label: 'Servicios' },
          ].map(stat => (
            <div key={stat.label}>
              <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#c8a96e] to-[#e2c898] bg-clip-text text-transparent mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-[#9a9b9e]">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
          Todo lo que necesitas
        </h2>
        <p className="text-center text-[#9a9b9e] mb-16 max-w-xl mx-auto">
          Arquitectura premium con las herramientas que tu equipo de construcción necesita para entregar proyectos a tiempo y dentro del presupuesto.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: '🏗️', title: 'Gestión de Proyectos', desc: 'Dashboard con KPIs, Kanban board con drag & drop, calendario, time tracking y puntuación de salud del proyecto.' },
            { icon: '🤖', title: 'IA Integrada', desc: 'Asistente de chat con Gemini, creación de tareas por voz, análisis presupuestario, y RAG con contexto del proyecto.' },
            { icon: '👥', title: 'Multi-Tenant', desc: 'Aislamiento completo de datos por espacio de trabajo. Roles Super Admin y Miembro con código de invitación.' },
            { icon: '💰', title: 'Presupuestos', desc: 'Control de gastos, facturación, tracking de presupuestos ejecutado vs. planificado con reportes financieros.' },
            { icon: '📱', title: 'PWA Offline', desc: 'Instalable como app nativa. Funciona sin conexión con sincronización inteligente y cola offline.' },
            { icon: '🔌', title: 'Integraciones', desc: 'OneDrive, WhatsApp, Calendly, GitHub, Slack, Jira, Stripe. API REST v1 con OpenAPI spec.' },
          ].map(f => (
            <div
              key={f.title}
              className="p-6 rounded-2xl border border-[#252830] bg-[#16181c] hover:border-[#c8a96e]/20 transition-all group"
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="text-base font-semibold mb-2 group-hover:text-[#c8a96e] transition-colors">{f.title}</h3>
              <p className="text-sm text-[#9a9b9e] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech Stack */}
      <section className="px-6 py-20 border-t border-[#252830]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-8" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Tech Stack
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              'Next.js 16', 'React 19', 'TypeScript 5', 'Firebase', 'Tailwind CSS 4',
              'shadcn/ui', 'Framer Motion', 'Google Gemini', 'Zustand', 'Recharts',
              '@dnd-kit', 'OneDrive API', 'Web Push', 'PWA',
            ].map(tech => (
              <span
                key={tech}
                className="px-4 py-2 rounded-xl bg-[#16181c] border border-[#252830] text-sm text-[#9a9b9e] hover:border-[#c8a96e]/30 hover:text-[#c8a96e] transition-all cursor-default"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20">
        <div className="max-w-2xl mx-auto text-center p-10 rounded-3xl border border-[#c8a96e]/20 bg-gradient-to-b from-[#c8a96e]/5 to-transparent">
          <h2 className="text-2xl md:text-3xl font-bold mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Empieza a gestionar tus obras hoy
          </h2>
          <p className="text-[#9a9b9e] mb-8">
            Open source, self-hosted, y con IA integrada. Sin vendor lock-in.
          </p>
          <a
            href="/"
            className="inline-block px-8 py-4 rounded-2xl bg-gradient-to-r from-[#c8a96e] to-[#e2c898] text-[#0e0f11] text-base font-semibold hover:shadow-lg hover:shadow-[#c8a96e]/25 transition-all"
          >
            Ir a la app
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-[#252830] text-center">
        <p className="text-sm text-[#5e5f63]">
          <span className="font-semibold text-[#9a9b9e]">Archii</span> — Open source bajo licencia MIT
        </p>
        <p className="text-xs text-[#5e5f63] mt-1">
          Next.js 16 · React 19 · Firebase · Gemini AI
        </p>
      </footer>
    </div>
  );
}
