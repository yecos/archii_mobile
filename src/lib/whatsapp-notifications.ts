/**
 * Archii — WhatsApp Notifications
 * Funciones para enviar notificaciones automaticas a WhatsApp
 * cuando ocurren eventos en Archii (tareas, gastos, aprobaciones, etc.)
 *
 * Uso desde page.tsx:
 *   import { notifyWhatsApp } from '@/lib/whatsapp-notifications';
 *   await notifyWhatsApp.taskAssigned(userId, taskTitle, projectName);
 *
 * IMPORTANTE: Esta funcion llama al API endpoint /api/whatsapp/notify
 * via fetch, por lo que NO importa firebase-admin al bundle del cliente.
 */

import { fmtCOP, fmtDate } from './helpers';
import { getAuthHeaders } from './firebase-service';

// URL base del API interno
const NOTIFY_API = '/api/whatsapp/notify';

// Enviar notificacion a un usuario por userId via API
async function sendToUser(userId: string, message: string): Promise<void> {
  try {
    const authHeaders = await getAuthHeaders();
    await fetch(NOTIFY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ userId, message }),
    });
  } catch (err: any) {
    console.error('[Archii WhatsApp Notify] Error:', err.message);
  }
}

// Broadcast a todos los vinculados via API
async function sendBroadcast(message: string): Promise<void> {
  try {
    const authHeaders = await getAuthHeaders();
    await fetch(NOTIFY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ broadcast: true, message }),
    });
  } catch (err: any) {
    console.error('[Archii WhatsApp Notify] Error broadcast:', err.message);
  }
}

export const notifyWhatsApp = {

  async taskAssigned(
    userId: string,
    taskTitle: string,
    projectName: string,
    priority?: string,
    dueDate?: string
  ) {
    const prio = priority === 'Alta' ? '🔴' : priority === 'Media' ? '🟡' : '🟢';
    const due = dueDate ? `\n📅 Vence: ${fmtDate(dueDate)}` : '';
    await sendToUser(userId,
      `📋 *Nueva tarea asignada*\n\n${prio} *${taskTitle}*\n📁 Proyecto: ${projectName}${due}\n\n_Abre Archii para mas detalles._`
    );
  },

  async taskUpdated(
    userId: string,
    taskTitle: string,
    newStatus: string
  ) {
    const emoji = newStatus === 'Completado' ? '✅' : newStatus === 'En progreso' ? '🔄' : newStatus === 'Revision' ? '👀' : '📌';
    await sendToUser(userId,
      `${emoji} *Tarea actualizada*\n\n*${taskTitle}*\nEstado: ${newStatus}`
    );
  },

  async taskDueSoon(
    userId: string,
    taskTitle: string,
    projectName: string,
    daysLeft: number
  ) {
    const urgent = daysLeft <= 1 ? '🔴 ¡URGENTE!' : daysLeft <= 3 ? '🟡 Proximo a vencer' : '📅 Recordatorio';
    await sendToUser(userId,
      `${urgent}\n\n📋 *${taskTitle}*\n📁 ${projectName}\n⏰ ${daysLeft === 0 ? 'Vence HOY' : daysLeft === 1 ? 'Vence MAÑANA' : `Vence en ${daysLeft} dias`}\n\n_Abre Archii para mas detalles._`
    );
  },

  async expenseCreated(
    userId: string,
    concept: string,
    amount: number,
    projectName: string,
    category?: string
  ) {
    await sendToUser(userId,
      `💰 *Nuevo gasto registrado*\n\n*${concept}*\n💵 ${fmtCOP(amount)}\n📁 ${projectName}${category ? `\n🏷️ ${category}` : ''}\n\n_Abre Archii para ver detalles._`
    );
  },

  async budgetAlert(
    userId: string,
    projectName: string,
    spent: number,
    budget: number,
    percentage: number
  ) {
    const emoji = percentage >= 100 ? '🔴' : percentage >= 90 ? '🟠' : '🟡';
    await sendToUser(userId,
      `${emoji} *Alerta de presupuesto*\n\n📁 *${projectName}*\n💵 Gastado: ${fmtCOP(spent)} de ${fmtCOP(budget)} (${percentage}%)\n_${percentage >= 100 ? '¡Presupuesto agotado!' : 'Revisa los gastos del proyecto.'}_\n\n_Abre Archii para mas detalles._`
    );
  },

  async approvalPending(
    userId: string,
    title: string,
    projectName: string,
    requestedBy: string
  ) {
    await sendToUser(userId,
      `👀 *Nueva aprobacion pendiente*\n\n*${title}*\n📁 ${projectName}\n👤 Solicitada por: ${requestedBy}\n\n_Abre Archii para revisar y aprobar._`
    );
  },

  async approvalResolved(
    userId: string,
    title: string,
    status: string,
    resolvedBy?: string
  ) {
    const emoji = status === 'Aprobado' ? '✅' : '❌';
    await sendToUser(userId,
      `${emoji} *Aprobacion ${status}*\n\n*${title}*${resolvedBy ? `\n👤 ${resolvedBy}` : ''}\n\n_Abre Archii para mas detalles._`
    );
  },

  async projectUpdated(
    userId: string,
    projectName: string,
    update: string
  ) {
    await sendToUser(userId,
      `📊 *Actualizacion de proyecto*\n\n📁 *${projectName}*\n${update}\n\n_Abre Archii para mas detalles._`
    );
  },

  async weeklySummary(data: {
    totalProjects: number;
    completedTasks: number;
    newExpenses: number;
    totalSpent: number;
    pendingApprovals: number;
  }) {
    await sendBroadcast(
      `📊 *Resumen semanal Archii*\n\n` +
      `📁 Proyectos activos: ${data.totalProjects}\n` +
      `✅ Tareas completadas: ${data.completedTasks}\n` +
      `💰 Gastos nuevos: ${data.newExpenses} (${fmtCOP(data.totalSpent)})\n` +
      `👀 Aprobaciones pendientes: ${data.pendingApprovals}\n\n` +
      `_Abre Archii para ver detalles._`
    );
  },

  async custom(userId: string, message: string) {
    await sendToUser(userId, message);
  },

  async customBroadcast(message: string) {
    await sendBroadcast(message);
  },
};
