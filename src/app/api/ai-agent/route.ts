import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { getAdminDb, getAdminFieldValue } from "@/lib/firebase-admin";
import { getNextSequentialNumber, atomicStockUpdate } from "@/app/api/_lib/counter";
import { chatCompletionWithTools, type ChatMessage } from "@/lib/gemini-helper";

/**
 * POST /api/ai-agent
 *
 * Super IA Agent para Archii.
 * Usa Google Gemini API con function calling para ejecutar acciones reales en la app:
 * - Crear/editar tareas, proyectos, gastos, proveedores, reuniones
 * - Consultar datos del proyecto, equipo, presupuesto
 * - Gestionar fases de obra, aprobaciones, inventario
 *
 * Powered by Google Gemini (gemini-2.0-flash)
 */

// ─── TOOL DEFINITIONS ────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_projects",
      description: "Obtener la lista de proyectos del usuario. Retorna nombre, estado, cliente, ubicación, presupuesto y progreso de cada proyecto.",
      parameters: {
        type: "object",
        properties: {
          status_filter: {
            type: "string",
            description: "Filtrar por estado (Concepto, Diseño, Ejecución, Entregado, Pausado). Opcional.",
            enum: ["Concepto", "Diseño", "Ejecución", "Entregado", "Pausado"],
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_project_detail",
      description: "Obtener detalles completos de un proyecto específico incluyendo tareas, gastos, fases y equipo asignado.",
      parameters: {
        type: "object",
        properties: {
          project_name: {
            type: "string",
            description: "Nombre del proyecto a consultar (búsqueda parcial, no necesita coincidencia exacta).",
          },
          project_id: {
            type: "string",
            description: "ID del proyecto (si se conoce). Opcional si se proporciona project_name.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Crear una nueva tarea en un proyecto. La IA debe inferir los parámetros del contexto de la conversación.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título de la tarea" },
          project_name: { type: "string", description: "Nombre del proyecto al que pertenece" },
          project_id: { type: "string", description: "ID del proyecto (opcional si se conoce el nombre)" },
          priority: {
            type: "string",
            description: "Prioridad de la tarea",
            enum: ["Alta", "Media", "Baja"],
          },
          status: {
            type: "string",
            description: "Estado inicial",
            enum: ["Por hacer", "En progreso", "Completado", "Pendiente"],
          },
          due_date: {
            type: "string",
            description: "Fecha límite en formato YYYY-MM-DD. Opcional.",
          },
          assignee_name: {
            type: "string",
            description: "Nombre de la persona asignada (si se conoce del equipo). Opcional.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_project",
      description: "Crear un nuevo proyecto de construcción/arquitectura.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre del proyecto" },
          client: { type: "string", description: "Nombre del cliente" },
          location: { type: "string", description: "Ubicación del proyecto" },
          budget: { type: "number", description: "Presupuesto estimado en COP" },
          description: { type: "string", description: "Descripción del proyecto" },
          start_date: { type: "string", description: "Fecha de inicio en YYYY-MM-DD" },
          end_date: { type: "string", description: "Fecha de entrega estimada en YYYY-MM-DD" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_expense",
      description: "Registrar un nuevo gasto en un proyecto.",
      parameters: {
        type: "object",
        properties: {
          concept: { type: "string", description: "Concepto o descripción del gasto" },
          project_name: { type: "string", description: "Nombre del proyecto" },
          project_id: { type: "string", description: "ID del proyecto" },
          category: {
            type: "string",
            description: "Categoría del gasto",
            enum: [
              "Materiales",
              "Mano de obra",
              "Equipos",
              "Transporte",
              "Permisos",
              "Diseño",
              "Consultoría",
              "Administración",
              "Imprevistos",
              "Otro",
            ],
          },
          amount: { type: "number", description: "Monto del gasto en COP" },
          date: { type: "string", description: "Fecha del gasto en YYYY-MM-DD" },
        },
        required: ["concept", "amount"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_budget_summary",
      description: "Obtener resumen del presupuesto de un proyecto: total de gastos por categoría y presupuesto vs gastado.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Nombre del proyecto" },
          project_id: { type: "string", description: "ID del proyecto" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_supplier",
      description: "Registrar un nuevo proveedor en el sistema.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre del proveedor o empresa" },
          category: {
            type: "string",
            description: "Categoría del proveedor",
            enum: [
              "Materiales",
              "Maquinaria",
              "Transporte",
              "Servicios",
              "Insumos",
              "Herramientas",
              "Seguridad",
              "Otro",
            ],
          },
          phone: { type: "string", description: "Teléfono de contacto" },
          email: { type: "string", description: "Correo electrónico" },
          address: { type: "string", description: "Dirección" },
          notes: { type: "string", description: "Notas adicionales" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_meeting",
      description: "Programar una nueva reunión.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título de la reunión" },
          project_name: { type: "string", description: "Proyecto relacionado (opcional)" },
          project_id: { type: "string", description: "ID del proyecto (opcional)" },
          date: { type: "string", description: "Fecha en YYYY-MM-DD" },
          time: { type: "string", description: "Hora en formato HH:MM" },
          duration: { type: "string", description: "Duración estimada (ej: 1 hora, 30 min)" },
          location: { type: "string", description: "Lugar de la reunión" },
          description: { type: "string", description: "Agenda o descripción" },
        },
        required: ["title", "date", "time"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_tasks",
      description: "Obtener lista de tareas, opcionalmente filtradas por proyecto o estado.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Filtrar por nombre de proyecto" },
          project_id: { type: "string", description: "Filtrar por ID de proyecto" },
          status_filter: {
            type: "string",
            description: "Filtrar por estado",
            enum: ["Por hacer", "En progreso", "Completado", "Pendiente"],
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_team_members",
      description: "Obtener la lista de miembros del equipo con sus roles.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_task_status",
      description: "Cambiar el estado de una tarea existente.",
      parameters: {
        type: "object",
        properties: {
          task_title: { type: "string", description: "Título de la tarea (búsqueda parcial)" },
          task_id: { type: "string", description: "ID de la tarea (si se conoce)" },
          new_status: {
            type: "string",
            description: "Nuevo estado",
            enum: ["Por hacer", "En progreso", "Completado"],
          },
        },
        required: ["new_status"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_expenses",
      description: "Obtener lista de gastos, opcionalmente filtrados por proyecto o categoría.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Filtrar por nombre de proyecto" },
          project_id: { type: "string", description: "Filtrar por ID de proyecto" },
          category: {
            type: "string",
            description: "Filtrar por categoría",
            enum: [
              "Materiales",
              "Mano de obra",
              "Equipos",
              "Transporte",
              "Permisos",
              "Diseño",
              "Consultoría",
              "Administración",
              "Imprevistos",
              "Otro",
            ],
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_rfis",
      description: "Obtener lista de RFIs (Request for Information), opcionalmente filtrados por proyecto o estado.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Filtrar por nombre de proyecto" },
          project_id: { type: "string", description: "Filtrar por ID de proyecto" },
          status_filter: {
            type: "string",
            description: "Filtrar por estado",
            enum: ["Abierto", "En revisión", "Respondido", "Cerrado"],
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_rfi",
      description: "Crear un nuevo RFI (Request for Information) en un proyecto.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Asunto del RFI" },
          question: { type: "string", description: "Pregunta o consulta detallada" },
          project_name: { type: "string", description: "Nombre del proyecto" },
          project_id: { type: "string", description: "ID del proyecto" },
          priority: {
            type: "string",
            description: "Prioridad",
            enum: ["Alta", "Media", "Baja"],
          },
          assignee_name: { type: "string", description: "Nombre de la persona asignada" },
          due_date: { type: "string", description: "Fecha límite en YYYY-MM-DD" },
        },
        required: ["subject", "question"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_submittals",
      description: "Obtener lista de submittals (entregables), opcionalmente filtrados por proyecto o estado.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Filtrar por nombre de proyecto" },
          project_id: { type: "string", description: "Filtrar por ID de proyecto" },
          status_filter: {
            type: "string",
            description: "Filtrar por estado",
            enum: ["Borrador", "En revisión", "Aprobado", "Rechazado", "Devuelto"],
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_punch_items",
      description: "Obtener lista de items de punch list (verificación de obra), opcionalmente filtrados por proyecto o ubicación.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Filtrar por nombre de proyecto" },
          project_id: { type: "string", description: "Filtrar por ID de proyecto" },
          status_filter: {
            type: "string",
            description: "Filtrar por estado",
            enum: ["Pendiente", "En progreso", "Completado"],
          },
          location: {
            type: "string",
            description: "Filtrar por ubicación",
            enum: ["Fachada", "Interior", "Estructura", "Instalaciones", "Acabados", "Terraza", "Zonas comunes", "Otro"],
          },
        },
        required: [],
      },
    },
  },

  // ── INVENTORY MODULE ──
  {
    type: "function" as const,
    function: {
      name: "get_inventory_products",
      description: "Obtener lista de productos del inventario, opcionalmente filtrados por categoría o bodega/almacén.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filtrar por categoría del producto" },
          warehouse: { type: "string", description: "Filtrar por bodega o almacén" },
          search: { type: "string", description: "Buscar por nombre o SKU del producto" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_inventory_product",
      description: "Crear un nuevo producto en el inventario.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre del producto" },
          sku: { type: "string", description: "Código SKU del producto" },
          category: { type: "string", description: "Categoría del producto" },
          unit: { type: "string", description: "Unidad de medida (ej: unidades, mts, kg, litros)" },
          price: { type: "number", description: "Precio unitario en COP" },
          stock: { type: "number", description: "Cantidad en stock inicial" },
          min_stock: { type: "number", description: "Stock mínimo para alerta" },
          warehouse: { type: "string", description: "Bodega o almacén donde se encuentra" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_inventory_movements",
      description: "Obtener lista de movimientos de inventario (entradas y salidas), opcionalmente filtrados por producto o bodega.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Filtrar por ID de producto" },
          warehouse: { type: "string", description: "Filtrar por bodega" },
          movement_type: {
            type: "string",
            description: "Tipo de movimiento",
            enum: ["Entrada", "Salida"],
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_inventory_movement",
      description: "Registrar un movimiento de inventario (entrada o salida de productos). Actualiza el stock del producto automáticamente.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "ID del producto (obtenerlo con get_inventory_products)" },
          product_name: { type: "string", description: "Nombre del producto (para búsqueda si no hay ID)" },
          type: {
            type: "string",
            description: "Tipo de movimiento",
            enum: ["Entrada", "Salida"],
          },
          quantity: { type: "number", description: "Cantidad del movimiento" },
          reason: { type: "string", description: "Motivo del movimiento" },
          reference: { type: "string", description: "Referencia (ej: número de factura, orden de compra)" },
          warehouse: { type: "string", description: "Bodega o almacén" },
        },
        required: ["type", "quantity"],
      },
    },
  },

  // ── INVOICES MODULE ──
  {
    type: "function" as const,
    function: {
      name: "get_invoices",
      description: "Obtener lista de facturas, opcionalmente filtradas por proyecto o estado.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Filtrar por nombre de proyecto" },
          project_id: { type: "string", description: "Filtrar por ID de proyecto" },
          status_filter: {
            type: "string",
            description: "Filtrar por estado",
            enum: ["Borrador", "Enviada", "Pagada", "Vencida", "Cancelada"],
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_invoice",
      description: "Crear una nueva factura para un proyecto. Se asigna numeración automática INV-001, INV-002, etc.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Nombre del proyecto" },
          project_id: { type: "string", description: "ID del proyecto" },
          client_name: { type: "string", description: "Nombre del cliente" },
          description: { type: "string", description: "Descripción o concepto general de la factura" },
          items: {
            type: "array",
            description: "Items de la factura. Cada item debe tener description, quantity, unitPrice.",
            items: {
              type: "object",
              properties: {
                description: { type: "string", description: "Descripción del item" },
                quantity: { type: "number", description: "Cantidad" },
                unitPrice: { type: "number", description: "Precio unitario en COP" },
              },
              required: ["description", "quantity", "unitPrice"],
            },
          },
          tax_percent: { type: "number", description: "Porcentaje de IVA (por defecto 19)" },
          issue_date: { type: "string", description: "Fecha de emisión en YYYY-MM-DD" },
          due_date: { type: "string", description: "Fecha de vencimiento en YYYY-MM-DD" },
        },
        required: ["project_name", "items"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_invoice_status",
      description: "Cambiar el estado de una factura existente.",
      parameters: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "ID de la factura" },
          invoice_number: { type: "string", description: "Número de factura (ej: INV-001). Opcional si se provee ID." },
          new_status: {
            type: "string",
            description: "Nuevo estado",
            enum: ["Borrador", "Enviada", "Pagada", "Vencida", "Cancelada"],
          },
        },
        required: ["new_status"],
      },
    },
  },

  // ── TIME TRACKING MODULE ──
  {
    type: "function" as const,
    function: {
      name: "get_time_entries",
      description: "Obtener lista de registros de tiempo (time entries), opcionalmente filtrados por proyecto, usuario o fecha.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Filtrar por nombre de proyecto" },
          project_id: { type: "string", description: "Filtrar por ID de proyecto" },
          user_name: { type: "string", description: "Filtrar por nombre de usuario" },
          date_from: { type: "string", description: "Fecha desde YYYY-MM-DD" },
          date_to: { type: "string", description: "Fecha hasta YYYY-MM-DD" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_time_entry",
      description: "Registrar una nueva entrada de tiempo de trabajo.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Nombre del proyecto" },
          project_id: { type: "string", description: "ID del proyecto" },
          phase_name: { type: "string", description: "Nombre de la fase de obra" },
          description: { type: "string", description: "Descripción del trabajo realizado" },
          hours: { type: "number", description: "Cantidad de horas trabajadas" },
          date: { type: "string", description: "Fecha del trabajo en YYYY-MM-DD" },
          billable: { type: "boolean", description: "Si es facturable (por defecto true)" },
          rate: { type: "number", description: "Tarifa por hora en COP" },
        },
        required: ["hours"],
      },
    },
  },

  // ── SUBMITTALS CREATE ──
  {
    type: "function" as const,
    function: {
      name: "create_submittal",
      description: "Crear un nuevo submittal (entregable para revisión/aprobación). Numeración automática SUB-001, SUB-002, etc.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título del submittal" },
          project_name: { type: "string", description: "Nombre del proyecto" },
          project_id: { type: "string", description: "ID del proyecto" },
          description: { type: "string", description: "Descripción del submittal" },
          specification: { type: "string", description: "Especificación técnica referenciada" },
          reviewer_name: { type: "string", description: "Nombre del revisor asignado" },
          due_date: { type: "string", description: "Fecha límite en YYYY-MM-DD" },
        },
        required: ["title"],
      },
    },
  },

  // ── PUNCH ITEMS CREATE ──
  {
    type: "function" as const,
    function: {
      name: "create_punch_item",
      description: "Crear un nuevo item de punch list (verificación de obra).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título del item" },
          project_name: { type: "string", description: "Nombre del proyecto" },
          project_id: { type: "string", description: "ID del proyecto" },
          description: { type: "string", description: "Descripción detallada" },
          location: {
            type: "string",
            description: "Ubicación en la obra",
            enum: ["Fachada", "Interior", "Estructura", "Instalaciones", "Acabados", "Terraza", "Zonas comunes", "Otro"],
          },
          priority: {
            type: "string",
            description: "Prioridad",
            enum: ["Alta", "Media", "Baja"],
          },
          assigned_to_name: { type: "string", description: "Nombre de la persona asignada" },
          due_date: { type: "string", description: "Fecha límite en YYYY-MM-DD" },
        },
        required: ["title"],
      },
    },
  },

  // ── COMPANIES MODULE ──
  {
    type: "function" as const,
    function: {
      name: "get_companies",
      description: "Obtener lista de empresas/compañías registradas en el sistema.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Buscar por nombre o NIT" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_company",
      description: "Registrar una nueva empresa/compañía en el sistema.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre de la empresa" },
          legal_name: { type: "string", description: "Razón social" },
          nit: { type: "string", description: "NIT de la empresa" },
          email: { type: "string", description: "Correo de contacto" },
          phone: { type: "string", description: "Teléfono de contacto" },
          address: { type: "string", description: "Dirección" },
        },
        required: ["name"],
      },
    },
  },

  // ── DAILY LOGS MODULE ──
  {
    type: "function" as const,
    function: {
      name: "get_daily_logs",
      description: "Obtener bitácoras de obra (daily logs) de un proyecto. Registros diarios de actividades, clima y personal.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Nombre del proyecto" },
          project_id: { type: "string", description: "ID del proyecto" },
          date_from: { type: "string", description: "Fecha desde YYYY-MM-DD" },
          date_to: { type: "string", description: "Fecha hasta YYYY-MM-DD" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_daily_log",
      description: "Crear una nueva bitácora de obra (daily log) para un proyecto. Registro diario de lo ocurrido en la obra.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Nombre del proyecto" },
          project_id: { type: "string", description: "ID del proyecto" },
          date: { type: "string", description: "Fecha del registro en YYYY-MM-DD" },
          weather: { type: "string", description: "Condición climática (ej: Soleado, Lluvioso, Nublado)" },
          activities: {
            type: "array",
            description: "Lista de actividades realizadas",
            items: { type: "string" },
          },
          labor_count: { type: "number", description: "Número de trabajadores en obra" },
          supervisor: { type: "string", description: "Nombre del supervisor a cargo" },
          notes: { type: "string", description: "Notas adicionales u observaciones" },
        },
        required: ["project_name", "date"],
      },
    },
  },

  // ── PROJECT UPDATES ──
  {
    type: "function" as const,
    function: {
      name: "update_project_status",
      description: "Cambiar el estado de un proyecto existente.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Nombre del proyecto" },
          project_id: { type: "string", description: "ID del proyecto" },
          new_status: {
            type: "string",
            description: "Nuevo estado del proyecto",
            enum: ["Concepto", "Diseño", "Ejecución", "Entregado", "Pausado"],
          },
        },
        required: ["new_status"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_project_progress",
      description: "Actualizar el porcentaje de progreso de un proyecto.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Nombre del proyecto" },
          project_id: { type: "string", description: "ID del proyecto" },
          progress: { type: "number", description: "Nuevo porcentaje de progreso (0-100)" },
        },
        required: ["progress"],
      },
    },
  },

  // ── DELETE OPERATIONS ──
  {
    type: "function" as const,
    function: {
      name: "delete_task",
      description: "Eliminar una tarea existente. Esta acción no se puede deshacer.",
      parameters: {
        type: "object",
        properties: {
          task_title: { type: "string", description: "Título de la tarea (búsqueda parcial)" },
          task_id: { type: "string", description: "ID de la tarea (si se conoce)" },
        },
        required: [],
      },
    },
  },
];

// ─── SYSTEM PROMPT ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres Archii AI Agent, un asistente inteligente SUPERIOR especializado en gestión de proyectos de construcción, arquitectura e interiorismo. Puedes REALIZAR ACCIONES directamente en la aplicación.

CAPACIDADES:
- CREAR y EDITAR tareas, proyectos, gastos, proveedores, reuniones, RFIs
- CREAR y GESTIONAR inventario (productos, movimientos, transferencias de bodega)
- CREAR y CONSULTAR facturas con numeración automática (INV-001)
- REGISTRAR tiempos de trabajo (time tracking)
- CREAR submittals y punch items
- GESTIONAR empresas y compañías
- REGISTRAR bitácoras de obra (daily logs)
- ACTUALIZAR estados de proyectos y facturas
- CONSULTAR datos de proyectos, equipo, presupuestos, inventario, RFIs, Submittals, Punch List, Facturas, Tiempos
- ANALIZAR presupuestos y dar recomendaciones
- PLANIFICAR cronogramas y fases de obra
- OPTIMIZAR recursos y dar consejos profesionales
- ANALIZAR imágenes de planos, obras, materiales, cotizaciones y documentos
- ELIMINAR tareas (con confirmación)

REGLAS IMPORTANTES:
1. Siempre respondes en ESPAÑOL
2. Cuando el usuario pida crear algo, USA LAS FUNCIONES disponibles (no solo lo describas)
3. Si no estás seguro de un parámetro, PREGUNTA antes de ejecutar
4. Si el usuario dice "crea una tarea para revisar planos", infiere los parámetros y crea la tarea
5. Siempre confirma QUÉ acción realizaste y los detalles
6. Para montos en COP, usa el formato $XXX.XXX.XXX (pesos colombianos)
7. Sé proactivo: si ves una oportunidad de ayudar, ofrécela
8. No inventes datos que no existan — consulta primero si es necesario
9. Cuando crees algo, describe qué creaste con emoji (✅ 📋 💰 🤝 📅)
10. Cuando el usuario envíe una imagen, analízala detalladamente y proporciona información útil sobre lo que ves

ESTRUCTURA DE RESPUESTA:
- Primero ejecuta las acciones necesarias
- Luego explica qué hiciste de forma clara y concisa
- Si fue una consulta, presenta los datos de forma organizada

TONO: Profesional pero cercano. Eres como un asistente de proyecto experto que puede hacer cosas por el usuario.`;

// ─── TOOL EXECUTION ENGINE ──────────────────────────────────────────

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface ExecutedAction {
  type: string;
  label: string;
  icon: string;
  details: string;
  success: boolean;
  error?: string;
}

function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

type FirestoreDoc = { id: string; data: Record<string, any> };

function findProjectByName(projects: FirestoreDoc[], name: string): FirestoreDoc | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  return (
    projects.find((p) => p.data?.name?.toLowerCase() === lower) ??
    projects.find((p) => p.data?.name?.toLowerCase().includes(lower))
  ) ?? null;
}

function findTaskByTitle(tasks: FirestoreDoc[], title: string): FirestoreDoc | null {
  if (!title) return null;
  const lower = title.toLowerCase();
  return (
    tasks.find((t) => t.data?.title?.toLowerCase() === lower) ??
    tasks.find((t) => t.data?.title?.toLowerCase().includes(lower))
  ) ?? null;
}

// Tools that only Admin/Director/SuperAdmin should execute (write/update/delete operations)
const ADMIN_ONLY_TOOLS = new Set([
  "create_task", "create_project", "create_expense", "create_supplier",
  "create_meeting", "create_rfi", "create_submittal", "create_punch_item",
  "create_inventory_product", "create_inventory_movement", "create_invoice",
  "create_time_entry", "create_company", "create_daily_log",
  "update_task_status", "update_project_status", "update_project_progress",
  "update_invoice_status", "delete_task",
]);

async function executeToolCall(
  name: string,
  args: Record<string, any>,
  db: Firestore,
  userUid: string,
  actions: ExecutedAction[],
  tenantId: string,
  userRole?: string
): Promise<string> {
  const FieldValue = getAdminFieldValue();
  const ts = FieldValue.serverTimestamp();

  try {
    // SECURITY: Role-based access control for write/update/delete operations
    if (ADMIN_ONLY_TOOLS.has(name)) {
      const allowedRoles = ["Admin", "Director", "Super Admin"];
      if (!userRole || !allowedRoles.includes(userRole)) {
        const error = `Lo siento, solo Administradores o Directores pueden ejecutar "${name}". Contacta al admin de tu equipo.`;
        actions.push({ type: "permission_denied", label: "Sin permisos", icon: "🔒", details: error, success: false, error });
        return error;
      }
    }

    switch (name) {
      // ── READ OPERATIONS ──
      case "get_projects": {
        let query = db.collection("projects").where("tenantId", "==", tenantId).orderBy("createdAt", "desc");
        const snap = await query.limit(20).get();
        const projects = snap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        const filter = args.status_filter;
        const filtered = filter
          ? projects.filter((p: any) => p.data?.status === filter)
          : projects;

        if (filtered.length === 0) {
          return filter
            ? `No se encontraron proyectos con estado "${filter}".`
            : "No hay proyectos creados aún.";
        }

        const lines = filtered.map(
          (p: any) =>
            `- **${p.data.name}**: ${p.data.status || "Sin estado"} | Cliente: ${p.data.client || "N/A"} | ${p.data.location || ""} | Presupuesto: ${formatCOP(p.data.budget || 0)} | Progreso: ${p.data.progress || 0}% [ID: ${p.id}]`
        );
        return `Proyectos encontrados (${filtered.length}):\n${lines.join("\n")}`;
      }

      case "get_project_detail": {
        const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(20).get();
        const allProjects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        const project = args.project_id
          ? allProjects.find((p: any) => p.id === args.project_id)
          : args.project_name
          ? findProjectByName(allProjects, args.project_name)
          : null;

        if (!project) {
          return args.project_name
            ? `No encontré un proyecto llamado "${args.project_name}". Proyectos disponibles: ${allProjects.map((p: any) => p.data.name).join(", ") || "ninguno"}`
            : "No se especificó ningún proyecto. Por favor indica cuál proyecto quieres consultar.";
        }

        // Get tasks
        const tasksSnap = await db
          .collection("tasks")
          .where("tenantId", "==", tenantId)
          .where("projectId", "==", project.id)
          .limit(50)
          .get();
        const tasks = tasksSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        // Get expenses
        const expSnap = await db
          .collection("expenses")
          .where("tenantId", "==", tenantId)
          .where("projectId", "==", project.id)
          .limit(50)
          .get();
        const expenses = expSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        // Get phases
        const phasesSnap = await db
          .collection("projects")
          .doc(project.id)
          .collection("workPhases")
          .orderBy("order", "asc")
          .get();
        const phases = phasesSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        const totalExpenses = expenses.reduce((sum: number, e: any) => sum + (e.data.amount || 0), 0);
        const taskByStatus: Record<string, number> = {};
        tasks.forEach((t: any) => {
          const s = t.data.status || "Sin estado";
          taskByStatus[s] = (taskByStatus[s] || 0) + 1;
        });

        let detail = `## ${project.data.name}\n`;
        detail += `**Estado:** ${project.data.status} | **Progreso:** ${project.data.progress || 0}%\n`;
        detail += `**Cliente:** ${project.data.client || "N/A"} | **Ubicación:** ${project.data.location || "N/A"}\n`;
        detail += `**Presupuesto:** ${formatCOP(project.data.budget || 0)} | **Gastado:** ${formatCOP(totalExpenses)}\n`;
        if (project.data.description) detail += `**Descripción:** ${project.data.description}\n`;

        if (phases.length > 0) {
          detail += `\n### Fases de obra:\n`;
          phases.forEach((ph: any) => {
            detail += `- ${ph.data.name}: ${ph.data.status} ${ph.data.startDate ? `(${ph.data.startDate} → ${ph.data.endDate || "?"})` : ""}\n`;
          });
        }

        detail += `\n### Resumen de tareas (${tasks.length} total):\n`;
        Object.entries(taskByStatus).forEach(([status, count]) => {
          detail += `- ${status}: ${count}\n`;
        });

        if (expenses.length > 0) {
          detail += `\n### Últimos gastos:\n`;
          expenses.slice(0, 5).forEach((e: any) => {
            detail += `- ${e.data.concept}: ${formatCOP(e.data.amount)} (${e.data.category || "Otro"})\n`;
          });
        }

        detail += `\n[ID del proyecto: ${project.id}]`;
        return detail;
      }

      case "get_tasks": {
        let query = db.collection("tasks").where("tenantId", "==", tenantId).orderBy("createdAt", "desc");
        const snap = await query.limit(50).get();
        const allTasks = snap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        // Filter by project
        let filtered = allTasks;
        if (args.project_id) {
          filtered = allTasks.filter((t: any) => t.data.projectId === args.project_id);
        } else if (args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) filtered = allTasks.filter((t: any) => t.data.projectId === proj.id);
          else return `No encontré el proyecto "${args.project_name}".`;
        }

        // Filter by status
        if (args.status_filter) {
          filtered = filtered.filter((t: any) => t.data.status === args.status_filter);
        }

        if (filtered.length === 0) return "No se encontraron tareas con esos filtros.";

        const lines = filtered.map(
          (t: any) =>
            `- **${t.data.title}**: ${t.data.status || "Sin estado"} | Prioridad: ${t.data.priority || "N/A"} | Proyecto: ${t.data.projectId || "N/A"} | Fecha: ${t.data.dueDate || "N/A"} [ID: ${t.id}]`
        );
        return `Tareas encontradas (${filtered.length}):\n${lines.join("\n")}`;
      }

      case "get_team_members": {
        // Get tenant members
        const tenantSnap = await db.collection("tenants").doc(tenantId).get();
        const tenantData = tenantSnap.exists ? tenantSnap.data() : null;
        const memberIds: string[] = tenantData?.members || [];
        // Fetch only tenant members (not all users) - individual gets for reliability
        let members: { id: string; data: any }[] = [];
        if (memberIds.length > 0) {
          const memberPromises = memberIds.map(async (uid: string) => {
            const doc = await db.collection("users").doc(uid).get();
            if (doc.exists) return { id: doc.id, data: doc.data() };
            return null;
          });
          const results = await Promise.all(memberPromises);
          members = results.filter((m): m is { id: string; data: any } => m !== null);
        }
        if (members.length === 0) return "No hay miembros en este espacio de trabajo.";

        const lines = members.map(
          (m: any) =>
            `- **${m.data.name || "Sin nombre"}** (${m.data.role || "Miembro"}) — ${m.data.email || "Sin email"} [ID: ${m.id}]`
        );
        return `Equipo (${members.length} miembros):\n${lines.join("\n")}`;
      }

      case "get_budget_summary": {
        const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
        const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        const project = args.project_id
          ? projects.find((p: any) => p.id === args.project_id)
          : args.project_name
          ? findProjectByName(projects, args.project_name)
          : null;

        if (!project) {
          return "No se encontró el proyecto. Especifica cuál proyecto quieres consultar.";
        }

        const expSnap = await db.collection("expenses").where("tenantId", "==", tenantId).where("projectId", "==", project.id).limit(100).get();
        const expenses = expSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        const byCategory: Record<string, number> = {};
        let total = 0;
        expenses.forEach((e: any) => {
          const cat = e.data.category || "Otro";
          byCategory[cat] = (byCategory[cat] || 0) + (e.data.amount || 0);
          total += e.data.amount || 0;
        });

        const budget = project.data.budget || 0;
        const pct = budget > 0 ? ((total / budget) * 100).toFixed(1) : "N/A";

        let summary = `## Resumen de presupuesto: ${project.data.name}\n`;
        summary += `**Presupuesto:** ${formatCOP(budget)}\n**Gastado:** ${formatCOP(total)}\n**Porcentaje ejecutado:** ${pct}%\n`;

        if (budget > 0 && total > budget) {
          summary += `\n⚠️ **ALERTA:** El gasto SUPERA el presupuesto en ${formatCOP(total - budget)}.\n`;
        }

        if (Object.keys(byCategory).length > 0) {
          summary += `\n### Gastos por categoría:\n`;
          Object.entries(byCategory)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .forEach(([cat, amount]) => {
              const catPct = total > 0 ? (((amount as number) / total) * 100).toFixed(1) : "0";
              summary += `- **${cat}**: ${formatCOP(amount as number)} (${catPct}%)\n`;
            });
        }

        return summary;
      }

      case "get_expenses": {
        const expSnap = await db.collection("expenses").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allExpenses = expSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        if (args.project_id) {
          allExpenses = allExpenses.filter((e: any) => e.data.projectId === args.project_id);
        } else if (args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) allExpenses = allExpenses.filter((e: any) => e.data.projectId === proj.id);
          else return `No encontré el proyecto "${args.project_name}".`;
        }

        if (args.category) {
          allExpenses = allExpenses.filter((e: any) => e.data.category === args.category);
        }

        if (allExpenses.length === 0) return "No se encontraron gastos con esos filtros.";

        const lines = allExpenses.map(
          (e: any) =>
            `- **${e.data.concept}**: ${formatCOP(e.data.amount)} | ${e.data.category || "Otro"} | ${e.data.date || "Sin fecha"} [ID: ${e.id}]`
        );
        return `Gastos encontrados (${allExpenses.length}):\n${lines.join("\n")}`;
      }

      // ── WRITE OPERATIONS ──
      case "create_task": {
        // Resolve project
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
        }

        // Resolve assignee
        let assigneeId: string | undefined;
        if (args.assignee_name) {
          // Only search within tenant members
          const taskTenantSnap = await db.collection("tenants").doc(tenantId).get();
          const taskTenantMembers = taskTenantSnap.exists ? (taskTenantSnap.data()?.members || []) : [];
          const taskUsersPromises = taskTenantMembers.map(async (uid: string) => {
            const doc = await db.collection("users").doc(uid).get();
            if (doc.exists) return { id: doc.id, data: doc.data() };
            return null;
          });
          const users = (await Promise.all(taskUsersPromises)).filter((u): u is { id: string; data: any } => u !== null);
          const lower = args.assignee_name.toLowerCase();
          const found = users.find(
            (u: any) =>
              u.data?.name?.toLowerCase().includes(lower) ||
              u.data?.email?.toLowerCase().includes(lower)
          );
          if (found) assigneeId = found.id;
        }

        const docRef = await db.collection("tasks").add({
          title: args.title,
          projectId: projectId || "",
          assigneeId: assigneeId || "",
          priority: args.priority || "Media",
          status: args.status || "Por hacer",
          dueDate: args.due_date || "",
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "task_created",
          label: `Tarea creada`,
          icon: "✅",
          details: args.title,
          success: true,
        });

        return `Tarea "${args.title}" creada exitosamente [ID: ${docRef.id}]. Proyecto: ${projectId || "Sin asignar"}, Prioridad: ${args.priority || "Media"}, Estado: ${args.status || "Por hacer"}`;
      }

      case "create_project": {
        const docRef = await db.collection("projects").add({
          name: args.name,
          status: "Concepto",
          client: args.client || "",
          location: args.location || "",
          budget: args.budget || 0,
          description: args.description || "",
          startDate: args.start_date || "",
          endDate: args.end_date || "",
          progress: 0,
          tenantId,
          createdAt: ts,
          createdBy: userUid,
          updatedAt: ts,
        });

        // Create default phases
        const defaultPhases = [
          "Concepto",
          "Diseño",
          "Planeación",
          "Pre-construcción",
          "Construcción",
          "Entrega",
        ];
        const batch = db.batch();
        defaultPhases.forEach((phaseName, i) => {
          const ref = db.collection("projects").doc(docRef.id).collection("workPhases").doc();
          batch.set(ref, {
            name: phaseName,
            description: "",
            status: "Pendiente",
            order: i,
            startDate: "",
            endDate: "",
            createdAt: ts,
          });
        });
        await batch.commit();

        actions.push({
          type: "project_created",
          label: `Proyecto creado`,
          icon: "🏗️",
          details: args.name,
          success: true,
        });

        return `Proyecto "${args.name}" creado exitosamente [ID: ${docRef.id}]. Cliente: ${args.client || "N/A"}, Ubicación: ${args.location || "N/A"}, Presupuesto: ${formatCOP(args.budget || 0)}. Fases iniciales creadas automáticamente.`;
      }

      case "create_expense": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
        }

        const docRef = await db.collection("expenses").add({
          concept: args.concept,
          projectId: projectId || "",
          category: args.category || "Otro",
          amount: args.amount || 0,
          date: args.date || new Date().toISOString().split("T")[0],
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "expense_created",
          label: `Gasto registrado`,
          icon: "💰",
          details: `${args.concept}: ${formatCOP(args.amount || 0)}`,
          success: true,
        });

        return `Gasto "${args.concept}" registrado exitosamente [ID: ${docRef.id}]. Monto: ${formatCOP(args.amount || 0)}, Categoría: ${args.category || "Otro"}, Proyecto: ${projectId || "Sin asignar"}`;
      }

      case "create_supplier": {
        const docRef = await db.collection("suppliers").add({
          name: args.name,
          category: args.category || "Otro",
          phone: args.phone || "",
          email: args.email || "",
          address: args.address || "",
          website: "",
          notes: args.notes || "",
          rating: 0,
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "supplier_created",
          label: `Proveedor registrado`,
          icon: "🤝",
          details: args.name,
          success: true,
        });

        return `Proveedor "${args.name}" registrado exitosamente [ID: ${docRef.id}]. Categoría: ${args.category || "Otro"}, Teléfono: ${args.phone || "N/A"}, Email: ${args.email || "N/A"}`;
      }

      case "create_meeting": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
        }

        const docRef = await db.collection("meetings").add({
          title: args.title,
          projectId: projectId || "",
          date: args.date || "",
          time: args.time || "",
          duration: args.duration || "",
          location: args.location || "",
          description: args.description || "",
          attendees: [],
          tenantId,
          createdBy: userUid,
          createdAt: ts,
        });

        actions.push({
          type: "meeting_created",
          label: `Reunión programada`,
          icon: "📅",
          details: `${args.title} — ${args.date} ${args.time}`,
          success: true,
        });

        return `Reunión "${args.title}" programada exitosamente [ID: ${docRef.id}]. Fecha: ${args.date} ${args.time}, Duración: ${args.duration || "N/A"}, Lugar: ${args.location || "N/A"}`;
      }

      case "update_task_status": {
        const tasksSnap = await db.collection("tasks").where("tenantId", "==", tenantId).limit(100).get();
        const allTasks = tasksSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        let task: FirestoreDoc | null = null;
        if (args.task_id) {
          task = allTasks.find((t: any) => t.id === args.task_id) ?? null;
        } else if (args.task_title) {
          task = findTaskByTitle(allTasks, args.task_title);
        }

        if (!task) {
          const error = `No encontré la tarea "${args.task_title || args.task_id}". Busca por título o ID exacto.`;
          actions.push({
            type: "task_update_failed",
            label: `Error al actualizar tarea`,
            icon: "❌",
            details: error,
            success: false,
            error,
          });
          return error;
        }

        const updateData: Record<string, any> = {
          status: args.new_status,
          updatedAt: ts,
        };
        // Set completedAt when marking as completed, clear it otherwise
        if (args.new_status === 'Completado') {
          updateData.completedAt = ts;
        } else {
          updateData.completedAt = null;
        }
        await db.collection("tasks").doc(task.id).update(updateData);

        actions.push({
          type: "task_updated",
          label: `Tarea actualizada`,
          icon: "🔄",
          details: `"${task.data.title}" → ${args.new_status}`,
          success: true,
        });

        return `Tarea "${task.data.title}" actualizada a estado "${args.new_status}" exitosamente.`;
      }

      case "get_rfis": {
        const rfiSnap = await db.collection("rfis").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allRFIs = rfiSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        if (args.project_id) {
          allRFIs = allRFIs.filter((r: any) => r.data.projectId === args.project_id);
        } else if (args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) allRFIs = allRFIs.filter((r: any) => r.data.projectId === proj.id);
        }
        if (args.status_filter) allRFIs = allRFIs.filter((r: any) => r.data.status === args.status_filter);
        if (allRFIs.length === 0) return "No se encontraron RFIs con esos filtros.";
        const lines = allRFIs.map((r: any) => `- **${r.data.number}** ${r.data.subject}: ${r.data.status} | Prioridad: ${r.data.priority || "N/A"} | Proyecto: ${r.data.projectId || "N/A"}${r.data.dueDate ? ` | Vence: ${r.data.dueDate}` : ""}`);
        return `RFIs encontrados (${allRFIs.length}):\n${lines.join("\n")}`;
      }

      case "create_rfi": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
        }
        let assigneeId: string | undefined;
        if (args.assignee_name) {
          // Only search within tenant members
          const rfiTenantSnap = await db.collection("tenants").doc(tenantId).get();
          const rfiTenantMembers = rfiTenantSnap.exists ? (rfiTenantSnap.data()?.members || []) : [];
          const rfiUsersPromises = rfiTenantMembers.map(async (uid: string) => {
            const doc = await db.collection("users").doc(uid).get();
            if (doc.exists) return { id: doc.id, data: doc.data() };
            return null;
          });
          const users = (await Promise.all(rfiUsersPromises)).filter((u): u is { id: string; data: any } => u !== null);
          const lower = args.assignee_name.toLowerCase();
          const found = users.find((u: any) => u.data?.name?.toLowerCase().includes(lower) || u.data?.email?.toLowerCase().includes(lower));
          if (found) assigneeId = found.id;
        }
        const number = await getNextSequentialNumber("rfis", tenantId, "RFI");
        const docRef = await db.collection("rfis").add({
          number, subject: args.subject, question: args.question, response: "",
          projectId: projectId || "", assignedTo: assigneeId || "",
          priority: args.priority || "Media", status: "Abierto", dueDate: args.due_date || "",
          tenantId, createdAt: ts, createdBy: userUid,
        });
        actions.push({ type: "rfi_created", label: "RFI creado", icon: "❓", details: `${number}: ${args.subject}`, success: true });
        return `RFI "${number}" creado exitosamente [ID: ${docRef.id}]. Asunto: ${args.subject}, Prioridad: ${args.priority || "Media"}, Proyecto: ${projectId || "Sin asignar"}`;
      }

      case "get_submittals": {
        const subSnap = await db.collection("submittals").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allSubs = subSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        if (args.project_id) {
          allSubs = allSubs.filter((s: any) => s.data.projectId === args.project_id);
        } else if (args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) allSubs = allSubs.filter((s: any) => s.data.projectId === proj.id);
        }
        if (args.status_filter) allSubs = allSubs.filter((s: any) => s.data.status === args.status_filter);
        if (allSubs.length === 0) return "No se encontraron submittals con esos filtros.";
        const lines = allSubs.map((s: any) => `- **${s.data.number}** ${s.data.title}: ${s.data.status}${s.data.specification ? ` | Spec: ${s.data.specification}` : ""}${s.data.dueDate ? ` | Vence: ${s.data.dueDate}` : ""}`);
        return `Submittals encontrados (${allSubs.length}):\n${lines.join("\n")}`;
      }

      case "get_punch_items": {
        const punchSnap = await db.collection("punchItems").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allPunch = punchSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        if (args.project_id) {
          allPunch = allPunch.filter((p: any) => p.data.projectId === args.project_id);
        } else if (args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) allPunch = allPunch.filter((p: any) => p.data.projectId === proj.id);
        }
        if (args.status_filter) allPunch = allPunch.filter((p: any) => p.data.status === args.status_filter);
        if (args.location) allPunch = allPunch.filter((p: any) => p.data.location === args.location);
        if (allPunch.length === 0) return "No se encontraron items de punch list con esos filtros.";
        const lines = allPunch.map((p: any) => `- **${p.data.title}**: ${p.data.status} | ${p.data.priority || "Media"} | ${p.data.location || "Otro"}${p.data.dueDate ? ` | Vence: ${p.data.dueDate}` : ""}`);
        return `Items de Punch List (${allPunch.length}):\n${lines.join("\n")}`;
      }

      // ── INVENTORY OPERATIONS ──
      case "get_inventory_products": {
        const invSnap = await db.collection("invProducts").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allProducts = invSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        if (args.category) {
          allProducts = allProducts.filter((p: any) => p.data.category === args.category);
        }
        if (args.warehouse) {
          allProducts = allProducts.filter((p: any) => p.data.warehouse === args.warehouse);
        }
        if (args.search) {
          const searchLower = args.search.toLowerCase();
          allProducts = allProducts.filter((p: any) =>
            p.data.name?.toLowerCase().includes(searchLower) ||
            p.data.sku?.toLowerCase().includes(searchLower)
          );
        }

        if (allProducts.length === 0) return "No se encontraron productos en el inventario.";

        const lines = allProducts.map(
          (p: any) =>
            `- **${p.data.name}**: SKU: ${p.data.sku || "N/A"} | ${p.data.unit || "und"} | Precio: ${formatCOP(p.data.price || 0)} | Stock: ${p.data.stock || 0}${p.data.minStock ? ` (Mín: ${p.data.minStock})` : ""} | Bodega: ${p.data.warehouse || "N/A"} [ID: ${p.id}]`
        );
        return `Productos del inventario (${allProducts.length}):\n${lines.join("\n")}`;
      }

      case "create_inventory_product": {
        const docRef = await db.collection("invProducts").add({
          name: args.name,
          sku: args.sku || "",
          category: args.category || "",
          unit: args.unit || "unidades",
          price: args.price || 0,
          stock: args.stock || 0,
          minStock: args.min_stock || 0,
          warehouse: args.warehouse || "",
          warehouseStock: args.warehouse ? { [args.warehouse]: args.stock || 0 } : {},
          imageData: "",
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "inventory_product_created",
          label: "Producto creado",
          icon: "📦",
          details: args.name,
          success: true,
        });

        return `Producto "${args.name}" creado exitosamente en el inventario [ID: ${docRef.id}]. SKU: ${args.sku || "N/A"}, Categoría: ${args.category || "N/A"}, Precio: ${formatCOP(args.price || 0)}, Stock inicial: ${args.stock || 0} ${args.unit || "unidades"}`;
      }

      case "get_inventory_movements": {
        const movSnap = await db.collection("invMovements").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allMovements = movSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        if (args.product_id) {
          allMovements = allMovements.filter((m: any) => m.data.productId === args.product_id);
        }
        if (args.warehouse) {
          allMovements = allMovements.filter((m: any) => m.data.warehouse === args.warehouse);
        }
        if (args.movement_type) {
          allMovements = allMovements.filter((m: any) => m.data.type === args.movement_type);
        }

        if (allMovements.length === 0) return "No se encontraron movimientos de inventario.";

        const lines = allMovements.map(
          (m: any) =>
            `- **${m.data.type === "Entrada" ? "📥" : "📤"} ${m.data.type}**: ${m.data.quantity} und${m.data.reason ? ` | Motivo: ${m.data.reason}` : ""}${m.data.reference ? ` | Ref: ${m.data.reference}` : ""} | Bodega: ${m.data.warehouse || "N/A"} | Fecha: ${m.data.date || "N/A"} [ID: ${m.id}]`
        );
        return `Movimientos de inventario (${allMovements.length}):\n${lines.join("\n")}`;
      }

      case "create_inventory_movement": {
        let productId = args.product_id;
        if (!productId && args.product_name) {
          const prodSnap = await db.collection("invProducts").where("tenantId", "==", tenantId).limit(50).get();
          const products = prodSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const searchLower = args.product_name.toLowerCase();
          const found = products.find((p: any) => p.data.name?.toLowerCase() === searchLower || p.data.name?.toLowerCase().includes(searchLower));
          if (found) productId = found.id;
          else return `No encontré el producto "${args.product_name}" en el inventario.`;
        }
        if (!productId) {
          return "Debes proporcionar el ID del producto o el nombre del producto para registrar el movimiento.";
        }

        const today = new Date().toISOString().split("T")[0];
        const docRef = await db.collection("invMovements").add({
          productId,
          type: args.type || "Entrada",
          quantity: args.quantity || 0,
          reason: args.reason || "",
          reference: args.reference || "",
          date: today,
          warehouse: args.warehouse || "",
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        // Update product stock atomically (race-condition safe)
        const quantityChange = args.type === "Entrada" ? (args.quantity || 0) : -(args.quantity || 0);
        const newStock = await atomicStockUpdate(productId, quantityChange);

        actions.push({
          type: "inventory_movement_created",
          label: `${args.type === "Entrada" ? "📥 Entrada" : "📤 Salida"} registrada`,
          icon: args.type === "Entrada" ? "📥" : "📤",
          details: `${args.quantity} unidades`,
          success: true,
        });

        return `${args.type === "Entrada" ? "📥 Entrada" : "📤 Salida"} de ${args.quantity} unidades registrada exitosamente [ID: ${docRef.id}].${args.reason ? ` Motivo: ${args.reason}` : ""}${args.reference ? ` | Ref: ${args.reference}` : ""}`;
      }

      // ── INVOICES OPERATIONS ──
      case "get_invoices": {
        const invSnap = await db.collection("invoices").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allInvoices = invSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        if (args.project_id) {
          allInvoices = allInvoices.filter((i: any) => i.data.projectId === args.project_id);
        } else if (args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) allInvoices = allInvoices.filter((i: any) => i.data.projectId === proj.id);
        }
        if (args.status_filter) {
          allInvoices = allInvoices.filter((i: any) => i.data.status === args.status_filter);
        }

        if (allInvoices.length === 0) return "No se encontraron facturas con esos filtros.";

        const lines = allInvoices.map(
          (i: any) =>
            `- **${i.data.number || "Sin número"}**: ${i.data.projectName || "N/A"} | Cliente: ${i.data.clientName || "N/A"} | Total: ${formatCOP(i.data.total || 0)} | Estado: ${i.data.status || "Borrador"} | Emisión: ${i.data.issueDate || "N/A"} [ID: ${i.id}]`
        );
        return `Facturas encontradas (${allInvoices.length}):\n${lines.join("\n")}`;
      }

      case "create_invoice": {
        let projectId = args.project_id;
        let projectName = args.project_name || "";
        let clientName = args.client_name || "";

        if (!projectId && projectName) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, projectName);
          if (proj) {
            projectId = proj.id;
            if (!clientName) clientName = proj.data.client || "";
          }
        }

        const items = (args.items || []).map((item: any) => ({
          description: item.description || "",
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0,
          total: (item.quantity || 1) * (item.unitPrice || 0),
        }));
        const subtotal = items.reduce((sum: number, item: any) => sum + item.total, 0);
        const taxPercent = args.tax_percent ?? 19;
        const tax = Math.round(subtotal * (taxPercent / 100));
        const total = subtotal + tax;

        const number = await getNextSequentialNumber("invoices", tenantId, "INV");

        const docRef = await db.collection("invoices").add({
          number,
          projectId: projectId || "",
          projectName,
          clientName,
          description: args.description || "",
          items,
          subtotal,
          tax,
          taxPercent,
          total,
          status: "Borrador",
          issueDate: args.issue_date || new Date().toISOString().split("T")[0],
          dueDate: args.due_date || "",
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "invoice_created",
          label: "Factura creada",
          icon: "🧾",
          details: `${number}: ${formatCOP(total)}`,
          success: true,
        });

        return `Factura "${number}" creada exitosamente [ID: ${docRef.id}]. Proyecto: ${projectName || "N/A"}, Cliente: ${clientName || "N/A"}, Subtotal: ${formatCOP(subtotal)}, IVA (${taxPercent}%): ${formatCOP(tax)}, Total: ${formatCOP(total)}`;
      }

      case "update_invoice_status": {
        // SECURITY: Whitelist valid invoice statuses to prevent arbitrary data from LLM
        const VALID_INVOICE_STATUSES = [
          "Borrador", "Enviada", "Aprobada", "Pagada",
          "Vencida", "Cancelada", "Parcialmente Pagada",
        ];
        const newStatus = String(args.new_status || "").trim();
        if (!VALID_INVOICE_STATUSES.includes(newStatus)) {
          const error = `Estado de factura invalido "${newStatus}". Estados validos: ${VALID_INVOICE_STATUSES.join(", ")}`;
          actions.push({ type: "invoice_update_failed", label: "Estado invalido", icon: "⚠️", details: error, success: false, error });
          return error;
        }

        let invoice: FirestoreDoc | null = null;
        if (args.invoice_id) {
          const doc = await db.collection("invoices").doc(args.invoice_id).get();
          // SECURITY: Verify the invoice belongs to the requesting tenant (prevent cross-tenant IDOR)
          if (doc.exists && doc.data()?.tenantId === tenantId) {
            invoice = { id: doc.id, data: doc.data()! };
          }
        } else if (args.invoice_number) {
          const invSnap = await db.collection("invoices").where("tenantId", "==", tenantId).limit(50).get();
          const allInvoices = invSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          invoice = allInvoices.find((i: any) => i.data.number === args.invoice_number) ?? null;
        }

        if (!invoice) {
          const error = `No encontré la factura "${args.invoice_number || args.invoice_id}".`;
          actions.push({ type: "invoice_update_failed", label: "Error al actualizar factura", icon: "❌", details: error, success: false, error });
          return error;
        }

        await db.collection("invoices").doc(invoice.id).update({
          status: newStatus,
          updatedAt: ts,
        });

        actions.push({
          type: "invoice_updated",
          label: "Factura actualizada",
          icon: "🔄",
          details: `${invoice.data.number || invoice.id} → ${newStatus}`,
          success: true,
        });

        return `Factura "${invoice.data.number || invoice.id}" actualizada a estado "${newStatus}" exitosamente.`;
      }

      // ── TIME TRACKING OPERATIONS ──
      case "get_time_entries": {
        const teSnap = await db.collection("timeEntries").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allEntries = teSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        if (args.project_id) {
          allEntries = allEntries.filter((e: any) => e.data.projectId === args.project_id);
        } else if (args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) allEntries = allEntries.filter((e: any) => e.data.projectId === proj.id);
        }

        if (args.user_name) {
          const searchLower = args.user_name.toLowerCase();
          allEntries = allEntries.filter((e: any) => e.data.userName?.toLowerCase().includes(searchLower));
        }
        if (args.date_from) {
          allEntries = allEntries.filter((e: any) => e.data.date >= args.date_from);
        }
        if (args.date_to) {
          allEntries = allEntries.filter((e: any) => e.data.date <= args.date_to);
        }

        if (allEntries.length === 0) return "No se encontraron registros de tiempo.";

        const totalHours = allEntries.reduce((sum: number, e: any) => sum + (e.data.hours || 0), 0);
        const lines = allEntries.map(
          (e: any) =>
            `- **${e.data.description || "Sin descripción"}**: ${e.data.hours || 0}h | Usuario: ${e.data.userName || "N/A"} | Fase: ${e.data.phaseName || "N/A"} | ${e.data.billable ? "💰 Facturable" : "📝 No facturable"} | Fecha: ${e.data.date || "N/A"} [ID: ${e.id}]`
        );
        return `Registros de tiempo (${allEntries.length}), Total: ${totalHours}h:\n${lines.join("\n")}`;
      }

      case "create_time_entry": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
        }

        // Get user name
        const userDoc = await db.collection("users").doc(userUid).get();
        const userName = userDoc.exists ? (userDoc.data()?.name || "") : "";

        const docRef = await db.collection("timeEntries").add({
          userId: userUid,
          userName,
          projectId: projectId || "",
          phaseName: args.phase_name || "",
          description: args.description || "",
          hours: args.hours || 0,
          startTime: "",
          endTime: "",
          duration: "",
          billable: args.billable !== false,
          rate: args.rate || 0,
          date: args.date || new Date().toISOString().split("T")[0],
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        const totalAmount = (args.hours || 0) * (args.rate || 0);
        actions.push({
          type: "time_entry_created",
          label: "Tiempo registrado",
          icon: "⏱️",
          details: `${args.hours || 0}h ${args.description ? `— ${args.description}` : ""}`,
          success: true,
        });

        return `Registro de tiempo creado exitosamente [ID: ${docRef.id}]. Horas: ${args.hours || 0}, Proyecto: ${projectId || "N/A"}${args.description ? `, Descripción: ${args.description}` : ""}${totalAmount > 0 ? `, Valor: ${formatCOP(totalAmount)}` : ""}, Facturable: ${args.billable !== false ? "Sí" : "No"}`;
      }

      // ── SUBMITTAL CREATE ──
      case "create_submittal": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
        }

        let reviewerId: string | undefined;
        if (args.reviewer_name) {
          // Only search within tenant members
          const subTenantSnap = await db.collection("tenants").doc(tenantId).get();
          const subTenantMembers = subTenantSnap.exists ? (subTenantSnap.data()?.members || []) : [];
          const subUsersPromises = subTenantMembers.map(async (uid: string) => {
            const doc = await db.collection("users").doc(uid).get();
            if (doc.exists) return { id: doc.id, data: doc.data() };
            return null;
          });
          const users = (await Promise.all(subUsersPromises)).filter((u): u is { id: string; data: any } => u !== null);
          const lower = args.reviewer_name.toLowerCase();
          const found = users.find((u: any) => u.data?.name?.toLowerCase().includes(lower) || u.data?.email?.toLowerCase().includes(lower));
          if (found) reviewerId = found.id;
        }

        const number = await getNextSequentialNumber("submittals", tenantId, "SUB");

        const docRef = await db.collection("submittals").add({
          number,
          title: args.title,
          projectId: projectId || "",
          description: args.description || "",
          specification: args.specification || "",
          status: "Borrador",
          reviewer: reviewerId || "",
          submittedBy: userUid,
          dueDate: args.due_date || "",
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "submittal_created",
          label: "Submittal creado",
          icon: "📋",
          details: `${number}: ${args.title}`,
          success: true,
        });

        return `Submittal "${number}" creado exitosamente [ID: ${docRef.id}]. Título: ${args.title}${args.specification ? `, Spec: ${args.specification}` : ""}, Proyecto: ${projectId || "Sin asignar"}${args.reviewer_name ? `, Revisor: ${args.reviewer_name}` : ""}`;
      }

      // ── PUNCH ITEM CREATE ──
      case "create_punch_item": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
        }

        let assignedToId: string | undefined;
        if (args.assigned_to_name) {
          // Only search within tenant members
          const punchTenantSnap = await db.collection("tenants").doc(tenantId).get();
          const punchTenantMembers = punchTenantSnap.exists ? (punchTenantSnap.data()?.members || []) : [];
          const punchUsersPromises = punchTenantMembers.map(async (uid: string) => {
            const doc = await db.collection("users").doc(uid).get();
            if (doc.exists) return { id: doc.id, data: doc.data() };
            return null;
          });
          const users = (await Promise.all(punchUsersPromises)).filter((u): u is { id: string; data: any } => u !== null);
          const lower = args.assigned_to_name.toLowerCase();
          const found = users.find((u: any) => u.data?.name?.toLowerCase().includes(lower) || u.data?.email?.toLowerCase().includes(lower));
          if (found) assignedToId = found.id;
        }

        const docRef = await db.collection("punchItems").add({
          title: args.title,
          projectId: projectId || "",
          description: args.description || "",
          location: args.location || "Otro",
          status: "Pendiente",
          priority: args.priority || "Media",
          assignedTo: assignedToId || "",
          dueDate: args.due_date || "",
          photos: [],
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "punch_item_created",
          label: "Punch item creado",
          icon: "🔧",
          details: args.title,
          success: true,
        });

        return `Item de Punch List "${args.title}" creado exitosamente [ID: ${docRef.id}]. Ubicación: ${args.location || "Otro"}, Prioridad: ${args.priority || "Media"}, Proyecto: ${projectId || "Sin asignar"}`;
      }

      // ── COMPANIES OPERATIONS ──
      case "get_companies": {
        const compSnap = await db.collection("companies").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allCompanies = compSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        if (args.search) {
          const searchLower = args.search.toLowerCase();
          allCompanies = allCompanies.filter((c: any) =>
            c.data.name?.toLowerCase().includes(searchLower) ||
            c.data.nit?.toLowerCase().includes(searchLower) ||
            c.data.legalName?.toLowerCase().includes(searchLower)
          );
        }

        if (allCompanies.length === 0) return "No se encontraron empresas.";

        const lines = allCompanies.map(
          (c: any) =>
            `- **${c.data.name}**: NIT: ${c.data.nit || "N/A"} | Razón social: ${c.data.legalName || "N/A"} | ${c.data.email || "Sin email"} | ${c.data.phone || "Sin teléfono"} | ${c.data.address || "Sin dirección"} [ID: ${c.id}]`
        );
        return `Empresas encontradas (${allCompanies.length}):\n${lines.join("\n")}`;
      }

      case "create_company": {
        const docRef = await db.collection("companies").add({
          name: args.name,
          nit: args.nit || "",
          address: args.address || "",
          phone: args.phone || "",
          email: args.email || "",
          legalName: args.legal_name || "",
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "company_created",
          label: "Empresa registrada",
          icon: "🏢",
          details: args.name,
          success: true,
        });

        return `Empresa "${args.name}" registrada exitosamente [ID: ${docRef.id}]. NIT: ${args.nit || "N/A"}, Razón social: ${args.legal_name || args.name}, Email: ${args.email || "N/A"}, Teléfono: ${args.phone || "N/A"}`;
      }

      // ── DAILY LOGS OPERATIONS ──
      case "get_daily_logs": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
          else return `No encontré el proyecto "${args.project_name}".`;
        }
        if (!projectId) {
          return "Debes especificar un proyecto para consultar las bitácoras de obra.";
        }

        const dlSnap = await db.collection("projects").doc(projectId).collection("dailyLogs").orderBy("date", "desc").limit(30).get();
        let allLogs = dlSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        if (args.date_from) {
          allLogs = allLogs.filter((l: any) => l.data.date >= args.date_from);
        }
        if (args.date_to) {
          allLogs = allLogs.filter((l: any) => l.data.date <= args.date_to);
        }

        if (allLogs.length === 0) return "No se encontraron bitácoras de obra para ese proyecto.";

        const lines = allLogs.map(
          (l: any) =>
            `- **${l.data.date || "Sin fecha"}**: ${l.data.weather || "N/A"} | Personal: ${l.data.laborCount || 0} | Supervisor: ${l.data.supervisor || "N/A"} | Actividades: ${(l.data.activities || []).join(", ") || "N/A"} [ID: ${l.id}]`
        );
        return `Bitácoras de obra (${allLogs.length}):\n${lines.join("\n")}`;
      }

      case "create_daily_log": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
          else return `No encontré el proyecto "${args.project_name}".`;
        }
        if (!projectId) {
          return "Debes especificar un proyecto para crear la bitácora de obra.";
        }

        const docRef = await db.collection("projects").doc(projectId).collection("dailyLogs").add({
          projectId,
          date: args.date || new Date().toISOString().split("T")[0],
          weather: args.weather || "",
          activities: args.activities || [],
          laborCount: args.labor_count || 0,
          photos: [],
          supervisor: args.supervisor || "",
          notes: args.notes || "",
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "daily_log_created",
          label: "Bitácora de obra creada",
          icon: "📓",
          details: `Fecha: ${args.date || "Hoy"}${args.weather ? ` | Clima: ${args.weather}` : ""}`,
          success: true,
        });

        return `Bitácora de obra creada exitosamente [ID: ${docRef.id}]. Fecha: ${args.date || "Hoy"}, Clima: ${args.weather || "N/A"}, Personal: ${args.labor_count || 0}${args.activities?.length ? `, Actividades: ${args.activities.join(", ")}` : ""}${args.supervisor ? `, Supervisor: ${args.supervisor}` : ""}`;
      }

      // ── PROJECT UPDATE OPERATIONS ──
      case "update_project_status": {
        const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
        const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        const project = args.project_id
          ? projects.find((p: any) => p.id === args.project_id)
          : args.project_name
          ? findProjectByName(projects, args.project_name)
          : null;

        if (!project) {
          const error = args.project_name
            ? `No encontré el proyecto "${args.project_name}".`
            : "No se especificó ningún proyecto.";
          actions.push({ type: "project_update_failed", label: "Error al actualizar proyecto", icon: "❌", details: error, success: false, error });
          return error;
        }

        const oldStatus = project.data.status;
        await db.collection("projects").doc(project.id).update({
          status: args.new_status,
          updatedAt: ts,
        });

        actions.push({
          type: "project_status_updated",
          label: "Estado de proyecto actualizado",
          icon: "🔄",
          details: `${project.data.name}: ${oldStatus} → ${args.new_status}`,
          success: true,
        });

        return `Proyecto "${project.data.name}" actualizado de "${oldStatus}" a "${args.new_status}" exitosamente.`;
      }

      case "update_project_progress": {
        const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
        const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        const project = args.project_id
          ? projects.find((p: any) => p.id === args.project_id)
          : args.project_name
          ? findProjectByName(projects, args.project_name)
          : null;

        if (!project) {
          const error = args.project_name
            ? `No encontré el proyecto "${args.project_name}".`
            : "No se especificó ningún proyecto.";
          actions.push({ type: "project_update_failed", label: "Error al actualizar proyecto", icon: "❌", details: error, success: false, error });
          return error;
        }

        const clampedProgress = Math.min(100, Math.max(0, args.progress || 0));
        const oldProgress = project.data.progress || 0;
        await db.collection("projects").doc(project.id).update({
          progress: clampedProgress,
          updatedAt: ts,
        });

        actions.push({
          type: "project_progress_updated",
          label: "Progreso actualizado",
          icon: "📊",
          details: `${project.data.name}: ${oldProgress}% → ${clampedProgress}%`,
          success: true,
        });

        return `Progreso del proyecto "${project.data.name}" actualizado de ${oldProgress}% a ${clampedProgress}%.`;
      }

      // ── DELETE OPERATIONS ──
      case "delete_task": {
        const tasksSnap = await db.collection("tasks").where("tenantId", "==", tenantId).limit(100).get();
        const allTasks = tasksSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        let task: FirestoreDoc | null = null;
        if (args.task_id) {
          task = allTasks.find((t: any) => t.id === args.task_id) ?? null;
        } else if (args.task_title) {
          task = findTaskByTitle(allTasks, args.task_title);
        }

        if (!task) {
          const error = `No encontré la tarea "${args.task_title || args.task_id}".`;
          actions.push({ type: "task_delete_failed", label: "Error al eliminar tarea", icon: "❌", details: error, success: false, error });
          return error;
        }

        await db.collection("tasks").doc(task.id).delete();

        actions.push({
          type: "task_deleted",
          label: "Tarea eliminada",
          icon: "🗑️",
          details: `"${task.data.title}" eliminada permanentemente`,
          success: true,
        });

        return `Tarea "${task.data.title}" eliminada exitosamente.`;
      }

      default:
        return `Función "${name}" no reconocida.`;
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : "Error desconocido";
    actions.push({
      type: "error",
      label: `Error en ${name}`,
      icon: "❌",
      details: errMsg,
      success: false,
      error: errMsg,
    });
    return `Error ejecutando ${name}: ${errMsg}`;
  }
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth check
  let user: { uid: string; email: string; role?: string };
  try {
    user = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Error de autenticación" }, { status: 401 });
  }

  try {
    const { messages, projectContext, tenantId } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Se requiere al menos un mensaje" },
        { status: 400 }
      );
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "Se requiere el ID del espacio de trabajo (tenantId)" },
        { status: 400 }
      );
    }

    // Verify tenant membership - prevent cross-tenant access
    const db = getAdminDb();
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Espacio de trabajo no encontrado' }, { status: 404 });
    }
    const tenantData = tenantDoc.data()!;
    const tenantMembers: string[] = tenantData.members || [];
    const tenantSuperAdmins: string[] = tenantData.superAdmins || [];
    const tenantCreatedBy: string = tenantData.createdBy || '';
    if (!tenantMembers.includes(user.uid) && !tenantSuperAdmins.includes(user.uid)) {
      return NextResponse.json({ error: 'No tienes acceso a este espacio de trabajo' }, { status: 403 });
    }

    // Determine user role for RBAC in tool execution
    let userRole: string = 'Miembro';
    if (tenantSuperAdmins.includes(user.uid)) userRole = 'Super Admin';
    else if (tenantCreatedBy === user.uid) userRole = 'Admin';
    else if (tenantData.memberRoles?.[user.uid]) userRole = tenantData.memberRoles[user.uid];

    // Rate limiting: 20 requests per minute per user per tenant (protects Gemini API costs)
    const { checkRateLimit } = await import("@/lib/rate-limiter");
    const rateKey = `ai_agent:${user.uid}:${tenantId}`;
    const rateResult = await checkRateLimit(rateKey, { limit: 20, windowSeconds: 60 });
    if (!rateResult.allowed) {
      return NextResponse.json(
        {
          error: "Has superado el límite de mensajes al asistente. Intenta de nuevo en un minuto.",
          retryAfter: Math.ceil((rateResult.resetAt - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateResult.resetAt - Date.now()) / 1000)),
            "X-RateLimit-Limit": String(rateResult.limit),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const actions: ExecutedAction[] = [];

    // Build messages
    const apiMessages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (projectContext) {
      apiMessages.push({
        role: "system",
        content: `Contexto actual del usuario:\n${projectContext}`,
      });
    }

    // Add conversation history
    const recentMessages = messages.slice(-20);
    for (const msg of recentMessages) {
      if (msg.role === "user" || msg.role === "assistant") {
        const apiMsg: ChatMessage = { role: msg.role, content: msg.content };
        if (msg.images && msg.images.length > 0) {
          apiMsg.images = msg.images;
        }
        apiMessages.push(apiMsg);
      }
    }

    // First call: with tools (using Gemini API)
    let data;
    try {
      data = await chatCompletionWithTools(apiMessages, TOOLS, {
        max_tokens: 2048,
        temperature: 0.7,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[AI Agent] SDK error:", msg);
      return NextResponse.json({
        error: "Error en la API de IA",
        message: `⚠️ Error de la IA. Intenta de nuevo.`,
      });
    }
    const choice = data.choices?.[0];

    if (!choice) {
      return NextResponse.json({
        error: "Sin respuesta",
        message: "⚠️ La IA no generó una respuesta. Intenta de nuevo.",
      });
    }

    const finishReason = choice.finish_reason;
    const assistantMessage = choice.message;

    // If the model wants to call tools, execute them
    if (finishReason === "tool_calls" && assistantMessage.tool_calls) {
      // Add assistant message with tool calls to history
      apiMessages.push({ role: "assistant", content: assistantMessage.content || "", tool_calls: assistantMessage.tool_calls });

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls as ToolCall[]) {
        const funcName = toolCall.function.name;
        let funcArgs: Record<string, any>;
        try {
          funcArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          funcArgs = {};
        }

        const result = await executeToolCall(funcName, funcArgs, db, user.uid, actions, tenantId, userRole);

        // Add tool result to conversation
        apiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // Second call: get final response with tool results (using Gemini API)
      try {
        const followUpData = await chatCompletionWithTools(apiMessages, undefined, {
          max_tokens: 2048,
          temperature: 0.7,
        });

        const finalMessage = followUpData.choices?.[0]?.message?.content;

        return NextResponse.json({
          message: finalMessage || "Acciones ejecutadas correctamente.",
          actions: actions.length > 0 ? actions : undefined,
        });
      } catch (error: unknown) {
        console.error("[AI Agent] Follow-up error:", error instanceof Error ? error.message : String(error));
        return NextResponse.json({
          message: "Acciones ejecutadas correctamente.",
          actions: actions.length > 0 ? actions : undefined,
        });
      }
    }

    // No tool calls — just return the text response
    return NextResponse.json({
      message: assistantMessage.content || "No pude generar una respuesta.",
      actions: actions.length > 0 ? actions : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    console.error("[AI Agent] Error:", message);
    return NextResponse.json(
      {
        error: "Error de conexión",
        message: "⚠️ Error de conexión con la IA. Intenta de nuevo.",
      },
      { status: 500 }
    );
  }
}
