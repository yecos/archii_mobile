/**
 * Archii Theme Registry
 * 
 * Sistema extensible de temas. Para agregar un nuevo tema:
 * 1. Agregar una entrada en THEME_REGISTRY con su id y CSS variables
 * 2. Las variables CSS se inyectan automáticamente en <html> via setProperty
 * 3. El store (ui-store) maneja la persistencia y el toggle
 * 4. El panel de temas (ThemePanel.tsx) permite al usuario cambiar
 */

export interface ThemeDefinition {
  id: string;
  label: string;
  icon: string;          // Emoji para el selector
  isDark: boolean;       // ¿Usa la clase .dark?
  description: string;   // Descripción corta
  preview: string[];     // 3-4 colores de preview para la swatch
  colors: {
    '--background': string;
    '--foreground': string;
    '--card': string;
    '--card-foreground': string;
    '--popover': string;
    '--popover-foreground': string;
    '--primary': string;
    '--primary-foreground': string;
    '--secondary': string;
    '--secondary-foreground': string;
    '--muted': string;
    '--muted-foreground': string;
    '--accent': string;
    '--accent-foreground': string;
    '--destructive': string;
    '--border': string;
    '--input': string;
    '--ring': string;
    '--chart-1': string;
    '--chart-2': string;
    '--chart-3': string;
    '--chart-4': string;
    '--chart-5': string;
    '--sidebar': string;
    '--sidebar-foreground': string;
    '--sidebar-primary': string;
    '--sidebar-primary-foreground': string;
    '--sidebar-accent': string;
    '--sidebar-accent-foreground': string;
    '--sidebar-border': string;
    '--sidebar-ring': string;
    '--af-green': string;
    '--af-amber': string;
    '--af-red': string;
    '--af-blue': string;
    '--af-purple': string;
    '--af-bg3': string;
    '--af-bg4': string;
    '--af-text3': string;
    '--af-accent': string;
    '--af-accent2': string;
  };
}

export const THEME_REGISTRY: ThemeDefinition[] = [
  // ═══════════════════════════════════════════
  //  TEMAS ORIGINALES — Luxo Dorado
  // ═══════════════════════════════════════════
  {
    id: 'dark',
    label: 'Nocturno',
    icon: '🌙',
    isDark: true,
    description: 'Oscuro elegante con acentos dorados',
    preview: ['#0e0f11', '#d4b87a', '#16181c', '#ecd4a8'],
    colors: {
      '--background': '#0e0f11',
      '--foreground': '#f0f0ee',
      '--card': '#16181c',
      '--card-foreground': '#f0f0ee',
      '--popover': '#16181c',
      '--popover-foreground': '#f0f0ee',
      '--primary': '#d4b87a',
      '--primary-foreground': '#0e0f11',
      '--secondary': '#1e2128',
      '--secondary-foreground': '#f0f0ee',
      '--muted': '#252830',
      '--muted-foreground': '#a3a4a7',
      '--accent': 'rgba(200,169,110,0.1)',
      '--accent-foreground': '#ecd4a8',
      '--destructive': '#e05555',
      '--border': 'rgba(255,255,255,0.07)',
      '--input': 'rgba(255,255,255,0.12)',
      '--ring': '#d4b87a',
      '--chart-1': '#d4b87a',
      '--chart-2': '#4caf7d',
      '--chart-3': '#e09855',
      '--chart-4': '#5b9bd5',
      '--chart-5': '#9b7ed4',
      '--sidebar': '#16181c',
      '--sidebar-foreground': '#f0f0ee',
      '--sidebar-primary': '#d4b87a',
      '--sidebar-primary-foreground': '#0e0f11',
      '--sidebar-accent': 'rgba(200,169,110,0.1)',
      '--sidebar-accent-foreground': '#ecd4a8',
      '--sidebar-border': 'rgba(255,255,255,0.07)',
      '--sidebar-ring': '#d4b87a',
      '--af-green': '#4caf7d',
      '--af-amber': '#e09855',
      '--af-red': '#e05555',
      '--af-blue': '#5b9bd5',
      '--af-purple': '#9b7ed4',
      '--af-bg3': '#1e2128',
      '--af-bg4': '#252830',
      '--af-text3': '#5e5f63',
      '--af-accent': '#d4b87a',
      '--af-accent2': '#ecd4a8',
    },
  },
  {
    id: 'light',
    label: 'Diurno',
    icon: '☀️',
    isDark: false,
    description: 'Claro cálido con tonos crema',
    preview: ['#f8f7f4', '#9e7c3e', '#ffffff', '#b8933f'],
    colors: {
      '--background': '#f8f7f4',
      '--foreground': '#1a1a1a',
      '--card': '#ffffff',
      '--card-foreground': '#1a1a1a',
      '--popover': '#ffffff',
      '--popover-foreground': '#1a1a1a',
      '--primary': '#9e7c3e',
      '--primary-foreground': '#ffffff',
      '--secondary': '#f0ece4',
      '--secondary-foreground': '#1a1a1a',
      '--muted': '#e8e5dd',
      '--muted-foreground': '#737373',
      '--accent': 'rgba(158,124,62,0.08)',
      '--accent-foreground': '#9e7c3e',
      '--destructive': '#dc3545',
      '--border': 'rgba(0,0,0,0.08)',
      '--input': 'rgba(0,0,0,0.1)',
      '--ring': '#9e7c3e',
      '--chart-1': '#9e7c3e',
      '--chart-2': '#2d8f5e',
      '--chart-3': '#c47a28',
      '--chart-4': '#3a7cc4',
      '--chart-5': '#7b5bbf',
      '--sidebar': '#ffffff',
      '--sidebar-foreground': '#1a1a1a',
      '--sidebar-primary': '#9e7c3e',
      '--sidebar-primary-foreground': '#ffffff',
      '--sidebar-accent': 'rgba(158,124,62,0.08)',
      '--sidebar-accent-foreground': '#9e7c3e',
      '--sidebar-border': 'rgba(0,0,0,0.08)',
      '--sidebar-ring': '#9e7c3e',
      '--af-green': '#2d8f5e',
      '--af-amber': '#c47a28',
      '--af-red': '#dc3545',
      '--af-blue': '#3a7cc4',
      '--af-purple': '#7b5bbf',
      '--af-bg3': '#f0ece4',
      '--af-bg4': '#e8e5dd',
      '--af-text3': '#a3a3a3',
      '--af-accent': '#9e7c3e',
      '--af-accent2': '#b8933f',
    },
  },

  // ═══════════════════════════════════════════
  //  TEMA NUEVO — Soft Pastel (Azul + Teal)
  //  Basado en: Guía de Transformación Visual v2
  // ═══════════════════════════════════════════
  {
    id: 'pastel',
    label: 'Soft Pastel',
    icon: '🎨',
    isDark: false,
    description: 'Amigable, cálido y moderno con tonos azul-teal',
    preview: ['#FAFAF8', '#6C8EBF', '#FFFFFF', '#7BB8A8'],
    colors: {
      '--background': '#FAFAF8',
      '--foreground': '#2D3436',
      '--card': '#FFFFFF',
      '--card-foreground': '#2D3436',
      '--popover': '#FFFFFF',
      '--popover-foreground': '#2D3436',
      '--primary': '#6C8EBF',
      '--primary-foreground': '#FFFFFF',
      '--secondary': '#F0F4F8',
      '--secondary-foreground': '#2D3436',
      '--muted': '#EDF0F4',
      '--muted-foreground': '#8B95A5',
      '--accent': 'rgba(108,142,191,0.08)',
      '--accent-foreground': '#6C8EBF',
      '--destructive': '#E07B7B',
      '--border': 'rgba(0,0,0,0.06)',
      '--input': 'rgba(0,0,0,0.08)',
      '--ring': '#6C8EBF',
      '--chart-1': '#6C8EBF',
      '--chart-2': '#7BB8A8',
      '--chart-3': '#E8B87D',
      '--chart-4': '#C49ABB',
      '--chart-5': '#E07B7B',
      '--sidebar': '#FFFFFF',
      '--sidebar-foreground': '#2D3436',
      '--sidebar-primary': '#6C8EBF',
      '--sidebar-primary-foreground': '#FFFFFF',
      '--sidebar-accent': 'rgba(108,142,191,0.08)',
      '--sidebar-accent-foreground': '#6C8EBF',
      '--sidebar-border': 'rgba(0,0,0,0.06)',
      '--sidebar-ring': '#6C8EBF',
      '--af-green': '#7BB8A8',
      '--af-amber': '#E8B87D',
      '--af-red': '#E07B7B',
      '--af-blue': '#6C8EBF',
      '--af-purple': '#C49ABB',
      '--af-bg3': '#F0F4F8',
      '--af-bg4': '#EDF0F4',
      '--af-text3': '#A3ACBA',
      '--af-accent': '#6C8EBF',
      '--af-accent2': '#7BB8A8',
    },
  },
  {
    id: 'pastel-dark',
    label: 'Soft Pastel Oscuro',
    icon: '🌌',
    isDark: true,
    description: 'Soft pastel con fondo oscuro suave',
    preview: ['#1A1D23', '#8AADDB', '#22262E', '#8FCEBF'],
    colors: {
      '--background': '#1A1D23',
      '--foreground': '#E8ECF0',
      '--card': '#22262E',
      '--card-foreground': '#E8ECF0',
      '--popover': '#22262E',
      '--popover-foreground': '#E8ECF0',
      '--primary': '#8AADDB',
      '--primary-foreground': '#1A1D23',
      '--secondary': '#282C36',
      '--secondary-foreground': '#E8ECF0',
      '--muted': '#303540',
      '--muted-foreground': '#8B95A5',
      '--accent': 'rgba(138,173,219,0.1)',
      '--accent-foreground': '#8AADDB',
      '--destructive': '#E89B9B',
      '--border': 'rgba(255,255,255,0.06)',
      '--input': 'rgba(255,255,255,0.08)',
      '--ring': '#8AADDB',
      '--chart-1': '#8AADDB',
      '--chart-2': '#8FCEBF',
      '--chart-3': '#E8C89D',
      '--chart-4': '#D4B0C8',
      '--chart-5': '#E89B9B',
      '--sidebar': '#22262E',
      '--sidebar-foreground': '#E8ECF0',
      '--sidebar-primary': '#8AADDB',
      '--sidebar-primary-foreground': '#1A1D23',
      '--sidebar-accent': 'rgba(138,173,219,0.1)',
      '--sidebar-accent-foreground': '#8AADDB',
      '--sidebar-border': 'rgba(255,255,255,0.06)',
      '--sidebar-ring': '#8AADDB',
      '--af-green': '#8FCEBF',
      '--af-amber': '#E8C89D',
      '--af-red': '#E89B9B',
      '--af-blue': '#8AADDB',
      '--af-purple': '#D4B0C8',
      '--af-bg3': '#282C36',
      '--af-bg4': '#303540',
      '--af-text3': '#6B7280',
      '--af-accent': '#8AADDB',
      '--af-accent2': '#8FCEBF',
    },
  },
];

/** Obtener un tema por su ID */
export function getThemeById(id: string): ThemeDefinition | undefined {
  return THEME_REGISTRY.find(t => t.id === id);
}

/** Obtener los temas disponibles agrupados */
export function getThemeGroups(): { dark: ThemeDefinition[]; light: ThemeDefinition[] } {
  return {
    dark: THEME_REGISTRY.filter(t => t.isDark),
    light: THEME_REGISTRY.filter(t => !t.isDark),
  };
}
