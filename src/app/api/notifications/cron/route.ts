/**
 * POST /api/notifications/cron
 *
 * Vercel Cron Job endpoint — executes scheduled notification checks.
 * Called automatically by Vercel on configured schedules.
 *
 * This endpoint handles:
 * 1. Task due reminders (tasks due tomorrow → Push + Email)
 * 2. Task overdue alerts (tasks past due → Push + WhatsApp)
 * 3. Meeting reminders (meetings in 1 hour → Push + WhatsApp)
 * 4. Daily agenda reminder (7am → Push summary of today's activities)
 * 5. Weekly summary (Monday 8am → Email full summary)
 *
 * Security: Requires CRON_SECRET env var to prevent unauthorized calls.
 * In Vercel, cron requests include this header automatically.
 */

import { NextRequest, NextResponse } from 'next/server';

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
  // ── Verify cron secret ──
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, any> = {};
  const errors: string[] = [];

  try {
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();

    // Parse optional "type" query param for selective execution
    const url = new URL(request.url);
    const forceType = url.searchParams.get('type'); // 'hourly' | 'daily' | 'weekly'

    // ── 1. TASK DUE REMINDERS (tasks due in the next 24 hours) ──
    if (!forceType || forceType === 'hourly') {
      try {
        results.taskDueReminders = await checkTaskDueReminders(db);
      } catch (err: any) {
        errors.push(`taskDueReminders: ${err.message}`);
      }
    }

    // ── 2. TASK OVERDUE ALERTS (tasks past their due date, not completed) ──
    if (!forceType || forceType === 'hourly') {
      try {
        results.taskOverdueAlerts = await checkTaskOverdueAlerts(db);
      } catch (err: any) {
        errors.push(`taskOverdueAlerts: ${err.message}`);
      }
    }

    // ── 3. MEETING REMINDERS (meetings starting in ~1 hour) ──
    if (!forceType || forceType === 'hourly') {
      try {
        results.meetingReminders = await checkMeetingReminders(db);
      } catch (err: any) {
        errors.push(`meetingReminders: ${err.message}`);
      }
    }

    // ── 4. DAILY AGENDA REMINDER (today's agenda items) ──
    if (!forceType || forceType === 'daily') {
      try {
        results.dailyAgendaReminder = await checkDailyAgendaReminder(db);
      } catch (err: any) {
        errors.push(`dailyAgendaReminder: ${err.message}`);
      }
    }

    // ── 5. WEEKLY SUMMARY (Mondays) ──
    if (!forceType || forceType === 'weekly') {
      try {
        results.weeklySummary = await checkWeeklySummary(db);
      } catch (err: any) {
        errors.push(`weeklySummary: ${err.message}`);
      }
    }

    // ── 6. Persist notification history to Firestore ──
    // (This is handled client-side now, but we clean up old entries here)
    try {
      await cleanupOldNotifications(db);
    } catch (err: any) {
      errors.push(`cleanup: ${err.message}`);
    }

    return NextResponse.json({
      ok: true,
      executedAt: new Date().toISOString(),
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[Archii Cron] Fatal error:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message, results, errors },
      { status: 500 }
    );
  }
}

// Also support GET for easy testing
export async function GET(request: NextRequest) {
  return POST(request);
}

/* ================================================================
   NOTIFICATION CHECK FUNCTIONS
   ================================================================ */

interface UserDoc {
  uid: string;
  email: string;
  displayName?: string;
  tenantId?: string;
  whatsappPhone?: string;
  pushSubscription?: any;
  emailNotifPrefs?: any;
}

/** Get all active users with their notification preferences */
async function getActiveUsers(db: any): Promise<UserDoc[]> {
  const snap = await db.collection('users').get();
  return snap.docs
    .map((doc: any) => ({ uid: doc.id, ...doc.data() }))
    .filter((u: any) => u.email);
}

/** Check if we already sent this notification recently (dedup) */
async function wasRecentlyNotified(db: any, key: string, hours: number = 24): Promise<boolean> {
  const doc = await db.collection('cronNotifLog').doc(key).get();
  if (!doc.exists) return false;
  const lastSent = doc.data()?.sentAt;
  if (!lastSent) return false;
  const sentDate = lastSent.toDate ? lastSent.toDate() : new Date(lastSent);
  return Date.now() - sentDate.getTime() < hours * 60 * 60 * 1000;
}

/** Mark a notification as sent (for dedup) */
async function markNotified(db: any, key: string): Promise<void> {
  await db.collection('cronNotifLog').doc(key).set({
    sentAt: new Date(),
    key,
  }, { merge: true });
}

/** Send push notification to a user via internal API call */
async function sendPushToUser(userId: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
  try {
    const { getAdminDb } = await import('@/lib/firebase-admin');
    const db = getAdminDb();
    const subDoc = await db.collection('pushSubscriptions').doc(userId).get();
    if (!subDoc.exists) return;

    const subData = subDoc.data();
    if (!subData?.active || !subData?.endpoint) return;

    const webpush = (await import('web-push')).default;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@archii.app';
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!privateKey || !publicKey) return;

    webpush.setVapidDetails(subject, publicKey, privateKey);

    await webpush.sendNotification(
      {
        endpoint: subData.endpoint,
        keys: subData.keys,
      },
      JSON.stringify({ title, body, icon: '/icon-192.png', data: data || {} }),
      { TTL: 86400, urgency: 'normal' }
    );
  } catch (err: any) {
    // Silently fail — don't block other notifications
    console.warn(`[Archii Cron] Push failed for ${userId}:`, err.message?.substring(0, 80));
  }
}

/** Send WhatsApp message to a user */
async function sendWhatsAppToUser(db: any, userId: string, message: string): Promise<void> {
  try {
    const linkDoc = await db.collection('whatsappLinks').doc(userId).get();
    if (!linkDoc.exists) return;
    const linkData = linkDoc.data();
    if (!linkData?.active || !linkData?.whatsappPhone) return;

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp-service');
    await sendWhatsAppMessage(linkData.whatsappPhone, message);
  } catch (err: any) {
    console.warn(`[Archii Cron] WhatsApp failed for ${userId}:`, err.message?.substring(0, 80));
  }
}

/** Send email to a user */
async function sendEmailToUser(email: string, subject: string, html: string): Promise<void> {
  try {
    const { sendEmail } = await import('@/lib/email-service');
    await sendEmail({ to: email, subject, html });
  } catch (err: any) {
    console.warn(`[Archii Cron] Email failed for ${email}:`, err.message?.substring(0, 80));
  }
}

/** Format a date as YYYY-MM-DD */
function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Get today as YYYY-MM-DD in Colombia timezone (UTC-5) */
function todayColombia(): string {
  const now = new Date();
  const colombiaOffset = -5 * 60; // UTC-5
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const colombiaTime = new Date(utcMs + colombiaOffset * 60000);
  return colombiaTime.toISOString().split('T')[0];
}

/** Get current hour in Colombia timezone */
function colombiaHour(): number {
  const now = new Date();
  const colombiaOffset = -5 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const colombiaTime = new Date(utcMs + colombiaOffset * 60000);
  return colombiaTime.getHours();
}

/* ── 1. TASK DUE REMINDERS ── */
async function checkTaskDueReminders(db: any): Promise<{ sent: number; skipped: number }> {
  const today = todayColombia();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = fmtDate(tomorrow);

  // Get all non-completed tasks due within the next 2 days
  const snap = await db.collection('tasks')
    .where('status', '!=', 'Completado')
    .get();

  let sent = 0;
  let skipped = 0;

  const tasks = snap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((t: any) => t.dueDate && (t.dueDate === today || t.dueDate === tomorrowStr));

  for (const task of tasks) {
    const daysLeft = task.dueDate === today ? 0 : 1;
    const label = daysLeft === 0 ? 'HOY' : 'manana';
    const dedupKey = `taskDue-${task.id}-${today}`;

    if (await wasRecentlyNotified(db, dedupKey, 12)) {
      skipped++;
      continue;
    }

    // Get assignees
    const assigneeIds: string[] = [];
    if (task.assigneeId) assigneeIds.push(task.assigneeId);
    if (Array.isArray(task.assigneeIds)) assigneeIds.push(...task.assigneeIds);

    for (const uid of [...new Set(assigneeIds)]) {
      const title = daysLeft === 0
        ? `⚠️ Tarea vence HOY: ${task.title}`
        : `📅 Tarea vence manana: ${task.title}`;

      // Push
      await sendPushToUser(uid, title, `Prioridad: ${task.priority || 'Media'}`, { screen: 'tasks', itemId: task.id });

      // WhatsApp for urgent tasks (high priority or due today)
      if (daysLeft === 0 || task.priority === 'Alta') {
        await sendWhatsAppToUser(db, uid, `${title}\nPrioridad: ${task.priority || 'Media'}\nProyecto: ${task.projectName || 'N/A'}`);
      }
    }

    await markNotified(db, dedupKey);
    sent++;
  }

  return { sent, skipped };
}

/* ── 2. TASK OVERDUE ALERTS ── */
async function checkTaskOverdueAlerts(db: any): Promise<{ sent: number; skipped: number }> {
  const today = todayColombia();

  const snap = await db.collection('tasks')
    .where('status', '!=', 'Completado')
    .get();

  let sent = 0;
  let skipped = 0;

  const overdueTasks = snap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((t: any) => t.dueDate && t.dueDate < today);

  for (const task of overdueTasks) {
    const dedupKey = `taskOverdue-${task.id}-${today}`;
    if (await wasRecentlyNotified(db, dedupKey, 24)) {
      skipped++;
      continue;
    }

    const assigneeIds: string[] = [];
    if (task.assigneeId) assigneeIds.push(task.assigneeId);
    if (Array.isArray(task.assigneeIds)) assigneeIds.push(...task.assigneeIds);

    for (const uid of [...new Set(assigneeIds)]) {
      // Push
      await sendPushToUser(uid, `🔴 Tarea VENCIDA: ${task.title}`, `Vencio el ${task.dueDate}`, { screen: 'tasks', itemId: task.id });

      // WhatsApp for high priority overdue
      if (task.priority === 'Alta') {
        await sendWhatsAppToUser(db, uid, `🔴 TAREA VENCIDA: ${task.title}\nVencio: ${task.dueDate}\nPrioridad: Alta\nResponde "tareas" para ver tu lista`);
      }
    }

    await markNotified(db, dedupKey);
    sent++;
  }

  return { sent, skipped };
}

/* ── 3. MEETING REMINDERS ── */
async function checkMeetingReminders(db: any): Promise<{ sent: number; skipped: number }> {
  const today = todayColombia();
  const currentHour = colombiaHour();

  // Only run between 7am-8pm Colombia time
  if (currentHour < 7 || currentHour > 20) return { sent: 0, skipped: 0 };

  const snap = await db.collection('meetings')
    .where('date', '==', today)
    .get();

  let sent = 0;
  let skipped = 0;

  const meetings = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  for (const meeting of meetings) {
    const meetingHour = parseInt(meeting.time?.split(':')[0] || '0', 10);
    const hoursUntilMeeting = meetingHour - currentHour;

    // Remind when meeting is 1 hour away (or less, for hourly cron)
    if (hoursUntilMeeting < 0 || hoursUntilMeeting > 1) {
      skipped++;
      continue;
    }

    const dedupKey = `meeting-${meeting.id}-${today}`;
    if (await wasRecentlyNotified(db, dedupKey, 2)) {
      skipped++;
      continue;
    }

    // Get attendees
    const attendeeUids: string[] = meeting.attendeeUids || [];
    if (meeting.createdBy && !attendeeUids.includes(meeting.createdBy)) {
      attendeeUids.push(meeting.createdBy);
    }

    for (const uid of attendeeUids) {
      const title = `📅 Reunion en 1 hora: ${meeting.title}`;
      const body = `${meeting.time}${meeting.location ? ` · ${meeting.location}` : ''}`;

      // Push
      await sendPushToUser(uid, title, body, { screen: 'calendar', itemId: meeting.id });

      // WhatsApp
      await sendWhatsAppToUser(db, uid, `${title}\nHora: ${meeting.time}${meeting.location ? `\nLugar: ${meeting.location}` : ''}`);
    }

    await markNotified(db, dedupKey);
    sent++;
  }

  return { sent, skipped };
}

/* ── 4. DAILY AGENDA REMINDER ── */
async function checkDailyAgendaReminder(db: any): Promise<{ sent: number; skipped: number }> {
  const today = todayColombia();
  const currentHour = colombiaHour();

  // Only send at 7am
  if (currentHour !== 7) return { sent: 0, skipped: 0 };

  const dedupKey = `dailyAgenda-${today}`;
  if (await wasRecentlyNotified(db, dedupKey, 12)) return { sent: 0, skipped: 1 };

  // Get tasks with agendaMeta for today
  const snap = await db.collection('tasks')
    .where('agendaMeta.isAgendaItem', '==', true)
    .get();

  const todayTasks = snap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((t: any) => t.agendaMeta?.dayKey === today);

  if (todayTasks.length === 0) return { sent: 0, skipped: 0 };

  // Group by user
  const userTasks: Record<string, any[]> = {};
  for (const task of todayTasks) {
    const uids: string[] = [...(task.agendaMeta?.participantIds || [])];
    if (task.assigneeId) uids.push(task.assigneeId);
    for (const uid of [...new Set(uids)]) {
      if (!userTasks[uid]) userTasks[uid] = [];
      userTasks[uid].push(task);
    }
  }

  let sent = 0;
  for (const [uid, tasks] of Object.entries(userTasks)) {
    const taskList = tasks
      .map((t: any, i: number) => {
        const hours = t.agendaMeta?.hourSlots || [];
        const hourStr = hours.length > 0 ? `${Math.min(...hours)}:00` : '';
        return `${i + 1}. ${hourStr ? `(${hourStr}) ` : ''}${t.title}`;
      })
      .join('\n');

    const title = `📆 Tu agenda de hoy`;
    const body = `Tienes ${tasks.length} actividad${tasks.length > 1 ? 'es' : ''} programada${tasks.length > 1 ? 's' : ''} hoy`;

    // Push
    await sendPushToUser(uid, title, body, { screen: 'weeklyAgenda' });

    // WhatsApp
    await sendWhatsAppToUser(db, uid, `${title}\n\n${taskList}\n\nResponde "tareas" para ver mas detalles`);
    sent++;
  }

  await markNotified(db, dedupKey);
  return { sent, skipped: 0 };
}

/* ── 5. WEEKLY SUMMARY ── */
async function checkWeeklySummary(db: any): Promise<{ sent: number; skipped: number }> {
  const now = new Date();
  const colombiaOffset = -5 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const colombiaTime = new Date(utcMs + colombiaOffset * 60000);

  // Only send on Mondays at 8am Colombia
  if (colombiaTime.getDay() !== 1 || colombiaTime.getHours() !== 8) {
    return { sent: 0, skipped: 0 };
  }

  const weekKey = `weekly-${fmtDate(colombiaTime)}`;
  if (await wasRecentlyNotified(db, weekKey, 48)) return { sent: 0, skipped: 1 };

  // Get stats from Firestore
  const tasksSnap = await db.collection('tasks').get();
  const allTasks = tasksSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  // Week range
  const weekStart = new Date(colombiaTime);
  weekStart.setDate(weekStart.getDate() - 7);
  const weekStartStr = fmtDate(weekStart);
  const todayStr = fmtDate(colombiaTime);

  const completedThisWeek = allTasks.filter((t: any) =>
    t.status === 'Completado' && t.completedAt
  ).length;

  const overdueTasks = allTasks.filter((t: any) =>
    t.status !== 'Completado' && t.dueDate && t.dueDate < todayStr
  ).length;

  const pendingTasks = allTasks.filter((t: any) =>
    t.status !== 'Completado'
  ).length;

  const inProgress = allTasks.filter((t: any) =>
    t.status === 'En progreso'
  ).length;

  // Get projects
  const projectsSnap = await db.collection('projects').get();
  const totalProjects = projectsSnap.size;

  // Send to all users
  const users = await getActiveUsers(db);
  let sent = 0;

  for (const user of users) {
    // Email with rich template
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">📊 Resumen Semanal Archii</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">Semana del ${weekStartStr} al ${todayStr}</p>
        </div>
        <div style="padding: 24px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
            <div style="background: white; border-radius: 8px; padding: 16px; text-align: center; border: 1px solid #e5e7eb;">
              <div style="font-size: 28px; font-weight: 700; color: #6366f1;">${totalProjects}</div>
              <div style="font-size: 12px; color: #6b7280;">Proyectos activos</div>
            </div>
            <div style="background: white; border-radius: 8px; padding: 16px; text-align: center; border: 1px solid #e5e7eb;">
              <div style="font-size: 28px; font-weight: 700; color: #10b981;">${completedThisWeek}</div>
              <div style="font-size: 12px; color: #6b7280;">Tareas completadas</div>
            </div>
            <div style="background: white; border-radius: 8px; padding: 16px; text-align: center; border: 1px solid #e5e7eb;">
              <div style="font-size: 28px; font-weight: 700; color: #3b82f6;">${inProgress}</div>
              <div style="font-size: 12px; color: #6b7280;">En progreso</div>
            </div>
            <div style="background: ${overdueTasks > 0 ? '#fef2f2' : 'white'}; border-radius: 8px; padding: 16px; text-align: center; border: 1px solid ${overdueTasks > 0 ? '#fecaca' : '#e5e7eb'};">
              <div style="font-size: 28px; font-weight: 700; color: ${overdueTasks > 0 ? '#ef4444' : '#6b7280'};">${overdueTasks}</div>
              <div style="font-size: 12px; color: #6b7280;">Vencidas</div>
            </div>
          </div>
          <div style="text-align: center; margin-top: 16px;">
            <span style="font-size: 14px; color: #6b7280;">${pendingTasks} tareas pendientes en total</span>
          </div>
          <div style="text-align: center; margin-top: 24px;">
            <a href="https://archii-theta.vercel.app" style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Abrir Archii</a>
          </div>
        </div>
        <div style="padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 11px; color: #9ca3af; margin: 0;">Archii — Gestión de proyectos de construcción</p>
        </div>
      </div>
    `;

    await sendEmailToUser(user.email, '📊 Tu resumen semanal — Archii', html);

    // WhatsApp brief summary
    await sendWhatsAppToUser(db, user.uid,
      `📊 *Resumen Semanal Archii*\n\n` +
      `📁 ${totalProjects} proyectos\n` +
      `✅ ${completedThisWeek} completadas\n` +
      `🔄 ${inProgress} en progreso\n` +
      `${overdueTasks > 0 ? `🔴 ${overdueTasks} vencidas\n` : ''}` +
      `📋 ${pendingTasks} pendientes\n\n` +
      `Responde "tareas" para ver detalles`
    );

    sent++;
  }

  await markNotified(db, weekKey);
  return { sent, skipped: 0 };
}

/* ── CLEANUP: Remove old cronNotifLog entries (older than 7 days) ── */
async function cleanupOldNotifications(db: any): Promise<void> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const snap = await db.collection('cronNotifLog')
    .where('sentAt', '<', sevenDaysAgo)
    .limit(500)
    .get();

  if (snap.empty) return;

  const batch = db.batch();
  snap.docs.forEach((doc: any) => batch.delete(doc.ref));
  await batch.commit();
}
