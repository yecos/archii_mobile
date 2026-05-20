/**
 * api-auth.ts
 * Firebase ID token verification utilities for API routes.
 * Provides authenticateRequest, requireAuth, and requireAdmin helpers.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

// Admin emails — loaded from env var, comma-separated. No hardcoded fallback for security.
const ADMIN_EMAILS: string[] = process.env.ADMIN_EMAILS
  ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  : (() => {
      if (process.env.NODE_ENV === 'production') {
        console.error('[Archii Auth] CRITICAL: ADMIN_EMAILS env var is not set in production. Admin routes will be disabled.');
      } else {
        console.warn('[Archii Auth] ADMIN_EMAILS not set. Admin routes disabled. Set ADMIN_EMAILS env var to enable.');
      }
      return [];
    })();

export interface AuthUser {
  uid: string;
  email: string;
  role?: string;
}

/**
 * Error de autenticación con status code HTTP.
 * Los callers pueden usar instanceof AuthError para manejar errores.
 */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

/**
 * Authenticate a request by verifying the Firebase ID token from the Authorization header.
 * Returns the decoded user info on success, or null on failure.
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<AuthUser | null> {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      console.warn("[Archii Auth] Missing or malformed Authorization header");
      return null;
    }

    const idToken = authHeader.split("Bearer ")[1];

    if (!idToken) {
      console.warn("[Archii Auth] Empty Bearer token");
      return null;
    }

    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    return {
      uid: decodedToken.uid,
      email: decodedToken.email || "",
      role: decodedToken.role,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (
        error.message.includes("auth/id-token-expired") ||
        error.message.includes("token expired")
      ) {
        console.warn("[Archii Auth] Token expired");
      } else if (
        error.message.includes("auth/invalid-id-token") ||
        error.message.includes("invalid token")
      ) {
        console.warn("[Archii Auth] Invalid token");
      } else {
        console.warn("[Archii Auth] Verification failed:", error.message);
      }
    } else {
      console.warn("[Archii Auth] Unknown verification error");
    }
    return null;
  }
}

/**
 * Require authentication. Returns the user on success, or throws an AuthError.
 * Usage: const user = await requireAuth(request);
 */
export async function requireAuth(
  request: NextRequest
): Promise<AuthUser> {
  const user = await authenticateRequest(request);

  if (!user) {
    throw new AuthError("No autenticado. Se requiere un token válido.", 401);
  }

  return user;
}

/**
 * Require authentication AND admin role.
 * Returns the user on success, or throws an AuthError.
 * Usage: const user = await requireAdmin(request);
 */
export async function requireAdmin(
  request: NextRequest
): Promise<AuthUser> {
  const user = await requireAuth(request);

  if (!ADMIN_EMAILS.includes(user.email)) {
    console.warn(
      `[Archii Auth] Non-admin access attempt by ${user.email}`
    );
    throw new AuthError("No autorizado. Se requieren permisos de administrador.", 403);
  }

  return user;
}
