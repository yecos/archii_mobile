import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp-service";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireAdmin, AuthError } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limiter";

/**
 * POST /api/whatsapp/send
 * Envia notificaciones de Archii a WhatsApp.
 */
export async function POST(request: NextRequest) {
  try {
    // Admin-only: broadcast and direct send require admin privileges
    const authResponse = await requireAdmin(request);

    // Rate limiting: 30 messages per minute per admin (prevents abuse / cost spikes)
    const adminUid = (authResponse as any)?.uid || 'unknown';
    const rateResult = await checkRateLimit(`whatsapp_send:${adminUid}`, { limit: 30, windowSeconds: 60 });
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: "Límite de envíos alcanzado. Intenta de nuevo en un minuto." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateResult.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const body = await request.json();
    const { type, userId, message, tenantId } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Se requiere un mensaje" }, { status: 400 });
    }

    const db = getAdminDb();
    let sentCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    if (type === "user" && userId) {
      let query = db
        .collection("whatsappLinks")
        .where("userId", "==", userId)
        .where("active", "==", true);
      if (tenantId) {
        query = query.where("tenantId", "==", tenantId);
      }
      const snap = await query.limit(1).get();

      if (snap.empty) {
        return NextResponse.json({ success: false, sent: 0, message: "El usuario no tiene WhatsApp vinculado" });
      }

      for (const doc of snap.docs) {
        const link = doc.data();
        const result = await sendWhatsAppMessage(link.whatsappPhone, message);
        if (result.success) sentCount++;
        else { errorCount++; errors.push(result.error || "Error"); }
      }
    } else if (type === "broadcast") {
      // SECURITY: Broadcast REQUIRES tenantId to prevent cross-tenant leaks
      if (!tenantId) {
        return NextResponse.json(
          { error: "tenantId es requerido para broadcast" },
          { status: 400 }
        );
      }

      const snap = await db
        .collection("whatsappLinks")
        .where("active", "==", true)
        .where("tenantId", "==", tenantId)
        .get();

      if (snap.empty) {
        return NextResponse.json({ success: false, sent: 0, message: "No hay usuarios con WhatsApp vinculado" });
      }

      for (const doc of snap.docs) {
        const link = doc.data();
        const result = await sendWhatsAppMessage(link.whatsappPhone, message);
        if (result.success) sentCount++;
        else { errorCount++; errors.push(`${link.userName}: ${result.error || "Error"}`); }
      }
    } else {
      return NextResponse.json({ error: "Se requiere type ('user' o 'broadcast') y userId (si type=user)" }, { status: 400 });
    }

    return NextResponse.json({ success: sentCount > 0, sent: sentCount, errors: errorCount, errorDetails: errors });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Error interno";
    console.error("[Archii WhatsApp] Error en send:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
