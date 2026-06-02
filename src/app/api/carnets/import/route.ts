import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { getAdminDb, getAdminFieldValue } from "@/lib/firebase-admin";
import * as XLSX from "xlsx";

/**
 * POST /api/carnets/import
 *
 * Bulk import carnets from an Excel file (.xlsx, .xls).
 * Expects multipart/form-data with:
 *   - file: the Excel file
 *   - tenantId: the tenant ID
 *
 * The Excel file should have columns matching the CarnetData fields.
 * Column names are matched case-insensitively and with common variations.
 */

interface ImportRow {
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
  _rowIndex: number;
  _missingFields: string[];
}

// Column name mapping: lowercase key → CarnetData field
const COLUMN_MAP: Record<string, keyof ImportRow> = {
  // Nombre
  'nombre completo': 'fullName',
  'nombre_completo': 'fullName',
  'nombrecompleto': 'fullName',
  'nombre': 'fullName',
  'name': 'fullName',
  'full name': 'fullName',
  'full_name': 'fullName',
  // Código
  'codigo empleado': 'employeeCode',
  'codigo_empleado': 'employeeCode',
  'codigoempleado': 'employeeCode',
  'codigo': 'employeeCode',
  'code': 'employeeCode',
  'employee code': 'employeeCode',
  'employee_code': 'employeeCode',
  'empleado': 'employeeCode',
  // Cédula (maps to employeeCode as fallback)
  'cedula de ciudadania': 'employeeCode',
  'cedula': 'employeeCode',
  'cc': 'employeeCode',
  'identificacion': 'employeeCode',
  // Cargo
  'cargo': 'position',
  'cargo / posicion': 'position',
  'cargo/posicion': 'position',
  'posicion': 'position',
  'position': 'position',
  'puesto': 'position',
  'rol': 'position',
  // Área
  'area': 'area',
  'area / departamento': 'area',
  'area/departamento': 'area',
  'departamento': 'area',
  'department': 'area',
  // Ciudad
  'ciudad': 'city',
  'city': 'city',
  'municipio': 'city',
  // Teléfono
  'telefono': 'phone',
  'tel': 'phone',
  'phone': 'phone',
  'celular': 'phone',
  // Email
  'email': 'email',
  'correo': 'email',
  'correo electronico': 'email',
  'e-mail': 'email',
  // Tipo de sangre
  'tipo de sangre': 'bloodType',
  'tipodesangre': 'bloodType',
  'blood type': 'bloodType',
  'blood_type': 'bloodType',
  'rh': 'bloodType',
  'grupo sanguineo': 'bloodType',
  // EPS
  'eps': 'eps',
  'aseguradora': 'eps',
  'salud': 'eps',
  // Contacto emergencia
  'contacto de emergencia': 'emergencyContact',
  'contactodeemergencia': 'emergencyContact',
  'emergency contact': 'emergencyContact',
  'contacto emergencia': 'emergencyContact',
  // Teléfono emergencia
  'telefono emergencia': 'emergencyPhone',
  'telefonoemergencia': 'emergencyPhone',
  'emergency phone': 'emergencyPhone',
  'tel emergencia': 'emergencyPhone',
  // Fecha ingreso
  'fecha ingreso': 'startDate',
  'fechaingreso': 'startDate',
  'fecha inicio': 'startDate',
  'fechainicio': 'startDate',
  'start date': 'startDate',
  'start_date': 'startDate',
  'ingreso': 'startDate',
  // Vigencia
  'vigencia hasta': 'validUntil',
  'vigenciahasta': 'validUntil',
  'valido hasta': 'validUntil',
  'valid until': 'validUntil',
  'valid_until': 'validUntil',
  'vencimiento': 'validUntil',
  'fecha vencimiento': 'validUntil',
  'expiracion': 'validUntil',
  // Foto
  'foto': 'photoBase64',
  'foto (url o base64)': 'photoBase64',
  'photo': 'photoBase64',
  'fotografia': 'photoBase64',
  // Activo
  'activo': 'isActive',
  'active': 'isActive',
  'estado': 'isActive',
  'status': 'isActive',
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[_\-\.]/g, ' ').replace(/\s+/g, ' ');
}

function resolveColumn(header: string): keyof ImportRow | null {
  const normalized = normalizeHeader(header);
  return COLUMN_MAP[normalized] || null;
}

function parseExcelDate(value: any): string {
  if (!value) return '';
  if (typeof value === 'number') {
    // Excel serial date number
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
    return '';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      const [d, m, y] = trimmed.split('/');
      return `${y}-${m}-${d}`;
    }
    // Text like "Jun 2025" — keep as-is
    return trimmed;
  }
  return String(value);
}

function parseActive(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'si' || lower === 'sí' || lower === 'yes' || lower === '1' || lower === 'true' || lower === 'activo';
  }
  if (typeof value === 'number') return value !== 0;
  return true;
}

export async function POST(request: NextRequest) {
  // Auth check
  let user: any;
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Error de autenticación" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const tenantId = formData.get('tenantId') as string | null;

    if (!file) {
      return NextResponse.json({ error: "Archivo no proporcionado" }, { status: 400 });
    }
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });
    }

    // Read the Excel file
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

    // Use first sheet (or "Personal Carnets" if exists)
    const sheetName = workbook.SheetNames.includes('Personal Carnets')
      ? 'Personal Carnets'
      : workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return NextResponse.json({ error: "No se encontró una hoja válida en el archivo" }, { status: 400 });
    }

    // Convert to JSON with headers
    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (rawData.length === 0) {
      return NextResponse.json({ error: "El archivo está vacío o no tiene datos" }, { status: 400 });
    }

    // Map columns
    const headers = Object.keys(rawData[0]);
    const columnMapping: Record<string, keyof ImportRow | null> = {};
    const unmappedColumns: string[] = [];

    for (const header of headers) {
      const field = resolveColumn(header);
      columnMapping[header] = field;
      if (!field && header.trim() !== '' && header !== '#') {
        unmappedColumns.push(header);
      }
    }

    // Parse rows
    const rows: ImportRow[] = [];
    let skippedCount = 0;

    for (let i = 0; i < rawData.length; i++) {
      const rawRow = rawData[i];
      const row: any = {
        employeeCode: '',
        fullName: '',
        position: '',
        area: '',
        phone: '',
        email: '',
        bloodType: '',
        eps: '',
        emergencyContact: '',
        emergencyPhone: '',
        startDate: '',
        validUntil: '',
        photoBase64: '',
        city: '',
        isActive: true,
        _rowIndex: i + 2,
        _missingFields: [],
      };

      for (const [header, value] of Object.entries(rawRow)) {
        const field = columnMapping[header];
        if (!field) continue;

        if (field === 'startDate' || field === 'validUntil') {
          row[field] = parseExcelDate(value);
        } else if (field === 'isActive') {
          row[field] = parseActive(value);
        } else if (field === 'bloodType') {
          let bt = String(value).trim().toUpperCase();
          bt = bt.replace(/^RH[\s:]*/i, '');
          row[field] = bt;
        } else {
          row[field] = String(value).trim();
        }
      }

      // Skip rows without a name
      if (!row.fullName) {
        skippedCount++;
        continue;
      }

      // Track missing important fields
      const importantFields: [keyof ImportRow, string][] = [
        ['position', 'Cargo'],
        ['area', 'Área'],
        ['phone', 'Teléfono'],
        ['bloodType', 'Tipo de Sangre'],
        ['eps', 'EPS'],
        ['emergencyContact', 'Contacto Emergencia'],
        ['emergencyPhone', 'Tel. Emergencia'],
        ['startDate', 'Fecha Ingreso'],
        ['validUntil', 'Vigencia'],
      ];

      for (const [field, label] of importantFields) {
        if (!row[field]) {
          row._missingFields.push(label);
        }
      }

      rows.push(row);
    }

    if (rows.length === 0) {
      return NextResponse.json({
        error: "No se encontraron registros válidos. Asegúrate de que la columna 'Nombre Completo' exista y tenga datos.",
      }, { status: 400 });
    }

    // Bulk create in Firestore
    const db = getAdminDb();
    const FieldValue = getAdminFieldValue();

    // Get existing codes for this tenant
    const existingSnap = await db.collection("carnets")
      .where("tenantId", "==", tenantId)
      .limit(500)
      .get();

    const existingCodes = new Set<string>();
    let maxCodeNum = 0;
    existingSnap.docs.forEach((doc: any) => {
      const data = doc.data();
      if (data.employeeCode) {
        existingCodes.add(data.employeeCode);
        const match = data.employeeCode.match(/ARCH-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxCodeNum) maxCodeNum = num;
        }
      }
    });

    const created: any[] = [];
    const errors: any[] = [];

    for (const row of rows) {
      try {
        // Auto-generate employee code if missing or looks like a CC number
        let code = row.employeeCode;
        if (!code || existingCodes.has(code) || /^[\d.]+$/.test(code)) {
          maxCodeNum++;
          code = `ARCH-${String(maxCodeNum).padStart(3, '0')}`;
        }
        existingCodes.add(code);

        // Limit photo size
        let photo = row.photoBase64 || '';
        if (photo && photo.length > 680000) {
          photo = '';
        }

        const carnetData = {
          tenantId,
          employeeCode: code,
          fullName: row.fullName,
          position: row.position || '',
          area: row.area || '',
          phone: row.phone || '',
          email: row.email || '',
          bloodType: row.bloodType || '',
          eps: row.eps || '',
          emergencyContact: row.emergencyContact || '',
          emergencyPhone: row.emergencyPhone || '',
          startDate: row.startDate || new Date().toISOString().split('T')[0],
          validUntil: row.validUntil || '',
          photoBase64: photo,
          city: row.city || '',
          isActive: row.isActive,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: user.uid,
          importedFrom: 'excel',
        };

        const docRef = await db.collection("carnets").add(carnetData);

        created.push({
          id: docRef.id,
          employeeCode: code,
          fullName: row.fullName,
          position: row.position,
          bloodType: row.bloodType,
          missingFields: row._missingFields,
        });
      } catch (err: any) {
        errors.push({
          row: row._rowIndex,
          fullName: row.fullName,
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      total: rows.length,
      created: created.length,
      errors: errors.length,
      skipped: skippedCount,
      results: created,
      errorDetails: errors,
      unmappedColumns,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno";
    console.error("[Carnets Import] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
