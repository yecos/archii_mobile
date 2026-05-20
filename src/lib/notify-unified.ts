/**
 * Archii — Servicio Unificado de Notificaciones Externas
 *
 * Centraliza el envío de notificaciones a los 3 canales externos:
 *   1. WhatsApp (Meta Cloud API) — ya existente
 *   2. Email (Resend API) — nuevo
 *   3. Push (Web Push via web-push) — nuevo
 *
 * Uso:
 *   import { notifyExternal } from '@/lib/notify-unified';
 *   await notifyExternal.taskAssigned(userId, taskTitle, projectName, priority, dueDate);
 *
 * Cada función envía a los 3 canales EN PARALELO. Si un canal falla,
 * no afecta a los demás. Los errores se loguean silenciosamente.
 *
 * IMPORTANTE: No importa firebase-admin. Solo llama API routes via fetch.
 */

import { notifyWhatsApp } from './whatsapp-notifications';
import { notifyEmail } from './email-notifications';
import { notifyPush } from './push-notifications';

/* ===== Canal preferences (localStorage) ===== */

interface ChannelPrefs {
  whatsapp: boolean;
  email: boolean;
  push: boolean;
}

const CHANNEL_PREFS_KEY = 'archii-channel-prefs';

function getChannelPrefs(): ChannelPrefs {
  try {
    const saved = localStorage.getItem(CHANNEL_PREFS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { whatsapp: true, email: true, push: true };
}

function isChannelEnabled(channel: keyof ChannelPrefs): boolean {
  const prefs = getChannelPrefs();
  return prefs[channel] !== false;
}

/* ===== Unified Notification Functions ===== */

export const notifyExternal = {

  /**
   * Nueva tarea asignada
   */
  async taskAssigned(
    userId: string,
    taskTitle: string,
    projectName: string,
    priority?: string,
    dueDate?: string,
    assignedBy?: string,
  ) {
    const promises: Promise<unknown>[] = [];
    if (isChannelEnabled('whatsapp'))
      promises.push(notifyWhatsApp.taskAssigned(userId, taskTitle, projectName, priority, dueDate).catch(() => {}));
    if (isChannelEnabled('email'))
      promises.push(notifyEmail.taskAssigned(userId, taskTitle, projectName, priority, dueDate, assignedBy).catch(() => {}));
    if (isChannelEnabled('push'))
      promises.push(notifyPush.taskAssigned(userId, taskTitle, projectName, priority || '').catch(() => {}));
    await Promise.allSettled(promises);
  },

  /**
   * Tarea actualizada (cambio de estado)
   */
  async taskUpdated(
    userId: string,
    taskTitle: string,
    newStatus: string,
  ) {
    const promises: Promise<unknown>[] = [];
    if (isChannelEnabled('whatsapp'))
      promises.push(notifyWhatsApp.taskUpdated(userId, taskTitle, newStatus).catch(() => {}));
    if (isChannelEnabled('email'))
      promises.push(notifyEmail.taskUpdated(userId, taskTitle, newStatus).catch(() => {}));
    if (isChannelEnabled('push'))
      promises.push(notifyPush.custom(userId, 'Tarea actualizada', `"${taskTitle}" → ${newStatus}`, { screen: 'tasks' }).catch(() => {}));
    await Promise.allSettled(promises);
  },

  /**
   * Tarea próxima a vencer
   */
  async taskDueSoon(
    userId: string,
    taskTitle: string,
    projectName: string,
    daysLeft: number,
  ) {
    const promises: Promise<unknown>[] = [];
    if (isChannelEnabled('whatsapp'))
      promises.push(notifyWhatsApp.taskDueSoon(userId, taskTitle, projectName, daysLeft).catch(() => {}));
    if (isChannelEnabled('email'))
      promises.push(notifyEmail.taskDueSoon(userId, taskTitle, projectName, daysLeft).catch(() => {}));
    if (isChannelEnabled('push'))
      promises.push(notifyPush.taskDueSoon(userId, taskTitle, projectName, daysLeft).catch(() => {}));
    await Promise.allSettled(promises);
  },

  /**
   * Aprobación pendiente
   */
  async approvalPending(
    userId: string,
    title: string,
    projectName: string,
    requestedBy: string,
  ) {
    const promises: Promise<unknown>[] = [];
    if (isChannelEnabled('whatsapp'))
      promises.push(notifyWhatsApp.approvalPending(userId, title, projectName, requestedBy).catch(() => {}));
    if (isChannelEnabled('email'))
      promises.push(notifyEmail.approvalPending(userId, title, projectName, requestedBy).catch(() => {}));
    if (isChannelEnabled('push'))
      promises.push(notifyPush.approvalPending(userId, title, projectName).catch(() => {}));
    await Promise.allSettled(promises);
  },

  /**
   * Aprobación resuelta
   */
  async approvalResolved(
    userId: string,
    title: string,
    status: string,
    resolvedBy?: string,
  ) {
    const promises: Promise<unknown>[] = [];
    if (isChannelEnabled('whatsapp'))
      promises.push(notifyWhatsApp.approvalResolved(userId, title, status, resolvedBy).catch(() => {}));
    if (isChannelEnabled('email'))
      promises.push(notifyEmail.approvalResolved(userId, title, status, resolvedBy).catch(() => {}));
    if (isChannelEnabled('push'))
      promises.push(notifyPush.approvalResolved(userId, title, status === 'Aprobado' ? 'aprobada' : 'rechazada').catch(() => {}));
    await Promise.allSettled(promises);
  },

  /**
   * Nuevo gasto registrado
   */
  async expenseCreated(
    userId: string,
    concept: string,
    amount: number,
    projectName: string,
    category?: string,
  ) {
    const promises: Promise<unknown>[] = [];
    if (isChannelEnabled('whatsapp'))
      promises.push(notifyWhatsApp.expenseCreated(userId, concept, amount, projectName, category).catch(() => {}));
    if (isChannelEnabled('email'))
      promises.push(notifyEmail.expenseCreated(userId, concept, amount, projectName, category).catch(() => {}));
    if (isChannelEnabled('push'))
      promises.push(notifyPush.custom(userId, 'Nuevo gasto registrado', `${concept} — ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(amount)}`, { screen: 'budget' }).catch(() => {}));
    await Promise.allSettled(promises);
  },

  /**
   * Alerta de presupuesto
   */
  async budgetAlert(
    userId: string,
    projectName: string,
    spent: number,
    budget: number,
    percentage: number,
  ) {
    const promises: Promise<unknown>[] = [];
    if (isChannelEnabled('whatsapp'))
      promises.push(notifyWhatsApp.budgetAlert(userId, projectName, spent, budget, percentage).catch(() => {}));
    if (isChannelEnabled('email'))
      promises.push(notifyEmail.budgetAlert(userId, projectName, spent, budget, percentage).catch(() => {}));
    if (isChannelEnabled('push'))
      promises.push(notifyPush.budgetAlert(userId, projectName, percentage).catch(() => {}));
    await Promise.allSettled(promises);
  },

  /**
   * Recordatorio de reunión
   */
  async meetingReminder(
    userId: string,
    title: string,
    date: string,
    time: string,
    project: string,
  ) {
    const promises: Promise<unknown>[] = [];
    if (isChannelEnabled('email'))
      promises.push(notifyEmail.meetingReminder(userId, title, date, time, project).catch(() => {}));
    if (isChannelEnabled('push'))
      promises.push(notifyPush.meetingReminder(userId, title, date, time).catch(() => {}));
    if (isChannelEnabled('whatsapp'))
      promises.push(notifyWhatsApp.custom(userId, `📅 Recordatorio: ${title}\n\n📅 ${date} a las ${time}\n📁 ${project}`).catch(() => {}));
    await Promise.allSettled(promises);
  },

  /**
   * Actualización de proyecto
   */
  async projectUpdated(
    userId: string,
    projectName: string,
    update: string,
  ) {
    const promises: Promise<unknown>[] = [];
    if (isChannelEnabled('whatsapp'))
      promises.push(notifyWhatsApp.projectUpdated(userId, projectName, update).catch(() => {}));
    if (isChannelEnabled('email'))
      promises.push(notifyEmail.projectUpdated(userId, projectName, update).catch(() => {}));
    if (isChannelEnabled('push'))
      promises.push(notifyPush.custom(userId, 'Actualización de proyecto', `${projectName}: ${update}`, { screen: 'projects' }).catch(() => {}));
    await Promise.allSettled(promises);
  },

  /**
   * Resumen semanal (broadcast a todos los miembros)
   */
  async weeklySummary(data: {
    totalProjects: number;
    completedTasks: number;
    newExpenses: number;
    totalSpent: number;
    pendingApprovals: number;
  }) {
    const promises: Promise<unknown>[] = [];
    if (isChannelEnabled('whatsapp'))
      promises.push(notifyWhatsApp.weeklySummary(data).catch(() => {}));
    if (isChannelEnabled('email'))
      promises.push(notifyEmail.weeklySummary(data).catch(() => {}));
    if (isChannelEnabled('push'))
      promises.push(notifyPush.broadcast('📊 Resumen semanal', `${data.totalProjects} proyectos, ${data.completedTasks} tareas completadas`).catch(() => {}));
    await Promise.allSettled(promises);
  },

  /**
   * Notificación personalizada a un usuario
   */
  async custom(userId: string, message: string) {
    const promises: Promise<unknown>[] = [];
    if (isChannelEnabled('whatsapp'))
      promises.push(notifyWhatsApp.custom(userId, message).catch(() => {}));
    if (isChannelEnabled('email'))
      promises.push(notifyEmail.custom(userId, 'Notificación de Archii', `<p>${message.replace(/\n/g, '<br>')}</p>`).catch(() => {}));
    if (isChannelEnabled('push'))
      promises.push(notifyPush.custom(userId, 'Archii', message).catch(() => {}));
    await Promise.allSettled(promises);
  },

  /**
   * Broadcast personalizado a todos los miembros
   */
  async customBroadcast(message: string) {
    const promises: Promise<unknown>[] = [];
    if (isChannelEnabled('whatsapp'))
      promises.push(notifyWhatsApp.customBroadcast(message).catch(() => {}));
    if (isChannelEnabled('email'))
      promises.push(notifyEmail.customBroadcast('Comunicado de Archii', `<p>${message.replace(/\n/g, '<br>')}</p>`).catch(() => {}));
    if (isChannelEnabled('push'))
      promises.push(notifyPush.broadcast('Comunicado Archii', message).catch(() => {}));
    await Promise.allSettled(promises);
  },
};

/* ===== Channel Preferences Management ===== */

export function getExternalChannelPrefs(): ChannelPrefs {
  return getChannelPrefs();
}

export function setExternalChannelPref(channel: keyof ChannelPrefs, enabled: boolean): void {
  const prefs = getChannelPrefs();
  prefs[channel] = enabled;
  try {
    localStorage.setItem(CHANNEL_PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}
