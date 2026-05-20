# Contribuir a Archii

¡Gracias por tu interés en contribuir a Archii! Este documento tiene las pautas para participar en el desarrollo del proyecto.

## Código de conducta

Al participar en este proyecto, te comprometes a respetar a todos los participantes. Sé profesional, constructivo y cortés. Los comportamientos dañinos no serán tolerados.

## Cómo contribuir

### Reportar bugs

Usa el template de [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) al crear un issue. Incluye:
- Pasos para reproducir
- Comportamiento esperado vs actual
- Entorno (dispositivo, navegador, versión)
- Screenshots cuando sea posible

### Proponer funcionalidades

Usa el template de [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md). Explica:
- El problema que resuelve
- La solución propuesta
- La prioridad percibida

### Enviar Pull Requests

1. **Fork** el repositorio y crea una rama descriptiva:
   ```bash
   git checkout -b feature/mi-funcionalidad
   ```

2. **Desarrolla** tus cambios siguiendo las convenciones del proyecto (ver más abajo).

3. **Verifica** que todo compila y los tests pasan:
   ```bash
   npm run build
   npm run test
   npm run lint
   ```

4. **Commit** con mensajes claros (usa [Conventional Commits](https://www.conventionalcommits.org/)):
   ```
   feat(tasks): agregar filtro por prioridad
   fix(auth): corregir error de sesión expirada
   refactor(onedrive): consolidar utilidades de auth
   ```

5. **Push** y abre un Pull Request usando el [template](.github/PULL_REQUEST_TEMPLATE.md).

## Convenciones del código

### TypeScript
- Tipado estricto. Evitar `any` cuando sea posible.
- Usar interfaces para definir tipos de datos.
- Preferir `const` sobre `let`, y never sobre `const`.

### React / Next.js
- Componentes funcionales con hooks.
- Server Components por defecto; `'use client'` solo cuando sea necesario.
- Props con tipos explícitos (no `any`).

### Estilo
- Seguir las reglas de ESLint configuradas (`npm run lint`).
- Tailwind CSS para estilos. Evitar CSS inline excepto para valores dinámicos.
- Nombres de archivos: `PascalCase` para componentes, `kebab-case` para utilidades.

### Estructura de carpetas
- `src/app/api/` — Rutas API de Next.js.
- `src/screens/` — Pantallas principales de la aplicación.
- `src/components/` — Componentes React organizados por dominio.
- `src/lib/` — Servicios, utilidades y helpers compartidos.
- `src/hooks/` — Custom hooks de React.

### Seguridad
- **Nunca** exponer tokens o credenciales en respuestas API.
- **Siempre** verificar pertenencia al tenant antes de operaciones de lectura/escritura.
- **Usar** `verifyTenantMembership` de `@/lib/tenant-utils` para verificación de acceso.
- **Usar** `checkRateLimit` de `@/lib/rate-limiter` en endpoints públicos.
- **Encriptar** datos sensibles antes de almacenar en Firestore.

### Tests
- Usar Vitest + Testing Library.
- Tests unitarios para servicios y utilidades en `src/lib/`.
- Tests de integración para rutas API en `src/app/api/`.

## Arquitectura importante

- **Multi-tenant**: Todos los datos están aislados por `tenantId`. Las queries a Firestore siempre deben incluir el filtro de tenant.
- **AppContext**: El estado global de la aplicación está en `src/contexts/AppContext.tsx`. Modificar con cuidado.
- **SPA en App Router**: La app es una sola página que cambia pantallas condicionalmente, no usa file-based routing para navegación interna.
- **OneDrive auth**: Usar las utilidades compartidas de `src/lib/onedrive-auth.ts`. No duplicar funciones de autenticación.

## Preguntas

Si tienes dudas sobre cómo contribuir, abre un issue con la etiqueta `question` y te responderemos lo antes posible.

---

¡Gracias a todos los contribuyentes! ❤️
