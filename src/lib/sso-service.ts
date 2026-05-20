/**
 * sso-service.ts
 * Servicio de SSO/SAML para tenants enterprise.
 *
 * Arquitectura:
 *   - Firebase Auth SAML Provider (Azure AD, Okta, Google Workspace)
 *   - Mapeo de roles desde IdP claims a roles internos
 *   - Provisioning automático vía SCIM
 *   - Configuración por tenant almacenada en Firestore
 *
 * Flujo:
 *   1. Admin configura SAML en el tenant (IdP metadata + cert)
 *   2. Firebase Auth genera SP metadata ( AssertionConsumerService URL )
 *   3. Usuario inicia login → IdP autentica → callback → mapeo de roles → acceso
 *   4. SCIM webhook crea/desactiva usuarios automáticamente
 *
 * Gated por feature flag 'sso_saml'.
 */

import { getAdminDb } from './firebase-admin';
import { getAdminAuth } from './firebase-admin';
import { isFlagEnabled } from './feature-flags';

/* ---- Types ---- */

export interface SSOConfig {
  /** ID del tenant */
  tenantId: string;
  /** Proveedor de identidad */
  provider: 'azure-ad' | 'okta' | 'google-workspace' | 'custom';
  /** ID del proveedor SAML en Firebase Auth (auto-generado) */
  samlProviderId?: string;
  /** Entity ID del IdP (Identity Provider) */
  idpEntityId: string;
  /** SSO URL del IdP (donde redirigir para login) */
  idpSsoUrl: string;
  /** X.509 Certificate del IdP (para verificar firmas) */
  idpCertificate: string;
  /** Attribute mapping: IdP claim → Archii field */
  attributeMapping: {
    email: string;    // ej: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'
    displayName: string;
    role: string;
    department?: string;
    jobTitle?: string;
  };
  /** Mapeo de roles del IdP a roles internos */
  roleMapping: Record<string, string[]>;
  /** ¿Crear usuarios automáticamente al primer login? */
  autoProvision: boolean;
  /** ¿Desactivar usuarios eliminados del IdP? */
  autoDeprovision: boolean;
  /** SCIM endpoint secret (para recibir webhooks del IdP) */
  scimSecret?: string;
  /** Estado */
  active: boolean;
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface SCIMUser {
  id?: string;
  userName: string;
  name?: { givenName?: string; familyName?: string };
  displayName?: string;
  emails?: Array<{ value: string; primary?: boolean }>;
  active: boolean;
  title?: string;
  department?: string;
  roles?: Array<{ value: string; display?: string }>;
}

export interface SCIMEvent {
  operation: 'create' | 'update' | 'delete';
  tenantId: string;
  user: SCIMUser;
  timestamp: string;
  verified: boolean;
}

/* ---- SSO Configuration Management ---- */

/**
 * Crea o actualiza la configuración SSO de un tenant.
 */
export async function saveSSOConfig(config: SSOConfig): Promise<string> {
  if (!isFlagEnabled('sso_saml')) {
    throw new Error('SSO/SAML no está habilitado');
  }

  const db = getAdminDb();

  // Verificar que no exista otra config activa para este tenant
  const existing = await db
    .collection('sso_configs')
    .where('tenantId', '==', config.tenantId)
    .where('active', '==', true)
    .get();

  if (!existing.empty && config.active) {
    // Desactivar configs anteriores
    const batch = db.batch();
    existing.docs.forEach((doc) => {
      batch.update(doc.ref, { active: false, updatedAt: new Date().toISOString() });
    });
    await batch.commit();
  }

  // Guardar nueva config
  const docRef = await db.collection('sso_configs').add({
    ...config,
    updatedAt: new Date().toISOString(),
  });

  return docRef.id;
}

/**
 * Obtiene la configuración SSO activa de un tenant.
 */
export async function getSSOConfig(tenantId: string): Promise<SSOConfig | null> {
  const db = getAdminDb();

  const snapshot = await db
    .collection('sso_configs')
    .where('tenantId', '==', tenantId)
    .where('active', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const data = snapshot.docs[0].data();
  return data as unknown as SSOConfig;
}

/**
 * Elimina (desactiva) la configuración SSO de un tenant.
 */
export async function disableSSO(tenantId: string): Promise<void> {
  const db = getAdminDb();

  const snapshot = await db
    .collection('sso_configs')
    .where('tenantId', '==', tenantId)
    .where('active', '==', true)
    .get();

  if (snapshot.empty) return;

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.update(doc.ref, { active: false, updatedAt: new Date().toISOString() });
  });
  await batch.commit();

}

/* ---- Role Mapping ---- */

/**
 * Mapea un rol del IdP a roles internos de Archii.
 * Si no hay mapeo específico, asigna 'Miembro' por defecto.
 */
export function mapIdPRoleToInternal(
  idpRole: string,
  roleMapping: Record<string, string[]>
): string[] {
  const mapped = roleMapping[idpRole];
  if (mapped && mapped.length > 0) return mapped;

  // Buscar coincidencia parcial (case-insensitive)
  const lowerRole = idpRole.toLowerCase();
  for (const [key, roles] of Object.entries(roleMapping)) {
    if (key.toLowerCase().includes(lowerRole) || lowerRole.includes(key.toLowerCase())) {
      return roles;
    }
  }

  return ['Miembro']; // Default
}

/**
 * Extrae el rol del IdP desde los claims del token.
 */
export function extractRoleFromClaims(
  claims: Record<string, any>,
  attributeMapping: SSOConfig['attributeMapping']
): string {
  // Buscar en los claims usando el attribute mapping
  const roleClaimPath = attributeMapping.role;

  // Soporta notación de punto (ej: 'roles.primary')
  const parts = roleClaimPath.split('.');
  let value: any = claims;
  for (const part of parts) {
    value = value?.[part];
  }

  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value[0] as string;

  return 'Miembro';
}

/* ---- SCIM Provisioning ---- */

/**
 * Genera el secret SCIM para recibir webhooks del IdP.
 */
export function generateSCIMSecret(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verifica la firma HMAC de un webhook SCIM.
 */
export function verifySCIMSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto');
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSig, 'hex')
  );
}

/**
 * Procesa un evento SCIM (create/update/delete user).
 */
export async function processSCIMEvent(event: SCIMEvent): Promise<{
  success: boolean;
  action: string;
  userId?: string;
}> {
  if (!isFlagEnabled('sso_saml')) {
    return { success: false, action: 'SSO disabled' };
  }

  const db = getAdminDb();

  // Log del evento SCIM
  await db.collection('scim_events').add({
    ...event,
    processedAt: new Date().toISOString(),
  });

  const scimUser = event.user;
  const email = scimUser.emails?.[0]?.value;

  if (!email) {
    return { success: false, action: 'No email in SCIM payload' };
  }

  // Buscar usuario existente
  let userRecord;
  try {
    userRecord = await getAdminAuth().getUserByEmail(email);
  } catch {
    // Usuario no existe
  }

  switch (event.operation) {
    case 'create': {
      if (userRecord) {
        // Usuario ya existe, solo actualizar metadata
        const customClaims: Record<string, any> = {
          tenantId: event.tenantId,
          ssoManaged: true,
        };

        if (scimUser.title) customClaims.jobTitle = scimUser.title;
        if (scimUser.department) customClaims.department = scimUser.department;

        await getAdminAuth().setCustomUserClaims(userRecord.uid, customClaims);

        // Actualizar documento en users
        await db.collection('users').doc(userRecord.uid).set(
          {
            email,
            name: scimUser.displayName || scimUser.name?.givenName || email.split('@')[0],
            role: scimUser.roles?.[0]?.value || 'Miembro',
            companyId: undefined,
            tenantId: event.tenantId,
            ssoManaged: true,
            active: true,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        return { success: true, action: 'updated', userId: userRecord.uid };
      }

      // Crear usuario en Firebase Auth
      const newUser = await getAdminAuth().createUser({
        email,
        displayName: scimUser.displayName || scimUser.name?.givenName || '',
        emailVerified: true, // Confiamos en el IdP
        disabled: !scimUser.active,
      });

      // Set custom claims
      const customClaims: Record<string, any> = {
        tenantId: event.tenantId,
        ssoManaged: true,
      };
      if (scimUser.title) customClaims.jobTitle = scimUser.title;
      if (scimUser.department) customClaims.department = scimUser.department;

      await getAdminAuth().setCustomUserClaims(newUser.uid, customClaims);

      // Crear documento en users
      await db.collection('users').doc(newUser.uid).set({
        email,
        name: scimUser.displayName || scimUser.name?.givenName || email.split('@')[0],
        role: scimUser.roles?.[0]?.value || 'Miembro',
        companyId: undefined,
        tenantId: event.tenantId,
        ssoManaged: true,
        active: scimUser.active,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      return { success: true, action: 'created', userId: newUser.uid };
    }

    case 'update': {
      if (!userRecord) {
        return { success: false, action: 'User not found' };
      }

      // Actualizar estado (activado/desactivado)
      await getAdminAuth().updateUser(userRecord.uid, {
        displayName: scimUser.displayName || undefined,
        disabled: !scimUser.active,
      });

      // Actualizar custom claims
      const customClaims: Record<string, any> = {
        tenantId: event.tenantId,
        ssoManaged: true,
      };
      await getAdminAuth().setCustomUserClaims(userRecord.uid, customClaims);

      // Actualizar documento
      await db.collection('users').doc(userRecord.uid).set(
        {
          name: scimUser.displayName || undefined,
          role: scimUser.roles?.[0]?.value || 'Miembro',
          active: scimUser.active,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return { success: true, action: 'updated', userId: userRecord.uid };
    }

    case 'delete': {
      if (!userRecord) {
        return { success: false, action: 'User not found' };
      }

      // Desactivar usuario (no eliminar)
      await getAdminAuth().updateUser(userRecord.uid, { disabled: true });

      await db.collection('users').doc(userRecord.uid).set(
        {
          active: false,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return { success: true, action: 'deactivated', userId: userRecord.uid };
    }

    default:
      return { success: false, action: `Unknown operation: ${event.operation}` };
  }
}

/* ---- SAML Metadata Helpers ---- */

/**
 * Genera la metadata del Service Provider (SP) para Archii.
 * Esta metadata se registra en el IdP (Azure AD, Okta, etc.).
 */
export function generateSPMetadata(
  tenantId: string,
  entityId: string
): string {
  const acsUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://archii-theta.vercel.app'}/api/auth/saml/callback`;
  const sloUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://archii-theta.vercel.app'}/api/auth/saml/logout`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${entityId}">
  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}" index="1"/>
    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="${sloUrl}"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
}
