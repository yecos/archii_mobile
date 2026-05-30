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

// Tools that only Admin/Director/SuperAdmin should execute (write/update/delete operations)
const ADMIN_ONLY_TOOLS = new Set([
  "create_task", "create_project", "create_expense", "create_supplier",
  "create_meeting", "create_rfi", "create_submittal", "create_punch_item",
  "create_inventory_product", "create_inventory_movement", "create_invoice",
  "create_time_entry", "create_company", "create_daily_log",
  "update_task_status", "update_project_status", "update_project_progress",
  "update_invoice_status", "delete_task",
]);

export { TOOLS, SYSTEM_PROMPT, ADMIN_ONLY_TOOLS };
