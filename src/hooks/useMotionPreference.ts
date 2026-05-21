'use client';

import { useReducedMotion } from 'framer-motion';

/**
 * Re-export of framer-motion's useReducedMotion hook.
 * Use this to conditionally skip or simplify animations when
 * the user has enabled "prefers-reduced-motion" in their OS settings.
 *
 * Example:
 *   const prefersReduced = useMotionPreference();
 *   <motion.div
 *     initial={prefersReduced ? false : { opacity: 0 }}
 *     animate={{ opacity: 1 }}
 *     transition={prefersReduced ? { duration: 0 } : { duration: 0.2 }}
 *   />
 */
export function useMotionPreference(): boolean {
  return useReducedMotion() ?? false;
}
