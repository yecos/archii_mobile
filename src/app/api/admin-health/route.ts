import { NextRequest, NextResponse } from 'next/server';
import { isAdminInitialized, getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

/**
 * GET /api/admin-health
 * Diagnostic endpoint to verify Firebase Admin SDK is properly configured.
 * Requires Bearer token for auth verification test.
 */
export async function GET(request: NextRequest) {
  const results: Record<string, any> = {};

  // 1. Check env vars
  results.projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? 'SET' : 'MISSING';
  results.adminCreds = process.env.FIREBASE_ADMIN_CREDENTIALS ? 'SET' : 'MISSING';

  // 2. Check Admin SDK initialization
  const adminStatus = isAdminInitialized();
  results.adminInit = adminStatus;

  // 3. Test Auth (if token provided)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      const auth = getAdminAuth();
      const decoded = await auth.verifyIdToken(token);
      results.authTest = { ok: true, uid: decoded.uid, email: decoded.email };
    } catch (e: any) {
      results.authTest = { ok: false, error: e?.message || String(e) };
    }
  } else {
    results.authTest = 'skipped (no token)';
  }

  // 4. Test Firestore read
  try {
    const db = getAdminDb();
    // Try to read a single document from a collection that should exist
    const snap = await db.collection('tenants').limit(1).get();
    results.firestoreTest = { ok: true, canRead: true };
  } catch (e: any) {
    results.firestoreTest = { ok: false, error: e?.message || String(e) };
  }

  const allOk = adminStatus.ok && results.firestoreTest?.ok;
  return NextResponse.json({ status: allOk ? 'OK' : 'ERROR', results }, { status: allOk ? 200 : 500 });
}
