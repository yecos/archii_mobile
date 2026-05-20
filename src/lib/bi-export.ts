/**
 * bi-export.ts
 * BI Connector — Export service for Power BI / Tableau / custom BI tools.
 *
 * Provides structured data export from Firestore collections with:
 *   - CSV, JSON output formats
 *   - Cursor-based pagination (max 10 000 rows per request)
 *   - Date range filtering on all date fields
 *   - Field selection (export only specified columns)
 *   - PII sanitisation (optional redaction of emails, phones)
 *   - Nested-object flattening for BI compatibility
 *
 * Gated by feature flag 'bi_connector'.
 */

import { getAdminDb } from './firebase-admin';
import { isFlagEnabled } from './feature-flags';

/* ===== Types ===== */

export type BIExportFormat = 'csv' | 'json' | 'parquet';

export interface BIExportOptions {
  /** Tenant whose data to export */
  tenantId: string;
  /** ISO date string — lower bound for date fields */
  dateFrom?: string;
  /** ISO date string — upper bound for date fields */
  dateTo?: string;
  /** Which collections to include */
  collections: string[];
  /** Output format */
  format: BIExportFormat;
  /** Arbitrary key-value filters applied as equality checks */
  filters?: Record<string, string>;
  /** Max rows per request (hard cap 10 000) */
  limit?: number;
  /** Opaque cursor from a previous response for pagination */
  cursor?: string;
  /** Only export these fields (null = all) */
  fields?: string[];
  /** Redact PII (emails, phone numbers) */
  sanitizePII?: boolean;
}

export interface BIExportResult {
  /** The exported data as an array of flat objects */
  data: Record<string, unknown>[];
  /** Total rows available (may be larger than returned data) */
  total: number;
  /** Pass this value in the next request to fetch the next page */
  nextCursor?: string;
  /** How many rows were returned */
  rowCount: number;
}

export interface BISchemaField {
  name: string;
  type: string;
  description: string;
  nullable: boolean;
}

export interface BISchemaForeignKey {
  field: string;
  references: { collection: string; field: string };
}

export interface BISchemaCollection {
  name: string;
  description: string;
  fields: BISchemaField[];
  primaryKey: string;
  foreignKeys: BISchemaForeignKey[];
}

export interface BISchema {
  version: string;
  generatedAt: string;
  collections: BISchemaCollection[];
}

/* ===== Constants ===== */

const MAX_ROWS_PER_REQUEST = 10000;
const DEFAULT_LIMIT = 5000;
const ENCRYPTED_PREFIX = 'ENC_AES256:';

/* ===== Collection Schema Registry ===== */

const COLLECTION_DEFINITIONS: BISchemaCollection[] = [
  {
    name: 'projects',
    description: 'Construction projects managed by the tenant',
    primaryKey: 'id',
    foreignKeys: [
      { field: 'companyId', references: { collection: 'companies', field: 'id' } },
      { field: 'clientId', references: { collection: 'companies', field: 'id' } },
    ],
    fields: [
      { name: 'id', type: 'string', description: 'Unique document ID', nullable: false },
      { name: 'name', type: 'string', description: 'Project name', nullable: false },
      { name: 'description', type: 'string', description: 'Project description', nullable: true },
      { name: 'status', type: 'string', description: 'Current status', nullable: true },
      { name: 'client', type: 'string', description: 'Client name', nullable: true },
      { name: 'clientName', type: 'string', description: 'Client display name', nullable: true },
      { name: 'location', type: 'string', description: 'Project location', nullable: true },
      { name: 'budget', type: 'number', description: 'Budget in COP', nullable: true },
      { name: 'progress', type: 'number', description: 'Completion percentage (0-100)', nullable: true },
      { name: 'startDate', type: 'date', description: 'Planned start date', nullable: true },
      { name: 'endDate', type: 'date', description: 'Planned end date', nullable: true },
      { name: 'tenantId', type: 'string', description: 'Owning tenant ID', nullable: false },
      { name: 'createdBy', type: 'string', description: 'Creator user ID', nullable: true },
      { name: 'createdAt', type: 'datetime', description: 'Creation timestamp', nullable: false },
      { name: 'updatedAt', type: 'datetime', description: 'Last update timestamp', nullable: true },
    ],
  },
  {
    name: 'tasks',
    description: 'Work tasks within projects',
    primaryKey: 'id',
    foreignKeys: [
      { field: 'projectId', references: { collection: 'projects', field: 'id' } },
      { field: 'createdBy', references: { collection: 'users', field: 'id' } },
    ],
    fields: [
      { name: 'id', type: 'string', description: 'Unique document ID', nullable: false },
      { name: 'title', type: 'string', description: 'Task title', nullable: false },
      { name: 'description', type: 'string', description: 'Task description', nullable: true },
      { name: 'status', type: 'string', description: 'Task status', nullable: true },
      { name: 'priority', type: 'string', description: 'Task priority', nullable: true },
      { name: 'projectId', type: 'string', description: 'Parent project ID', nullable: false },
      { name: 'assigneeId', type: 'string', description: 'Primary assignee user ID', nullable: true },
      { name: 'assigneeIds', type: 'string', description: 'Comma-separated assignee IDs', nullable: true },
      { name: 'dueDate', type: 'date', description: 'Due date', nullable: true },
      { name: 'estimatedHours', type: 'number', description: 'Estimated hours', nullable: true },
      { name: 'tags', type: 'string', description: 'Comma-separated tags', nullable: true },
      { name: 'tenantId', type: 'string', description: 'Owning tenant ID', nullable: false },
      { name: 'createdBy', type: 'string', description: 'Creator user ID', nullable: true },
      { name: 'createdAt', type: 'datetime', description: 'Creation timestamp', nullable: false },
      { name: 'updatedAt', type: 'datetime', description: 'Last update timestamp', nullable: true },
    ],
  },
  {
    name: 'expenses',
    description: 'Project expenses / costs',
    primaryKey: 'id',
    foreignKeys: [
      { field: 'projectId', references: { collection: 'projects', field: 'id' } },
    ],
    fields: [
      { name: 'id', type: 'string', description: 'Unique document ID', nullable: false },
      { name: 'concept', type: 'string', description: 'Expense concept / description', nullable: false },
      { name: 'projectId', type: 'string', description: 'Parent project ID', nullable: true },
      { name: 'category', type: 'string', description: 'Expense category', nullable: true },
      { name: 'amount', type: 'number', description: 'Amount in COP', nullable: false },
      { name: 'date', type: 'date', description: 'Expense date', nullable: false },
      { name: 'paymentMethod', type: 'string', description: 'Payment method', nullable: true },
      { name: 'vendor', type: 'string', description: 'Vendor / supplier name', nullable: true },
      { name: 'tenantId', type: 'string', description: 'Owning tenant ID', nullable: false },
      { name: 'createdBy', type: 'string', description: 'Creator user ID', nullable: true },
      { name: 'createdAt', type: 'datetime', description: 'Creation timestamp', nullable: false },
    ],
  },
  {
    name: 'suppliers',
    description: 'Suppliers and vendors',
    primaryKey: 'id',
    foreignKeys: [],
    fields: [
      { name: 'id', type: 'string', description: 'Unique document ID', nullable: false },
      { name: 'name', type: 'string', description: 'Supplier name', nullable: false },
      { name: 'contact', type: 'string', description: 'Contact person', nullable: true },
      { name: 'email', type: 'string', description: 'Email address', nullable: true },
      { name: 'phone', type: 'string', description: 'Phone number', nullable: true },
      { name: 'category', type: 'string', description: 'Supplier category', nullable: true },
      { name: 'address', type: 'string', description: 'Address', nullable: true },
      { name: 'website', type: 'string', description: 'Website URL', nullable: true },
      { name: 'rating', type: 'number', description: 'Rating (1-5)', nullable: true },
      { name: 'tenantId', type: 'string', description: 'Owning tenant ID', nullable: false },
      { name: 'createdAt', type: 'datetime', description: 'Creation timestamp', nullable: false },
    ],
  },
  {
    name: 'timeEntries',
    description: 'Time tracking entries per project and user',
    primaryKey: 'id',
    foreignKeys: [
      { field: 'projectId', references: { collection: 'projects', field: 'id' } },
      { field: 'userId', references: { collection: 'users', field: 'id' } },
    ],
    fields: [
      { name: 'id', type: 'string', description: 'Unique document ID', nullable: false },
      { name: 'description', type: 'string', description: 'Work description', nullable: true },
      { name: 'projectId', type: 'string', description: 'Parent project ID', nullable: false },
      { name: 'userId', type: 'string', description: 'User who logged time', nullable: false },
      { name: 'userName', type: 'string', description: 'Display name of user', nullable: true },
      { name: 'phaseName', type: 'string', description: 'Work phase name', nullable: true },
      { name: 'duration', type: 'number', description: 'Duration in minutes', nullable: true },
      { name: 'date', type: 'date', description: 'Work date', nullable: false },
      { name: 'billable', type: 'boolean', description: 'Whether entry is billable', nullable: true },
      { name: 'rate', type: 'number', description: 'Hourly rate in COP', nullable: true },
      { name: 'tenantId', type: 'string', description: 'Owning tenant ID', nullable: false },
      { name: 'createdAt', type: 'datetime', description: 'Creation timestamp', nullable: false },
    ],
  },
  {
    name: 'invoices',
    description: 'Client invoices',
    primaryKey: 'id',
    foreignKeys: [
      { field: 'projectId', references: { collection: 'projects', field: 'id' } },
    ],
    fields: [
      { name: 'id', type: 'string', description: 'Unique document ID', nullable: false },
      { name: 'number', type: 'string', description: 'Invoice number', nullable: false },
      { name: 'projectName', type: 'string', description: 'Project display name', nullable: true },
      { name: 'clientName', type: 'string', description: 'Client display name', nullable: true },
      { name: 'status', type: 'string', description: 'Invoice status', nullable: true },
      { name: 'total', type: 'number', description: 'Total amount in COP', nullable: false },
      { name: 'subtotal', type: 'number', description: 'Subtotal in COP', nullable: true },
      { name: 'tax', type: 'number', description: 'Tax amount in COP', nullable: true },
      { name: 'issueDate', type: 'date', description: 'Issue date', nullable: false },
      { name: 'dueDate', type: 'date', description: 'Due date', nullable: true },
      { name: 'paidDate', type: 'date', description: 'Payment date', nullable: true },
      { name: 'tenantId', type: 'string', description: 'Owning tenant ID', nullable: false },
      { name: 'createdBy', type: 'string', description: 'Creator user ID', nullable: true },
      { name: 'createdAt', type: 'datetime', description: 'Creation timestamp', nullable: false },
    ],
  },
  {
    name: 'rfis',
    description: 'Requests for Information',
    primaryKey: 'id',
    foreignKeys: [
      { field: 'projectId', references: { collection: 'projects', field: 'id' } },
    ],
    fields: [
      { name: 'id', type: 'string', description: 'Unique document ID', nullable: false },
      { name: 'number', type: 'string', description: 'RFI number', nullable: true },
      { name: 'subject', type: 'string', description: 'RFI subject', nullable: false },
      { name: 'question', type: 'string', description: 'RFI question text', nullable: true },
      { name: 'response', type: 'string', description: 'RFI response text', nullable: true },
      { name: 'status', type: 'string', description: 'RFI status', nullable: true },
      { name: 'priority', type: 'string', description: 'RFI priority', nullable: true },
      { name: 'assignedTo', type: 'string', description: 'Assigned user ID', nullable: true },
      { name: 'dueDate', type: 'date', description: 'Due date', nullable: true },
      { name: 'projectId', type: 'string', description: 'Parent project ID', nullable: false },
      { name: 'tenantId', type: 'string', description: 'Owning tenant ID', nullable: false },
      { name: 'createdAt', type: 'datetime', description: 'Creation timestamp', nullable: false },
      { name: 'updatedAt', type: 'datetime', description: 'Last update timestamp', nullable: true },
    ],
  },
  {
    name: 'submittals',
    description: 'Design submittals and approvals',
    primaryKey: 'id',
    foreignKeys: [
      { field: 'projectId', references: { collection: 'projects', field: 'id' } },
    ],
    fields: [
      { name: 'id', type: 'string', description: 'Unique document ID', nullable: false },
      { name: 'number', type: 'string', description: 'Submittal number', nullable: true },
      { name: 'title', type: 'string', description: 'Submittal title', nullable: false },
      { name: 'description', type: 'string', description: 'Submittal description', nullable: true },
      { name: 'specification', type: 'string', description: 'Specification reference', nullable: true },
      { name: 'status', type: 'string', description: 'Submittal status', nullable: true },
      { name: 'reviewer', type: 'string', description: 'Reviewer user ID', nullable: true },
      { name: 'submittedBy', type: 'string', description: 'Submitter user ID', nullable: true },
      { name: 'dueDate', type: 'date', description: 'Due date', nullable: true },
      { name: 'projectId', type: 'string', description: 'Parent project ID', nullable: false },
      { name: 'tenantId', type: 'string', description: 'Owning tenant ID', nullable: false },
      { name: 'createdAt', type: 'datetime', description: 'Creation timestamp', nullable: false },
      { name: 'updatedAt', type: 'datetime', description: 'Last update timestamp', nullable: true },
    ],
  },
  {
    name: 'punchItems',
    description: 'Punch list items for quality control',
    primaryKey: 'id',
    foreignKeys: [
      { field: 'projectId', references: { collection: 'projects', field: 'id' } },
    ],
    fields: [
      { name: 'id', type: 'string', description: 'Unique document ID', nullable: false },
      { name: 'title', type: 'string', description: 'Punch item title', nullable: false },
      { name: 'description', type: 'string', description: 'Punch item description', nullable: true },
      { name: 'status', type: 'string', description: 'Punch item status', nullable: true },
      { name: 'priority', type: 'string', description: 'Punch item priority', nullable: true },
      { name: 'location', type: 'string', description: 'Location within project', nullable: true },
      { name: 'assignedTo', type: 'string', description: 'Assigned user ID', nullable: true },
      { name: 'dueDate', type: 'date', description: 'Due date', nullable: true },
      { name: 'projectId', type: 'string', description: 'Parent project ID', nullable: false },
      { name: 'tenantId', type: 'string', description: 'Owning tenant ID', nullable: false },
      { name: 'createdAt', type: 'datetime', description: 'Creation timestamp', nullable: false },
      { name: 'updatedAt', type: 'datetime', description: 'Last update timestamp', nullable: true },
    ],
  },
  {
    name: 'audit_logs',
    description: 'Audit trail of all write operations',
    primaryKey: 'id',
    foreignKeys: [],
    fields: [
      { name: 'id', type: 'string', description: 'Unique document ID', nullable: false },
      { name: 'collection', type: 'string', description: 'Affected Firestore collection', nullable: false },
      { name: 'docId', type: 'string', description: 'Affected document ID', nullable: false },
      { name: 'action', type: 'string', description: 'Action performed (create/update/delete)', nullable: false },
      { name: 'userId', type: 'string', description: 'User who performed the action', nullable: false },
      { name: 'tenantId', type: 'string', description: 'Tenant context', nullable: false },
      { name: 'timestamp', type: 'number', description: 'Unix timestamp (ms)', nullable: false },
      { name: 'createdAt', type: 'datetime', description: 'Server timestamp', nullable: false },
    ],
  },
];

/* ===== Available Collections ===== */

export function getAvailableCollections(): string[] {
  return COLLECTION_DEFINITIONS.map((c) => c.name);
}

/* ===== BI Schema ===== */

export function getBISchema(): BISchema {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    collections: COLLECTION_DEFINITIONS,
  };
}

/* ===== Helpers ===== */

/**
 * Flatten a nested object into dot-notation keys.
 * e.g. { a: { b: 1 } } → { 'a.b': 1 }
 */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = '',
  maxDepth = 3,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      maxDepth > 0
    ) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey, maxDepth - 1));
    } else if (Array.isArray(value)) {
      // Arrays are stringified for BI compatibility
      result[fullKey] = value.join(', ');
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

/**
 * Convert Firestore Timestamps and nested dates to ISO strings.
 */
function normaliseValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  // Firestore Timestamp
  if (typeof value === 'object' && value !== null && 'toDate' in (value as object)) {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }

  // Nested object
  if (typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normaliseValue(v);
    }
    return out;
  }

  return value;
}

/**
 * Detect and redact PII fields.
 */
function sanitizeRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const piiPatterns: Record<string, RegExp> = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    phone: /\b\+?\d[\d\s()-]{7,}\b/g,
  };

  const redacted: Record<string, unknown> = { ...record };

  for (const [fieldKey, value] of Object.entries(redacted)) {
    if (typeof value !== 'string') continue;

    const lowerKey = fieldKey.toLowerCase();
    if (lowerKey.includes('email') || lowerKey.includes('mail')) {
      redacted[fieldKey] = value.replace(piiPatterns.email, '[REDACTED_EMAIL]');
    } else if (lowerKey.includes('phone') || lowerKey.includes('tel') || lowerKey.includes('celular') || lowerKey.includes('movil')) {
      redacted[fieldKey] = value.replace(piiPatterns.phone, '[REDACTED_PHONE]');
    }
  }

  return redacted;
}

/**
 * Select only the requested fields (or all if fields is empty/null).
 */
function selectFields(
  record: Record<string, unknown>,
  fields?: string[],
): Record<string, unknown> {
  if (!fields || fields.length === 0) return record;
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in record) out[f] = record[f];
  }
  return out;
}

/**
 * Convert a Firestore document snapshot to a flat, normalised record.
 */
function docToFlatRecord(
  doc: { id: string; data: () => Record<string, unknown> },
  fields?: string[],
  sanitizePII = false,
): Record<string, unknown> {
  const raw = { id: doc.id, ...doc.data() };
  const normalised = flattenObject(normaliseValue(raw) as Record<string, unknown>);
  let result = selectFields(normalised, fields);
  if (sanitizePII) result = sanitizeRecord(result);
  return result;
}

/* ===== Core Fetch ===== */

async function fetchCollectionData(
  collectionName: string,
  options: BIExportOptions,
): Promise<{ data: Record<string, unknown>[]; nextCursor?: string }> {
  const db = getAdminDb();
  const { tenantId, dateFrom, dateTo, filters, limit, cursor, fields, sanitizePII } = options;

  const effectiveLimit = Math.min(limit || DEFAULT_LIMIT, MAX_ROWS_PER_REQUEST);

  let query: FirebaseFirestore.Query = db
    .collection(collectionName)
    .where('tenantId', '==', tenantId);

  // Date range filtering on createdAt
  if (dateFrom) {
    query = query.where('createdAt', '>=', dateFrom);
  }
  if (dateTo) {
    query = query.where('createdAt', '<=', dateTo);
  }

  // Additional equality filters
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      query = query.where(key, '==', value);
    }
  }

  // Ordering by createdAt for stable cursor pagination
  query = query.orderBy('createdAt', 'asc');

  // Cursor-based pagination
  if (cursor) {
    // Decode cursor — it is the last document's createdAt + id
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
      // Firestore requires startAfter with a DocumentSnapshot, so we use the field values
      // We store the last createdAt value in the cursor for a field-based startAfter
      const { lastCreatedAt } = decoded as { lastCreatedAt: string; lastId: string };
      query = query.startAfter(lastCreatedAt);
    } catch {
      // Invalid cursor — ignore and start from beginning
      console.warn('[BI Export] Invalid cursor, starting from beginning');
    }
  }

  query = query.limit(effectiveLimit + 1); // +1 to detect if there are more

  const snapshot = await query.get();

  const docs = snapshot.docs.slice(0, effectiveLimit);
  const hasMore = snapshot.docs.length > effectiveLimit;

  const data = docs.map((doc) =>
    docToFlatRecord(doc, fields, sanitizePII),
  );

  let nextCursor: string | undefined;
  if (hasMore && docs.length > 0) {
    const lastDoc = docs[docs.length - 1];
    const lastCreatedAt = String((lastDoc as any)['createdAt'] ?? '');
    const payload = JSON.stringify({ lastCreatedAt, lastId: lastDoc['id'] });
    nextCursor = Buffer.from(payload).toString('base64url');
  }

  return { data, nextCursor };
}

/* ===== Public Export Functions ===== */

/**
 * Export data as CSV string.
 */
export async function exportToCSV(options: BIExportOptions): Promise<{
  csv: string;
  total: number;
  nextCursor?: string;
  rowCount: number;
}> {
  if (!isFlagEnabled('bi_connector')) {
    throw new Error('BI Connector is not enabled');
  }

  const allData: Record<string, unknown>[] = [];
  let mergedCursor: string | undefined;

  for (const collection of options.collections) {
    const result = await fetchCollectionData(collection, {
      ...options,
      collections: [collection],
    });
    // Prefix collection name to avoid field collisions
    for (const row of result.data) {
      const prefixed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        prefixed[`${collection}.${k}`] = v;
      }
      prefixed['_collection'] = collection;
      allData.push(prefixed);
    }
    // Use last cursor from the last collection processed
    mergedCursor = result.nextCursor;
  }

  if (allData.length === 0) {
    return { csv: '', total: 0, rowCount: 0 };
  }

  // Gather all unique keys preserving insertion order
  const keySet = new Set<string>();
  for (const row of allData) {
    for (const key of Object.keys(row)) {
      keySet.add(key);
    }
  }
  const headers = Array.from(keySet);

  // Build CSV
  const escapeCSV = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[] = [headers.map(escapeCSV).join(',')];
  for (const row of allData) {
    lines.push(headers.map((h) => escapeCSV(row[h])).join(','));
  }

  return {
    csv: lines.join('\n'),
    total: allData.length,
    nextCursor: mergedCursor,
    rowCount: allData.length,
  };
}

/**
 * Export data as a JSON array.
 */
export async function exportToJSON(options: BIExportOptions): Promise<BIExportResult> {
  if (!isFlagEnabled('bi_connector')) {
    throw new Error('BI Connector is not enabled');
  }

  const allData: Record<string, unknown>[] = [];
  let mergedCursor: string | undefined;

  for (const collection of options.collections) {
    const result = await fetchCollectionData(collection, {
      ...options,
      collections: [collection],
    });
    for (const row of result.data) {
      row['_collection'] = collection;
      allData.push(row);
    }
    mergedCursor = result.nextCursor;
  }

  return {
    data: allData,
    total: allData.length,
    nextCursor: mergedCursor,
    rowCount: allData.length,
  };
}

/**
 * Validate that requested collections exist in the schema.
 */
export function validateCollections(collections: string[]): { valid: boolean; unknown: string[] } {
  const available = getAvailableCollections();
  const unknown = collections.filter((c) => !available.includes(c));
  return { valid: unknown.length === 0, unknown };
}
