/**
 * collaboration-service.ts
 * Real-time collaboration service for Archii.
 *
 * Firestore-based optimistic sync for multi-user document editing.
 * Provides presence tracking, cursor sharing, anchored comments, and
 * CRDT-like conflict resolution using version vectors and transactions.
 *
 * Gated by feature flag `realtime_collab`.
 *
 * Firestore collections (scoped by tenantId):
 *   - tenants/{tenantId}/collab_presence/{sessionId}  — user presence + cursor
 *   - tenants/{tenantId}/collab_documents/{docId}     — document state + version
 *   - tenants/{tenantId}/collab_comments/{commentId}  — anchored comments
 *
 * Heartbeat: every 15s, timeout: 45s for stale presence cleanup.
 */

import { isFlagEnabled } from './feature-flags';
import { getFirebase, type FirestoreDB, type DocRef } from './firebase-service';

/* ================================================================
   Types
   ================================================================ */

/** Cursor position within a document */
export interface CursorPosition {
  /** Line index (0-based) */
  line: number;
  /** Column index (0-based) */
  column: number;
  /** Optional section/field identifier for structured documents */
  section?: string;
}

/** Presence entry stored in Firestore */
export interface PresenceEntry {
  userId: string;
  userName: string;
  userPhoto?: string;
  userRole?: string;
  documentId: string;
  tenantId: string;
  cursor?: CursorPosition;
  isTyping: boolean;
  lastHeartbeat: any; // Firestore serverTimestamp
  joinedAt: any;
}

/** Unsubscribe function returned by Firestore listeners */
type Unsubscribe = () => void;

/** Version vector entry for conflict resolution */
export interface VersionVector {
  [userId: string]: number;
}

/** A change applied to a collaborative document */
export interface DocumentChange {
  /** Unique change ID (client-generated) */
  changeId: string;
  /** User who made the change */
  userId: string;
  /** Type of operation */
  type: 'insert' | 'delete' | 'replace' | 'format';
  /** Path/field affected */
  path: string;
  /** New value (for insert/replace) */
  value?: any;
  /** Length of deletion (for delete) */
  length?: number;
  /** Timestamp when change was created */
  timestamp: any;
  /** Version vector at time of change */
  version: VersionVector;
}

/** Collaborative document state stored in Firestore */
export interface CollaborativeDocumentState {
  documentId: string;
  tenantId: string;
  content: any;
  version: VersionVector;
  lastModified: any;
  modifiedBy: string;
  changeLog: DocumentChange[];
}

/** Anchored comment attached to a specific location in a document */
export interface AnchoredComment {
  id: string;
  documentId: string;
  tenantId: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  userRole?: string;
  /** Where the comment is anchored */
  location: CursorPosition;
  /** Comment text (supports markdown-lite) */
  text: string;
  /** Status of the comment */
  status: 'active' | 'resolved' | 'archived';
  /** Nested replies (1 level) */
  replies?: AnchoredComment[];
  /** Parent comment ID for replies */
  parentId?: string;
  createdAt: any;
  updatedAt?: any;
}

/* ================================================================
   Constants
   ================================================================ */

const HEARTBEAT_INTERVAL_MS = 15_000; // 15 seconds
const PRESENCE_TIMEOUT_MS = 45_000;   // 45 seconds
const MAX_CHANGES_IN_LOG = 500;

/* ================================================================
   CollaborativeDocument
   ================================================================ */

/**
 * Manages collaborative document state with version-based conflict resolution.
 * Uses Firestore as the coordination layer with optimistic local updates.
 */
export class CollaborativeDocument {
  private documentId: string;
  private tenantId: string;
  private userId: string;
  private localVersion: VersionVector = {};
  private changeCallbacks: Set<(change: DocumentChange) => void> = new Set();
  private unsubscribe: Unsubscribe | null = null;

  constructor(documentId: string, tenantId: string, userId: string) {
    this.documentId = documentId;
    this.tenantId = tenantId;
    this.userId = userId;
  }

  /**
   * Initialize the collaborative document, loading current state
   * and subscribing to remote changes.
   */
  async init(): Promise<CollaborativeDocumentState | null> {
    if (!isFlagEnabled('realtime_collab')) return null;

    const db = this.getDb();
    const docRef = db
      .collection('tenants')
      .doc(this.tenantId)
      .collection('collab_documents')
      .doc(this.documentId);

    const doc = await docRef.get();
    if (doc.exists) {
      const data = doc.data();
      this.localVersion = data.version || {};
    }

    // Subscribe to remote changes
    this.unsubscribe = docRef.onSnapshot(
      (snap: any) => {
        if (!snap.exists) return;
        const data = snap.data();
        const serverVersion: VersionVector = data.version || {};
        const remoteUserId = data.modifiedBy;

        // Skip own changes (already applied optimistically)
        if (remoteUserId === this.userId) return;

        // Check if we need to merge versions
        const changes: DocumentChange[] = data.changeLog || [];
        const newChanges = changes.filter(
          (c: DocumentChange) => !this.hasSeenChange(c.changeId)
        );

        if (newChanges.length > 0) {
          // Update local version vector
          this.mergeVersions(serverVersion);
          // Notify listeners
          newChanges.forEach((c: DocumentChange) => {
            this.changeCallbacks.forEach((cb) => cb(c));
          });
        }
      },
      (err: any) => {
        console.error('[Collab] Document snapshot error:', err);
      }
    );

    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  /**
   * Apply a local change optimistically and persist to Firestore.
   * Uses Firestore transactions for conflict resolution.
   */
  async applyLocalChange(change: Omit<DocumentChange, 'changeId' | 'timestamp' | 'version'>): Promise<DocumentChange> {
    if (!isFlagEnabled('realtime_collab')) {
      throw new Error('Collaboration is not enabled');
    }

    const db = this.getDb();
    const fb = getFirebase();
    const fv = fb.FieldValue;
    const fullChange: DocumentChange = {
      ...change,
      changeId: `chg_${this.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      version: { ...this.localVersion },
    };

    // Bump version for this user
    this.localVersion[this.userId] = (this.localVersion[this.userId] || 0) + 1;

    const docRef = db
      .collection('tenants')
      .doc(this.tenantId)
      .collection('collab_documents')
      .doc(this.documentId);

    // Optimistic local state update (caller should handle UI)
    // Persist to Firestore with transaction for conflict resolution
    try {
      await db.runTransaction(async (tx: any) => {
        const txDoc = await tx.get(docRef);
        const existing = txDoc.exists ? txDoc.data() : null;
        const serverVersion: VersionVector = existing?.version || {};
        const changeLog: DocumentChange[] = existing?.changeLog || [];

        // Check for conflicts: if another user has a higher version
        // for any key, we have a potential conflict
        const conflicts = this.detectConflicts(fullChange.version, serverVersion);
        if (conflicts.length > 0 && existing?.modifiedBy !== this.userId) {
          // Merge versions — take the max for each user
          const mergedVersion: VersionVector = { ...serverVersion };
          for (const [uid, ver] of Object.entries(this.localVersion)) {
            mergedVersion[uid] = Math.max(mergedVersion[uid] || 0, ver as number);
          }
          fullChange.version = mergedVersion;
          this.localVersion = mergedVersion;
        }

        // Append change to log (keep last N entries)
        const updatedLog = [...changeLog, fullChange].slice(-MAX_CHANGES_IN_LOG);

        if (existing) {
          tx.update(docRef, {
            version: fullChange.version,
            modifiedBy: this.userId,
            lastModified: fv.serverTimestamp(),
            changeLog: updatedLog,
          });
        } else {
          tx.set(docRef, {
            documentId: this.documentId,
            tenantId: this.tenantId,
            content: {},
            version: fullChange.version,
            lastModified: fv.serverTimestamp(),
            modifiedBy: this.userId,
            changeLog: updatedLog,
          });
        }
      });
    } catch (err) {
      console.error('[Collab] Transaction failed:', err);
      throw err;
    }

    return fullChange;
  }

  /**
   * Subscribe to remote changes from other users.
   * @returns Unsubscribe function
   */
  subscribeToRemoteChanges(callback: (change: DocumentChange) => void): Unsubscribe {
    this.changeCallbacks.add(callback);
    return () => {
      this.changeCallbacks.delete(callback);
    };
  }

  /** Check if a change ID has already been processed */
  private hasSeenChange(changeId: string): boolean {
    // In production, this could be a Bloom filter or LRU cache
    // For now, we rely on version vectors
    return false;
  }

  /** Detect version conflicts between local and remote */
  private detectConflicts(local: VersionVector, remote: VersionVector): string[] {
    const conflicts: string[] = [];
    const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    for (const key of allKeys) {
      const lVer = local[key] || 0;
      const rVer = remote[key] || 0;
      if (lVer !== rVer) {
        conflicts.push(key);
      }
    }
    return conflicts;
  }

  /** Merge remote version vector into local */
  private mergeVersions(remote: VersionVector): void {
    for (const [uid, ver] of Object.entries(remote)) {
      this.localVersion[uid] = Math.max(this.localVersion[uid] || 0, ver as number);
    }
  }

  /** Clean up Firestore listener */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.changeCallbacks.clear();
  }

  private getDb(): FirestoreDB {
    return getFirebase().firestore();
  }
}

/* ================================================================
   PresenceManager
   ================================================================ */

/**
 * Tracks which users are currently active in a document.
 * Uses heartbeat pattern with Firestore presence documents.
 * Auto-cleans stale presence after PRESENCE_TIMEOUT_MS.
 */
export class PresenceManager {
  private documentId: string;
  private tenantId: string;
  private userId: string;
  private userName: string;
  private userPhoto?: string;
  private userRole?: string;
  private sessionId: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribePresence: Unsubscribe | null = null;
  private presenceCallbacks: Set<(presences: PresenceEntry[]) => void> = new Set();
  private currentPresences: Map<string, PresenceEntry> = new Map();

  constructor(params: {
    documentId: string;
    tenantId: string;
    userId: string;
    userName: string;
    userPhoto?: string;
    userRole?: string;
  }) {
    this.documentId = params.documentId;
    this.tenantId = params.tenantId;
    this.userId = params.userId;
    this.userName = params.userName;
    this.userPhoto = params.userPhoto;
    this.userRole = params.userRole;
    // Session ID is unique per user+document+tab
    this.sessionId = `${params.userId}_${params.documentId}_${Date.now()}`;
  }

  /**
   * Join a collaboration session — creates presence document and starts heartbeat.
   */
  async join(): Promise<void> {
    if (!isFlagEnabled('realtime_collab')) return;

    const db = getFirebase().firestore();
    const fv = getFirebase().FieldValue;

    const presenceRef = db
      .collection('tenants')
      .doc(this.tenantId)
      .collection('collab_presence')
      .doc(this.sessionId);

    // Create/upsert presence document
    await presenceRef.set({
      userId: this.userId,
      userName: this.userName,
      userPhoto: this.userPhoto || null,
      userRole: this.userRole || 'Miembro',
      documentId: this.documentId,
      tenantId: this.tenantId,
      cursor: null,
      isTyping: false,
      lastHeartbeat: fv.serverTimestamp(),
      joinedAt: fv.serverTimestamp(),
    });

    // Start heartbeat
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);

    // Start stale presence cleanup
    this.cleanupTimer = setInterval(() => this.cleanupStalePresence(), PRESENCE_TIMEOUT_MS);

    // Listen to all presence for this document
    this.unsubscribePresence = db
      .collection('tenants')
      .doc(this.tenantId)
      .collection('collab_presence')
      .where('documentId', '==', this.documentId)
      .onSnapshot(
        (snap: any) => {
          const presences: PresenceEntry[] = [];
          const cutoff = new Date(Date.now() - PRESENCE_TIMEOUT_MS);

          this.currentPresences.clear();

          snap.forEach((doc: any) => {
            const data = doc.data();
            const heartbeat = data.lastHeartbeat?.toDate?.() || new Date(data.lastHeartbeat);

            // Filter out stale entries
            if (heartbeat >= cutoff) {
              presences.push({ id: doc.id, ...data } as PresenceEntry);
              this.currentPresences.set(data.userId, { id: doc.id, ...data } as PresenceEntry);
            }
          });

          this.presenceCallbacks.forEach((cb) => cb(presences));
        },
        (err: any) => {
          console.error('[Collab] Presence snapshot error:', err);
        }
      );
  }

  /**
   * Leave the collaboration session — removes presence document.
   */
  async leave(): Promise<void> {
    if (!isFlagEnabled('realtime_collab')) return;

    // Stop timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Remove presence document
    if (this.unsubscribePresence) {
      this.unsubscribePresence();
      this.unsubscribePresence = null;
    }

    try {
      const db = getFirebase().firestore();
      await db
        .collection('tenants')
        .doc(this.tenantId)
        .collection('collab_presence')
        .doc(this.sessionId)
        .delete();
    } catch (err) {
      console.error('[Collab] Error removing presence:', err);
    }

    this.presenceCallbacks.clear();
    this.currentPresences.clear();
  }

  /**
   * Update cursor position for this user.
   */
  async updateCursor(position: CursorPosition | null): Promise<void> {
    if (!isFlagEnabled('realtime_collab')) return;

    try {
      const db = getFirebase().firestore();
      await db
        .collection('tenants')
        .doc(this.tenantId)
        .collection('collab_presence')
        .doc(this.sessionId)
        .update({
          cursor: position,
          lastHeartbeat: getFirebase().FieldValue.serverTimestamp(),
        });
    } catch (err) {
      console.error('[Collab] Error updating cursor:', err);
    }
  }

  /**
   * Set typing indicator for this user.
   */
  async setTyping(isTyping: boolean): Promise<void> {
    if (!isFlagEnabled('realtime_collab')) return;

    try {
      const db = getFirebase().firestore();
      await db
        .collection('tenants')
        .doc(this.tenantId)
        .collection('collab_presence')
        .doc(this.sessionId)
        .update({
          isTyping,
          lastHeartbeat: getFirebase().FieldValue.serverTimestamp(),
        });
    } catch (err) {
      console.error('[Collab] Error updating typing state:', err);
    }
  }

  /**
   * Subscribe to presence updates (other users' online status).
   */
  subscribeToPresence(callback: (presences: PresenceEntry[]) => void): Unsubscribe {
    this.presenceCallbacks.add(callback);
    // Immediately emit current state
    if (this.currentPresences.size > 0) {
      callback(Array.from(this.currentPresences.values()));
    }
    return () => {
      this.presenceCallbacks.delete(callback);
    };
  }

  /** Send heartbeat to keep presence alive */
  private async sendHeartbeat(): Promise<void> {
    try {
      const db = getFirebase().firestore();
      await db
        .collection('tenants')
        .doc(this.tenantId)
        .collection('collab_presence')
        .doc(this.sessionId)
        .update({
          lastHeartbeat: getFirebase().FieldValue.serverTimestamp(),
        });
    } catch (err) {
      console.warn('[Collab] Heartbeat failed:', err);
    }
  }

  /** Remove stale presence entries (users who stopped sending heartbeats) */
  private async cleanupStalePresence(): Promise<void> {
    if (!isFlagEnabled('realtime_collab')) return;

    try {
      const db = getFirebase().firestore();
      const cutoff = new Date(Date.now() - PRESENCE_TIMEOUT_MS);

      const snapshot = await db
        .collection('tenants')
        .doc(this.tenantId)
        .collection('collab_presence')
        .where('documentId', '==', this.documentId)
        .get();

      const batch = db.batch();
      let deleted = 0;

      snapshot.forEach((doc: any) => {
        const data = doc.data();
        const heartbeat = data.lastHeartbeat?.toDate?.() || new Date(data.lastHeartbeat);
        if (heartbeat < cutoff) {
          batch.delete(doc.ref);
          deleted++;
        }
      });

      if (deleted > 0) {
        await batch.commit();
      }
    } catch (err) {
      console.error('[Collab] Stale presence cleanup error:', err);
    }
  }

  /** Get current session ID */
  getSessionId(): string {
    return this.sessionId;
  }
}

/* ================================================================
   CursorTracker
   ================================================================ */

/**
 * High-level cursor tracking wrapper around PresenceManager.
 * Debounces cursor updates to avoid excessive Firestore writes.
 */
export class CursorTracker {
  private presenceManager: PresenceManager;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private cursorCallbacks: Set<(userId: string, cursor: CursorPosition | null) => void> = new Set();
  private lastBroadcastCursor: CursorPosition | null = null;
  private readonly DEBOUNCE_MS = 100;

  constructor(presenceManager: PresenceManager) {
    this.presenceManager = presenceManager;

    // Subscribe to presence changes to get other users' cursors
    this.presenceManager.subscribeToPresence((presences) => {
      presences.forEach((p) => {
        if (p.userId !== this.presenceManager['userId']) {
          this.cursorCallbacks.forEach((cb) => cb(p.userId, p.cursor || null));
        }
      });
    });
  }

  /**
   * Broadcast cursor position (debounced).
   */
  broadcastCursor(position: CursorPosition): void {
    if (!isFlagEnabled('realtime_collab')) return;

    this.lastBroadcastCursor = position;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      await this.presenceManager.updateCursor(position);
    }, this.DEBOUNCE_MS);
  }

  /**
   * Subscribe to other users' cursor positions.
   */
  subscribeToCursors(callback: (userId: string, cursor: CursorPosition | null) => void): Unsubscribe {
    this.cursorCallbacks.add(callback);
    return () => {
      this.cursorCallbacks.delete(callback);
    };
  }

  /** Clear cursor position */
  clearCursor(): void {
    this.lastBroadcastCursor = null;
    this.presenceManager.updateCursor(null);
  }

  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.cursorCallbacks.clear();
  }
}

/* ================================================================
   AnchoredComments
   ================================================================ */

/**
 * Manages location-aware comments on collaborative documents.
 * Comments are anchored to specific positions (line/column) in the document.
 */
export class AnchoredCommentsManager {
  private documentId: string;
  private tenantId: string;
  private userId: string;
  private unsubscribe: Unsubscribe | null = null;
  private commentCallbacks: Set<(comments: AnchoredComment[]) => void> = new Set();

  constructor(documentId: string, tenantId: string, userId: string) {
    this.documentId = documentId;
    this.tenantId = tenantId;
    this.userId = userId;
  }

  /**
   * Initialize comment subscriptions.
   */
  async init(): Promise<void> {
    if (!isFlagEnabled('realtime_collab')) return;

    const db = getFirebase().firestore();

    // Subscribe to top-level comments for this document
    this.unsubscribe = db
      .collection('tenants')
      .doc(this.tenantId)
      .collection('collab_comments')
      .where('documentId', '==', this.documentId)
      .where('status', 'in', ['active', 'resolved'])
      .orderBy('createdAt', 'asc')
      .onSnapshot(
        async (snap: any) => {
          const comments: AnchoredComment[] = [];

          for (const doc of snap.docs) {
            const data = doc.data();
            const comment: AnchoredComment = {
              id: doc.id,
              ...data,
            } as AnchoredComment;

            // Load replies (1 level deep)
            if (!data.parentId) {
              const repliesSnap = await db
                .collection('tenants')
                .doc(this.tenantId)
                .collection('collab_comments')
                .where('parentId', '==', doc.id)
                .orderBy('createdAt', 'asc')
                .get();

              comment.replies = repliesSnap.docs.map((rDoc: any) => ({
                id: rDoc.id,
                ...rDoc.data(),
              })) as AnchoredComment[];
            }

            comments.push(comment);
          }

          this.commentCallbacks.forEach((cb) => cb(comments));
        },
        (err: any) => {
          console.error('[Collab] Comments snapshot error:', err);
        }
      );
  }

  /**
   * Add a new anchored comment at a specific location.
   */
  async addComment(comment: {
    location: CursorPosition;
    text: string;
    userName: string;
    userPhoto?: string;
    userRole?: string;
  }): Promise<string> {
    if (!isFlagEnabled('realtime_collab')) {
      throw new Error('Collaboration is not enabled');
    }

    const db = getFirebase().firestore();
    const fv = getFirebase().FieldValue;

    const docRef = await db
      .collection('tenants')
      .doc(this.tenantId)
      .collection('collab_comments')
      .add({
        documentId: this.documentId,
        tenantId: this.tenantId,
        userId: this.userId,
        userName: comment.userName,
        userPhoto: comment.userPhoto || null,
        userRole: comment.userRole || 'Miembro',
        location: comment.location,
        text: comment.text,
        status: 'active',
        parentId: null,
        createdAt: fv.serverTimestamp(),
        updatedAt: fv.serverTimestamp(),
      });

    return docRef.id;
  }

  /**
   * Reply to an existing comment.
   */
  async addReply(
    parentId: string,
    reply: {
      text: string;
      userName: string;
      userPhoto?: string;
      userRole?: string;
    }
  ): Promise<string> {
    if (!isFlagEnabled('realtime_collab')) {
      throw new Error('Collaboration is not enabled');
    }

    const db = getFirebase().firestore();
    const fv = getFirebase().FieldValue;

    // Get parent comment to inherit location
    const parentDoc = await db
      .collection('tenants')
      .doc(this.tenantId)
      .collection('collab_comments')
      .doc(parentId)
      .get();

    if (!parentDoc.exists) {
      throw new Error('Parent comment not found');
    }

    const parentData = parentDoc.data();

    const docRef = await db
      .collection('tenants')
      .doc(this.tenantId)
      .collection('collab_comments')
      .add({
        documentId: this.documentId,
        tenantId: this.tenantId,
        userId: this.userId,
        userName: reply.userName,
        userPhoto: reply.userPhoto || null,
        userRole: reply.userRole || 'Miembro',
        location: parentData.location,
        text: reply.text,
        status: 'active',
        parentId: parentId,
        createdAt: fv.serverTimestamp(),
        updatedAt: fv.serverTimestamp(),
      });

    return docRef.id;
  }

  /**
   * Resolve a comment (mark as resolved).
   */
  async resolveComment(commentId: string): Promise<void> {
    if (!isFlagEnabled('realtime_collab')) return;

    const db = getFirebase().firestore();
    await db
      .collection('tenants')
      .doc(this.tenantId)
      .collection('collab_comments')
      .doc(commentId)
      .update({
        status: 'resolved',
        updatedAt: getFirebase().FieldValue.serverTimestamp(),
      });
  }

  /**
   * Subscribe to comment updates.
   */
  subscribeToComments(callback: (comments: AnchoredComment[]) => void): Unsubscribe {
    this.commentCallbacks.add(callback);
    return () => {
      this.commentCallbacks.delete(callback);
    };
  }

  /** Clean up Firestore listener */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.commentCallbacks.clear();
  }
}

/* ================================================================
   CollaborationService (Facade)
   ================================================================ */

/**
 * High-level facade that combines all collaboration features.
 * Usage:
 *   const service = new CollaborationService();
 *   await service.joinSession(docId, userId, tenantId, userName);
 *   service.broadcastCursor({ line: 10, column: 5 });
 *   service.onRemoteChange((change) => { ... });
 *   // ... when done:
 *   service.leaveSession();
 */
export class CollaborationService {
  private document: CollaborativeDocument | null = null;
  private presence: PresenceManager | null = null;
  private cursorTracker: CursorTracker | null = null;
  private comments: AnchoredCommentsManager | null = null;
  private _active = false;

  /** Whether the collaboration session is active */
  get active(): boolean {
    return this._active;
  }

  /**
   * Join a collaboration session for a document.
   * Initializes presence, cursor tracking, document sync, and comments.
   */
  async joinSession(
    documentId: string,
    userId: string,
    tenantId: string,
    userName: string,
    userPhoto?: string,
    userRole?: string
  ): Promise<void> {
    if (!isFlagEnabled('realtime_collab')) {
      console.warn('[Collab] realtime_collab flag is disabled');
      return;
    }

    if (this._active) {
      console.warn('[Collab] Already in a session, leaving first');
      await this.leaveSession();
    }

    // Initialize all subsystems
    this.document = new CollaborativeDocument(documentId, tenantId, userId);
    this.presence = new PresenceManager({
      documentId,
      tenantId,
      userId,
      userName,
      userPhoto,
      userRole,
    });
    this.cursorTracker = new CursorTracker(this.presence);
    this.comments = new AnchoredCommentsManager(documentId, tenantId, userId);

    // Start presence (heartbeats, listeners)
    await this.presence.join();

    // Initialize document sync
    await this.document.init();

    // Initialize comments
    await this.comments.init();

    this._active = true;
  }

  /**
   * Leave the current collaboration session and clean up all resources.
   */
  async leaveSession(): Promise<void> {
    if (!this._active) return;

    try {
      if (this.presence) {
        await this.presence.leave();
      }
    } catch (err) {
      console.error('[Collab] Error leaving presence:', err);
    }

    this.document?.destroy();
    this.cursorTracker?.destroy();
    this.comments?.destroy();

    this.document = null;
    this.presence = null;
    this.cursorTracker = null;
    this.comments = null;
    this._active = false;
  }

  /**
   * Broadcast cursor position to other users.
   */
  broadcastCursor(position: CursorPosition): void {
    this.cursorTracker?.broadcastCursor(position);
  }

  /**
   * Subscribe to other users' cursor positions.
   */
  subscribeToCursors(callback: (userId: string, cursor: CursorPosition | null) => void): Unsubscribe {
    return this.cursorTracker?.subscribeToCursors(callback) || (() => {});
  }

  /**
   * Subscribe to online presence updates.
   */
  subscribeToPresence(callback: (presences: PresenceEntry[]) => void): Unsubscribe {
    return this.presence?.subscribeToPresence(callback) || (() => {});
  }

  /**
   * Apply a local change to the document.
   */
  async applyLocalChange(change: Omit<DocumentChange, 'changeId' | 'timestamp' | 'version'>): Promise<DocumentChange> {
    if (!this.document) throw new Error('Not in a collaboration session');
    return this.document.applyLocalChange(change);
  }

  /**
   * Subscribe to remote changes from other users.
   */
  subscribeToRemoteChanges(callback: (change: DocumentChange) => void): Unsubscribe {
    return this.document?.subscribeToRemoteChanges(callback) || (() => {});
  }

  /**
   * Add an anchored comment at a specific location.
   */
  async addAnchoredComment(comment: {
    location: CursorPosition;
    text: string;
    userName: string;
    userPhoto?: string;
    userRole?: string;
  }): Promise<string> {
    if (!this.comments) throw new Error('Not in a collaboration session');
    return this.comments.addComment(comment);
  }

  /**
   * Reply to an anchored comment.
   */
  async replyToComment(
    parentId: string,
    reply: { text: string; userName: string; userPhoto?: string; userRole?: string }
  ): Promise<string> {
    if (!this.comments) throw new Error('Not in a collaboration session');
    return this.comments.addReply(parentId, reply);
  }

  /**
   * Subscribe to comment updates.
   */
  subscribeToComments(callback: (comments: AnchoredComment[]) => void): Unsubscribe {
    return this.comments?.subscribeToComments(callback) || (() => {});
  }

  /**
   * Resolve an anchored comment.
   */
  async resolveComment(commentId: string): Promise<void> {
    await this.comments?.resolveComment(commentId);
  }

  /**
   * Set typing indicator.
   */
  async setTyping(isTyping: boolean): Promise<void> {
    await this.presence?.setTyping(isTyping);
  }

  /** Get current session ID */
  getSessionId(): string {
    return this.presence?.getSessionId() || '';
  }
}

/* ================================================================
   Singleton (for convenience in client components)
   ================================================================ */

let _collabService: CollaborationService | null = null;

/**
 * Get or create the singleton CollaborationService instance.
 * Use this in client components that need collaboration features.
 */
export function getCollaborationService(): CollaborationService {
  if (!_collabService) {
    _collabService = new CollaborationService();
  }
  return _collabService;
}

/**
 * Destroy the singleton instance (for cleanup on sign-out).
 */
export function destroyCollaborationService(): void {
  if (_collabService) {
    _collabService.leaveSession().catch(() => {});
    _collabService = null;
  }
}
