/**
 * Archii — Email Notifications
 * Funciones para enviar notificaciones automaticas por email
 * cuando ocurren eventos en Archii (tareas, gastos, aprobaciones, etc.)
 *
 * Uso desde page.tsx:
 *   import { notifyEmail } from '@/lib/email-notifications';
 *   await notifyEmail.taskAssigned(userId, taskTitle, projectName);
 *
 * IMPORTANTE: Esta funcion llama al API endpoint /api/notifications/email
 * via fetch, por lo que NO importa firebase-admin al bundle del cliente.
 *
 * Patron idéntico a whatsapp-notifications.ts.
 */

import { fmtCOP, fmtDate } from './helpers';
import { getAuthHeaders } from './firebase-service';

/** Escapa caracteres HTML para prevenir inyección XSS */
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// URL base del API interno
const EMAIL_NOTIFY_API = '/api/notifications/email';

// ─── HTML Email Template Builder ───
// Branding colors
const BRAND = {
  darkBg: '#1e1b4b',      // dark indigo
  gradientStart: '#312e81', // indigo-900
  gradientEnd: '#581c87',   // purple-900
  accent: '#818cf8',        // indigo-400
  text: '#1f2937',          // gray-800
  muted: '#6b7280',         // gray-500
  lightBg: '#f9fafb',       // gray-50
  white: '#ffffff',
  ctaBg: '#4f46e5',         // indigo-600
  ctaHover: '#4338ca',      // indigo-700
  border: '#e5e7eb',        // gray-200
  success: '#059669',       // emerald-600
  warning: '#d97706',       // amber-600
  danger: '#dc2626',        // red-600
};

const CTA_URL = 'https://archii-theta.vercel.app';

function buildEmailHtml(subject: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.lightBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.lightBg};padding:24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND.gradientStart},${BRAND.gradientEnd});border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.02em;">🏗️ Archii</h1>
              <p style="margin:6px 0 0;font-size:13px;color:${BRAND.accent};opacity:0.9;">Gestión de Obras Inteligente</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:${BRAND.white};padding:32px;border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};">
              ${bodyHtml}
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td style="background:${BRAND.white};padding:0 32px 32px;border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${CTA_URL}" target="_blank" style="display:inline-block;background-color:${BRAND.ctaBg};color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;mso-padding-alt:0;text-align:center;">
                      <!--[if mso]><i style="mso-font-width:300%;mso-text-raise:21pt" hidden>&emsp;</i><![endif]-->
                      <span style="mso-text-raise:10pt;">Abrir Archii</span>
                      <!--[if mso]><i style="mso-font-width:300%;" hidden>&emsp;&#8203;</i><![endif]-->
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:${BRAND.white};border-radius:0 0 12px 12px;padding:20px 32px;border:1px solid ${BRAND.border};border-top:none;text-align:center;">
              <p style="margin:0;font-size:12px;color:${BRAND.muted};">
                Recibiste este correo porque estás registrado en Archii.<br>
                <a href="${CTA_URL}" style="color:${BRAND.accent};text-decoration:none;">Configurar notificaciones</a> en tu perfil.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function infoRow(icon: string, label: string, value: string, valueColor?: string): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="32" valign="top" style="font-size:18px;">${icon}</td>
            <td>
              <span style="font-size:12px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.05em;">${label}</span><br>
              <span style="font-size:15px;color:${valueColor || BRAND.text};font-weight:600;">${value}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

// ─── Enviar notificacion a un usuario por userId via API ───
async function sendToUser(userId: string, subject: string, htmlBody: string): Promise<void> {
  try {
    const authHeaders = await getAuthHeaders();
    await fetch(EMAIL_NOTIFY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ userId, subject, htmlBody }),
    });
  } catch (err: any) {
    console.error('[Archii Email Notify] Error:', err.message);
  }
}

// ─── Broadcast a todos los miembros del tenant via API ───
async function sendBroadcast(subject: string, htmlBody: string): Promise<void> {
  try {
    const authHeaders = await getAuthHeaders();
    await fetch(EMAIL_NOTIFY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ broadcast: true, subject, htmlBody }),
    });
  } catch (err: any) {
    console.error('[Archii Email Notify] Error broadcast:', err.message);
  }
}

// ─── Notification Functions ───
export const notifyEmail = {

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
    const prioEmoji = priority === 'Alta' ? '🔴' : priority === 'Media' ? '🟡' : '🟢';
    const prioColor = priority === 'Alta' ? BRAND.danger : priority === 'Media' ? BRAND.warning : BRAND.success;
    const subject = `📋 Nueva tarea: ${taskTitle}`;

    const body = `
      <h2 style="margin:0 0 20px;font-size:20px;color:${BRAND.text};">📋 Nueva tarea asignada</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        ${infoRow('📌', 'Tarea', taskTitle)}
        ${infoRow('📁', 'Proyecto', projectName)}
        ${infoRow(prioEmoji, 'Prioridad', priority || 'Sin definir', prioColor)}
        ${dueDate ? infoRow('📅', 'Fecha límite', fmtDate(dueDate)) : ''}
        ${assignedBy ? infoRow('👤', 'Asignado por', assignedBy) : ''}
      </table>
      <p style="color:${BRAND.muted};font-size:14px;margin:0;">Revisa los detalles y empieza a trabajar en esta tarea desde Archii.</p>`;

    await sendToUser(userId, subject, buildEmailHtml(subject, body));
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
    const urgent = daysLeft <= 1;
    const emoji = urgent ? '🔴' : daysLeft <= 3 ? '🟡' : '📅';
    const color = urgent ? BRAND.danger : daysLeft <= 3 ? BRAND.warning : BRAND.accent;
    const dueText = daysLeft === 0 ? 'Vence HOY' : daysLeft === 1 ? 'Vence MAÑANA' : `Vence en ${daysLeft} días`;
    const subject = `${emoji} Recordatorio: ${taskTitle}`;

    const body = `
      <h2 style="margin:0 0 20px;font-size:20px;color:${color};">${emoji} ${urgent ? '¡URGENTE!' : 'Recordatorio de tarea'}</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        ${infoRow('📋', 'Tarea', taskTitle)}
        ${infoRow('📁', 'Proyecto', projectName)}
        ${infoRow('⏰', 'Estado', dueText, color)}
      </table>
      <p style="color:${BRAND.muted};font-size:14px;margin:0;">No olvides completar esta tarea a tiempo. ¡Ábre Archii para actualizar su estado!</p>`;

    await sendToUser(userId, subject, buildEmailHtml(subject, body));
  },

  /**
   * Nueva aprobacion pendiente
   */
  async approvalPending(
    userId: string,
    title: string,
    projectName: string,
    requestedBy: string,
  ) {
    const subject = `👀 Aprobación pendiente: ${title}`;

    const body = `
      <h2 style="margin:0 0 20px;font-size:20px;color:${BRAND.text};">👀 Nueva aprobación pendiente</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        ${infoRow('📋', 'Elemento', title)}
        ${infoRow('📁', 'Proyecto', projectName)}
        ${infoRow('👤', 'Solicitada por', requestedBy)}
      </table>
      <p style="color:${BRAND.muted};font-size:14px;margin:0;">Se necesita tu aprobación para continuar. Revisa los detalles en Archii.</p>`;

    await sendToUser(userId, subject, buildEmailHtml(subject, body));
  },

  /**
   * Aprobacion resuelta
   */
  async approvalResolved(
    userId: string,
    title: string,
    status: string,
    resolvedBy?: string,
  ) {
    const approved = status === 'Aprobado';
    const emoji = approved ? '✅' : '❌';
    const color = approved ? BRAND.success : BRAND.danger;
    const subject = `${emoji} Aprobación ${status}: ${title}`;

    const body = `
      <h2 style="margin:0 0 20px;font-size:20px;color:${color};">${emoji} Aprobación ${status}</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        ${infoRow('📋', 'Elemento', title)}
        ${infoRow('📊', 'Estado', status, color)}
        ${resolvedBy ? infoRow('👤', 'Resuelta por', resolvedBy) : ''}
      </table>
      <p style="color:${BRAND.muted};font-size:14px;margin:0;">${approved ? '¡Tu solicitud fue aprobada! Puedes continuar con el siguiente paso.' : 'Tu solicitud fue rechazada. Revisa los comentarios en Archii para más detalles.'}</p>`;

    await sendToUser(userId, subject, buildEmailHtml(subject, body));
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
    const subject = `💰 Nuevo gasto: ${concept}`;

    const body = `
      <h2 style="margin:0 0 20px;font-size:20px;color:${BRAND.text};">💰 Nuevo gasto registrado</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        ${infoRow('📝', 'Concepto', concept)}
        ${infoRow('💵', 'Monto', fmtCOP(amount), BRAND.danger)}
        ${infoRow('📁', 'Proyecto', projectName)}
        ${category ? infoRow('🏷️', 'Categoría', category) : ''}
      </table>
      <p style="color:${BRAND.muted};font-size:14px;margin:0;">Se registró un nuevo gasto en tu proyecto. Revisa los detalles en Archii.</p>`;

    await sendToUser(userId, subject, buildEmailHtml(subject, body));
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
    const emoji = percentage >= 100 ? '🔴' : percentage >= 90 ? '🟠' : '🟡';
    const color = percentage >= 100 ? BRAND.danger : percentage >= 90 ? BRAND.warning : '#ea580c';
    const subject = `${emoji} Alerta de presupuesto: ${projectName} (${percentage}%)`;

    const body = `
      <h2 style="margin:0 0 20px;font-size:20px;color:${color};">${emoji} Alerta de presupuesto</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        ${infoRow('📁', 'Proyecto', projectName)}
        ${infoRow('💸', 'Gastado', fmtCOP(spent))}
        ${infoRow('💰', 'Presupuesto', fmtCOP(budget))}
        ${infoRow('📊', 'Utilizado', `${percentage}%`, color)}
      </table>
      <!-- Progress bar -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          <td style="background:#e5e7eb;border-radius:6px;height:10px;position:relative;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" style="height:10px" fill="true" stroke="false">
              <v:fill type="frame" color="${color}"/>
            </v:roundrect>
            <![endif]-->
            <div style="background:${color};border-radius:6px;height:10px;width:${Math.min(percentage, 100)}%;"></div>
          </td>
        </tr>
      </table>
      <p style="color:${BRAND.muted};font-size:14px;margin:0;">
        ${percentage >= 100 ? '⚠️ ¡El presupuesto se ha agotado! Revisa los gastos urgentemente.' : 'Revisa los gastos del proyecto y ajusta el presupuesto si es necesario.'}
      </p>`;

    await sendToUser(userId, subject, buildEmailHtml(subject, body));
  },

  /**
   * Recordatorio de reunion
   */
  async meetingReminder(
    userId: string,
    title: string,
    date: string,
    time: string,
    project: string,
  ) {
    const subject = `📅 Recordatorio: ${title}`;

    const body = `
      <h2 style="margin:0 0 20px;font-size:20px;color:${BRAND.text};">📅 Recordatorio de reunión</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        ${infoRow('📋', 'Reunión', title)}
        ${infoRow('📅', 'Fecha', date)}
        ${infoRow('⏰', 'Hora', time)}
        ${infoRow('📁', 'Proyecto', project)}
      </table>
      <p style="color:${BRAND.muted};font-size:14px;margin:0;">Tienes una reunión próxima. Prepárate y únete a tiempo desde Archii.</p>`;

    await sendToUser(userId, subject, buildEmailHtml(subject, body));
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
    const subject = '📊 Resumen semanal — Archii';
    const now = new Date();
    const weekLabel = now.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

    const body = `
      <h2 style="margin:0 0 4px;font-size:20px;color:${BRAND.text};">📊 Resumen Semanal</h2>
      <p style="margin:0 0 20px;font-size:13px;color:${BRAND.muted};">Semana del ${weekLabel}</p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        ${infoRow('📁', 'Proyectos activos', String(data.totalProjects))}
        ${infoRow('✅', 'Tareas completadas', String(data.completedTasks), BRAND.success)}
        ${infoRow('💰', 'Gastos nuevos', `${data.newExpenses} (${fmtCOP(data.totalSpent)})`)}
        ${infoRow('👀', 'Aprobaciones pendientes', String(data.pendingApprovals), data.pendingApprovals > 0 ? BRAND.warning : BRAND.success)}
      </table>
      <p style="color:${BRAND.muted};font-size:14px;margin:0;">Revisa el detalle completo de tu semana en Archii.</p>`;

    await sendBroadcast(subject, buildEmailHtml(subject, body));
  },

  /**
   * Tarea actualizada
   */
  async taskUpdated(
    userId: string,
    taskTitle: string,
    newStatus: string,
  ) {
    const emoji = newStatus === 'Completado' ? '✅' : newStatus === 'En progreso' ? '🔄' : newStatus === 'Revision' ? '👀' : '📌';
    const color = newStatus === 'Completado' ? BRAND.success : BRAND.accent;
    const subject = `${emoji} Tarea actualizada: ${taskTitle}`;

    const body = `
      <h2 style="margin:0 0 20px;font-size:20px;color:${BRAND.text};">${emoji} Tarea actualizada</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        ${infoRow('📋', 'Tarea', taskTitle)}
        ${infoRow('📊', 'Nuevo estado', newStatus, color)}
      </table>
      <p style="color:${BRAND.muted};font-size:14px;margin:0;">El estado de esta tarea ha cambiado. Revisa los detalles en Archii.</p>`;

    await sendToUser(userId, subject, buildEmailHtml(subject, body));
  },

  /**
   * Actualizacion de proyecto
   */
  async projectUpdated(
    userId: string,
    projectName: string,
    update: string,
  ) {
    const subject = `📊 Actualización: ${projectName}`;

    const body = `
      <h2 style="margin:0 0 20px;font-size:20px;color:${BRAND.text};">📊 Actualización de proyecto</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        ${infoRow('📁', 'Proyecto', projectName)}
        ${infoRow('📝', 'Detalle', update)}
      </table>
      <p style="color:${BRAND.muted};font-size:14px;margin:0;">Revisa los detalles completos en Archii.</p>`;

    await sendToUser(userId, subject, buildEmailHtml(subject, body));
  },

  /**
   * Notificacion personalizada
   */
  async custom(userId: string, subject: string, htmlBody: string) {
    await sendToUser(userId, subject, buildEmailHtml(subject, escapeHtml(htmlBody)));
  },

  /**
   * Broadcast personalizado
   */
  async customBroadcast(subject: string, htmlBody: string) {
    await sendBroadcast(subject, buildEmailHtml(subject, escapeHtml(htmlBody)));
  },
};
