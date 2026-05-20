'use client';
import React, { useEffect } from 'react';
import { useOnboardingStore } from '@/stores/onboarding-store';
import OnboardingWizard from './OnboardingWizard';
import OnboardingSpotlight from './OnboardingSpotlight';
import { HelpButton } from './HelpButton';

/**
 * OnboardingProvider — wraps all onboarding components and handles auto-trigger logic.
 *
 * - First-time users: triggers the wizard after tenant selection
 * - Completed onboarding: shows spotlight tips for unvisited features
 * - Always renders: HelpButton (floating ? button) + Spotlight overlay
 *
 * Place this inside the main app tree (after tenantReady check in HomeContent).
 */
export default function OnboardingProvider() {
  const {
    wizardActive,
    completedAt,
    spotlightTips,
    startWizard,
    showSpotlight,
  } = useOnboardingStore();

  // Auto-trigger: first time user enters the app (only if never completed)
  useEffect(() => {
    if (!completedAt && !wizardActive) {
      // Small delay to let the UI settle after tenant selection
      const timer = setTimeout(() => {
        startWizard();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [completedAt, wizardActive, startWizard]);

  // Auto-trigger spotlight tips after wizard completion
  useEffect(() => {
    if (completedAt && !wizardActive) {
      const firstPending = spotlightTips.find(t => !t.dismissed);
      if (firstPending) {
        const timer = setTimeout(() => {
          showSpotlight(firstPending.id);
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [completedAt, wizardActive, spotlightTips, showSpotlight]);

  return (
    <>
      <OnboardingWizard />
      <OnboardingSpotlight />
      <HelpButton />
    </>
  );
}
