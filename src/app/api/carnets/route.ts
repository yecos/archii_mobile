import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { getAdminDb, getAdminFieldValue } from "@/lib/firebase-admin";

/**
 * POST /api/carnets
 *
 * Corporate ID Card (Carnets) management.
 * All data scoped by tenantId.
 *
 * Actions:
 *   - list:          List all carnets for the tenant (with optional search, status filter)
 *   - create:        Create a new carnet/employee record
 *   - update:        Update an existing carnet
 *   - delete:        Delete a carnet
 *   - toggle-status: Toggle active/inactive
 *   - duplicate:     Duplicate a carnet
 *   - stats:         Get dashboard stats (total, active, inactive, valid, expired)
 *   - get-by-code:   Get carnet by employee code (for public QR page, no auth required)
 */

interface CarnetData {
  tenantId: string;
  employeeCode: string;
  fullName: string;
  position: string;
  area: string;
  phone: string;
  email: string;
  bloodType: string;
  eps: string;
  emergencyContact: string;
  emergencyPhone: string;
  startDate: string;
  validUntil: string;
  photoBase64: string;
  city: string;
  isActive: boolean;
  createdAt: any;
  createdBy: string;
}

const ADMIN_ROLES = ['Admin', 'Director', 'Super Admin'];

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { action } = body;

  // get-by-code is a public action — no auth required
  if (action === 'get-by-code') {
    return handleGetByCode(body);
  }

  // All other actions require auth
  let user: any;
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Error de autenticación" }, { status: 401 });
  }

  const validActions = [
    "list", "create", "update", "delete",
    "toggle-status", "duplicate", "stats",
  ];

  if (!action || !validActions.includes(action)) {
    return NextResponse.json(
      { error: `Acción inválida. Usa: ${validActions.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const db = getAdminDb();
    const FieldValue = getAdminFieldValue();

    // ===== LIST — All carnets for tenant =====
    if (action === "list") {
      const { tenantId, search, status, page = 1, limit = 50 } = body;
      if (!tenantId) {
        return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });
      }

      let query = db.collection("carnets")
        .where("tenantId", "==", tenantId)
        .orderBy("createdAt", "desc");

      if (status === 'active') {
        query = db.collection("carnets")
          .where("tenantId", "==", tenantId)
          .where("isActive", "==", true)
          .orderBy("createdAt", "desc");
      } else if (status === 'inactive') {
        query = db.collection("carnets")
          .where("tenantId", "==", tenantId)
          .where("isActive", "==", false)
          .orderBy("createdAt", "desc");
      }

      const snap = await query.get();
      let carnets = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

      // Client-side search filter (Firestore doesn't support full-text search)
      if (search) {
        const q = search.toLowerCase();
        carnets = carnets.filter((c: any) =>
          (c.fullName || '').toLowerCase().includes(q) ||
          (c.employeeCode || '').toLowerCase().includes(q) ||
          (c.position || '').toLowerCase().includes(q) ||
          (c.area || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q)
        );
      }

      // Pagination
      const total = carnets.length;
      const start = (page - 1) * limit;
      const paginated = carnets.slice(start, start + limit);

      return NextResponse.json({ carnets: paginated, total, page, limit });
    }

    // ===== CREATE — New carnet =====
    if (action === "create") {
      const {
        tenantId, employeeCode, fullName, position, area,
        phone, email, bloodType, eps, emergencyContact, emergencyPhone,
        startDate, validUntil, photoBase64, city,
      } = body;

      if (!tenantId) {
        return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });
      }
      if (!fullName || !fullName.trim()) {
        return NextResponse.json({ error: "Nombre completo es requerido" }, { status: 400 });
      }

      // Auto-generate employee code if not provided
      let code = employeeCode;
      if (!code) {
        // Find the highest ARCH-XXX number for this tenant
        const existingSnap = await db.collection("carnets")
          .where("tenantId", "==", tenantId)
          .orderBy("createdAt", "desc")
          .limit(100)
          .get();

        let maxNum = 0;
        existingSnap.docs.forEach((doc: any) => {
          const data = doc.data();
          const match = (data.employeeCode || '').match(/ARCH-(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        });
        code = `ARCH-${String(maxNum + 1).padStart(3, '0')}`;
      }

      // Check unique employee code per tenant
      const existingCode = await db.collection("carnets")
        .where("tenantId", "==", tenantId)
        .where("employeeCode", "==", code)
        .limit(1)
        .get();

      if (!existingCode.empty) {
        return NextResponse.json(
          { error: `El código ${code} ya existe en este espacio` },
          { status: 409 }
        );
      }

      // Resize photo if too large (max ~500KB for Firestore)
      let photo = photoBase64 || '';
      if (photo && photo.length > 680000) {
        // Truncate with warning — in production you'd resize
        console.warn('[Carnets] Photo base64 exceeds 500KB, truncating');
        photo = ''; // Clear oversized photos rather than storing broken data
      }

      const carnetData: CarnetData = {
        tenantId,
        employeeCode: code,
        fullName: fullName.trim(),
        position: position || '',
        area: area || '',
        phone: phone || '',
        email: email || '',
        bloodType: bloodType || '',
        eps: eps || '',
        emergencyContact: emergencyContact || '',
        emergencyPhone: emergencyPhone || '',
        startDate: startDate || new Date().toISOString().split('T')[0],
        validUntil: validUntil || '',
        photoBase64: photo,
        city: city || '',
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: user.uid,
      };

      const docRef = await db.collection("carnets").add(carnetData);

      return NextResponse.json({
        id: docRef.id,
        ...carnetData,
        createdAt: new Date().toISOString(),
      });
    }

    // ===== UPDATE — Existing carnet =====
    if (action === "update") {
      const { carnetId, tenantId, ...updates } = body;

      if (!carnetId || !tenantId) {
        return NextResponse.json({ error: "carnetId y tenantId requeridos" }, { status: 400 });
      }

      const doc = await db.collection("carnets").doc(carnetId).get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Carnet no encontrado" }, { status: 404 });
      }

      const existing = doc.data()!;
      if (existing.tenantId !== tenantId) {
        return NextResponse.json({ error: "Carnet no pertenece a este espacio" }, { status: 403 });
      }

      // If employeeCode is being changed, check uniqueness
      if (updates.employeeCode && updates.employeeCode !== existing.employeeCode) {
        const dupSnap = await db.collection("carnets")
          .where("tenantId", "==", tenantId)
          .where("employeeCode", "==", updates.employeeCode)
          .limit(1)
          .get();
        if (!dupSnap.empty && dupSnap.docs[0].id !== carnetId) {
          return NextResponse.json(
            { error: `El código ${updates.employeeCode} ya existe` },
            { status: 409 }
          );
        }
      }

      // Resize photo if too large
      if (updates.photoBase64 && updates.photoBase64.length > 680000) {
        console.warn('[Carnets] Photo base64 exceeds 500KB, clearing');
        updates.photoBase64 = '';
      }

      // Only allow specific fields
      const allowedFields = [
        'employeeCode', 'fullName', 'position', 'area',
        'phone', 'email', 'bloodType', 'eps',
        'emergencyContact', 'emergencyPhone',
        'startDate', 'validUntil', 'photoBase64', 'city', 'isActive',
      ];
      const cleanUpdates: Record<string, any> = {};
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          cleanUpdates[field] = updates[field];
        }
      }
      cleanUpdates.updatedAt = FieldValue.serverTimestamp();

      await db.collection("carnets").doc(carnetId).update(cleanUpdates);

      return NextResponse.json({ updated: true, id: carnetId });
    }

    // ===== DELETE =====
    if (action === "delete") {
      const { carnetId, tenantId } = body;
      if (!carnetId || !tenantId) {
        return NextResponse.json({ error: "carnetId y tenantId requeridos" }, { status: 400 });
      }

      const doc = await db.collection("carnets").doc(carnetId).get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Carnet no encontrado" }, { status: 404 });
      }

      const data = doc.data()!;
      if (data.tenantId !== tenantId) {
        return NextResponse.json({ error: "Carnet no pertenece a este espacio" }, { status: 403 });
      }

      await db.collection("carnets").doc(carnetId).delete();
      return NextResponse.json({ deleted: true, id: carnetId });
    }

    // ===== TOGGLE STATUS =====
    if (action === "toggle-status") {
      const { carnetId, tenantId } = body;
      if (!carnetId || !tenantId) {
        return NextResponse.json({ error: "carnetId y tenantId requeridos" }, { status: 400 });
      }

      const doc = await db.collection("carnets").doc(carnetId).get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Carnet no encontrado" }, { status: 404 });
      }

      const data = doc.data()!;
      if (data.tenantId !== tenantId) {
        return NextResponse.json({ error: "Carnet no pertenece a este espacio" }, { status: 403 });
      }

      const newStatus = !data.isActive;
      await db.collection("carnets").doc(carnetId).update({
        isActive: newStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ updated: true, id: carnetId, isActive: newStatus });
    }

    // ===== DUPLICATE =====
    if (action === "duplicate") {
      const { carnetId, tenantId } = body;
      if (!carnetId || !tenantId) {
        return NextResponse.json({ error: "carnetId y tenantId requeridos" }, { status: 400 });
      }

      const doc = await db.collection("carnets").doc(carnetId).get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Carnet no encontrado" }, { status: 404 });
      }

      const data = doc.data()!;
      if (data.tenantId !== tenantId) {
        return NextResponse.json({ error: "Carnet no pertenece a este espacio" }, { status: 403 });
      }

      // Generate new employee code
      const existingSnap = await db.collection("carnets")
        .where("tenantId", "==", tenantId)
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();

      let maxNum = 0;
      existingSnap.docs.forEach((d: any) => {
        const match = (d.data().employeeCode || '').match(/ARCH-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      const newCode = `ARCH-${String(maxNum + 1).padStart(3, '0')}`;

      const duplicated: CarnetData = {
        tenantId,
        employeeCode: newCode,
        fullName: `${data.fullName} (copia)`,
        position: data.position || '',
        area: data.area || '',
        phone: data.phone || '',
        email: data.email || '',
        bloodType: data.bloodType || '',
        eps: data.eps || '',
        emergencyContact: data.emergencyContact || '',
        emergencyPhone: data.emergencyPhone || '',
        startDate: data.startDate || '',
        validUntil: data.validUntil || '',
        photoBase64: data.photoBase64 || '',
        city: data.city || '',
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: user.uid,
      };

      const newDoc = await db.collection("carnets").add(duplicated);

      return NextResponse.json({
        id: newDoc.id,
        ...duplicated,
        createdAt: new Date().toISOString(),
      });
    }

    // ===== STATS =====
    if (action === "stats") {
      const { tenantId } = body;
      if (!tenantId) {
        return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });
      }

      const snap = await db.collection("carnets")
        .where("tenantId", "==", tenantId)
        .get();

      const now = new Date();
      const total = snap.size;
      let active = 0;
      let inactive = 0;
      let valid = 0;
      let expired = 0;

      snap.docs.forEach((doc: any) => {
        const data = doc.data();
        if (data.isActive) active++;
        else inactive++;

        if (data.validUntil) {
          const validDate = new Date(data.validUntil);
          if (validDate >= now) valid++;
          else expired++;
        } else {
          valid++; // No expiry = valid
        }
      });

      return NextResponse.json({ total, active, inactive, valid, expired });
    }

    return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno";
    console.error("[Carnets] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ===== GET BY CODE — Public, no auth required =====
async function handleGetByCode(body: any) {
  const { employeeCode } = body;
  if (!employeeCode) {
    return NextResponse.json({ error: "employeeCode requerido" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection("carnets")
      .where("employeeCode", "==", employeeCode)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ error: "Carnet no encontrado" }, { status: 404 });
    }

    const doc = snap.docs[0];
    const data = doc.data();

    // Check validity
    const now = new Date();
    let isValid = true;
    if (data.validUntil) {
      isValid = new Date(data.validUntil) >= now;
    }

    return NextResponse.json({
      id: doc.id,
      employeeCode: data.employeeCode,
      fullName: data.fullName,
      position: data.position,
      area: data.area,
      phone: data.phone,
      email: data.email,
      bloodType: data.bloodType,
      eps: data.eps,
      emergencyContact: data.emergencyContact,
      emergencyPhone: data.emergencyPhone,
      startDate: data.startDate,
      validUntil: data.validUntil,
      photoBase64: data.photoBase64,
      city: data.city,
      isActive: data.isActive,
      isValid,
      tenantId: data.tenantId,
      // Get tenant name
      tenantName: await getTenantName(db, data.tenantId),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno";
    console.error("[Carnets] get-by-code error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function getTenantName(db: any, tenantId: string): Promise<string> {
  try {
    const doc = await db.collection("tenants").doc(tenantId).get();
    if (doc.exists) return doc.data()?.name || 'ARCHII';
    return 'ARCHII';
  } catch {
    return 'ARCHII';
  }
}
