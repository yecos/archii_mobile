// Priority colors for badges (RFIs, Submittals, Punch List, Tasks)
export const PRIO_COLORS: Record<string, string> = {
  'Alta': 'bg-red-500/10 text-red-400 border-red-500/30',
  'Media': 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  'Baja': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  'Crítica': 'bg-purple-500/10 text-purple-400 border-purple-500/30',
};

// Location colors for Punch List items
export const LOC_COLORS: Record<string, string> = {
  'Fachada': 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  'Interior': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  'Estructura': 'bg-gray-500/10 text-gray-400 border-gray-500/30',
  'Instalaciones': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  'Acabados': 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  'Terraza': 'bg-teal-500/10 text-teal-400 border-teal-500/30',
  'Zonas comunes': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  'Otro': 'bg-[var(--af-bg4)] text-[var(--muted-foreground)] border-[var(--border)]',
};

// Category colors for Budget/Expenses
export const CAT_COLORS: Record<string, string> = {
  'Materiales': '#6366f1',
  'Mano de obra': '#f59e0b',
  'Equipos': '#10b981',
  'Transporte': '#3b82f6',
  'Subcontratos': '#ef4444',
  'Permisos': '#8b5cf6',
  'Administración': '#ec4899',
  'Otros': '#6b7280',
};
