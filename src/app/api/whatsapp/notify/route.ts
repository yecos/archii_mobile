import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp-service";
import { requireAuth, AuthError, type AuthUser } from "@/lib/api-auth";

/**
 * POST /api/whatsapp/notify
 * Endpoint server-side para enviar notificaciones de WhatsApp.
 * Requiere autenticacion para TODAS las rutas (broadcast y individual).
 *
 * Body: { userId: string, message: string }
 * Body: { broadcast: true, message: string }
 */
export async function POST(request: NextRequest) {
  let authUser: AuthUser;
  try {
    authUser = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Error de autenticación" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { userId, message, broadcast } = body;

    if (!message) {
      return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
    }

    const { getAdminDb } = await import("@/lib/firebase-admin");
    const db = getAdminDb();

    if (broadcast) {
      // Tenant isolation: obtener tenantId del usuario autenticado
      const userSnap = await db.collection("users").doc(authUser.uid).get();
      const tenantId = userSnap.exists ? userSnap.data()?.tenantId : null;
      if (!tenantId) {
        return NextResponse.json({ error: "Usuario sin tenant asociado" }, { status: 403 });
      }

      // Solo enviar a links del mismo tenant
      const query = db
        .collection("whatsappLinks")
        .where("active", "==", true)
        .where("tenantId", "==", tenantId);

      const snap = await query.get();

      // Enviar en paralelo con Promise.allSettled
      const results = await Promise.allSettled(
        snap.docs.map(async (doc) => {
          const link = doc.data();
          const result = await sendWhatsAppMessage(link.whatsappPhone, message);
          return result.success;
        })
      );

      const sent = results.filter(
        (r) => r.status === "fulfilled" && r.value === true
      ).length;

      return NextResponse.json({ ok: true, sent, total: snap.size });
    }

    if (!userId) {
      return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    }

    // SEC-H03: Verify sender and recipient belong to the same tenant
    const senderDoc = await db.collection("users").doc(authUser.uid).get();
    const senderTenantId = senderDoc.exists ? senderDoc.data()?.defaultTenantId : null;

    const snap = await db
      .collection("whatsappLinks")
      .where("userId", "==", userId)
      .where("active", "==", true)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ ok: true, sent: 0, reason: "no_link" });
    }

    // Check that recipient belongs to the same tenant
    const recipientLink = snap.docs[0].data();
    if (recipientLink.tenantId && senderTenantId && recipientLink.tenantId !== senderTenantId) {
      return NextResponse.json({ error: "No puedes enviar mensajes a usuarios de otro equipo" }, { status: 403 });
    }

    const result = await sendWhatsAppMessage(recipientLink.whatsappPhone, message);

    return NextResponse.json({
      ok: true,
      sent: result.success ? 1 : 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    console.error("[Archii Notify] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
