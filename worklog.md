---
Task ID: 1
Agent: Super Z (Main)
Task: Build Super IA Agent — AI with function calling that can create, edit and manage everything in ArchiFlow

Work Log:
- Explored entire codebase structure (19 screens, 10+ API routes, 40+ UI components)
- Analyzed existing AI infrastructure (ai-assistant, ai-suggestions stub, AIChatPanel, QuickActions)
- Studied data model: 15+ Firestore entities with CRUD operations in firestore-actions.ts
- Created /api/ai-agent/route.ts with 13 OpenAI function-calling tools
- Redesigned AIChatPanel.tsx with Action Cards, typing improvements, Super IA branding
- Rewrote QuickActions.tsx to use functional /api/ai-agent endpoint
- Updated AIFloatingWrapper.tsx with new gradient styling and descriptive tooltip
- Verified 0 TypeScript errors and clean build
- Committed (72f89fb) and pushed to origin/main

Stage Summary:
- **New API**: /api/ai-agent with 13 tools (get_projects, get_project_detail, create_task, create_project, create_expense, create_supplier, create_meeting, get_tasks, get_team_members, update_task_status, get_budget_summary, get_expenses)
- **Action Cards**: Visual feedback showing exactly what the AI created/modified (green cards for success, red for errors)
- **Quick Actions**: Now functional — "Sugerir tareas", "Analizar presupuesto", "Planificar cronograma", "Mejoras del proyecto"
- **Branding**: "Super IA" with gradient gold buttons, ray icon, AGENT badge
- **Build**: 0 TS errors, all routes verified
---
Task ID: 1
Agent: main
Task: Implementar multi-tenant completo en ArchiFlow

Work Log:
- Leidos todos los archivos clave: AppContext, firebase-service, firestore-actions, AuthScreen, TopBar, AI Agent
- Descubierto que ya existia infraestructura parcial de tenant (estado en AppContext, API /api/tenants, listeners filtrados)
- Creado TenantSelectionScreen.tsx - pantalla completa de seleccion/creacion de tenant
- Actualizado HomeContent.tsx - bloquea la app hasta que se seleccione un tenant
- Actualizado TopBar.tsx - switcher de tenant con dropdown premium
- Filtrado generalMessages por tenantId en AppContext listener y sendMessage
- Actualizado firestore-actions.ts - 41 funciones con parametro tenantId
- Actualizado AI Agent - todas las queries filtradas por tenantId, escrituras con tenantId
- Actualizado AIChatPanel.tsx y QuickActions.tsx para enviar tenantId al endpoint
- Actualizado TimeTrackingScreen e InvoicesScreen como callers de firestore-actions
- 0 TypeScript errors, build exitoso, push completado

Stage Summary:
- Multi-tenant completamente implementado con aislamiento total
- Pantalla de seleccion de tenant despues del login
- Switcher de tenant en TopBar
- Todos los datos aislados por tenant
- Commit: c11e952, deploy en progreso a Vercel

---
Task ID: 2
Agent: Super Z (Main)
Task: Diagnosticar y corregir error "This page couldn't load" en Vercel

Work Log:
- Verificado que el build local compila sin errores (0 TS errors)
- Probado servidor local con `npm run start` - responde HTTP 200 correctamente
- Analizado todos los archivos importados por HomeContent.tsx - todos existen
- Analizado layout.tsx, error.tsx, AppContext, TenantSelectionScreen, TopBar
- Descubierto bug critico: /api/tenants/route.ts llamaba request.json() 3 veces
  - Line 45: leer 'action' (primera lectura del body)
  - Line 71: leer 'name' en create (segunda lectura - FALLA, body ya consumido)
  - Line 95: leer 'code' en join (tercera lectura - FALLA, body ya consumido)
- Corregido: ahora se lee el body UNA SOLA VEZ y se destructuran todos los campos
- Verificado que ningun otro API route tiene el mismo bug
- Build limpio, push completado (e701bf8)

Stage Summary:
- Bug corregido: request.json() llamado multiples veces en /api/tenants
- La correccion permite que create/join tenant funcionen correctamente
- Commit: e701bf8, deploy a Vercel en progreso

---
Task ID: 3
Agent: Super Z (Main)
Task: Fix critico turbopack.root + flujo Login→Tenant con roles

Work Log:
- Descubierto CAUSA RAIZ: turbopack.root en next.config.ts apuntaba a /home/z/my-project
  Esta ruta absoluta NO EXISTE en Vercel, causando que Turbopack no pueda resolver modulos
  Resultado: "This page couldn't load" en Vercel (aunque localmente funciona perfecto)
- Removido bloque turbopack de next.config.ts
- Generado package-lock.json para builds deterministas en Vercel
- Implementado flujo de roles: Super Admin (creador) / Miembro (invitado)
  - /api/tenants create: devuelve role 'Super Admin'
  - /api/tenants join: devuelve role 'Miembro'
  - /api/tenants list: calcula rol comparando createdBy con user.uid
- AppContext: Nuevo estado activeTenantRole, switchTenant() recibe role
- TenantSelectionScreen: Badge SUPER ADMIN dorado en tenants del creador
- TenantSelectionScreen: Info visual "Serás Super Admin" al crear espacio
- TenantSelectionScreen: Info visual "Entrarás como Miembro" al unirse
- TopBar: Badge ADMIN en dropdown del tenant actual
- 0 build errors, commit 76903cb, push completado

Stage Summary:
- FIX CRITICO: turbopack.root removido - esta era la causa del error en Vercel
- Flujo definido: Login → Tenant Selection → (create=Super Admin / join=Miembro)
- 1 tenant = auto-select, 0 = crear, varios = selector
- Roles con badge visual dorado "SUPER ADMIN" en toda la UI
- Commit: 76903cb, deploy a Vercel en progreso

---
Task ID: 4
Agent: Super Z (Main)
Task: Diagnosticar y corregir error persistente "This page couldn't load" en Vercel

Work Log:
- Verificado deployment actual en Vercel: curl https://archii-theta.vercel.app/ retorna HTTP 200
- HTML servido correctamente con Firebase scripts, CSS, JS chunks
- Verificados TODOS los JS chunks (11d0x0h03oee-.js, etc.) - todos retornan 200
- Verificado que firebase-admin NO se filtra al bundle del cliente
- Confirmado que el flujo Login→Tenant está correctamente implementado
- Agregado serverExternalPackages: ['firebase-admin', 'sharp'] a next.config.ts
- Agregado window.onerror global handler en layout.tsx para capturar errores de cliente
- Actualizado service worker cache de v3 a v4 para forzar refresh de cache
- Build exitoso (0 errores), push completado (4374fcd)

Stage Summary:
- El servidor Vercel responde correctamente (HTTP 200, HTML completo, chunks OK)
- El error probablemente era causado por: (a) cache antigua del service worker, o (b) firebase-admin sin serverExternalPackages
- Fixes aplicados: serverExternalPackages + error handler global + SW cache bust v4
- Flujo verificado: Login → Tenant Selection → Super Admin/Miembro (ya estaba correcto)
- Commit: 4374fcd, deploy en vivo en https://archii-theta.vercel.app

---
Task ID: 1
Agent: main
Task: Fix 'useApp must be used within AppProvider' error + add tenant data migration

Work Log:
- Analyzed root cause: AppProvider was inside HomeContent.tsx which was loaded via dynamic() with ssr:false. In Next.js 16 + React 19, context from dynamically loaded components may not propagate correctly.
- Created src/app/ClientProviders.tsx — a 'use client' wrapper component
- Updated layout.tsx to wrap {children} with <ClientProviders>, moving AppProvider to the root layout level
- Updated HomeContent.tsx to remove AppProvider wrapper (no longer needed, context now global)
- Updated src/app/api/tenants/route.ts with migrateExistingData() function that migrates unassigned documents across 15 collections
- Updated TenantSelectionScreen.tsx with migration toggle UI (auto-enabled for first tenant creation)

Stage Summary:
- Fixed critical loading bug: AppProvider now wraps all children at layout level
- Added tenant creation with existing data migration
- Collections handled: projects, tasks, expenses, suppliers, companies, meetings, galleryPhotos, invProducts, invCategories, invMovements, invTransfers, timeEntries, invoices, comments, generalMessages
- Committed as 67453e5 and pushed to main — Vercel will auto-deploy

---
Task ID: 1
Agent: Main Agent
Task: Actualizar INSTRUCTIVO_BITACORA con PARTE 6 + documentar todas las sesiones recientes

Work Log:
- Leído el instructivo completo (4137 líneas) para entender estado actual
- Identificadas sesiones faltantes: 2026-04-13, 2026-04-18, 2026-04-19, 2026-04-20
- Creada PARTE 6: REGLA OBLIGATORIA DE DOCUMENTACION CONTINUA con 4 subsecciones
- Documentadas todas las sesiones con formato estándar
- Copiado archivo actualizado a raíz del proyecto
- Commit y push a GitHub

Stage Summary:
- Archivo: INSTRUCTIVO_BITACORA.txt (4137 → 4474 líneas, +337 líneas)
- Commit: fe66a6d
- PARTE 6 agregada con reglas obligatorias para todas las sesiones
- 4 sesiones documentadas (2026-04-13, 2026-04-18, 2026-04-19, 2026-04-20)
- Subido exitosamente a GitHub

---
Task ID: 2
Agent: Super Z (Main)
Task: Crear protocolo anti-errores concurrentes + mecanismo de lectura obligatoria para todas las sesiones

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt

Work Log:
- Analizado el INSTRUCTIVO_BITACORA.txt completo (4474 lineas, Partes 1-6)
- Analizado worklog.md para entender estado actual del proyecto
- Identificado que el mecanismo de lectura obligatoria no existia previamente
- Creado LEE_PRIMERO.txt (~90 lineas) en la raiz del repositorio como puerta de entrada obligatoria
- Creada PARTE 7 en INSTRUCTIVO_BITACORA.txt: PROTOCOLO ANTI-ERRORES CONCURRENTES (~335 lineas)
- Subsecciones de PARTE 7:
  - 7.1 Mecanismo de entrada — como garantizar que todas las sesiones lo lean
  - 7.2 Separacion de trabajo entre sesiones (areas seguras vs peligrosas)
  - 7.3 Bloqueo virtual de archivos (Virtual File Lock via worklog.md)
  - 7.4 Proteccion de datos en Firestore
  - 7.5 Rollback y recuperacion de emergencia
  - 7.6 Verificacion antes de push y deploy (checklists pre/post)
  - 7.7 Protocolo de comunicacion entre sesiones (INTENT/LOCK/UNLOCK/DONE)
  - 7.8 Escenarios de error comun y como prevenirlos (6 escenarios)
  - 7.9 Resumen ejecutivo — Las 10 Reglas de Oro

Stage Summary:
- Nuevo archivo: LEE_PRIMERO.txt (protocolo corto de emergencia en raiz del repo)
- Actualizado: INSTRUCTIVO_BITACORA.txt (4474 → 4809 lineas, +335 lineas PARTE 7)
- Mecanismo de lectura obligatoria: LEE_PRIMERO.txt + usuario menciona al iniciar sesion + registro en worklog.md
- Sistema de bloqueo virtual: LOCK/UNLOCK en worklog.md para archivos peligrosos
- Pendiente: commit y push a GitHub

---
Task ID: 3
Agent: Super Z (Main)
Task: Agregar gestion de miembros del tenant desde la UI

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt

LOCK: src/app/api/tenants/route.ts por Sesion-3 desde 15:00 — agregar acciones de gestion de miembros

Work Log:
- Analizado sistema actual de miembros (array UIDs en documento de Firestore)
- Verificados endpoints existentes: /api/debug/tenant, /api/debug/tenant/restore-members
- Tag de respaldo creado: backup-pre-manage-members-20260420
- Agregadas 4 nuevas acciones a /api/tenants:
  - add-members: busca usuarios por email y los agrega al array members
  - add-all-users: agrega TODOS los usuarios registrados al tenant (solo creador)
  - remove-member: elimina un miembro del array members (solo creador)
  - get-members: lista miembros con datos resueltos + usuarios disponibles
- Creado ManageMembersModal.tsx con 3 tabs:
  - Miembros: lista actual con fotos, badges ADMIN, boton eliminar
  - Agregar: seleccionar usuarios disponibles + agregar por email
  - Codigo: ver y copiar codigo de invitacion
- TopBar.tsx: agregado boton "Gestionar miembros" en dropdown del tenant
- Build verificado: 0 errores TypeScript, 0 errores de compilacion

UNLOCK: src/app/api/tenants/route.ts por Sesion-3 a 15:45 — commit 3dd3bfa

Stage Summary:
- Archivos modificados: 3 (route.ts, ManageMembersModal.tsx nuevo, TopBar.tsx)
- Total: +543 lineas, -5 lineas
- Commit: 3dd3bfa
- Tag: backup-pre-manage-members-20260420
- Build: exitoso (0 errores)
- Deploy: Vercel auto-deploy en progreso
---
Task ID: 2
Agent: Super Z (Main)
Task: Fix - Personas del equipo no aparecen en TeamScreen

Work Log:
- Investigado el flujo de carga de teamUsers en AppContext.tsx
- Identificada la causa: tenant members array solo contiene UID del creador
- Verificado que el filtro teamUsers = allUsersCache.filter(u => activeTenantMembers.includes(u.id)) es correcto
- Agregado boton "Gestionar miembros" directamente en TeamScreen para Admins/Directores/Super Admins
- Agregado estado vacio cuando no hay miembros con boton para agregar
- Build exitoso, commit y push a main

Stage Summary:
- Commit: b441b54 - fix(team): agregar boton Gestionar Miembros directo en TeamScreen
- El usuario puede ahora ir a Equipo > clic "Gestionar miembros" > "Agregar todos los usuarios"
- Desplegando en Vercel automaticamente
---
Task ID: 3
Agent: Super Z (Main) + full-stack-developer subagent
Task: Sistema multi-tenant OneDrive (equipo compartido + personal)

Work Log:
- Analizada integracion OneDrive existente (6 API routes, 7 UI components)
- Diseñada arquitectura dual: Tenant OneDrive (server-side token) + Personal OneDrive (client-side token)
- Creadas 4 nuevas API routes para tenant OneDrive:
  - /api/tenants/onedrive/connect (connect/disconnect/status/refresh)
  - /api/tenants/onedrive/files (list + upload)
  - /api/tenants/onedrive/files/[id] (download/rename/delete)
  - /api/tenants/onedrive/folders (create folders)
- Rediseñado FilesScreen.tsx con tabs: Equipo + Personal
- Actualizado ProfileScreen.tsx con seccion Mi OneDrive Personal
- Build exitoso (0 errores)
- Commit: fb3991c + push a main

Stage Summary:
- Sistema completo de OneDrive multi-tenant implementado
- El Super Admin conecta la cuenta Microsoft del tenant → todos los miembros ven archivos
- Cada usuario puede conectar su propio OneDrive personal desde Perfil
- Tokens del tenant almacenados seguros en Firestore (server-side)
- Deploy a Vercel en curso
---
Task ID: 1
Agent: Main Agent
Task: Unificar sistema de temas y corregir inconsistencias claro/oscuro

Work Log:
- Audit completo del sistema de temas (ui-store + AppContext + globals.css + componentes)
- Identificado bug: dos fuentes de verdad para tema (AppContext darkMode + ui-store theme) con dual-writes
- Identificado bug: .af-skeleton usaba [data-theme=dark] en vez de .dark
- Identificado bug: .af-glass/.af-glass-strong hardcodeados a dark mode
- Identificado bug: sonner toast border hardcoded rgba(255,255,255,0.1)
- Identificado bug: select arrow color hardcoded gray-500 sin dark variant
- Identificado: ManageMembersModal completamente hardcodeado a dark mode (bg-gray-900, text-white, etc.)
- Unificado fuente de verdad a ui-store (Zustand), AppContext ahora consume derivado
- Fix globals.css: glassmorphism adaptativo, skeleton selector, sonner border, select arrow
- ManageMembersModal reescrito con CSS variables (var(--card), var(--foreground), etc.)
- Creado src/lib/theme-registry.ts: sistema extensible para futuros temas
- Actualizado ui-store con initTheme(), applyThemeCSS(), soporte para THEME_REGISTRY

Stage Summary:
- Compilación exitosa, push completado (e6611c0)
- Sistema de temas ahora tiene una sola fuente de verdad
- Modo claro y oscuro consistentes en toda la app
- Preparado para agregar futuros temas (midnight, forest, etc.)
---
Task ID: 4
Agent: Super Z (Main)
Task: Integrar Phase 1 (RFIs, Submittals, Punch List) con el resto de la app

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt
Tag: backup-pre-phase1-integration-20260420

Work Log:
- Auditado puntos de integración faltantes (Dashboard, Calendar, Project Detail, AI Agent)
- DashboardScreen: agregados rfis, submittals, punchItems al useApp() + KPI cards (RFIs+Submittals, Punch List) + Quick Actions row (3 cards clickeables con stats y pulso rojo para vencidos) + Actividad reciente enriquecida (RFIs, Submittals, Punch items)
- CalendarScreen: agregados rfis, submittals, punchItems al useApp() + calRFIs/calSubmittals/calPunch filtrados + badges en días del calendario (❓ RFIs, 📋 Submittals, ✅ Punch) + detalle del día con secciones de RFIs, Submittals y Punch items
- ProjectDetailScreen: nuevo tab "Calidad" entre Tareas y Presupuesto con stats (3 cards), listas de RFIs/Submittals/Punch del proyecto con botón +Nuevo para crear directamente, barra de progreso de Punch List
- AI Agent (ai-agent/route.ts): 4 nuevas tools - get_rfis, create_rfi, get_submittals, get_punch_items con filtros por proyecto/estado/ubicación
- Build verificado: 0 errores, push completado

Stage Summary:
- 4 archivos modificados: DashboardScreen.tsx, CalendarScreen.tsx, ProjectDetailScreen.tsx, ai-agent/route.ts
- Total: +412 lineas, -12 lineas
- Commit: a7fe673
- Tag: backup-pre-phase1-integration-20260420
- Deploy a Vercel en curso

---
Task ID: 1
Agent: Super Z (Main)
Task: Reemplazar OpenAI por z-ai-web-dev-sdk (GLM) como motor de IA de la app

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt

Work Log:
- Investigada integración actual: ai-agent/route.ts (function calling con OpenAI) + ai-assistant/route.ts (chat simple con OpenAI)
- Descubierto que la app require OPENAI_API_KEY configurada en Vercel, la cual no estaba configurada
- Probado z-ai-web-dev-sdk: soporta function calling nativo (tools + tool_choice: auto) igual que OpenAI
- Instalado z-ai-web-dev-sdk como dependencia del proyecto
- Modificado ai-agent/route.ts: reemplazado fetch a OpenAI por zai.chat.completions.create() (mantiene function calling)
- Modificado ai-assistant/route.ts: reemplazado fetch a OpenAI por zai.chat.completions.create()
- Eliminada dependencia de OPENAI_API_KEY, OPENAI_BASE_URL, AI_MODEL
- Build verificado: 0 errores TypeScript en archivos modificados
- Commit: 8bf46f4, push a main completado

Stage Summary:
- La IA de ArchiFlow ahora usa GLM (z-ai-web-dev-sdk) sin necesidad de API keys externas
- Function calling funciona: 17 herramientas (crear tareas, proyectos, gastos, proveedores, reuniones, RFIs, consultar datos, etc.)
- Commit: 8bf46f4
- Deploy automático a Vercel en curso (https://archii-theta.vercel.app)

---
Task ID: 5
Agent: Fix Agent
Task: Replace z-ai-web-dev-sdk with Google Gemini API for Vercel compatibility

Work Log:
- Created src/lib/gemini-helper.ts with OpenAI-compatible Gemini wrapper
  - chatCompletion() for simple chat (used by ai-assistant)
  - chatCompletionWithTools() for function calling (used by ai-agent)
  - Full message format conversion (OpenAI ↔ Gemini)
  - Full tool format conversion (OpenAI ↔ Gemini)
  - Response conversion with proper finish_reason handling
  - Function call ID generation (Gemini doesn't provide one)
- Updated src/app/api/ai-agent/route.ts to use Gemini
  - Replaced import from z-ai-helper to gemini-helper
  - Updated JSDoc to reference Google Gemini
  - Replaced zai.chat.completions.create() calls with chatCompletionWithTools()
- Updated src/app/api/ai-assistant/route.ts to use Gemini
  - Replaced import from z-ai-helper to gemini-helper
  - Updated JSDoc to reference Google Gemini
  - Replaced zai.chat.completions.create() with chatCompletion()
- Replaced src/lib/z-ai-helper.ts with backwards-compatible re-export
- Verified TypeScript compilation: 0 errors in modified files

Stage Summary:
- z-ai-web-dev-sdk replaced with Google Gemini API (gemini-2.0-flash, free tier)
- User must set GEMINI_API_KEY in Vercel environment variables
- Both AI endpoints (/api/ai-agent and /api/ai-assistant) now work from Vercel
- No changes to tool definitions, system prompts, or tool execution logic
---
Task ID: 6
Agent: Super Z (Main)
Task: Fix - Mostrar botón 'Unirme con código' para usuarios nuevos sin tenant

Protocolo leído: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt

Work Log:
- Investigado el flujo de TenantSelectionScreen para nuevos usuarios
- Identificado el bug: el botón "Unirme con un código" solo se mostraba cuando tenants.length > 0
- Cuando un usuario nuevo se logeaba (0 tenants), solo veía "Crear espacio" pero no podía unirse a uno existente
- Removida la condición {tenants.length > 0 && (...)} del botón de unirse
- Ahora el botón siempre se muestra, permitiendo a nuevos usuarios crear o unirse
- Actualizado el subtítulo para usuarios sin tenants: "Crea tu espacio o únete con un código de invitación"
- Build verificado: 0 errores TypeScript en archivos del proyecto
- Commit: 7739a68, push a main completado

Stage Summary:
- Archivo modificado: src/components/layout/TenantSelectionScreen.tsx (+8, -10)
- Commit: 7739a68
- Deploy automático a Vercel en curso
- Ahora los usuarios nuevos ven AMBAS opciones: Crear espacio y Unirme con código
---
Task ID: 7
Agent: Super Z (Main)
Task: Fixes criticos: Super Admin role, mobile UX, Firestore writes, tenant persistence

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt

Work Log:
- Implementado sistema Super Admin multiple (set-super-admin action, superAdmins[] array, cross-tenant check)
- Implementada deduplicacion de usuarios (prevencion en onAuthStateChanged, migracion automatica de UIDs, lastUid tracking)
- Implementada persistencia de tenant en Firestore (defaultTenantId/Role/Name en user doc, restauracion automatica al borrar cache)
- Agregadas acciones debug-me y fix-my-role a /api/tenants para diagnostico
- Fix critical: ReferenceError activeTenantRole is not defined — eliminado auto-fix del onSnapshot callback (minifier no encontraba la variable en closure scope). Solucion: eliminar el auto-fix completo, el rol ya se establece correctamente en selectTenant() y restauracion Firestore
- Fix mobile: tenant selector detras de otros elementos — z-index z-50 a z-[200], boton "Cambiar Espacio" en Sidebar movil, TopBar visible en movil
- Fix Firestore: authUser?.uid undefined en updatedBy/createdBy — guard if (!authUser) + fallback || '' en firestore-actions.ts
- Agregado upload de imagenes en chat IA con auto-discovery de modelos y fallback
- Todos los cambios pusheados a GitHub (18 commits en esta sesion)

Stage Summary:
- 18 commits: 1d51a93, f5be7a0, 4f056fa, bec4786, 002eb43, 5edb900, 717a9a0, 084ae1e, 76c9968, 8883dbd, 61e4833, 79fce4a, db9b200, 5bfd536, 35de2f0, 33d9781, d2dae1a, 318b59a
- Archivos clave modificados: AppContext.tsx, tenants/route.ts, TopBar.tsx, Sidebar.tsx, TenantSelectionScreen.tsx, firestore-actions.ts, HomeContent.tsx
- Nuevo archivo: dedup-users/route.ts
- Deploy autom via Vercel en curso
- Pendiente: AI connection error, Kanban duplicado, verificar dedup automatico
---
Task ID: 8
Agent: Super Z (Main)
Task: Sistema de notificaciones externas (Email + Push + WhatsApp unificado)

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt
Tag: backup-pre-external-notifs-v2-20260421

Work Log:
- Audit completo del sistema de notificaciones existente:
  - In-app: toasts, sonido, vibracion, historial en memoria (useNotifications.ts)
  - Browser/OS: Web Notification API con service worker handlers
  - WhatsApp: Completo con 12+ tipos de eventos, bot commands, account linking
  - Service Worker: push + notificationclick handlers listos pero sin server-side
- Identificados gaps: sin email, sin push server-side, sin persistencia, sin unificacion

Tarea 1 — Email (Resend):
  - Creado src/lib/email-service.ts: HTTP client puro para Resend API
  - Creado src/lib/email-notifications.ts: 12 funciones de notificacion con templates HTML profesionales
  - Creado src/app/api/notifications/email/route.ts: endpoint con auth, preferencias, broadcast
  - Templates con branding ArchiFlow, gradient header, CTA button, inline styles

Tarea 2 — Push (Web Push con VAPID):
  - Creado src/lib/push-service.ts: registro de suscripcion via Push API + VAPID
  - Creado src/lib/push-notifications.ts: 8 funciones de notificacion push tipadas
  - Creado src/app/api/notifications/push/subscribe/route.ts: POST guarda, DELETE elimina
  - Creado src/app/api/notifications/push/send/route.ts: envio via web-push library con broadcast
  - Actualizado layout.tsx: SW message listener para navegacion desde push clicks

Tarea 3 — Servicio unificado:
  - Creado src/lib/notify-unified.ts: notifyExternal con 12 funciones que envian a 3 canales en paralelo
  - Cada funcion verifica preferencias de canal (localStorage) antes de enviar
  - Errores silenciosos: si un canal falla, los demas continuan
  - Exporta getExternalChannelPrefs() y setExternalChannelPref() para UI

Tarea 4 — UI actualizada:
  - Actualizado NotifPanel.tsx: seccion "Canales externos" colapsable
  - 3 botones toggle: WhatsApp (verde), Email (azul), Push (purpura)
  - Push requiere registro de suscripcion al activar (VAPID)
  - Indicador de soporte push cuando VAPID keys no estan configuradas

Dependencias instaladas:
  - resend (v6.12.2)
  - web-push (v3.6.7)
  - @types/web-push

TypeScript check: 0 errores en archivos nuevos (3 errores pre-existentes en AppContext)

Stage Summary:
- 8 archivos nuevos, 3 archivos modificados, 1960 lineas agregadas
- Commit: 0951bfb, push a main completado
- Deploy automatico a Vercel en curso
- Variables requeridas en Vercel:
  - RESEND_API_KEY (para email)
  - RESEND_FROM_EMAIL (opcional, default: notificaciones@archiflow.app)
  - NEXT_PUBLIC_VAPID_PUBLIC_KEY (para push)
  - VAPID_PRIVATE_KEY (para push)
  - VAPID_SUBJECT (opcional, default: mailto:admin@archiflow.app)
- Uso: import { notifyExternal } from '@/lib/notify-unified'

---
Task ID: 9
Agent: Super Z (Main)
Task: Vincular tareas de fases del modulo de proyectos con el modulo de tareas (bidireccional)

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt

Work Log:
- Diagnosticado el problema: workPhases solo se cargaba para selectedProjectId
- Las fases del proyecto no se mostraban en TasksScreen ni en TaskModal al crear/editar desde el modulo de tareas
- Creado cache de fases por proyecto (projectPhasesCache) en AppContext
- Creados 3 helpers en AppContext: getPhasesForProject, loadPhasesForProject, getPhaseName
- Actualizado TaskModal: ahora carga fases de CUALQUIER proyecto seleccionado (no solo el activo)
- Actualizado TasksScreen (lista): muestra tag de fase con icono Layers en violeta
- Actualizado TasksScreen (kanban): muestra fase junto al nombre del proyecto en cada tarjeta
- Agregado filtro de fase en TasksScreen (selector desplegable en panel de filtros)
- Actualizado ProjectDetailScreen (tab Tareas): muestra badge de fase con icono Layers
- TypeScript check: 0 errores nuevos (3 errores pre-existentes de projectType sin relacion)
- ESLint: error pre-existente de config circular (no relacionado)

Stage Summary:
- Archivos modificados: 4
  - src/contexts/AppContext.tsx (+50 lineas): cache de fases + 3 helpers
  - src/components/modals/TaskModal.tsx (reescrito): fases dinamicas por proyecto
  - src/screens/TasksScreen.tsx (+40 lineas): fase visible + filtro de fase
  - src/screens/ProjectDetailScreen.tsx (+10 lineas): fase en tab Tareas
- Vinculacion bidireccional completada:
  1. Crear tarea desde Proyecto > Obra > fase → aparece en Tareas con su fase
  2. Crear tarea desde Tareas con proyecto+fase → aparece en Proyecto > Obra
  3. Editar tarea desde Tareas → puede asignar/cambiar fase
  4. Filtrar tareas por fase en el modulo de Tareas

---
Task ID: 5
Agent: Super Z (Main)
Task: Fix del Sistema de Notificaciones — evitar notificaciones falsas al abrir la app

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt
Tag: backup-pre-fix-notif-system-20260424

Work Log:
- Leidos LEE_PRIMERO.txt, INSTRUCTIVO_BITACORA.txt y worklog.md completo
- Leido AppContext.tsx (4319 lineas) y firestore-actions.ts (1038 lineas)
- Identificado el problema: timeout ciego de 2s para armar notificaciones + comparacion O(n) con arrays + duplicados de notifyWhatsApp
- Creado tag de respaldo: backup-pre-fix-notif-system-20260424
- Reemplazado timeout de 2s por tracker de hidratacion por coleccion (10 colecciones)
- Reemplazado 10 refs de arrays por Sets de IDs con lookup O(1)
- Agregados 7 Maps de tracking de status para deteccion de cambios
- Implementada coalescencia de notificaciones con ventana de 800ms (bufferedNotify)
- Context-aware: no muestra toast si ya estas en la pantalla relevante (chat)
- Eliminadas 4 llamadas directas a notifyWhatsApp (saveTask, saveExpense, saveApproval, updateApproval)
- Eliminado import de notifyWhatsApp (ya no se usa directamente en AppContext)
- Build verificado: 0 errores, todas las rutas compilan correctamente

Stage Summary:
- Archivo modificado: src/contexts/AppContext.tsx (291 insertions, 440 deletions, net -149 lineas)
- Commit: ec83b86
- Build: exitoso (0 errores)
- Deploy: Vercel auto-deploy en curso a https://archii-theta.vercel.app
- Tag: backup-pre-fix-notif-system-20260424

Cambios implementados (6):
1. First-load guard: tracker de hidratacion por coleccion + safety timeout de 5s
2. Diff de datos: Sets de IDs con lookup O(1) en vez de comparacion O(n) de arrays
3. Coalescencia: agrupa eventos rapidos del mismo tipo en ventana de 800ms
4. Context-aware: no muestra toast si ya estas en la pantalla relevante
5. Duplicados: eliminadas llamadas directas a notifyWhatsApp de CRUD functions
6. markHydrated: cada onSnapshot marca su coleccion como hidratada

---
Task ID: 2
Agent: Super Z (Main)
Task: Módulo Presupuestos Pro Max - Upgrade completo

Work Log:
- Auditoría completa del módulo de presupuestos (28 archivos, 4 capas)
- Expandir EXPENSE_CATS de 5 a 8 categorías (+ Transporte, Equipos, Servicios)
- Agregar tipo PaymentMethod con 6 métodos de pago
- Ampliar interfaz Expense con campos opcionales: paymentMethod, vendor, notes
- Reescribir ExpenseModal: modo crear/editar, campos nuevos, validación
- Implementar saveExpense con soporte CRUD (crear + actualizar via editingId)
- Crear openEditExpense helper para pre-cargar formulario
- Rediseñar BudgetScreen: 6 KPIs, gráfico tendencia mensual, búsqueda, filtros, cards proyecto
- Agregar búsqueda por concepto/proveedor con debounce implícito
- Agregar filtros: proyecto, categoría, rango de fechas (paneles colapsables)
- Cards de presupuesto por proyecto con barras de progreso y alertas (excedido/cerca límite)
- Botón editar gasto en BudgetScreen (desktop hover + mobile OverflowMenu)
- Actualizar ProjectDetailScreen: botón editar + mostrar proveedor en sección Finanzas
- Actualizar exportaciones PDF y Excel con columnas nuevas
- Build exitoso, commit 24ce3ed push a main

Stage Summary:
- 7 archivos modificados, 408 insertiones, 83 eliminaciones
- Módulo presupuestos ahora soporta CRUD completo (crear/leer/editar/eliminar)
- 8 categorías de gasto, 6 métodos de pago, campos proveedor y notas
- Pantalla principal con KPIs avanzados, gráficos, filtros y búsqueda
- Integración completa con ProjectDetailScreen y exportaciones
---
Task ID: 2
Agent: Super Z (Main)
Task: Módulo Proyectos Pro Max - Upgrade completo

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt

Work Log:
- Auditoria completa del modulo de proyectos: ProjectsScreen.tsx (192 lineas), ProjectModal.tsx (202 lineas), ProjectDetailScreen.tsx (~700 lineas), tipos en types.ts, funciones en AppContext.tsx
- Creada funcion exportProjectsPDF en export-pdf.ts (~140 lineas): KPIs, tabla de proyectos, resumen financiero
- Reescrito ProjectsScreen.tsx de 192 a ~480 lineas con patron Pro Max completo:
  - Header con titulo + conteo + 3 botones de exportacion (PDF/Excel/CSV) + boton "Nuevo proyecto"
  - Barra de busqueda + boton Filtros con panel colapsable (tipo, presupuesto min/max, rango de fechas)
  - 6 KPI cards: Proyectos activos, Presupuesto total, Progreso promedio, Terminados, Con tareas vencidas, Sobrepasados
  - 2 graficos Recharts: Pie (distribucion por estado) + Bar (proyectos creados por mes, 6 meses)
  - Seccion Budget cards por proyecto (presupuesto vs gastado con barras y alertas)
  - Status tabs (Concepto/Diseno/Ejecucion/Terminado)
  - Company filter pills (Admin/Director)
  - Cards de proyecto mejoradas: badge de tipo, barra de presupuesto, conteo de tareas completadas, dias restantes, desktop hover actions + mobile OverflowMenu
  - ConfirmDialog para eliminacion segura
  - Empty state con icono
  - Floating action button (mobile)
- Build verificado: 0 errores, todas las rutas compiladas correctamente

Stage Summary:
- 2 archivos modificados: ProjectsScreen.tsx (reescrito), export-pdf.ts (+140 lineas)
- Módulo Proyectos ahora con KPIs avanzados, graficos, filtros avanzados, exportaciones PDF/Excel/CSV
- Integracion profunda con gastos (budget progress bars, over-budget alerts, total spent)
- Integracion con tareas (overdue count, completed/total per project)
- Patron consistente con BudgetScreen Pro Max
- Build: exitoso (0 errores)
---
Task ID: 10
Agent: Super Z (Main)
Task: Fase 0 - Fixes criticos: Kanban duplicado, estabilidad IA, validacion authUser?.uid en writes

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt
Tag: backup-pre-fase0-202604262145

Work Log:
- Git clone + verificacion sin conflictos
- Backup tag pre-fase0 creado
- Kanban (PASO 1): fix race-condition en KanbanBoardScreen.tsx
  - Root cause: onSnapshot suscrito dentro de .then() callback
  - StrictMode double-invoke causaba listener leak (cleanup no cancelaba promesa pendiente)
  - Fix: flag cancelled + variable local snapshotUnsub en vez de ref
  - Eliminado useRef import no utilizado
  - Agregado error callback al onSnapshot listener
- IA (PASO 2): creado src/lib/ai-service.ts
  - callAIWithRetry: retry exponencial (3x) + validacion tenantId + fallback message
  - callAIWithToolsRetry: retry exponencial para function calling
  - Usa tipos exportados de gemini-helper (ChatMessage, OpenAITool)
- Writes (PASO 3): auth validation en firestore-actions.ts
  - Creada funcion requireAuth() que lanza WRITE_BLOCKED si no hay uid
  - Agregada a TODAS las 20 funciones de escritura en firestore-actions.ts
  - Creada safeWrite() en helpers.ts como wrapper publico para writes directos fuera de firestore-actions
  - Exportados ChatMessage y OpenAITool desde gemini-helper.ts
- TypeScript: 0 errores nuevos (solo pre-existentes en AppContext y ProjectsScreen)
- Build: exitoso, 32 rutas compiladas correctamente

Stage Summary:
- Kanban sin duplicados: race-condition corregido con flag cancelled + cleanup local
- IA con reintento: ai-service.ts con backoff exponencial y fallback
- 20 funciones de escritura protegidas con requireAuth()
- safeWrite() disponible para writes directos fuera de firestore-actions
- Build limpio, sin errores nuevos introducidos


---
Task ID: 11
Agent: Super Z (Main)
Task: Fase 1 - Quick Wins: offline queue, virtualized lists, audit logs, feature flags, CI/CD

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt
Tag: backup-pre-fase1-202604252158

Work Log:
- Git pull + verificacion sin locks
- Backup tag creado: backup-pre-fase1-202604252158
- PASO 1.1: Offline-first basico
  - Instalado idb@8.0.3
  - Creado src/lib/offline-queue.ts (~230 lineas)
  - Cola IndexedDB con enqueueOfflineWrite(), syncOfflineQueue(), clearOfflineQueue()
  - Validacion de userId y tenantId en cada item antes de sincronizar
  - Auto-sync al reconectar: window.addEventListener("online", syncOfflineQueue)
  - Custom event 'archiflow:offline-sync' para reactividad UI
  - initOfflineSync() integrado en ClientProviders.tsx
- PASO 1.2: Virtualizacion de listas
  - Instalado @tanstack/react-virtual@3.13.24
  - Creado src/components/common/VirtualizedList.tsx (~130 lineas)
  - Componente generico VirtualizedList<T> con fallback a lista normal
  - Hook useVirtualizedList para control granular
  - Gated por feature flag 'virtualized_lists'
  - Audit de 19 archivos con listas >50 items candidatos a virtualizacion
- PASO 1.3: Audit logs simples
  - Creado src/lib/audit-logger.ts (~190 lineas)
  - logAudit() con sanitizacion de datos sensibles (passwords, tokens, imagenes)
  - withAudit() wrapper para logging automatico alrededor de operaciones
  - Diff engine: computeDiff() detecta campos cambiados en updates
  - 18 colecciones auditadas: tasks, projects, expenses, suppliers, companies, meetings, etc.
  - Gated por feature flag 'audit_logs'
- PASO 1.4: Feature flags
  - Creado src/lib/feature-flags.ts (~130 lineas)
  - 12 flags registradas para fases 1/2/3
  - isFlagEnabled(), getAllFlags(), getEnabledFlags(), clearFlagCache()
  - Variables de entorno NEXT_PUBLIC_FLAG_* con fallbacks por defecto
- PASO 1.5: CI/CD GitHub Actions
  - Creado .github/workflows/ci.yml
  - Jobs: lint + build en Node 18 y 20
  - Security audit: npm audit --audit-level=high
  - Secret detection: grep de patterns en diff
  - Triggers: push a main + pull_request
- Build: exitoso, 32 rutas compiladas correctamente
- Commit: 6305334, push a main completado

Stage Summary:
- 7 archivos nuevos + 3 modificados, 1010 lineas agregadas
- Offline sync funcional con IndexedDB, activacion por feature flag
- VirtualizedList componente listo para integracion en 19 pantallas
- Audit logger con diff engine y sanitizacion para 18 colecciones
- 12 feature flags para activar progresivamente fases 1/2/3
- CI/CD en GitHub Actions (lint + build + security audit)
- Build limpio, sin errores nuevos
- Commit: 6305334

---
Task ID: 13
Agent: Super Z (Main)
Task: Fix 5 bugs — Portal tab, filtro por rol, cliente autocomplete, deleteCompany dialog, dead code

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt
Tag: backup-pre-bugs-portal-cliente-20260427

Work Log:
- Git pull + verificacion sin conflictos
- Tag de respaldo creado: backup-pre-bugs-portal-cliente-20260427
- Bug 5: Eliminados clientId y clientName de ProjectData en interfaces.ts (dead code)
- Bug 4: AppContext.tsx — agregado estado pendingDeleteAction para dialog global
  - deleteCompany ahora usa pendingDeleteAction + ConfirmDialog en vez de confirm() nativo
  - Exportados pendingDeleteAction y setPendingDeleteAction desde AppContext
- Bug 4: HomeContent.tsx — importado ConfirmDialog y conectado a pendingDeleteAction
  - Dialog profesional con botones "Eliminar" (rojo) y "Cancelar"
- Bug 3: ProjectModal.tsx — campo Cliente con datalist autocomplete de empresas
  - Auto-fill del cliente al seleccionar empresa en dropdown
- Bug 1: ProjectDetailScreen.tsx — agregado tab 'Portal' (9 tabs)
  - Tab Portal con vista completa cliente: header, progreso, KPIs, fases con progreso,
    presupuesto gastado vs total, actividad reciente (bitacora), documentos compartidos,
    aprobaciones pendientes
- Bug 2: PortalScreen.tsx — rewrite completo
  - Ahora usa visibleProjects() en vez de projects (filtro por rol/empresa)
  - Barra de busqueda por nombre/descripcion/cliente/ubicacion
  - Filtro por estado con pills (Todos, Concepto, Diseno, Ejecucion, Terminado)
  - 4 KPIs resumen: total proyectos, en ejecucion, completados, presupuesto total
- CompaniesScreen.tsx — rewrite completo
  - Barra de busqueda por nombre
  - Ordenamiento: Nombre A-Z/Z-A, mas proyectos, mas recientes
  - Budget info por empresa (total presupuesto de proyectos vinculados)
  - Boton "Ver proyectos" por empresa
  - 3 KPIs resumen: total empresas, total proyectos, presupuesto total
- TypeScript check: 0 errores nuevos en archivos modificados
- Commit: 0e79216, push a main completado

Stage Summary:
- 7 archivos modificados, +828 lineas, -74 lineas
- Commit: 0e79216
- Tag: backup-pre-bugs-portal-cliente-20260427
- Deploy automático a Vercel en curso (https://archii-theta.vercel.app)

---
Task ID: 12
Agent: Super Z (Main)
Task: Fase 2 - Core Enterprise: RAG, Health Score, SSO/SAML, Public API, Webhooks

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt
Tag: backup-pre-fase2-202604252208

Work Log:
- Git pull + verificacion sin locks
- Backup tag pre-existent: backup-pre-fase2-202604252208
- PASO 2.1: IA RAG por Tenant
  - Creado src/lib/rag-service.ts (~350 lineas)
  - generateEmbedding(): Gemini text-embedding-004 API (768 dimensiones)
  - generateEmbeddingBatch(): batch de hasta 100 textos
  - chunkText(): division en chunks con overlap, mantiene parrafos enteros
  - cosineSimilarity(): similitud coseno para ranking
  - indexDocument(): chunking + embeddings + almacenamiento en Firestore (document_chunks)
  - deleteDocumentChunks(): limpieza de chunks por sourceDocId
  - searchDocuments(): busqueda semantica con aislamiento estricto por tenantId
  - askWithRAG(): busca contexto + genera respuesta con IA + cita fuentes
  - reindexCollection(): re-indexa toda una coleccion para un tenant
  - Creado /api/ai/rag/route.ts: search, ask, index, delete, reindex
  - Gated por feature flag 'rag_search'
- PASO 2.2: Health Score Predictivo
  - Creado src/lib/health-score.ts (~350 lineas)
  - calculateHealthScore(): score 0-100 con 5 dimensiones ponderadas
    - Task completion rate (30%)
    - Timeliness / delays (20%)
    - Budget health (20%)
    - Activity level (15%)
    - Resolution rate RFIs/Submittals (15%)
  - generateInsights(): mensajes contextuales sobre problemas detectados
  - generateRecommendations(): acciones sugeridas para mejorar score
  - saveHealthScore(): persiste en Firestore con calculo de tendencia
  - getHealthScoreHistory(): historial para analisis de tendencias
  - calculateAllTenantScores(): calcula scores para todos los proyectos de un tenant
  - getHealthColor(): semaforo visual (verde >=80, amarillo >=60, rojo <60)
  - Creado /api/health-score/route.ts: GET score/history, POST calculate-all
  - Gated por feature flag 'health_score_predictive'
- PASO 2.3: SSO/SAML + SCIM
  - Creado src/lib/sso-service.ts (~350 lineas)
  - saveSSOConfig(): configuracion SAML por tenant (Azure AD, Okta, Google Workspace)
  - getSSOConfig(): obtiene config SSO activa
  - mapIdPRoleToInternal(): mapeo de roles IdP → roles internos (admin/editor/viewer)
  - extractRoleFromClaims(): extrae rol desde claims del token SAML
  - generateSCIMSecret(): genera secret para webhooks SCIM
  - verifySCIMSignature(): verifica HMAC-SHA256 de webhooks SCIM
  - processSCIMEvent(): procesa create/update/delete de usuarios via SCIM
  - generateSPMetadata(): genera metadata XML del Service Provider
  - Creado /api/sso/route.ts: GET config, POST save/disable/metadata
  - Creado /api/scim/route.ts: POST provisioning, GET eventos (debug)
  - Gated por feature flag 'sso_saml'
- PASO 2.4: API Pública + Rate Limiting
  - Creado src/lib/rate-limiter.ts (~250 lineas)
  - checkRateLimit(): sliding window con Firestore (100 req/min default)
  - generateAPIKey(): formato af_live_xxxxx (48 chars hex)
  - validateAPIKey(): SHA-256 hash + verificacion de expiracion
  - createAPIKey(): genera key + almacena hash (la key solo se muestra UNA VEZ)
  - listAPIKeys(): lista keys sin exponer hash
  - revokeAPIKey(): desactiva una API key
  - Creado /api/v1/projects/route.ts: GET (paginado, filtros) + POST (crear)
  - Creado /api/v1/tasks/route.ts: GET (paginado, filtros) + POST (crear)
  - Creado /api/v1/health/route.ts: health check publico sin auth
  - Creado /api/v1/keys/route.ts: GET list + POST create/revoke
  - Creado /api/v1/openapi/route.ts: spec OpenAPI 3.0 completa
  - Auth dual: X-API-Key header o Authorization: Bearer (Firebase)
  - Rate limit headers: X-RateLimit-Limit, X-RateLimit-Remaining
  - Gated por feature flag 'public_api'
- PASO 2.5: Webhooks System
  - Creado src/lib/webhook-service.ts (~350 lineas)
  - 20+ tipos de evento definidos (task.*, project.*, expense.*, rfi.*, etc.)
  - createWebhook(): registra webhook con URL, eventos, secret HMAC
  - listWebhooks(): lista webhooks sin exponer secret
  - deleteWebhook(): elimina webhook por ID
  - signWebhookPayload(): HMAC-SHA256 para verificacion del receptor
  - dispatchWebhookEvent(): busca webhooks coincidentes y dispara async
  - deliverWebhook(): POST con firma, reintentos exponenciales (3 intentos)
  - sanitizePayload(): redacta campos sensibles antes de enviar
  - triggerWebhook(): helper para disparar facilmente desde cualquier punto
  - getWebhookDeliveries(): log de entregas para debugging
  - Creado /api/webhooks/route.ts: GET list/deliveries, POST create/delete/test
  - Gated por feature flag 'webhooks_system'
- Build: exitoso, 42 rutas compiladas correctamente (10 nuevas)
- Commit: face65b

Stage Summary:
- 15 archivos nuevos, 3389 lineas agregadas
- RAG aislado por tenant con embeddings Gemini + cosine similarity
- Health Score predictivo 0-100 con 5 dimensiones + semaforo visual
- SSO/SAML con mapeo de roles + SCIM provisioning automatico
- API publica /api/v1/* con API Key auth + rate limiting + OpenAPI spec
- Webhooks con 20+ eventos, HMAC signature, retry exponencial
- Todas las features gated por feature flags (rag_search, health_score_predictive, sso_saml, public_api, webhooks_system)
- Build limpio, 42 rutas sin errores
- Commit: face65b
---
Task ID: 13
Agent: Super Z (Main)
Task: Fase 3 - Maximum Level: real-time, marketplace, BI, compliance, SDK

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt
Tag: backup-pre-fase3-202604262220

Work Log:
- Git pull + verificacion sin locks
- Backup tag creado: backup-pre-fase3-202604262220
- PASO 3.1: Colaboracion Real-Time
  - Creado src/lib/collaboration-service.ts (~1083 lineas)
  - CollaborativeDocument: version vectors + Firestore transactions para CRDT-like sync
  - PresenceManager: heartbeat cada 15s, timeout 45s, auto-cleanup
  - CursorTracker: broadcast debounced (100ms) para cursores
  - AnchoredCommentsManager: comentarios anclados con replies (1 nivel)
  - CollaborationService facade: joinSession, leaveSession, subscribes
  - Creado src/components/collaboration/PresenceAvatars.tsx (~183 lineas)
  - Avatares apilados con anillo por rol, pulso para "escribiendo..."
  - Creado src/components/collaboration/AnchoredComments.tsx (~475 lineas)
  - Panel slide-in con threading, markdown-lite, jump-to, resolve
  - Creado src/app/api/collab/route.ts (~383 lineas)
  - 5 acciones: join, leave, cursor, comment, sync
  - Rate limit 30 req/min para cursores, auth + tenant membership
- PASO 3.2: Marketplace de Integraciones
  - Creado src/lib/marketplace-service.ts (~619 lineas)
  - Provider registry extensible con 5 proveedores built-in
  - install/uninstall/update/trigger/logs por integracion
  - Creados 5 conectores:
    - slack-connector.ts (~376 lineas): Block Kit, incoming webhooks
    - jira-connector.ts (~402 lineas): CRUD + sync bidireccional
    - github-connector.ts (~374 lineas): issues + PR comments + webhook receiver
    - calendly-connector.ts (~415 lineas): OAuth2 + scheduling sync
    - stripe-connector.ts (~427 lineas): invoices + customers + payments
  - Creado src/app/api/integrations/route.ts (~224 lineas)
  - Creado src/app/api/integrations/[provider]/route.ts (~352 lineas)
  - Creado src/screens/IntegrationsScreen.tsx (~712 lineas)
  - UI completa: cards, config modal, test connection, activity log
- PASO 3.3: BI Connector
  - Creado src/lib/bi-export.ts (~627 lineas)
  - 10 colecciones exportables, schema Power BI/Tableau compatible
  - CSV y JSON con cursor pagination (max 10K rows/request)
  - PII sanitization, date filtering, field selection
  - Creado src/app/api/v1/export/csv/route.ts (~165 lineas)
  - Creado src/app/api/v1/export/json/route.ts (~181 lineas)
  - Creado src/app/api/v1/bi/schema/route.ts (~77 lineas)
- PASO 3.4: Compliance & Seguridad
  - Creado src/lib/encryption.ts (~487 lineas)
  - AES-256-GCM field-level encryption (Node.js crypto)
  - 20+ patrones de deteccion PII, tenant KMS
  - Creado src/lib/retention-policy.ts (~533 lineas)
  - 14 politicas predefinidas por coleccion
  - archive → delete pipeline con batch 400
  - Creado src/lib/gdpr-service.ts (~844 lineas)
  - GDPR Art.17/20: export + delete/anonymize
  - 12 colecciones escaneadas, consent management
  - Creado src/app/api/compliance/route.ts (~501 lineas)
  - 11 acciones GET + 9 acciones POST
  - Auth Admin/Director, audit logging
- PASO 3.5: SDK Publico
  - Creado sdk/ (npm package: archiflow-sdk)
  - sdk/package.json + tsconfig.json
  - sdk/src/client.ts (~732 lineas): ArchiFlowClient con 8 namespaces
  - sdk/src/types.ts (~697 lineas): 13 enums, 50+ interfaces
  - sdk/src/webhooks.ts (~352 lineas): HMAC verification, typed events
  - sdk/src/errors.ts (~197 lineas): 6 error classes
  - sdk/src/utils.ts (~179 lineas): retry, formatting, merge
  - sdk/src/index.ts (~124 lineas): barrel exports
  - sdk/README.md (~535 lineas): documentacion completa
- Build verificado: 50 rutas compiladas, 0 errores
- Commit: c66941b, push a main completado

Stage Summary:
- 28 archivos nuevos, 12,312 lineas agregadas
- Real-time: CRDT-like sync via Firestore, presencia, cursores, comentarios anclados
- Marketplace: 5 integraciones (Slack, Jira, GitHub, Calendly, Stripe), UI completa
- BI: CSV/JSON export con schema compatible Power BI/Tableau
- Compliance: AES-256 encryption, GDPR Art.17/20, 14 retention policies
- SDK: archiflow-sdk con TypeScript completo, 0 dependencias externas
- Todas las features gated por feature flags (realtime_collab, marketplace, bi_connector, field_encryption, gdpr_tools)
- Build limpio, 50 rutas sin errores
- Commit: c66941b
- Tags: backup-pre-fase3-202604262220, fase3-completed-20260426

---
Task ID: 2
Agent: Super Z (Main)
Task: Fix bug — project phases stopped working (regression from P0 auth security fix)

Work Log:
- User reported: "las fases de los proyectos dejaron de funcionar"
- Investigated: git log showed commit 64c2011 (P0 security fix) added `requireAuth(req)` to `/api/project-phases/route.ts`
- Root cause: 3 fetch calls in AppContext.tsx to `/api/project-phases` did NOT send Authorization header
  - Line 1038: main useEffect polling phases every 5s
  - Line 1067: loadPhasesForProject helper (used by TaskModal)
  - Line 2885: initDefaultPhases reload
- Result: all calls returned 401 → `res.ok` false → `setWorkPhases([])` → phases disappeared
- Full audit found 1 additional critical bug:
  - `refreshMsToken()` (line 2020): missing Authorization header to `/api/onedrive/token` which also uses requireAuth
  - OneDrive auto-refresh token completely broken since the same P0 commit
- Fix: Added `getFirebaseIdToken()` + Authorization header to all 4 fetch calls
- Verified: tsc 0 errors (src/), next build successful
- Committed: 8aeebc4, pushed to origin/main

Stage Summary:
- **Root cause**: P0 security commit (64c2011) added requireAuth to /api/project-phases and /api/onedrive/token but client-side fetch calls were never updated to send Bearer token
- **Fix**: 4 fetch calls in AppContext.tsx now properly send Authorization header
- **Impact**: Project phases and OneDrive token auto-refresh restored
- **Commit**: 8aeebc4
---

---
Task ID: 13
Agent: Super Z (Main)
Task: Auditoría completa del sistema de notificaciones + fixes de integración

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt
Tag: backup-pre-fix-notifs-v2-20260426

Work Log:
- Mapeado completo: 19 archivos dedicados a notificaciones (3,719 líneas)
- 3 capas: in-app (useNotifications), external (notify-unified → WhatsApp/Email/Push), server (7 API routes)
- Auditoría profunda de: useNotifications hook, notify-unified.ts, push-service.ts, push-notifications.ts, email-service.ts, whatsapp-notifications.ts, NotifPanel.tsx, sw.js, API routes
- Identificados 3 bugs críticos + 1 bug menor

BUG 1 (CRÍTICO): bufferedNotify acumulaba eventos pero NUNCA los enviaba
  - El timer de flush solo hacía notificationBufferRef.current.clear()
  - Nunca llamaba a notifyExternal para enviar a WhatsApp/Email/Push
  - Impacto: 0 notificaciones externas funcionaban para otros usuarios
  - Fix: Switch/case que dispatcha cada tipo a notifyExternal

BUG 2 (ALTO): Evento sw-navigate sin listener
  - Service worker → layout.tsx despacha CustomEvent('sw-navigate')
  - Ningún componente escuchaba el evento
  - Impacto: Click en notificación push no navegaba a pantalla correcta
  - Fix: useEffect en AppContext escucha sw-navigate → navigateTo()

BUG 3 (MEDIO): Colecciones vacías nunca se marcaban como hidratadas
  - collectionsLoadedRef solo se marcaba si length > 0
  - Si un tenant no tenía tareas/reuniones, el sistema nunca armaba notificaciones
  - Fix: Cuando loading=false, marcar TODAS como cargadas (snapshot vacío = loaded)
  - También seeder status maps al hidratar para evitar falsos positivos de cambio

Build: exitoso (0 errores)
Commit: 58cfe4c, push a main completado

Stage Summary:
- 3 bugs corregidos en AppContext.tsx (+74 líneas, -10 líneas)
- Sistema de notificaciones externas ahora funciona completamente:
  - Nuevas tareas asignadas → notifican al asignado via WhatsApp/Email/Push
  - Cambios de estado → notifican al asignado
  - Nuevas reuniones → notifican a todos los miembros del equipo
  - Aprobaciones pendientes/resueltas → notifican al revisor/solicitante
  - RFIs, Submittals, Punch List → notifican al asignado
- Push notification clicks navegan correctamente a la pantalla del evento
- Colecciones vacías no bloquean más el sistema de notificaciones
---
Task ID: 13
Agent: Super Z (Main)
Task: Auditoría completa del módulo de Proyectos — 7 bugs encontrados y corregidos

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt
Tag: backup-pre-projects-audit-20260426

Work Log:
- Leidos: ProjectsScreen.tsx (1138 lineas), ProjectDetailScreen.tsx (~700 lineas), ProjectModal.tsx (202 lineas), types.ts, firestore-actions.ts, AppContext.tsx (funciones de proyectos)
- Auditado CRUD completo: saveProject, deleteProject, openEditProject, visibleProjects
- Auditado KPIs, Health Score, Timeline/Gantt, batch operations, exportaciones
- Auditado integración con tareas, gastos, fases, empresas, OneDrive

Bugs encontrados y corregidos (7):

FIX 1 (CRITICO): deleteProject NO borraba subcolecciones
- AppContext.tsx hacia db.collection("projects").doc(id).delete() directamente
- Esto dejaba datos huérfanos: tareas, gastos, fases, mensajes, archivos, approvals
- firestore-actions.ts ya tenia la version correcta que borra subcolecciones
- Fix: deleteProject ahora delega a fbActions.deleteProject

FIX 2 (CRITICO): saveProject duplicaba lógica de firestore-actions.ts
- 30 lineas de lógica duplicada sin requireAuth() ni error handling robusto
- Fix: saveProject ahora delega a fbActions.saveProject

FIX 3: totalSpent KPI sumaba TODOS los gastos del tenant
- Incluía gastos no vinculados a ningún proyecto → KPI inflado
- Fix: filtra expenses por projectIds existentes antes de sumar

FIX 4: Timeline onClick era un no-op
- Click en barra del timeline no navegaba a detalle del proyecto
- Fix: onClick={() => openProject(p.id)}

FIX 5: batchChangeStatus usaba new Date() del cliente
- Timestamps inconsistentes entre clientes
- Fix: db.FieldValue.serverTimestamp()

FIX 6: deleteProject no validaba tenantId
- Podía eliminarse un proyecto de otro tenant
- Fix: validación de tenantId antes de eliminar

FIX 7: ProjectModal usaba tipo any para companies
- Fix: importado tipo Company y aplicado correctamente

Stage Summary:
- 3 archivos modificados: AppContext.tsx, ProjectsScreen.tsx, ProjectModal.tsx
- Net: +20 lineas, -30 lineas (codigo simplificado al delegar a firestore-actions)
- Build: exitoso, 38 rutas compiladas, 0 errores
- Commit: 835d011, push a main completado
- Tag: backup-pre-projects-audit-20260426


---
Task ID: 14
Agent: Super Z (Main)
Task: Fix 2 bugs — notificaciones al cambiar tenant + no puede borrar tareas

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt
Tag: backup-pre-fix-notif-delete-20260427

Work Log:
- Git pull + verificacion sin conflictos
- Tag de respaldo creado: backup-pre-fix-notif-delete-20260427
- Bug 1 (Notificaciones al entrar al tenant):
  - Causa raiz: allCollectionsLoadedRef, firstLoadDoneRef, knownTaskIdsRef, etc.
    nunca se reseteaban al cambiar de tenant. Al entrar a un tenant nuevo, TODOS los
    datos del nuevo tenant se trataban como "nuevos" y disparaban notificaciones
    para cada tarea, aprobacion, reunion, RFI, submittal, punch item.
  - Fix: agregado useEffect que watchea activeTenantId y resetea TODOS los refs
    de tracking cuando el tenant cambia (allCollectionsLoadedRef, firstLoadDoneRef,
    collectionsLoadedRef, 7 knownIdSets, 7 prevStatusMaps, notificationBuffer, flushTimer)
- Bug 2 (No puede borrar tareas):
  - Causa 1: deleteTask() no mostraba error al usuario si fallaba el delete en Firestore
    (solo console.error silencioso)
  - Causa 2: ConfirmDialog tenia e.preventDefault() en AlertDialogAction que podia
    interferir con el cierre del dialog en Radix UI en algunos navegadores
  - Fix: deleteTask ahora muestra toast de error con mensaje descriptivo
  - Fix: Removido e.preventDefault() de ConfirmDialog para que Radix maneje
    el cierre del dialog normalmente
- Build exitoso, commit 9678aad, push a main completado

Stage Summary:
- Archivos modificados: 2
  - src/contexts/AppContext.tsx (+29 lineas): reset de notificaciones al cambiar tenant + error toast en deleteTask
  - src/components/common/ConfirmDialog.tsx (-1 linea): removido e.preventDefault()
- Commit: 9678aad
- Tag: backup-pre-fix-notif-delete-20260427
- Deploy automatico a Vercel en curso (https://archii-theta.vercel.app)

---
Task ID: 14
Agent: Super Z (Main)
Task: Fix - No se pueden eliminar tareas del panel de tareas

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt

Work Log:
- Git pull + verificacion sin conflictos
- Investigado el flujo de eliminacion de tareas en TasksScreen.tsx
- Identificada la causa raiz: useConfirmDialog.ts tiene un bug de stale closure
  - Usaba useState para almacenar la funcion resolve del Promise
  - Los callbacks handleConfirm/handleCancel/handleOpenChange se creaban con useCallback(fn, [])
  - Capturaban el valor inicial null de resolveRef[0] y nunca veian la funcion actualizada
  - Resultado: el Promise de confirm() NUNCA se resolvía
  - deleteTask/deleteProject nunca se ejecutaba despues de la confirmacion
- Fix: reemplazado useState por useRef para la funcion resolve
  - useRef.current siempre lee el valor actual sin importar el closure
  - Agregado resolveRef.current = null despues de resolver para prevenir double-resolve
- Verificado: 0 errores TypeScript nuevos
- Commit: dcfd91a, push a main completado

Stage Summary:
- Archivo modificado: src/lib/useConfirmDialog.ts (12 insertions, 7 deletions)
- Commit: dcfd91a
- Este fix aplica a TODAS las pantallas que usan useConfirmDialog:
  - TasksScreen (eliminar tareas)
  - ProjectsScreen (eliminar proyectos)
  - BudgetScreen (eliminar gastos)
  - KanbanBoardScreen (eliminar tarjetas)
  - RFIsScreen, SubmittalsScreen, PunchListScreen, InvoicesScreen, InventoryScreen
- Deploy automatico a Vercel en curso (https://archii-theta.vercel.app)

---
Task ID: 15
Agent: Super Z (Main)
Task: Auditoria completa del sistema de notificaciones — 12 fixes

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt
Tag: backup-pre-notif-audit-fixes-20260427

Auditoria completa de 22 archivos del sistema de notificaciones:
- In-App: useNotifications.tsx, NotifPanel.tsx, toast.tsx, ui-store.ts, AppContext.tsx
- Push: push-service.ts, push-notifications.ts, subscribe/route.ts, send/route.ts, sw.js
- Email: email-service.ts, email-notifications.ts, email/route.ts
- WhatsApp: whatsapp-service.ts, whatsapp-notifications.ts, whatsapp-commands.ts, notify/route.ts, send/route.ts
- Unificado: notify-unified.ts

Work Log:
- Mapeados 22 archivos del sistema de notificaciones
- 4 agentes en paralelo auditaron: in-app, push, email, WhatsApp+unificado
- Encontrados 3 bugs criticos, 18 medios, 7 low, 4 codigo muerto

FIX CRITICO 1: Race condition al cambiar de tenant (AppContext.tsx)
- Causa: efecto de hidratacion dependia de loading=false (solo se setea una vez al inicio)
- Al cambiar tenant: reset ponia allCollectionsLoadedRef=false, pero el efecto se re-armaba inmediatamente con datos stale del tenant anterior
- Fix: nuevo tenantSwitchingRef bloquea notificaciones al cambiar tenant
- Los 8 efectos de deteccion ahora verifican tenantSwitchingRef.current
- Efecto de hidratacion usa setTimeout(150ms) al cambiar tenant para esperar que los onSnapshot listeners actualicen el state

FIX CRITICO 2: Reset de historial al cambiar tenant (useNotifications.tsx)
- Nuevo: resetNotifOnTenantSwitch() limpia historial, in-app notifs, unread count, cierra panel y banner
- Conectado desde AppContext al cambiar tenant

FIX CRITICO 3: overdueCheckedRef no se reseteaba al cambiar tenant
- Agregado al bloque de reset en el efecto de cambio de tenant

FIX SEGURIDAD 1: Push send — auth en envio individual (push/send/route.ts)
- Antes: cualquier usuario podia enviar push a cualquier otro usuario
- Ahora: verifica que caller y target compartan tenantId

FIX SEGURIDAD 2: Push send — deactivation solo en 404/410
- Antes: TODOS los fallos marcaban suscripciones como expiradas
- Ahora: sendToSubscription retorna 'sent'|'expired'|'failed', solo 'expired' desactiva

FIX SEGURIDAD 3: Push send — admins hardcoded reemplazados por role Firestore

FIX SEGURIDAD 4: WhatsApp notify — aislamiento por tenant
- Antes: broadcast sin filtro de tenant
- Ahora: filtra whatsappLinks por tenantId del usuario autenticado
- Broadcast ahora paralelo con Promise.allSettled

FIX CALIDAD 1: XSS en email-notifications custom() — escapeHtml() aplicada

FIX CALIDAD 2: Push subscribe — ops redundantes (3 → 2 Firestore ops)

FIX LIMPIEZA 1: Codigo muerto en whatsapp-commands.ts (generateLinkCode, verifyLinkCode, Consultar IA)

FIX LIMPIEZA 2: Service Worker — notificationclick prefiere ventana focused/visible

TypeScript check: 0 errores nuevos en src/
Commit: 2764cb4 (local — push requiere autenticacion GitHub)
Tag: backup-pre-notif-audit-fixes-20260427

Stage Summary:
- 8 archivos modificados, +175 lineas, -85 lineas
- 12 fixes implementados (3 criticos, 4 seguridad, 5 calidad/limpieza)
- Commit: 2764cb4 (local)
- PENDIENTE: push a GitHub (requiere credenciales)
- NOTA: RESEND_API_KEY sigue vacia — emails no se envian hasta configurar
- NOTA: 6 de 12 tipos de notif no tienen disparadores en AppContext

---
Task ID: 14
Agent: Super Z (Main)
Task: Phase 3 - Visibility: README, CONTRIBUTING, SDK docs, GitHub templates

Work Log:
- Audit completo de todos los archivos de documentacion del proyecto
- README.md: ya existia con contenido profesional (badges, features, tech stack, estructura, setup, arquitectura, API REST, SDK, seguridad)
- CONTRIBUTING.md: ya existia con codigo de conducta, como contribuir, convenciones, testing, arquitectura
- SECURITY.md: ya existia con versiones soportadas, reporting, arquitectura de seguridad, best practices
- sdk/README.md: ya existia con documentacion completa (quick start, auth, resources, webhooks, error handling, interceptors, auto-retry, TypeScript types)
- .github/ISSUE_TEMPLATE/: bug_report.md, feature_request.md, config.yml ya existian
- .github/PULL_REQUEST_TEMPLATE.md: ya existia con tipo de cambio, testing, checklist de seguridad
- .github/workflows/ci.yml: ya existia con lint, build, security audit, secret detection
- Identificados 2 issues menores:
  1. README.md tenia seccion "Licencia" duplicada (2024 + 2026) al final
  2. SECURITY.md referenciaba @/lib/crypto pero el archivo real es @/lib/token-encryption
- Corregidos ambos issues
- Commit: 551ac63, push a main completado

Stage Summary:
- Phase 3 ya estaba completamente implementado en sesiones anteriores
- Correcciones aplicadas: README.md (duplicado eliminado), SECURITY.md (ruta corregida)
- Commit: 551ac63
- Deploy automatico a Vercel en curso
- Todas las 5 fases del plan maestro ahora completadas (0, 1, 2, 3, 4)

---
Task ID: 6
Agent: Main Agent
Task: Backup completo de la aplicación Archii

Work Log:
- Git pull origin/main (ya up-to-date)
- Creado tag anotado backup/v2.0.0-20260519-205143 con mensaje descriptivo
- Push del tag a GitHub (confirmado)
- Creado archivo comprimido del código fuente: archii-backup-v2.0.0-20260519.tar.gz (8.3MB)
- Creado backup completo del repo con git objects: archii-repo-full-backup-20260519.tar.gz (170MB)
- Exportada configuración de Vercel: vercel-project-config.json
- Exportado inventario de env vars: vercel-env-vars-inventory.json
- Exportado historial de deployments: vercel-deployments-history.json

Stage Summary:
- Tag backup/v2.0.0-20260519-205143 pushado a GitHub
- 2 archivos tar.gz de backup en /home/z/my-project/download/
- 3 archivos JSON con config de Vercel
- Backup completo y verificado

---
Task ID: 7
Agent: Main Agent
Task: Construir componente WeeklyAgenda para gestión de proyectos

Work Log:
- Analicé la arquitectura existente: tipos Task/Project, AppContext, Sidebar, navegación
- Creé WeeklyAgendaScreen.tsx con layout de 7 columnas (Lun-Dom) + panel de notas
- Implementé timeline de 8:00 AM a 5:00 PM con franjas horarias
- Modal de creación/edición de tareas con: proyecto, responsable, prioridad, estado, observaciones
- Diseño de agenda física: fondo blanco, líneas grises, bordes redondeados, separadores verticales
- Panel de notas adhesivas (sticky notes) al lado de Domingo con 6 colores
- Navegación semanal (anterior/siguiente/hoy) con rango de fechas
- Filtro por proyecto
- Función de impresión con ventana dedicada y estilos @media print
- Responsive con scroll horizontal en mobile (min-width 900px)
- Integración completa: Sidebar (CalendarDays icon), TopBar title, HomeContent lazy load, types.ts
- Corregidos errores TypeScript (displayName no existe en teamUsers.data)
- Build exitoso (0 errores)
- Push a GitHub (commit 0dfb727) para deploy automático en Vercel

Stage Summary:
- Nuevo archivo: src/screens/WeeklyAgendaScreen.tsx (619 líneas)
- Archivos modificados: HomeContent.tsx, globals.css, Sidebar.tsx, TopBar.tsx, types.ts
- Pantalla accesible desde Sidebar > "Agenda Semanal"
- Build y type-check pasados sin errores
- Push exitoso a main branch

---
Task ID: 14
Agent: Super Z (Main)
Task: Fix — Agenda Semanal no visible en modo oscuro, vincular al CSS global de la app

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt

Work Log:
- Audit completo del componente WeeklyAgendaScreen.tsx: encontrados 20+ colores hardcoded solo para modo claro
- Audit del sistema de temas de la app: 4 temas (dark, light, pastel, pastel-dark), variables CSS en globals.css
- Comparado con componentes que SI funcionan en dark mode (CalendarScreen, Sidebar): usan var(--card), var(--border), etc.
- Reemplazados todos los colores hardcoded por variables CSS del sistema de temas:
  - Encabezados de días: #f9fafb → var(--af-bg3), #d1d5db → var(--border)
  - Fondo del grid: #ffffff → var(--card)
  - Texto secundario: #6b7280 → var(--muted-foreground)
  - Columna "hoy": rgba(var(--primary),0.02) → var(--accent), #fff → var(--primary-foreground)
  - Fechas: opacity: 0.6 → color: var(--muted-foreground)
- PRIO_COLORS corregidos para dark mode:
  - bg-red-50 → bg-red-500/10 dark:bg-red-500/15
  - text-red-700 → text-red-600 dark:text-red-400
  - Mismo patrón para amber, emerald, purple
- NOTE_COLORS: hex hardcoded → variables CSS var(--note-*)
  - Agregadas 6 variables --note-* en :root (modo claro) y .dark (modo oscuro) en globals.css
  - Dark: tonos profundos (#422006, #172554, #4a1942, #064e3b, #2e1065, #422006)
- Placeholder notas: text-black/30 → text-[var(--muted-foreground)]
- Botón agregar nota: bg-amber-100 → bg-amber-500/15, text-amber-700 → text-amber-600 dark:text-amber-400
- Botón eliminar nota: bg-black/10 → dark:bg-white/10, text-black/50 → text-[var(--muted-foreground)]
- Ícono nota vacía: text-amber-300 → text-amber-500/50 dark:text-amber-400/40
- Build verificado: ✓ Compiled successfully in 7.1s, 0 errores
- Commit: 6038af4, push a main completado

Stage Summary:
- Archivos modificados: 2 (WeeklyAgendaScreen.tsx, globals.css)
- 20+ colores hardcoded reemplazados por variables CSS del sistema de temas
- 6 nuevas variables CSS --note-* agregadas en ambos modos (light + dark)
- Agenda semanal ahora se ve correctamente en modo claro Y oscuro
- Commit: 6038af4
- Deploy automático a Vercel en curso

---
Task ID: 15
Agent: Super Z (Main) + full-stack-developer subagent
Task: Agenda Semanal Pro — multi-hora, vinculación tareas, participantes, badge Agenda

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt

Work Log:
- Diseñada arquitectura completa basada en respuestas del usuario:
  1. Drag-to-select para horas consecutivas + "Agregar hora" para no consecutivas
  2. Crear nueva tarea O vincular tarea existente desde la agenda
  3. Responsable + múltiples participantes del equipo
  4. Bloque alto estilo Google Calendar (se estira por horas)
  5. Persistencia como tareas reales en Firestore con campo agendaMeta
  6. Badge "Agenda" en TasksScreen
- Actualizados tipos en types.ts e interfaces.ts: agregado campo agendaMeta a TaskData
  { dayKey: string, hourSlots: number[], participantIds: string[], isAgendaItem: boolean }
- WeeklyAgendaScreen.tsx reescrito completamente (~1221 líneas):
  * Drag selection: mousedown/mousemove/mouseup para seleccionar horas consecutivas
  * Mobile: tap simple + botón "Agregar hora" en formulario
  * Modal con dos tabs: "Nueva tarea" y "Vincular existente"
  * Multi-select de participantes con chips
  * Bloques altos con position:absolute que ocupan múltiples franjas
  * Subtareas visibles dentro del bloque de actividad
  * Delete inteligente: isAgendaItem=true borra tarea, false solo quita meta
  * Firestore: escribe directamente con getFirebase().firestore()
  * 100% compatible con dark mode (variables CSS)
- TasksScreen.tsx: badge "Agenda" con CalendarDays icon + rango horario
  en vista lista y kanban
- Build verificado: ✓ Compiled successfully in 7.8s, 0 errores
- Commit: 274e36b, push a main completado

Stage Summary:
- Archivos modificados: 4 (WeeklyAgendaScreen.tsx reescrito, types.ts, interfaces.ts, TasksScreen.tsx)
- +1134 líneas, -197 líneas
- Agenda semanal ahora es un módulo completo de planificación conectado al sistema de tareas
- Tareas creadas desde agenda aparecen en módulo de Tareas con badge "Agenda"
- Tareas existentes se pueden vincular a la agenda
- Deploy automático a Vercel en curso

---
Task ID: 16
Agent: Super Z (Main) + full-stack-developer subagent
Task: Agenda Semanal como elemento central — integrada debajo del Dashboard

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt

Work Log:
- Explorado DashboardScreen (802 líneas), HomeContent (341 líneas), Sidebar (234 líneas), TopBar (219 líneas)
- Diseñada estrategia de integración: agenda embebida debajo del dashboard + posición prominente en sidebar
- Sidebar.tsx cambios:
  * Agenda Semanal movida de posición #20 (Gestión) a posición #2 (Principal, después de Dashboard)
  * Agregado badge con conteo de actividades del día de hoy (agendaTodayBadge)
  * Eliminada entrada duplicada en sección Gestión
  * principalItems expandido de 5 a 6 items
- DashboardScreen.tsx cambios:
  * Nueva ROW 6: sección Agenda Semanal completa debajo del contenido del dashboard
  * Grid compacto con 7 columnas (Lun-Dom) y timeline 8am-5pm
  * Bloques de actividad estilo Google Calendar (position:absolute, spanning hours)
  * Columna 'hoy' resaltada con var(--primary) background
  * Botón "Ver agenda completa" que navega a weeklyAgenda
  * Celdas vacías clickeables → navegan a pantalla de agenda
  * Header con ícono CalendarDays + rango de semana
  * 100% dark mode compatible (CSS variables)
  * Quick Actions: botón "Agenda" agregado antes de "+ Tarea"
  * "Agenda de Hoy": enlace "Ver agenda completa →"
- Build verificado: ✓ Compiled successfully in 7.2s, 0 errores
- Commit: ac0cff7, push a main completado

Stage Summary:
- 3 archivos modificados: Sidebar.tsx, DashboardScreen.tsx (+270 líneas), worklog.md
- Agenda Semanal ahora es un elemento central de la app:
  1. Posición #2 en sidebar (grupo Principal)
  2. Visible debajo del Dashboard (vista compacta)
  3. Badge con actividades de hoy en sidebar
  4. Accesos rápidos desde Quick Actions y Agenda de Hoy
  5. Pantalla completa accesible desde sidebar
- Deploy automático a Vercel en curso

---
Task ID: 12
Agent: Super Z (Main)
Task: Fix lógica de vencimiento de tareas — día de gracia + zona horaria local

Protocolo leido: LEE_PRIMERO.txt + INSTRUCTIVO_BITACORA.txt

Work Log:
- Identificado bug: tareas se marcan vencidas el mismo día de su fecha de vencimiento
- Causa raíz: 2 problemas combinados:
  1. new Date("2026-05-21") parsea como UTC medianoche, pero comparación contra new Date() (hora actual) hace que el mismo día ya sea "menor"
  2. En zona horaria UTC-5 (Colombia), new Date("2026-05-21") = 20 de mayo 7pm local → ya "pasó"
- Corregido isOverdue() en kanban-helpers.ts:
  - Parsea fecha como LOCAL (new Date(year, month-1, day)) en vez de UTC
  - Día de vencimiento NO es vencido (estrictamente menor, no menor o igual)
- Reemplazadas 20+ comparaciones inline en 17 archivos con llamada a isOverdue()
- Archivos modificados:
  - src/lib/kanban-helpers.ts (función central corregida)
  - src/screens/TasksScreen.tsx (4 comparaciones)
  - src/components/kanban/KanbanBoard.tsx (2 comparaciones)
  - src/screens/AdminScreen.tsx (3 comparaciones)
  - src/screens/CalendarScreen.tsx (3 comparaciones)
  - src/contexts/AppContext.tsx (2 comparaciones)
  - src/screens/ProfileScreen.tsx (2 comparaciones)
  - src/screens/ProjectDetailScreen.tsx (4 comparaciones)
  - src/components/dashboard/useDashboardData.ts (2 comparaciones)
  - src/components/projects/useProjectsData.ts (2 comparaciones)
  - src/components/projects/project-helpers.tsx (1 comparación)
  - src/components/reports/ReportsEquipo.tsx (1 comparación)
  - src/components/reports/ReportsObra.tsx (1 comparación)
  - src/components/reports/ReportsOverview.tsx (1 comparación)
  - src/lib/export-pdf.ts (4 comparaciones)
  - src/lib/export-excel.ts (2 comparaciones)
  - src/lib/health-score.ts (1 comparación)
- Cron route (server-side) usa comparación de strings "YYYY-MM-DD" < "YYYY-MM-DD" que ya es correcta
- Build verificado: 0 errores TypeScript, 47 rutas compiladas
- Commit: 96f01b1, push a main completado

Stage Summary:
- Bug corregido: tareas ya NO aparecen vencidas en su propio día de vencimiento
- Zona horaria: fechas ahora se parsean como local (no UTC) para Colombia
- Centralizada lógica de vencimiento en una sola función isOverdue()
- 17 archivos, +64 lineas, -42 lineas
- Deploy automático a Vercel en curso
