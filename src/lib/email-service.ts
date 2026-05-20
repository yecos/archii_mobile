/**
 * Archii — Email Service (Server-side)
 * Conexion con Resend API para enviar correos electronicos.
 * Este modulo es PURO (no importa firebase-admin) para evitar problemas
 * de bundling con Turbopack.
 *
 * Las operaciones de Firestore se hacen directamente en los API routes
 * (/api/notifications/email) via dynamic import.
 *
 * Patron idéntico a whatsapp-service.ts: HTTP fetch directo a la API de Resend.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@archii.app';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Enviar un correo electronico via Resend API.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: EmailOptions): Promise<{ success: boolean; error?: string; messageId?: string }> {
  if (!RESEND_API_KEY) {
    console.error('[Archii Email] RESEND_API_KEY no configurada');
    return { success: false, error: 'Email no configurado.' };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Archii <${FROM_EMAIL}>`,
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('[Archii Email] Error:', response.status, err);
      return { success: false, error: `Error ${response.status}` };
    }

    const data = await response.json();
    return { success: true, messageId: data.id };
  } catch (err: any) {
    console.error('[Archii Email] Error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Enviar correo a multiples destinatarios (uno por uno).
 * Retorna estadisticas de envio.
 */
export async function sendBulkEmail(
  recipients: string[],
  subject: string,
  html: string,
): Promise<{ sent: number; total: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  for (const to of recipients) {
    if (!to) continue;
    const result = await sendEmail({ to, subject, html });
    if (result.success) {
      sent++;
    } else if (result.error) {
      errors.push(`${to}: ${result.error}`);
    }
  }

  return { sent, total: recipients.length, errors };
}
