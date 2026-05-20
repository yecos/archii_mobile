export default function Loading() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50"
      style={{
        backgroundColor: 'var(--background, #0e0f11)',
        animation: 'af-loadFadeIn 0.6s ease-out',
      }}
    >
      {/* Logo */}
      <h1
        className="text-4xl sm:text-5xl font-bold tracking-tight mb-3"
        style={{
          fontFamily: "'DM Serif Display', serif",
          color: 'var(--af-accent, #c8a96e)',
        }}
      >
        Archii
      </h1>
      <span className="text-xs font-bold tracking-wider uppercase mb-10 px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(200,169,110,0.12)', color: 'var(--af-accent, #c8a96e)' }}>
        v2.0 Premium
      </span>

      {/* Spinning ring */}
      <div
        className="w-10 h-10 rounded-full animate-spin mb-5"
        style={{
          border: '3px solid var(--af-bg4, #252830)',
          borderTopColor: 'var(--af-accent, #c8a96e)',
        }}
      />

      {/* Loading text */}
      <p
        className="text-sm tracking-widest uppercase"
        style={{
          color: 'var(--af-text3, #5e5f63)',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Cargando...
      </p>

      <style>{`
        @keyframes af-loadFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
