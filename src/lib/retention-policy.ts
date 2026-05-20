/**
 * retention-policy.ts
 * Data retention policy service for Archii.
 *
 * Defines per-collection retention rules:
 *   - Max age before archiving
 *   - Max age before permanent deletion
 *   - Archive collections prefixed with `archive_`
 *
 * Gated by feature flag 'gdpr_tools'.
 */

import { getAdminDb } from './firebase-admin';
import { isFlagEnabled } from './feature-flags';

/* ===== Types ===== */

export type RetentionAction = 'archive' | 'delete';

export interface RetentionPolicy {
  /** Firestore collection name */
  collection: string;
  /** Days after creation before archiving (null = never archive) */
  archiveAfterDays: number | null;
  /** Days after creation before permanent deletion (null = never delete) */
  maxAgeDays: number | null;
  /** Action when max age is reached */
  action: RetentionAction;
  /** Whether this policy is enabled */
  enabled: boolean;
  /** Human-readable description */
  description: string;
}

export interface RetentionActionItem {
  collection: string;
  action: RetentionAction;
  documentCount: number;
  olderThanDays: number;
  archiveCollection?: string;
}

export interface RetentionStatus {
  collection: string;
  totalDocuments: number;
  oldestDocument?: string;
  avgAgeDays?: number;
  policy: RetentionPolicy;
  actionable: boolean;
}

/* ===== Default Policies ===== */

export const DEFAULT_RETENTION_POLICIES: RetentionPolicy[] = [
  {
    collection: 'audit_logs',
    archiveAfterDays: 365,
    maxAgeDays: 730,
    action: 'delete',
    enabled: true,
    description: 'Audit logs: archive after 1 year, delete after 2 years',
  },
  {
    collection: 'generalMessages',
    archiveAfterDays: null,
    maxAgeDays: 180,
    action: 'delete',
    enabled: true,
    description: 'Chat messages: delete after 6 months',
  },
  {
    collection: 'notifications',
    archiveAfterDays: null,
    maxAgeDays: 90,
    action: 'delete',
    enabled: true,
    description: 'Notifications: delete after 90 days',
  },
  {
    collection: 'dailyLogs',
    archiveAfterDays: 1095,
    maxAgeDays: null,
    action: 'archive',
    enabled: true,
    description: 'Daily logs (bitácoras): archive after 3 years, keep indefinitely',
  },
  {
    collection: 'projects',
    archiveAfterDays: 2555,
    maxAgeDays: null,
    action: 'archive',
    enabled: true,
    description: 'Projects: archive after 7 years (legal retention)',
  },
  {
    collection: 'tasks',
    archiveAfterDays: 2555,
    maxAgeDays: null,
    action: 'archive',
    enabled: true,
    description: 'Tasks: archive after 7 years',
  },
  {
    collection: 'expenses',
    archiveAfterDays: 2555,
    maxAgeDays: null,
    action: 'archive',
    enabled: true,
    description: 'Expenses: archive after 7 years (tax retention)',
  },
  {
    collection: 'invoices',
    archiveAfterDays: 2555,
    maxAgeDays: null,
    action: 'archive',
    enabled: true,
    description: 'Invoices: archive after 7 years (tax retention)',
  },
  {
    collection: 'timeEntries',
    archiveAfterDays: 2555,
    maxAgeDays: null,
    action: 'archive',
    enabled: true,
    description: 'Time entries: archive after 7 years (labor retention)',
  },
  {
    collection: 'suppliers',
    archiveAfterDays: 2555,
    maxAgeDays: null,
    action: 'archive',
    enabled: true,
    description: 'Suppliers: archive after 7 years',
  },
  {
    collection: 'rfis',
    archiveAfterDays: 2555,
    maxAgeDays: null,
    action: 'archive',
    enabled: true,
    description: 'RFIs: archive after 7 years',
  },
  {
    collection: 'submittals',
    archiveAfterDays: 2555,
    maxAgeDays: null,
    action: 'archive',
    enabled: true,
    description: 'Submittals: archive after 7 years',
  },
  {
    collection: 'punchItems',
    archiveAfterDays: 2555,
    maxAgeDays: null,
    action: 'archive',
    enabled: true,
    description: 'Punch items: archive after 7 years',
  },
  {
    collection: 'comments',
    archiveAfterDays: 1825,
    maxAgeDays: null,
    action: 'archive',
    enabled: true,
    description: 'Comments: archive after 5 years',
  },
];

/* ===== Helpers ===== */

/**
 * Get the effective retention policy for a collection.
 */
function getPolicyForCollection(collectionName: string): RetentionPolicy | null {
  return DEFAULT_RETENTION_POLICIES.find((p) => p.collection === collectionName) || null;
}

/**
 * Calculate the date threshold string for N days ago.
 */
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/* ===== Core Operations ===== */

/**
 * Evaluate all retention policies for a tenant and return actionable items.
 */
export async function evaluateRetentionPolicies(
  tenantId: string,
): Promise<RetentionActionItem[]> {
  if (!isFlagEnabled('gdpr_tools')) {
    throw new Error('GDPR tools are not enabled');
  }

  const db = getAdminDb();
  const actionableItems: RetentionActionItem[] = [];

  for (const policy of DEFAULT_RETENTION_POLICIES) {
    if (!policy.enabled) continue;

    // Check archival threshold
    if (policy.archiveAfterDays !== null) {
      const threshold = daysAgo(policy.archiveAfterDays);
      try {
        const snapshot = await db
          .collection(policy.collection)
          .where('tenantId', '==', tenantId)
          .where('createdAt', '<', threshold)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const countSnapshot = await db
            .collection(policy.collection)
            .where('tenantId', '==', tenantId)
            .where('createdAt', '<', threshold)
            .count()
            .get();

          actionableItems.push({
            collection: policy.collection,
            action: 'archive',
            documentCount: countSnapshot.data().count,
            olderThanDays: policy.archiveAfterDays,
            archiveCollection: `archive_${policy.collection}`,
          });
        }
      } catch (err) {
        // Collection might not have createdAt index — skip silently
        console.warn(`[Retention] Cannot evaluate archive for ${policy.collection}:`, err);
      }
    }

    // Check deletion threshold
    if (policy.maxAgeDays !== null && policy.action === 'delete') {
      const threshold = daysAgo(policy.maxAgeDays);
      try {
        const snapshot = await db
          .collection(policy.collection)
          .where('tenantId', '==', tenantId)
          .where('createdAt', '<', threshold)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const countSnapshot = await db
            .collection(policy.collection)
            .where('tenantId', '==', tenantId)
            .where('createdAt', '<', threshold)
            .count()
            .get();

          actionableItems.push({
            collection: policy.collection,
            action: 'delete',
            documentCount: countSnapshot.data().count,
            olderThanDays: policy.maxAgeDays,
          });
        }
      } catch (err) {
        console.warn(`[Retention] Cannot evaluate delete for ${policy.collection}:`, err);
      }
    }
  }

  return actionableItems;
}

/**
 * Archive documents from a collection into an `archive_{collection}` collection.
 * Documents are moved (copied + deleted) in batches of 500.
 *
 * @returns Number of documents archived.
 */
export async function archiveCollection(
  tenantId: string,
  collection: string,
  olderThanDays: number,
): Promise<number> {
  if (!isFlagEnabled('gdpr_tools')) {
    throw new Error('GDPR tools are not enabled');
  }

  const db = getAdminDb();
  const threshold = daysAgo(olderThanDays);
  const archiveCollection = `archive_${collection}`;
  let totalArchived = 0;
  let lastDocId: string | null = null;

  // Process in batches
  while (true) {
    let query: FirebaseFirestore.Query = db
      .collection(collection)
      .where('tenantId', '==', tenantId)
      .where('createdAt', '<', threshold)
      .orderBy('createdAt', 'asc')
      .limit(400); // Firestore batch write limit is 500

    if (lastDocId) {
      query = (query as FirebaseFirestore.Query & { startAfter: (doc: string) => any }).startAfter(lastDocId);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      batch.set(db.collection(archiveCollection).doc(doc.id), {
        ...data,
        _archivedFrom: collection,
        _archivedAt: new Date().toISOString(),
        _originalDocId: doc.id,
      });
      batch.delete(doc.ref);
      lastDocId = doc.id;
    }

    await batch.commit();
    totalArchived += snapshot.size;

    // Safety: max 10 batches per run
    if (totalArchived >= 4000) break;
  }

  return totalArchived;
}

/**
 * Permanently delete documents from a collection.
 * Uses batch deletes of 400 docs at a time.
 *
 * @returns Number of documents deleted.
 */
export async function deleteCollection(
  tenantId: string,
  collection: string,
  olderThanDays: number,
): Promise<number> {
  if (!isFlagEnabled('gdpr_tools')) {
    throw new Error('GDPR tools are not enabled');
  }

  const db = getAdminDb();
  const threshold = daysAgo(olderThanDays);
  let totalDeleted = 0;
  let lastDocId: string | null = null;

  while (true) {
    let query: FirebaseFirestore.Query = db
      .collection(collection)
      .where('tenantId', '==', tenantId)
      .where('createdAt', '<', threshold)
      .orderBy('createdAt', 'asc')
      .limit(400);

    if (lastDocId) {
      query = (query as any).startAfter(lastDocId);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      lastDocId = doc.id;
    }

    await batch.commit();
    totalDeleted += snapshot.size;

    console.warn(`[Retention] Deleted ${snapshot.size} docs from ${collection} (total: ${totalDeleted})`);

    // Safety: max 10 batches per run
    if (totalDeleted >= 4000) break;
  }

  return totalDeleted;
}

/**
 * Create a batch of archived documents from a specific set of documents.
 */
export async function createArchiveBatch(
  tenantId: string,
  documents: Array<{ id: string; data: Record<string, unknown> }>,
  collection: string,
): Promise<number> {
  if (!isFlagEnabled('gdpr_tools')) {
    throw new Error('GDPR tools are not enabled');
  }

  const db = getAdminDb();
  const archiveCollection = `archive_${collection}`;

  // Firestore batch max 500 operations
  const BATCH_SIZE = 400;
  let archived = 0;

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);
    const writeBatch = db.batch();

    for (const doc of batch) {
      writeBatch.set(db.collection(archiveCollection).doc(doc.id), {
        ...doc.data,
        _archivedFrom: collection,
        _archivedAt: new Date().toISOString(),
        _archivedBy: 'batch',
      });
    }

    await writeBatch.commit();
    archived += batch.length;
  }

  return archived;
}

/**
 * Get a summary of data ages and retention status across all collections for a tenant.
 */
export async function getRetentionStatus(tenantId: string): Promise<RetentionStatus[]> {
  if (!isFlagEnabled('gdpr_tools')) {
    throw new Error('GDPR tools are not enabled');
  }

  const db = getAdminDb();
  const statuses: RetentionStatus[] = [];

  for (const policy of DEFAULT_RETENTION_POLICIES) {
    try {
      const countSnapshot = await db
        .collection(policy.collection)
        .where('tenantId', '==', tenantId)
        .count()
        .get();

      const totalDocuments = countSnapshot.data().count;

      // Get oldest document
      let oldestDocument: string | undefined;
      let avgAgeDays: number | undefined;

      if (totalDocuments > 0) {
        try {
          const oldestSnapshot = await db
            .collection(policy.collection)
            .where('tenantId', '==', tenantId)
            .orderBy('createdAt', 'asc')
            .limit(1)
            .get();

          if (!oldestSnapshot.empty) {
            const oldestData = oldestSnapshot.docs[0].data();
            const createdAt = oldestData.createdAt;
            if (createdAt) {
              const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt.toDate();
              oldestDocument = date.toISOString();
              avgAgeDays = Math.floor(
                (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24),
              );
            }
          }
        } catch {
          // Index may not exist
        }
      }

      // Determine if this collection has actionable items
      let actionable = false;
      if (policy.archiveAfterDays !== null && avgAgeDays !== undefined && avgAgeDays > policy.archiveAfterDays) {
        actionable = true;
      }
      if (policy.maxAgeDays !== null && avgAgeDays !== undefined && avgAgeDays > policy.maxAgeDays) {
        actionable = true;
      }

      statuses.push({
        collection: policy.collection,
        totalDocuments,
        oldestDocument,
        avgAgeDays,
        policy,
        actionable,
      });
    } catch (err) {
      console.warn(`[Retention] Cannot get status for ${policy.collection}:`, err);
      statuses.push({
        collection: policy.collection,
        totalDocuments: 0,
        policy,
        actionable: false,
      });
    }
  }

  return statuses;
}

/**
 * Schedule a retention cleanup via a Firestore Cloud Function trigger document.
 *
 * Creates a document in `retention_jobs` that a scheduled Cloud Function picks up
 * and processes asynchronously.
 */
export async function scheduleRetentionCleanup(tenantId: string): Promise<string> {
  if (!isFlagEnabled('gdpr_tools')) {
    throw new Error('GDPR tools are not enabled');
  }

  const db = getAdminDb();

  const docRef = await db.collection('retention_jobs').add({
    tenantId,
    status: 'pending',
    scheduledAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
  });

  return docRef.id;
}
