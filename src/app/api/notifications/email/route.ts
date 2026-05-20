import { NextRequest, NextResponse } from "next/server";
import { sendEmail, sendBulkEmail } from "@/lib/email-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

/**
 * POST /api/notifications/email
 * Endpoint server-side para enviar notificaciones por email via Resend.
 * Requiere autenticacion para TODAS las rutas (broadcast e individual).
 *
 * Body (individual): { userId: string, subject: string, htmlBody: string }
 * Body (broadcast):  { broadcast: true, subject: string, htmlBody: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Autenticacion OBLIGATORIA para todas las rutas
    await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Error de autenticación" }, { status: 401 });
  }

  // Get caller info for tenant checks (both broadcast and individual paths)
  const authHeader = request.headers.get("authorization");
  const idToken = authHeader?.split("Bearer ")[1] || "";
  const { getAdminAuth } = await import("@/lib/firebase-admin");
  const decodedToken = await getAdminAuth().verifyIdToken(idToken);
  const callerEmail = decodedToken.email || "";

  try {
    const body = await request.json();
    const { userId, message, broadcast, subject, htmlBody } = body;

    // Validez minima: se necesita subject + html (o message para compatibilidad)
    if (!subject && !message) {
      return NextResponse.json({ error: "subject o message requerido" }, { status: 400 });
    }

    // Determinar subject y htmlBody con fallback a message
    const emailSubject = subject || message || 'Notificación Archii';
    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const emailHtml = htmlBody || (message ? `<p style="font-family:sans-serif;font-size:15px;color:#1f2937;">${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : '');

    if (!emailHtml) {
      return NextResponse.json({ error: "htmlBody requerido" }, { status: 400 });
    }

    const { getAdminDb } = await import("@/lib/firebase-admin");
    const db = getAdminDb();

    // ─── Broadcast: enviar a todos los miembros del tenant ───
    if (broadcast) {
      // Buscar el perfil del usuario para obtener su tenantId (reutilizar callerEmail del header)
      const userSnap = await db
        .collection("users")
        .where("email", "==", callerEmail)
        .limit(1)
        .get();

      if (userSnap.empty) {
        return NextResponse.json({ ok: true, sent: 0, reason: "user_not_found" });
      }

      const userDoc = userSnap.docs[0].data();
      const tenantId = userDoc.tenantId;

      if (!tenantId) {
        return NextResponse.json({ ok: true, sent: 0, reason: "no_tenant" });
      }

      // Obtener todos los miembros del tenant con email y preferencias
      const membersSnap = await db
        .collection("users")
        .where("tenantId", "==", tenantId)
        .get();

      // Filtrar miembros con email y que tengan emailNotifPrefs activo
      const recipients: string[] = [];
      for (const doc of membersSnap.docs) {
        const member = doc.data();
        if (!member.email) continue;

        // Verificar preferencias de notificacion email
        const prefs = member.emailNotifPrefs;
        if (prefs === false) continue; // false = desactivado globalmente
        if (prefs && typeof prefs === 'object' && prefs.enabled === false) continue;

        recipients.push(member.email);
      }

      if (recipients.length === 0) {
        return NextResponse.json({ ok: true, sent: 0, reason: "no_recipients" });
      }

      const result = await sendBulkEmail(recipients, emailSubject, emailHtml);

      return NextResponse.json({
        ok: true,
        sent: result.sent,
        total: result.total,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    }

    // ─── Individual: enviar a un usuario por userId ───
    if (!userId) {
      return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    }

    // Buscar el usuario en Firestore para obtener su email
    const userSnap = await db
      .collection("users")
      .where("uid", "==", userId)
      .limit(1)
      .get();

    if (userSnap.empty) {
      return NextResponse.json({ ok: true, sent: 0, reason: "user_not_found" });
    }

    const userDoc = userSnap.docs[0].data();

    // Verify caller and target share the same tenant
    const callerUserSnap = await db.collection("users").where("email", "==", callerEmail).limit(1).get();
    if (!callerUserSnap.empty) {
      const callerTenantId = callerUserSnap.docs[0].data()?.tenantId;
      const targetTenantId = userDoc.tenantId;
      if (callerTenantId && targetTenantId && callerTenantId !== targetTenantId) {
        return NextResponse.json({ ok: false, error: "No autorizado: diferentes tenants" }, { status: 403 });
      }
    }

    const userEmail = userDoc.email;

    if (!userEmail) {
      return NextResponse.json({ ok: true, sent: 0, reason: "no_email" });
    }

    // Verificar preferencias de notificacion email
    const prefs = userDoc.emailNotifPrefs;
    if (prefs === false) {
      return NextResponse.json({ ok: true, sent: 0, reason: "email_disabled" });
    }
    if (prefs && typeof prefs === 'object' && prefs.enabled === false) {
      return NextResponse.json({ ok: true, sent: 0, reason: "email_disabled" });
    }

    const result = await sendEmail({
      to: userEmail,
      subject: emailSubject,
      html: emailHtml,
    });

    return NextResponse.json({
      ok: true,
      sent: result.success ? 1 : 0,
      messageId: result.messageId,
      error: result.error,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    console.error("[Archii Email Notify] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
