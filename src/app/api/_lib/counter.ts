/**
 * Atomic counter utility for Firestore.
 *
 * Uses a counter document to generate sequential numbers that are
 * race-condition safe. Each counter is scoped per collection + tenantId.
 *
 * Counter documents are stored in: counters/{collectionName}__{tenantId}
 */

import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Transaction } from 'firebase-admin/firestore';

interface CounterDoc {
  value: number;
  updatedAt: unknown;
}

/**
 * Generate the next sequential number for a given collection and tenant.
 * Uses Firestore transactions to prevent race conditions.
 *
 * @param collectionName - e.g., 'invoices', 'rfis', 'submittals'
 * @param tenantId - the tenant scope
 * @param prefix - e.g., 'INV', 'RFI', 'SUB'
 * @param padLength - zero-pad length (default: 3, e.g., INV-001)
 * @returns The formatted number string (e.g., 'INV-001')
 */
export async function getNextSequentialNumber(
  collectionName: string,
  tenantId: string,
  prefix: string,
  padLength: number = 3
): Promise<string> {
  const db = getAdminDb();
  const counterId = `${collectionName}__${tenantId}`;
  const counterRef = db.collection('counters').doc(counterId);

  const result = await db.runTransaction(async (transaction: Transaction) => {
    const counterDoc = await transaction.get(counterRef);

    let currentValue = 0;

    if (counterDoc.exists) {
      currentValue = (counterDoc.data() as CounterDoc).value || 0;
    } else {
      // First time: scan existing documents to find the max number
      // This ensures backward compatibility with existing data
      const existingDocs = await db
        .collection(collectionName)
        .where('tenantId', '==', tenantId)
        .select('number')
        .get();

      let maxNum = 0;
      for (const doc of existingDocs.docs) {
        const num = doc.data()?.number;
        if (typeof num === 'string') {
          const extracted = num.replace(/[^0-9]/g, '');
          const parsed = parseInt(extracted, 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
      }
      currentValue = maxNum;
    }

    const nextValue = currentValue + 1;

    // Write the new counter value (upsert)
    transaction.set(
      counterRef,
      {
        value: nextValue,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return nextValue;
  });

  return `${prefix}-${String(result).padStart(padLength, '0')}`;
}

/**
 * Atomically update a product's stock within a Firestore transaction.
 * Prevents race conditions in inventory stock updates.
 *
 * @param productId - The Firestore document ID of the product
 * @param quantityChange - Positive for entries, negative for exits
 * @returns The new stock value
 */
export async function atomicStockUpdate(
  productId: string,
  quantityChange: number
): Promise<number> {
  const db = getAdminDb();
  const productRef = db.collection('invProducts').doc(productId);

  return db.runTransaction(async (transaction: Transaction) => {
    const productDoc = await transaction.get(productRef);

    if (!productDoc.exists) {
      throw new Error('Producto no encontrado');
    }

    const currentStock = productDoc.data()?.stock || 0;
    const newStock = Math.max(0, currentStock + quantityChange);

    transaction.update(productRef, { stock: newStock });

    return newStock;
  });
}
