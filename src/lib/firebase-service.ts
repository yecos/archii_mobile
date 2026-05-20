/**
 * firebase-service.ts
 * Capa de abstracción limpia sobre Firebase.
 * Reemplaza TODOS los (window as any).firebase del componente.
 *
 * Exporta una función `getFirebase()` que devuelve la instancia de Firebase
 * cargada por el script en layout.tsx, con tipado y manejo de errores.
 *
 * IMPORTANTE: NO importamos de 'firebase/auth' ni ningún paquete 'firebase'
 * porque Turbopack puede incluir el SDK modular en el bundle del cliente,
 * causando conflictos con el SDK compat cargado via <script> en layout.tsx.
 * Todos los tipos se definen localmente.
 */

/* ---- Firebase compat types (usado via script tag en layout.tsx) ---- */

/** Tipo de usuario Firebase (compat) */
interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerData: any[];
  [key: string]: any;
}

interface FieldValueHelpers {
  serverTimestamp(): any;
  arrayUnion(...items: any[]): any;
  arrayRemove(...items: any[]): any;
  increment(n: number): any;
  delete(): any;
}

interface AuthInstance {
  onAuthStateChanged(cb: (user: FirebaseUser | null) => any): () => void;
  currentUser: any;
  signOut(): Promise<any>;
  GoogleAuthProvider: any;
  OAuthProvider: any;
  signInWithEmailAndPassword(email: string, pass: string): Promise<any>;
  createUserWithEmailAndPassword(email: string, pass: string): Promise<any>;
  signInWithPopup(provider: any): Promise<any>;
  signInWithRedirect(provider: any): Promise<any>;
  getRedirectResult(): Promise<any>;
  signInAnonymously(): Promise<any>;
}

interface FirebaseApp {
  /** firebase.auth() devuelve instancia; firebase.auth.GoogleAuthProvider accede al namespace. */
  auth: (() => AuthInstance) & { GoogleAuthProvider: any; OAuthProvider: any };
  /** firebase.firestore() devuelve DB; firebase.firestore.FieldValue accede al namespace. */
  firestore: (() => FirestoreDB) & { FieldValue: FieldValueHelpers };
  storage(): any;
  apps: any[];
  FieldValue: FieldValueHelpers;
}

interface FirestoreDB {
  collection(name: string): CollectionRef;
  collection(group: string): CollectionRef;
  batch(): BatchWriter;
  runTransaction(fn: (tx: any) => Promise<any>): Promise<any>;
}

interface CollectionRef {
  doc(id?: string): DocRef;
  where(field: string, op: string, value: any): CollectionRef;
  orderBy(field: string, dir?: 'asc' | 'desc'): CollectionRef;
  limit(n: number): CollectionRef;
  limitToLast(n: number): CollectionRef;
  onSnapshot(cb: (snap: QuerySnapshot) => void, errCb?: (err: any) => void): () => void;
  get(): Promise<QuerySnapshot>;
  add(data: any): Promise<{ id: string }>;
}

interface DocRef {
  id: string;
  collection(name: string): CollectionRef;
  get(): Promise<{ exists: boolean; data(): any; id: string }>;
  set(data: any, opts?: any): Promise<void>;
  update(data: any): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(cb: (snap: any) => void, errCb?: (err: any) => void): () => void;
}

interface QuerySnapshot {
  docs: QueryDocSnapshot[];
  forEach(cb: (doc: QueryDocSnapshot) => void): void;
  size: number;
  empty: boolean;
}

interface QueryDocSnapshot {
  id: string;
  data(): any;
  exists: boolean;
}

interface BatchWriter {
  set(ref: DocRef, data: any, opts?: any): BatchWriter;
  update(ref: DocRef, data: any): BatchWriter;
  delete(ref: DocRef): BatchWriter;
  commit(): Promise<void>;
}

/* ---- Singleton accessor ---- */
let _fb: FirebaseApp | null = null;

/**
 * Returns the Firebase instance loaded by the script tag in layout.tsx.
 * Throws a clear error if Firebase hasn't loaded yet.
 */
export function getFirebase(): FirebaseApp {
  if (_fb) return _fb;
  // Acceso seguro a window.firebase (SDK compat via CDN)
  const w = typeof window !== 'undefined' ? window : null;
  if (!w) {
    throw new Error('[Archii] No estamos en el navegador.');
  }
  const fb = (w as any).firebase as FirebaseApp | undefined;
  if (!fb || !fb.apps || fb.apps.length === 0) {
    throw new Error('[Archii] Firebase no está inicializado. Verifica que los scripts en layout.tsx cargaron correctamente.');
  }
  _fb = fb;
  return _fb;
}

/** Check if Firebase is ready (non-throwing). */
export function isFirebaseReady(): boolean {
  try {
    getFirebase();
    return true;
  } catch {
    return false;
  }
}

/** Convenience: get Firestore database. */
export function getDb(): FirestoreDB {
  return getFirebase().firestore();
}

/** Convenience: get Auth. */
export function getAuth() {
  return getFirebase().auth();
}

/** Convenience: FieldValue helpers. */
export function FieldValue() {
  return getFirebase().FieldValue;
}

/** Convenience: Storage reference. */
export function getStorage() {
  return getFirebase().storage();
}

/**
 * Returns Authorization headers with the current Firebase ID token.
 * Used for calling Archii API routes that require authentication.
 * Returns empty headers if user is not logged in or Firebase is not ready.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const auth = getFirebase().auth();
    const user = auth.currentUser;
    if (!user) return {};
    const token = await user.getIdToken();
    return { 'Authorization': `Bearer ${token}` };
  } catch {
    return {};
  }
}

/**
 * Returns the current Firebase ID token string (for custom headers).
 * Used when the Authorization header is needed for another purpose (e.g., MS Graph API).
 */
export async function getFirebaseIdToken(): Promise<string | null> {
  try {
    const auth = getFirebase().auth();
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/* ---- Re-export types for use in hooks/components ---- */
export type { FirebaseApp, FirebaseUser, FirestoreDB, CollectionRef, DocRef, QuerySnapshot, QueryDocSnapshot, BatchWriter };
