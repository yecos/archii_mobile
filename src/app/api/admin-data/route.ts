import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { getAdminDb, getAdminFieldValue } from "@/lib/firebase-admin";

/**
 * POST /api/admin-data
 *
 * Panel de datos administrativos — lectura y gestión de audit logs,
 * reportes de errores y feedback beta.
 * PROTEGIDO: Solo Admin/Director/Super Admin (requireAuth + role check).
 *
 * Acciones:
 *   - audit-logs:      Listar audit logs (paginado, filtrable por collection, action, userId)
 *   - error-reports:   Listar reportes de errores (paginado, filtrable por resolved)
 *   - beta-feedback:   Listar feedback beta (paginado, filtrable por category)
 *   - resolve-error:   Marcar un error report como resuelto
 *   - review-feedback: Marcar feedback como revisado + nota del admin
 */

const ADMIN_ROLES = ["Admin", "Director", "Super Admin"];

export async function POST(request: NextRequest) {
  let user: any;
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Error de autenticación" }, { status: 401 });
  }

  // Verify user has admin role
  const db = getAdminDb();
  let userRole = user.role || "";
  if (!ADMIN_ROLES.includes(userRole)) {
    // Look up role from Firestore as fallback
    try {
      const userDoc = await db.collection("users").doc(user.uid).get();
      if (userDoc.exists) {
        userRole = userDoc.data()?.role || "";
      }
    } catch {
      // ignore
    }
    if (!ADMIN_ROLES.includes(userRole)) {
      return NextResponse.json(
        { error: "No autorizado. Se requiere rol de Admin, Director o Super Admin." },
        { status: 403 }
      );
    }
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { action } = body;

  const validActions = [
    "audit-logs",
    "error-reports",
    "beta-feedback",
    "resolve-error",
    "review-feedback",
  ];

  if (!action || !validActions.includes(action)) {
    return NextResponse.json(
      { error: `Acción inválida. Usa: ${validActions.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const FieldValue = getAdminFieldValue();

    // ===== AUDIT LOGS =====
    if (action === "audit-logs") {
      const {
        tenantId,
        collection: filterCollection,
        filterAction,
        userId: filterUserId,
        page = 1,
        pageSize = 20,
      } = body;

      if (!tenantId) {
        return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });
      }

      let query: any = db
        .collection("audit_logs")
        .where("tenantId", "==", tenantId);

      if (filterCollection) {
        query = query.where("collection", "==", filterCollection);
      }
      if (filterAction) {
        query = query.where("action", "==", filterAction);
      }
      if (filterUserId) {
        query = query.where("userId", "==", filterUserId);
      }

      // Order by timestamp descending
      query = query.orderBy("timestamp", "desc");

      // Pagination with offset
      const offset = (page - 1) * pageSize;
      query = query.offset(offset).limit(pageSize);

      const snap = await query.get();

      const logs = snap.docs.map((doc: any) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Normalize Firestore timestamps
          timestamp: data.timestamp?._seconds
            ? new Date(data.timestamp._seconds * 1000).toISOString()
            : data.timestamp,
          createdAt: data.createdAt?._seconds
            ? new Date(data.createdAt._seconds * 1000).toISOString()
            : data.createdAt,
        };
      });

      // Get total count for pagination (approximate)
      let totalCount = 0;
      try {
        const countQuery = db
          .collection("audit_logs")
          .where("tenantId", "==", tenantId);
        const countSnap = await countQuery.get();
        totalCount = countSnap.size;
      } catch {
        // If count fails, just skip it
      }

      // Resolve user names
      const userIds = [...new Set(logs.map((l: any) => l.userId).filter(Boolean))] as string[];
      const userMap: Record<string, string> = {};
      for (const uid of userIds) {
        try {
          const uDoc = await db.collection("users").doc(uid).get();
          userMap[uid] = uDoc.exists ? uDoc.data()?.name || uid : uid;
        } catch {
          userMap[uid] = uid;
        }
      }

      return NextResponse.json({
        logs: logs.map((l: any) => ({ ...l, userName: userMap[l.userId] || l.userId })),
        totalCount,
        page,
        pageSize,
        hasMore: logs.length === pageSize,
      });
    }

    // ===== ERROR REPORTS =====
    if (action === "error-reports") {
      const { resolved, page = 1, pageSize = 20 } = body;

      let query = db.collection("error_reports").orderBy("timestamp", "desc");

      // Filter by resolved status if specified
      if (resolved !== undefined) {
        query = query.where("resolved", "==", resolved);
      }

      const offset = (page - 1) * pageSize;
      query = query.offset(offset).limit(pageSize);

      const snap = await query.get();

      const reports = snap.docs.map((doc: any) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp?._seconds
            ? new Date(data.timestamp._seconds * 1000).toISOString()
            : data.timestamp,
        };
      });

      // Group by message for dedup view
      const grouped: Record<string, { message: string; count: number; firstSeen: string; lastSeen: string; ids: string[]; resolved: boolean; sampleStack?: string; sampleComponentStack?: string; sampleScreen?: string; sampleUserAgent?: string; reports: any[] }> = {};
      for (const report of reports) {
        const key = (report.message || "Unknown").substring(0, 200);
        if (!grouped[key]) {
          grouped[key] = {
            message: report.message || "Unknown",
            count: 0,
            firstSeen: report.timestamp || "",
            lastSeen: report.timestamp || "",
            ids: [],
            resolved: !!report.resolved,
            sampleStack: report.stack,
            sampleComponentStack: report.componentStack,
            sampleScreen: report.screen,
            sampleUserAgent: report.userAgent,
            reports: [],
          };
        }
        grouped[key].count++;
        grouped[key].ids.push(report.id);
        grouped[key].reports.push(report);
        if (report.timestamp < grouped[key].firstSeen) {
          grouped[key].firstSeen = report.timestamp;
        }
        if (report.timestamp > grouped[key].lastSeen) {
          grouped[key].lastSeen = report.timestamp;
        }
      }

      // Get total count
      let totalCount = 0;
      let unresolvedCount = 0;
      try {
        const allSnap = await db.collection("error_reports").get();
        totalCount = allSnap.size;
        for (const doc of allSnap.docs) {
          if (!doc.data().resolved) unresolvedCount++;
        }
      } catch {
        // skip
      }

      return NextResponse.json({
        reports,
        grouped: Object.values(grouped).sort((a, b) => b.count - a.count),
        totalCount,
        unresolvedCount,
        page,
        pageSize,
        hasMore: reports.length === pageSize,
      });
    }

    // ===== BETA FEEDBACK =====
    if (action === "beta-feedback") {
      const { category, page = 1, pageSize = 20 } = body;

      let query = db.collection("beta_feedback").orderBy("timestamp", "desc");

      if (category) {
        query = query.where("category", "==", category);
      }

      const offset = (page - 1) * pageSize;
      query = query.offset(offset).limit(pageSize);

      const snap = await query.get();

      const entries = snap.docs.map((doc: any) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp?._seconds
            ? new Date(data.timestamp._seconds * 1000).toISOString()
            : data.timestamp,
        };
      });

      // Get total count
      let totalCount = 0;
      let reviewedCount = 0;
      try {
        const allSnap = await db.collection("beta_feedback").get();
        totalCount = allSnap.size;
        for (const doc of allSnap.docs) {
          if (doc.data().reviewed) reviewedCount++;
        }
      } catch {
        // skip
      }

      // Category stats
      const categoryStats: Record<string, number> = {};
      for (const entry of entries) {
        const cat = entry.category || "other";
        categoryStats[cat] = (categoryStats[cat] || 0) + 1;
      }

      return NextResponse.json({
        entries,
        totalCount,
        reviewedCount,
        categoryStats,
        page,
        pageSize,
        hasMore: entries.length === pageSize,
      });
    }

    // ===== RESOLVE ERROR =====
    if (action === "resolve-error") {
      const { errorId } = body;
      if (!errorId) {
        return NextResponse.json({ error: "errorId requerido" }, { status: 400 });
      }

      const errorDoc = await db.collection("error_reports").doc(errorId).get();
      if (!errorDoc.exists) {
        return NextResponse.json({ error: "Error report no encontrado" }, { status: 404 });
      }

      await db.collection("error_reports").doc(errorId).update({
        resolved: true,
        resolvedAt: FieldValue.serverTimestamp(),
        resolvedBy: user.uid,
      });

      return NextResponse.json({ resolved: true, errorId });
    }

    // ===== REVIEW FEEDBACK =====
    if (action === "review-feedback") {
      const { feedbackId, adminNote } = body;
      if (!feedbackId) {
        return NextResponse.json({ error: "feedbackId requerido" }, { status: 400 });
      }

      const feedbackDoc = await db.collection("beta_feedback").doc(feedbackId).get();
      if (!feedbackDoc.exists) {
        return NextResponse.json({ error: "Feedback no encontrado" }, { status: 404 });
      }

      const updates: Record<string, any> = {
        reviewed: true,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: user.uid,
      };

      if (adminNote && typeof adminNote === "string") {
        updates.adminNote = adminNote.trim();
      }

      await db.collection("beta_feedback").doc(feedbackId).update(updates);

      return NextResponse.json({ reviewed: true, feedbackId });
    }

    return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno";
    console.error("[AdminData] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
