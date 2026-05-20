'use client';

export default function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-dvh bg-background" style={{ height: '100dvh' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-[var(--af-accent)]/30 border-t-[var(--af-accent)] rounded-full animate-spin" />
        <div style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-[var(--af-accent)]">Archii</div>
      </div>
    </div>
  );
}
