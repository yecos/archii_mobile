/**
 * feature-flags.ts
 * Sistema de feature flags para Archii.
 *
 * Permite habilitar/deshabilitar features sin redeploy.
 * Usa variables de entorno NEXT_PUBLIC_FLAG_* para configuración,
 * con fallback a valores por defecto.
 *
 * Uso:
 *   import { isFlagEnabled, getAllFlags } from '@/lib/feature-flags';
 *   if (isFlagEnabled('new_kanban')) { ... }
 *
 * Configuración en Vercel / .env.local:
 *   NEXT_PUBLIC_FLAG_NEW_KANBAN=true
 *   NEXT_PUBLIC_FLAG_RAG_SEARCH=false
 */

/* ---- Flag Registry ---- */

/**
 * Registro centralizado de todas las feature flags.
 * El valor `default` se usa cuando no hay variable de entorno configurada.
 * El valor `envKey` es el nombre de la variable de entorno sin el prefijo NEXT_PUBLIC_FLAG_.
 */
const FLAG_REGISTRY: Record<string, { envKey: string; defaultValue: boolean; description: string }> = {
  // FASE 1 flags
  offline_queue: {
    envKey: 'OFFLINE_QUEUE',
    defaultValue: false,
    description: 'Activa la cola offline para writes cuando no hay conexión',
  },
  virtualized_lists: {
    envKey: 'VIRTUALIZED_LISTS',
    defaultValue: false,
    description: 'Usa virtualización para listas grandes (Kanban, Timeline, Notificaciones)',
  },
  audit_logs: {
    envKey: 'AUDIT_LOGS',
    defaultValue: false,
    description: 'Registra todas las operaciones de escritura en audit_logs',
  },

  // FASE 2 flags
  rag_search: {
    envKey: 'RAG_SEARCH',
    defaultValue: false,
    description: 'Habilita la búsqueda RAG por tenant (IA semántica)',
  },
  health_score_predictive: {
    envKey: 'HEALTH_SCORE_PREDICTIVE',
    defaultValue: false,
    description: 'Activa el Health Score predictivo con IA',
  },
  sso_saml: {
    envKey: 'SSO_SAML',
    defaultValue: false,
    description: 'Habilita login SSO/SAML para tenants enterprise',
  },
  public_api: {
    envKey: 'PUBLIC_API',
    defaultValue: false,
    description: 'Expone la API pública /api/v1/* con rate limiting',
  },
  webhooks_system: {
    envKey: 'WEBHOOKS_SYSTEM',
    defaultValue: false,
    description: 'Activa el sistema de webhooks para integraciones',
  },

  // FASE 3 flags
  realtime_collab: {
    envKey: 'REALTIME_COLLAB',
    defaultValue: false,
    description: 'Colaboración en tiempo real con cursores y presencia',
  },
  marketplace: {
    envKey: 'MARKETPLACE',
    defaultValue: false,
    description: 'Marketplace de integraciones (GitHub, Slack, Jira, etc.)',
  },
  bi_connector: {
    envKey: 'BI_CONNECTOR',
    defaultValue: false,
    description: 'Conector BI para Power BI / Tableau',
  },
  field_encryption: {
    envKey: 'FIELD_ENCRYPTION',
    defaultValue: false,
    description: 'Encriptación field-level para datos sensibles',
  },
  gdpr_tools: {
    envKey: 'GDPR_TOOLS',
    defaultValue: false,
    description: 'Herramientas GDPR (exportación/eliminación de datos)',
  },

  // BETA flags
  feedback_widget: {
    envKey: 'FEEDBACK_WIDGET',
    defaultValue: true,
    description: 'Muestra el widget de feedback flotante para reportes de usuarios',
  },
  error_reporting: {
    envKey: 'ERROR_REPORTING',
    defaultValue: true,
    description: 'Envía errores de UI a Firestore para análisis de bugs',
  },
  telemetry: {
    envKey: 'TELEMETRY',
    defaultValue: true,
    description: 'Telemetría anónima de uso de features (sin datos personales)',
  },
  beta_mode: {
    envKey: 'BETA_MODE',
    defaultValue: true,
    description: 'Activa indicadores visuales de beta y badge en la UI',
  },
};

/* ---- Cache ---- */

let flagCache: Record<string, boolean> | null = null;

/* ---- Public API ---- */

/**
 * Verifica si una feature flag está habilitada.
 * Convierte snake_case a SCREAMING_SNAKE_CASE para buscar la env var.
 *
 * @example
 *   isFlagEnabled('offline_queue')   → lee NEXT_PUBLIC_FLAG_OFFLINE_QUEUE
 *   isFlagEnabled('new_kanban')      → lee NEXT_PUBLIC_FLAG_NEW_KANBAN
 */
export function isFlagEnabled(flag: string): boolean {
  // Verificar cache
  if (flagCache && flag in flagCache) {
    return flagCache[flag];
  }

  const registry = FLAG_REGISTRY[flag];
  if (!registry) {
    console.warn(`[FeatureFlags] Flag desconocida: ${flag}`);
    return false;
  }

  // Buscar en process.env
  const envValue = process.env[`NEXT_PUBLIC_FLAG_${registry.envKey}`];

  let enabled: boolean;
  if (envValue !== undefined) {
    enabled = envValue === 'true' || envValue === '1';
  } else {
    enabled = registry.defaultValue;
  }

  // Guardar en cache
  if (!flagCache) flagCache = {};
  flagCache[flag] = enabled;

  return enabled;
}

/**
 * Devuelve todas las flags con sus valores actuales.
 * Útil para debugging y para la UI de administración.
 */
export function getAllFlags(): Record<string, { enabled: boolean; defaultValue: boolean; description: string }> {
  const result: Record<string, { enabled: boolean; defaultValue: boolean; description: string }> = {};
  for (const [key, registry] of Object.entries(FLAG_REGISTRY)) {
    result[key] = {
      enabled: isFlagEnabled(key),
      defaultValue: registry.defaultValue,
      description: registry.description,
    };
  }
  return result;
}

/**
 * Devuelve solo las flags habilitadas.
 */
export function getEnabledFlags(): string[] {
  return Object.entries(FLAG_REGISTRY)
    .filter(([key]) => isFlagEnabled(key))
    .map(([key]) => key);
}

/**
 * Limpia la cache de flags (útil después de cambiar env vars en dev).
 */
export function clearFlagCache(): void {
  flagCache = null;
}
