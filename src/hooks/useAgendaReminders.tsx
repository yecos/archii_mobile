/**
 * useAgendaReminders — Client-side timer that checks every 30 seconds
 * if any agenda activity is about to start and fires notifications.
 *
 * Notifies at two thresholds:
 *   1. 15 minutes before — "Tu actividad empieza en 15 min"
 *   2. 5 minutes before — "¡Tu actividad empieza en 5 min!"
 *
 * Deduplicates using a Set of notified task IDs + threshold keys
 * so each task only triggers once per threshold per session.
 *
 * Wired into AppContext — receives tasks array and notification helpers.
 */

import { useEffect, useRef } from 'react';
import type { Task } from '@/lib/types';

/* ===== Configuration ===== */
/** Minutes before an activity starts to trigger the first notification */
const FIRST_THRESHOLD_MIN = 15;
/** Minutes before an activity starts to trigger the urgent notification */
const URGENT_THRESHOLD_MIN = 5;
/** How often (ms) to check for upcoming activities */
const CHECK_INTERVAL_MS = 30_000; // 30 seconds

/* ===== Types ===== */
interface AgendaReminderDeps {
  tasks: Task[];
  authUserId: string | undefined;
  sendNotif: (title: string, body: string, icon?: string, tag?: string, data?: any) => void;
  bufferedNotify: (type: string, data: any) => void;
}

/* ===== Helpers ===== */

/**
 * Get current time in the user's local timezone as hour + minutes.
 * Returns { hour: 0-23, minute: 0-59 }
 */
function getLocalTime(): { hour: number; minute: number } {
  const now = new Date();
  return { hour: now.getHours(), minute: now.getMinutes() };
}

/** Get today's date as YYYY-MM-DD in local timezone */
function getLocalTodayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calculate minutes until a given hour today.
 * If the hour has already passed, returns a negative number.
 */
function minutesUntilHour(targetHour: number): number {
  const { hour, minute } = getLocalTime();
  return (targetHour - hour) * 60 - minute;
}

/* ===== Hook ===== */
export function useAgendaReminders(deps: AgendaReminderDeps) {
  const { tasks, authUserId, sendNotif, bufferedNotify } = deps;

  // Track which task+threshold combos have been notified this session
  const notifiedRef = useRef<Set<string>>(new Set());

  // Keep latest deps in ref so the interval callback always has fresh values
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    if (!authUserId) return;

    const check = () => {
      const currentDeps = depsRef.current;
      const { tasks: currentTasks, authUserId: uid, sendNotif: notify, bufferedNotify: bufNotify } = currentDeps;

      if (!uid) return;

      const todayKey = getLocalTodayKey();

      // Filter to today's agenda items with hourSlots, not completed
      const todayAgendaItems = currentTasks.filter(t => {
        const meta = t.data?.agendaMeta;
        if (!meta) return false;
        if (meta.dayKey !== todayKey) return false;
        if (!meta.hourSlots || meta.hourSlots.length === 0) return false;
        if (t.data?.status === 'Completado') return false;
        return true;
      });

      for (const task of todayAgendaItems) {
        const meta = task.data.agendaMeta!;
        const startHour = Math.min(...meta.hourSlots);

        // Check if this user should be notified
        const isAssignee = task.data.assigneeId === uid;
        const isParticipant = (meta.participantIds || []).includes(uid);
        const isCreator = task.data.createdBy === uid;
        if (!isAssignee && !isParticipant && !isCreator) continue;

        const minsUntil = minutesUntilHour(startHour);

        // Check 15-minute threshold
        const key15 = `${task.id}-15`;
        if (minsUntil > 0 && minsUntil <= FIRST_THRESHOLD_MIN && !notifiedRef.current.has(key15)) {
          notifiedRef.current.add(key15);

          const h12 = startHour === 0 || startHour === 12
            ? (startHour === 0 ? '12:00 am' : '12:00 pm')
            : startHour > 12
              ? `${startHour - 12}:00 pm`
              : `${startHour}:00 am`;

          // In-app notification
          notify(
            `⏰ Actividad en ${Math.round(minsUntil)} min`,
            `"${task.data.title}" empieza a las ${h12}`,
            '⏰',
            `agenda-15-${task.id}`,
            { type: 'agenda', screen: 'weeklyAgenda', itemId: task.id }
          );

          // External notifications (push, WhatsApp, email)
          bufNotify('agendaStarting', {
            uid,
            title: task.data.title,
            startHour,
            minutesLeft: Math.round(minsUntil),
          });
        }

        // Check 5-minute urgent threshold
        const key5 = `${task.id}-5`;
        if (minsUntil > 0 && minsUntil <= URGENT_THRESHOLD_MIN && !notifiedRef.current.has(key5)) {
          notifiedRef.current.add(key5);

          const h12 = startHour === 0 || startHour === 12
            ? (startHour === 0 ? '12:00 am' : '12:00 pm')
            : startHour > 12
              ? `${startHour - 12}:00 pm`
              : `${startHour}:00 am`;

          // In-app notification (urgent)
          notify(
            `🔴 ¡Tu actividad empieza en ${Math.round(minsUntil)} min!`,
            `"${task.data.title}" a las ${h12}`,
            '🔴',
            `agenda-5-${task.id}`,
            { type: 'agenda', screen: 'weeklyAgenda', itemId: task.id }
          );

          // External notifications (urgent)
          bufNotify('agendaStarting', {
            uid,
            title: task.data.title,
            startHour,
            minutesLeft: Math.round(minsUntil),
          });
        }

        // Auto-start notification (0 minutes left)
        const key0 = `${task.id}-0`;
        if (minsUntil <= 0 && minsUntil > -2 && !notifiedRef.current.has(key0)) {
          notifiedRef.current.add(key0);

          const h12 = startHour === 0 || startHour === 12
            ? (startHour === 0 ? '12:00 am' : '12:00 pm')
            : startHour > 12
              ? `${startHour - 12}:00 pm`
              : `${startHour}:00 am`;

          // In-app notification (starting now)
          notify(
            '🚀 ¡Tu actividad empieza ahora!',
            `"${task.data.title}" a las ${h12}`,
            '🚀',
            `agenda-0-${task.id}`,
            { type: 'agenda', screen: 'weeklyAgenda', itemId: task.id }
          );

          // External notifications (starting now)
          bufNotify('agendaStarting', {
            uid,
            title: task.data.title,
            startHour,
            minutesLeft: 0,
          });
        }
      }

      // Clean up old entries from notifiedRef (older than 2 hours) to prevent memory leak
      // Since we use task ID + threshold keys, they're naturally unique per day.
      // But we reset when the day changes, which we handle below.
    };

    // Run first check immediately
    check();

    // Set up interval
    const intervalId = setInterval(check, CHECK_INTERVAL_MS);

    // Reset notified set at midnight
    const currentDay = getLocalTodayKey();
    const midnightCheck = setInterval(() => {
      const newDay = getLocalTodayKey();
      if (newDay !== currentDay) {
        notifiedRef.current.clear();
      }
    }, 60_000); // Check every minute for day change

    return () => {
      clearInterval(intervalId);
      clearInterval(midnightCheck);
    };
  }, [authUserId]); // Only re-create effect when auth user changes
}
