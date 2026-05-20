import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OnboardingStep = 'welcome' | 'create-project' | 'explore-dashboard' | 'invite-team' | 'try-ai' | 'complete';

export interface SpotlightTip {
  id: string;
  targetId: string;       // DOM element id to highlight (primary)
  fallbackTargetIds?: string[]; // Alternative IDs to try if primary not found
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  screen?: string;        // only show on this screen
  dismissed?: boolean;
}

interface OnboardingState {
  // Wizard
  wizardActive: boolean;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  startedAt: string | null;
  completedAt: string | null;

  // Spotlight tips
  spotlightTips: SpotlightTip[];
  activeSpotlightId: string | null;

  // Help panel
  helpOpen: boolean;

  // Actions
  startWizard: () => void;
  setStep: (step: OnboardingStep) => void;
  completeStep: (step: OnboardingStep) => void;
  nextStep: () => void;
  skipWizard: () => void;
  resetWizard: () => void;

  // Spotlight
  showSpotlight: (tipId: string) => void;
  dismissSpotlight: (tipId: string) => void;
  dismissAllSpotlights: () => void;

  // Help
  toggleHelp: () => void;
  setHelpOpen: (open: boolean) => void;
}

const STEP_ORDER: OnboardingStep[] = ['welcome', 'create-project', 'explore-dashboard', 'invite-team', 'try-ai', 'complete'];

const DEFAULT_SPOTLIGHT_TIPS: SpotlightTip[] = [
  {
    id: 'sidebar-nav',
    targetId: 'onboarding-sidebar-trigger',
    fallbackTargetIds: ['onboarding-sidebar-trigger-mobile'],
    title: 'Navegacion principal',
    description: 'Accede rapidamente a todas las secciones de tu proyecto desde aqui. Arrastra el borde para colapsar el sidebar.',
    position: 'right',
  },
  {
    id: 'ai-assistant',
    targetId: 'onboarding-ai-trigger',
    title: 'Asistente IA',
    description: 'Tu asistente inteligente puede ayudarte a crear tareas, analizar presupuestos y mucho mas. Desliza el panel para abrirlo.',
    position: 'left',
  },
  {
    id: 'topbar-tenant',
    targetId: 'onboarding-tenant-trigger',
    title: 'Tu espacio de trabajo',
    description: 'Aqui puedes cambiar entre espacios de trabajo si perteneces a multiples organizaciones.',
    position: 'bottom',
  },
];

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      // Wizard
      wizardActive: false,
      currentStep: 'welcome',
      completedSteps: [],
      startedAt: null,
      completedAt: null,

      // Spotlight
      spotlightTips: DEFAULT_SPOTLIGHT_TIPS,
      activeSpotlightId: null,

      // Help
      helpOpen: false,

      // Actions
      startWizard: () => {
        const state = get();
        if (state.completedAt) {
          // Already completed, reset for re-onboarding
          set({
            wizardActive: true,
            currentStep: 'welcome',
            completedSteps: [],
            startedAt: new Date().toISOString(),
            completedAt: null,
            activeSpotlightId: null,
            spotlightTips: DEFAULT_SPOTLIGHT_TIPS,
          });
        } else {
          set({
            wizardActive: true,
            currentStep: 'welcome',
            completedSteps: [],
            startedAt: new Date().toISOString(),
          });
        }
      },

      setStep: (step) => set({ currentStep: step }),

      completeStep: (step) => {
        const state = get();
        const updated = [...new Set([...state.completedSteps, step])];
        set({ completedSteps: updated });
      },

      nextStep: () => {
        const state = get();
        const currentIdx = STEP_ORDER.indexOf(state.currentStep);
        if (currentIdx < STEP_ORDER.length - 1) {
          const next = STEP_ORDER[currentIdx + 1];
          // Complete current step
          state.completeStep(state.currentStep);
          set({ currentStep: next });
          if (next === 'complete') {
            set({
              wizardActive: false,
              completedAt: new Date().toISOString(),
            });
          }
        }
      },

      skipWizard: () => {
        const state = get();
        const updated = [...new Set([...state.completedSteps, state.currentStep])];
        set({
          wizardActive: false,
          completedSteps: updated,
          completedAt: new Date().toISOString(),
        });
      },

      resetWizard: () => {
        set({
          wizardActive: false,
          currentStep: 'welcome',
          completedSteps: [],
          startedAt: null,
          completedAt: null,
          activeSpotlightId: null,
          spotlightTips: DEFAULT_SPOTLIGHT_TIPS,
        });
      },

      // Spotlight
      showSpotlight: (tipId) => set({ activeSpotlightId: tipId }),
      dismissSpotlight: (tipId) => {
        const state = get();
        set({
          activeSpotlightId: null,
          spotlightTips: state.spotlightTips.map(t =>
            t.id === tipId ? { ...t, dismissed: true } : t
          ),
        });
      },
      dismissAllSpotlights: () => {
        set({
          activeSpotlightId: null,
          spotlightTips: get().spotlightTips.map(t => ({ ...t, dismissed: true })),
        });
      },

      // Help
      toggleHelp: () => set(s => ({ helpOpen: !s.helpOpen })),
      setHelpOpen: (open) => set({ helpOpen: open }),
    }),
    {
      name: 'archii-onboarding',
      partialize: (state) => ({
        completedSteps: state.completedSteps,
        completedAt: state.completedAt,
        spotlightTips: state.spotlightTips,
      }),
    }
  )
);
