/**
 * undo-helpers.ts
 * Utility for "undo" toast on destructive delete actions.
 * After deleting, shows a sonner toast with a "Deshacer" button for 5 seconds.
 * If the user clicks "Deshacer", re-creates the document in Firestore.
 */

import { toast } from 'sonner';
import { getFirebase } from '@/lib/firebase-service';
import { scrubUndefined } from '@/lib/helpers';

interface UndoDeleteOptions {
  /** Firestore collection name, e.g. 'rfis' */
  collection: string;
  /** Document ID to delete / re-create */
  docId: string;
  /** Snapshot of the document data before deletion */
  snapshot: Record<string, any>;
  /** Human-readable label, e.g. 'RFI', 'Submittal' — used in toast messages */
  label: string;
  /** Grammatical gender: 'a' for feminine (eliminada/restaurada), 'o' for masculine (eliminado/restaurado) */
  gender?: 'o' | 'a';
  /** Optional extra fields to add when re-creating (e.g. serverTimestamp for updatedAt) */
  recreateFields?: Record<string, any>;
}

/**
 * Shows an undo toast after a delete operation.
 * Call this AFTER the document has been deleted.
 * The `snapshot` must be captured BEFORE deletion.
 */
export function showUndoToast({ collection, docId, snapshot, label, gender = 'o', recreateFields }: UndoDeleteOptions) {
  const suffix = gender === 'a' ? 'a' : 'o';
  toast.success(`${label} eliminad${suffix}`, {
    duration: 5000,
    action: {
      label: 'Deshacer',
      onClick: async () => {
        try {
          const db = getFirebase().firestore();
          const restoreData = scrubUndefined({
            ...snapshot,
            ...recreateFields,
            updatedAt: getFirebase().firestore.FieldValue.serverTimestamp(),
          });
          await db.collection(collection).doc(docId).set(restoreData);
          toast.success(`${label} restaurad${suffix}`);
        } catch (err) {
          console.error(`[Archii] undo delete ${collection}/${docId}:`, err);
          toast.error('Error al restaurar');
        }
      },
    },
  });
}
