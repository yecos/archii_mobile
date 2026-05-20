/**
 * push-notifications.ts
 * Helpers client-side para enviar notificaciones push a otros usuarios.
 *
 * Cada método llama a POST /api/notifications/push/send con el payload
 * correspondiente. El servidor valida permisos y envía via web-push.
 *
 * Todos los textos en español para Archii.
 */

import { getAuthHeaders } from './firebase-service';

const PUSH_API = '/api/notifications/push/send';

/** Envía una notificación push a un usuario específico. */
async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  try {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders['Authorization']) {
      console.warn('[Archii Push] No autenticado, no se envía push');
      return false;
    }

    const res = await fetch(PUSH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ userId, title, body, data }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      console.error('[Archii Push] Error enviando:', err.error);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error('[Archii Push] Error en sendPushToUser:', err.message);
    return false;
  }
}

/** Envía una notificación push a todos los usuarios con suscripción activa (broadcast). */
async function sendPushBroadcast(
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ sent: number; failed: number }> {
  try {
    const authHeaders = await getAuthHeaders();
    if (!authHeaders['Authorization']) return { sent: 0, failed: 0 };

    const res = await fetch(PUSH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ broadcast: true, title, body, data }),
    });

    if (!res.ok) return { sent: 0, failed: 0 };

    const result = await res.json();
    return { sent: result.sent || 0, failed: result.failed || 0 };
  } catch (err: any) {
    console.error('[Archii Push] Error en broadcast:', err.message);
    return { sent: 0, failed: 0 };
  }
}

/**
 * Colección de notificaciones tipadas para los diferentes eventos de Archii.
 *
 * Uso:
 *   import { notifyPush } from '@/lib/push-notifications';
 *   await notifyPush.taskAssigned('user123', 'Diseño fachada', 'Reserva El Poblado', 'alta');
 */
export const notifyPush = {
  /**
   * Tarea asignada a un usuario.
   * @param userId - UID del usuario destino
   * @param taskTitle - Título de la tarea
   * @param projectName - Nombre del proyecto
   * @param priority - Prioridad (baja, media, alta, urgente)
   */
  async taskAssigned(
    userId: string,
    taskTitle: string,
    projectName: string,
    priority: string
  ): Promise<boolean> {
    const priorityLabel = priority ? ` [${priority.toUpperCase()}]` : '';
    return sendPushToUser(
      userId,
      'Nueva tarea asignada',
      `"${taskTitle}" en ${projectName}${priorityLabel}`,
      { screen: 'tasks', type: 'task_assigned' }
    );
  },

  /**
   * Tarea próxima a vencer.
   * @param userId - UID del usuario destino
   * @param taskTitle - Título de la tarea
   * @param projectName - Nombre del proyecto
   * @param daysLeft - Días restantes
   */
  async taskDueSoon(
    userId: string,
    taskTitle: string,
    projectName: string,
    daysLeft: number
  ): Promise<boolean> {
    const urgency = daysLeft <= 1 ? '¡Urgente! ' : daysLeft <= 3 ? '' : '';
    const label = daysLeft === 1 ? 'vence mañana' : daysLeft === 0 ? 'vence hoy' : `vence en ${daysLeft} días`;
    return sendPushToUser(
      userId,
      `${urgency}Tarea por vencer`,
      `"${taskTitle}" en ${projectName} ${label}`,
      { screen: 'tasks', type: 'task_due_soon' }
    );
  },

  /**
   * Aprobación pendiente de revisión.
   * @param userId - UID del usuario que debe aprobar
   * @param title - Título del elemento a aprobar
   * @param projectName - Nombre del proyecto
   */
  async approvalPending(
    userId: string,
    title: string,
    projectName: string
  ): Promise<boolean> {
    return sendPushToUser(
      userId,
      'Aprobación pendiente',
      `"${title}" en ${projectName} espera tu revisión`,
      { screen: 'approvals', type: 'approval_pending' }
    );
  },

  /**
   * Aprobación resuelta (aprobada o rechazada).
   * @param userId - UID del usuario que solicitó la aprobación
   * @param title - Título del elemento
   * @param status - 'aprobada' o 'rechazada'
   */
  async approvalResolved(
    userId: string,
    title: string,
    status: 'aprobada' | 'rechazada'
  ): Promise<boolean> {
    const emoji = status === 'aprobada' ? '✅' : '❌';
    return sendPushToUser(
      userId,
      `Aprobación ${status}`,
      `${emoji} "${title}" ha sido ${status}`,
      { screen: 'approvals', type: 'approval_resolved' }
    );
  },

  /**
   * Recordatorio de reunión.
   * @param userId - UID del usuario
   * @param title - Título de la reunión
   * @param date - Fecha formateada
   * @param time - Hora formateada
   */
  async meetingReminder(
    userId: string,
    title: string,
    date: string,
    time: string
  ): Promise<boolean> {
    return sendPushToUser(
      userId,
      'Recordatorio de reunión',
      `"${title}" el ${date} a las ${time}`,
      { screen: 'calendar', type: 'meeting_reminder' }
    );
  },

  /**
   * Alerta de presupuesto (porcentaje de uso).
   * @param userId - UID del usuario
   * @param projectName - Nombre del proyecto
   * @param percentage - Porcentaje usado (0-100+)
   */
  async budgetAlert(
    userId: string,
    projectName: string,
    percentage: number
  ): Promise<boolean> {
    const level = percentage >= 100 ? '¡Presupuesto agotado!' : `Presupuesto al ${Math.round(percentage)}%`;
    return sendPushToUser(
      userId,
      level,
      `El presupuesto de "${projectName}" ha alcanzado el ${Math.round(percentage)}%`,
      { screen: 'budget', type: 'budget_alert' }
    );
  },

  /**
   * Notificación personalizada.
   * @param userId - UID del usuario destino
   * @param title - Título de la notificación
   * @param body - Cuerpo del mensaje
   * @param data - Datos adicionales (screen, type, itemId, etc.)
   */
  async custom(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<boolean> {
    return sendPushToUser(userId, title, body, data);
  },

  /**
   * Envío masivo a todos los usuarios suscritos.
   * @param title - Título de la notificación
   * @param body - Cuerpo del mensaje
   * @param data - Datos adicionales opcionales
   */
  async broadcast(
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<{ sent: number; failed: number }> {
    return sendPushBroadcast(title, body, data);
  },
};
