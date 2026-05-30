/**
 * types.ts
 * Todas las interfaces, constantes y configuraciones del proyecto.
 * Extraído de page.tsx para modularización.
 */

/* ===== COMMON TYPES ===== */

/** Firebase Timestamp — can be a server timestamp object or a plain string */
export type FirestoreTimestamp = string | { toDate: () => Date } | null;

/** Safely convert a FirestoreTimestamp (or undefined) to a JavaScript Date */
export function toDate(ts: FirestoreTimestamp | undefined): Date {
  if (!ts) return new Date();
  if (typeof ts === 'string') return new Date(ts);
  if (typeof ts.toDate === 'function') return ts.toDate();
  return new Date();
}

/** Generic wrapper for Firestore documents: { id: string; data: T } */
export type FirestoreDoc<T> = { id: string; data: T };

/* ===== INTERFACES ===== */

export interface User {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
}

export interface TeamUser {
  id: string;
  data: {
    name: string;
    email: string;
    role?: string;
    photoURL?: string;
    companyId?: string;
  };
}

export interface Project {
  id: string;
  data: {
    name: string;
    status: string;
    client: string;
    location: string;
    budget: number;
    description: string;
    startDate: string;
    endDate: string;
    progress: number;
    companyId?: string;
    projectType?: string;
    tenantId?: string;
    createdAt: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
    createdBy?: string;
  };
}

export interface Task {
  id: string;
  data: {
    title: string;
    description?: string;
    projectId: string;
    assigneeId: string;
    assigneeIds?: string[];
    priority: string;   // 'Alta' | 'Media' | 'Baja'
    status: string;     // 'Por hacer' | 'En progreso' | 'Revision' | 'Completado'
    dueDate: string;
    startDate?: string;
    phaseId?: string;
    estimatedHours?: number;
    tags?: string[];
    subtasks?: { text: string; done: boolean }[];
    completedAt?: FirestoreTimestamp;
    createdAt: FirestoreTimestamp;
    createdBy?: string;
    updatedAt?: FirestoreTimestamp;
    updatedBy?: string;
    agendaMeta?: {
      dayKey: string;
      hourSlots: number[];
      participantIds: string[];
      isAgendaItem: boolean;
    };
  };
}

export const TASK_STATUSES = ['Por hacer', 'En progreso', 'Revision', 'Completado'] as const;
export const TASK_PRIORITIES = ['Alta', 'Media', 'Baja'] as const;
export const TASK_STATUS_COLORS: Record<string, string> = {
  'Por hacer': 'bg-slate-400/10 text-slate-400',
  'En progreso': 'bg-blue-500/10 text-blue-400',
  'Revision': 'bg-amber-500/10 text-amber-400',
  'Completado': 'bg-emerald-500/10 text-emerald-400',
};

export interface Expense {
  id: string;
  data: {
    concept: string;
    projectId: string;
    category: string;
    amount: number;
    date: string;
    paymentMethod?: string;
    vendor?: string;
    notes?: string;
    createdAt: FirestoreTimestamp;
    createdBy?: string;
  };
}

export interface Supplier {
  id: string;
  data: {
    name: string;
    category: string;
    phone: string;
    email: string;
    address: string;
    website: string;
    notes: string;
    rating: number;
    createdAt: FirestoreTimestamp;
  };
}

export interface Approval {
  id: string;
  data: {
    title: string;
    description: string;
    status: string;
    createdAt: FirestoreTimestamp;
  };
}

export interface WorkPhase {
  id: string;
  data: {
    name: string;
    description: string;
    status: string; // 'Pendiente' | 'En progreso' | 'Completado'
    order: number;
    startDate: string;
    endDate: string;
    createdAt: FirestoreTimestamp;
    type: 'Diseño' | 'Ejecución' | 'Otro';
    enabled: boolean;
    phaseKey: string; // clave única: 'conceptualizacion', 'anteproyecto', 'obra_gris', etc.
  };
}

export interface DailyLog {
  id: string;
  data: {
    projectId: string;
    date: string; // YYYY-MM-DD format
    weather: string; // 'Soleado', 'Nublado', 'Lluvioso', 'Parcialmente nublado', 'Tormenta'
    temperature: number; // Celsius
    activities: string[]; // Array of activity descriptions
    laborCount: number; // Number of workers
    equipment: string[]; // Equipment used
    materials: string[]; // Materials used/consumed
    observations: string; // General observations/notes
    photos: string[]; // Base64 photo strings
    supervisor: string; // Supervisor name
    createdBy: string; // User UID
    createdAt: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
  };
}

export interface ProjectFile {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  createdAt: FirestoreTimestamp;
}

export interface OneDriveFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  webUrl: string;
  createdDateTime: string;
  '@microsoft.graph.downloadUrl'?: string;
}

export interface GalleryPhoto {
  id: string;
  data: {
    projectId: string;
    categoryName: string;
    caption: string;
    imageData: string;
    createdAt: FirestoreTimestamp;
    createdBy: string;
  };
}

export interface InvProduct {
  id: string;
  data: {
    name: string;
    sku: string;
    categoryId: string;
    unit: string;
    price: number;
    stock: number;
    minStock: number;
    description: string;
    imageData: string;
    warehouse: string;
    warehouseStock: Record<string, number>;
    createdAt: FirestoreTimestamp;
    createdBy: string;
    updatedAt?: FirestoreTimestamp;
  };
}

export interface InvCategory {
  id: string;
  data: {
    name: string;
    color: string;
    description: string;
    createdAt: FirestoreTimestamp;
  };
}

export interface InvMovement {
  id: string;
  data: {
    productId: string;
    type: 'Entrada' | 'Salida';
    quantity: number;
    reason: string;
    reference: string;
    date: string;
    createdAt: FirestoreTimestamp;
    createdBy: string;
  };
}

export interface InvTransfer {
  id: string;
  data: {
    productId: string;
    productName: string;
    fromWarehouse: string;
    toWarehouse: string;
    quantity: number;
    status: string;
    date: string;
    notes: string;
    createdAt: FirestoreTimestamp;
    createdBy: string;
    completedAt?: FirestoreTimestamp;
  };
}

export interface Company {
  id: string;
  data: {
    name: string;
    nit: string;
    address?: string;
    phone?: string;
    email?: string;
    legalName?: string;
    createdAt: FirestoreTimestamp;
  };
}

export interface NotifEntry {
  id: string;
  title: string;
  body: string;
  icon?: string;
  type: string;
  read: boolean;
  timestamp: Date;
  screen: string | null;
  itemId: string | null;
}

export interface TimeEntry {
  id: string;
  data: {
    userId: string;
    userName: string;
    projectId: string;
    phaseName: string;
    description: string;
    startTime: string;
    endTime: string;
    duration: number; // minutos
    billable: boolean;
    rate: number; // COP/hora
    date: string;
    createdAt: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
  };
}

export interface Invoice {
  id: string;
  data: {
    projectId: string;
    projectName: string;
    clientName: string;
    number: string;
    status: 'Borrador' | 'Enviada' | 'Pagada' | 'Vencida' | 'Cancelada';
    items: InvoiceItem[];
    subtotal: number;
    tax: number;
    total: number;
    notes: string;
    issueDate: string;
    dueDate: string;
    paidDate?: string;
    createdAt: FirestoreTimestamp;
    createdBy: string;
  };
}

export interface InvoiceItem {
  concept: string;
  phase: string;
  hours: number;
  rate: number;
  amount: number;
}

export interface Comment {
  id: string;
  data: {
    taskId: string;
    projectId: string;
    userId: string;
    userName: string;
    userPhoto?: string;
    text: string;
    mentions: string[];
    parentId?: string;
    createdAt: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
  };
}

export interface TimeSession {
  entryId: string | null;
  startTime: number | null;
  description: string;
  projectId: string;
  phaseName: string;
  isRunning: boolean;
}

export interface RFI {
  id: string;
  data: {
    number: string;
    projectId: string;
    subject: string;
    question: string;
    response: string;
    status: 'Abierto' | 'En revisión' | 'Respondido' | 'Cerrado';
    priority: 'Alta' | 'Media' | 'Baja';
    assignedTo: string;
    dueDate: string;
    photos: string[];
    createdAt: FirestoreTimestamp;
    createdBy: string;
    updatedAt: FirestoreTimestamp;
    respondedBy: string;
    respondedAt: FirestoreTimestamp;
  };
}

export interface Submittal {
  id: string;
  data: {
    number: string;
    projectId: string;
    title: string;
    description: string;
    specification: string;
    status: 'Borrador' | 'En revisión' | 'Aprobado' | 'Rechazado' | 'Devuelto';
    submittedBy: string;
    reviewer: string;
    dueDate: string;
    reviewedAt: FirestoreTimestamp;
    reviewNotes: string;
    createdAt: FirestoreTimestamp;
    createdBy: string;
    updatedAt: FirestoreTimestamp;
  };
}

export interface PunchItem {
  id: string;
  data: {
    projectId: string;
    title: string;
    description: string;
    location: string;
    status: 'Pendiente' | 'En progreso' | 'Completado';
    priority: 'Alta' | 'Media' | 'Baja';
    assignedTo: string;
    dueDate: string;
    photos: string[];
    completedAt: FirestoreTimestamp;
    completedBy: string;
    createdAt: FirestoreTimestamp;
    createdBy: string;
    updatedAt: FirestoreTimestamp;
  };
}

export interface Meeting {
  id: string;
  data: {
    title: string;
    description: string;
    projectId: string;
    date: string;              // YYYY-MM-DD
    time: string;              // HH:MM
    duration: number;          // minutes (15, 30, 45, 60, 90, 120)
    attendees: string[];       // array of attendee names
    createdBy: string;         // user UID
    tenantId: string;
    createdAt: FirestoreTimestamp;
    recurring?: 'weekly' | 'none';
    recurringDayOfWeek?: number;     // 0=Sun … 6=Sat
    recurringEndDate?: string;       // YYYY-MM-DD
    recurringGroupId?: string;       // shared across series
    location?: string;
  };
}

/* ===== KANBAN TYPES ===== */
export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  wipLimit: number | null;
  order: number;
  isDefault?: boolean;
}

export interface KanbanSwimlane {
  id: string;
  title: string;
  filterField: 'assigneeId' | 'priority' | 'projectId';
  filterValue?: string;
  order: number;
}

export interface KanbanBoard {
  id: string;
  data: {
    name: string;
    type: 'tasks' | 'projects' | 'approvals' | 'invoices' | 'transfers' | 'phases' | 'incidents';
    columns: KanbanColumn[];
    swimlanes: KanbanSwimlane[];
    cardPositions: Record<string, { columnId: string; swimlaneId?: string; order: number }>;
    quickCards: KanbanQuickCard[];
    filters: KanbanFilters;
    viewMode: 'board' | 'list';
    createdAt: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
    createdBy: string;
  };
}

export interface KanbanQuickCard {
  id: string;
  title: string;
  description: string;
  columnId: string;
  swimlaneId?: string;
  order: number;
  color: string;
  tags: string[];
  createdAt: FirestoreTimestamp;
  createdBy: string;
}

export interface KanbanFilters {
  assigneeId: string | null;
  priority: string | null;
  projectIds: string[] | null;
  dueDateFrom: string | null;
  dueDateTo: string | null;
  tags: string[] | null;
  searchQuery: string | null;
}

export const KANBAN_DEFAULT_COLUMNS: Record<string, KanbanColumn[]> = {
  tasks: [
    { id: 'todo', title: 'Por hacer', color: '#6366f1', wipLimit: null, order: 0, isDefault: true },
    { id: 'inprogress', title: 'En progreso', color: '#f59e0b', wipLimit: null, order: 1, isDefault: true },
    { id: 'review', title: 'Revision', color: '#8b5cf6', wipLimit: null, order: 2, isDefault: true },
    { id: 'done', title: 'Completado', color: '#22c55e', wipLimit: null, order: 3, isDefault: true },
  ],
  projects: [
    { id: 'concept', title: 'Concepto', color: '#6366f1', wipLimit: null, order: 0, isDefault: true },
    { id: 'design', title: 'Diseno', color: '#f59e0b', wipLimit: null, order: 1, isDefault: true },
    { id: 'execution', title: 'Ejecucion', color: '#f97316', wipLimit: null, order: 2, isDefault: true },
    { id: 'finished', title: 'Terminado', color: '#22c55e', wipLimit: null, order: 3, isDefault: true },
  ],
  approvals: [
    { id: 'pending', title: 'Pendiente', color: '#6366f1', wipLimit: null, order: 0, isDefault: true },
    { id: 'inreview', title: 'En revision', color: '#f59e0b', wipLimit: null, order: 1, isDefault: true },
    { id: 'approved', title: 'Aprobada', color: '#22c55e', wipLimit: null, order: 2, isDefault: true },
    { id: 'rejected', title: 'Rechazada', color: '#ef4444', wipLimit: null, order: 3, isDefault: true },
  ],
  invoices: [
    { id: 'draft', title: 'Borrador', color: '#6366f1', wipLimit: null, order: 0, isDefault: true },
    { id: 'sent', title: 'Enviada', color: '#f59e0b', wipLimit: null, order: 1, isDefault: true },
    { id: 'paid', title: 'Pagada', color: '#22c55e', wipLimit: null, order: 2, isDefault: true },
    { id: 'overdue', title: 'Vencida', color: '#ef4444', wipLimit: null, order: 3, isDefault: true },
  ],
  transfers: [
    { id: 'pending', title: 'Pendiente', color: '#6366f1', wipLimit: null, order: 0, isDefault: true },
    { id: 'transit', title: 'En transito', color: '#f59e0b', wipLimit: null, order: 1, isDefault: true },
    { id: 'completed', title: 'Completada', color: '#22c55e', wipLimit: null, order: 2, isDefault: true },
    { id: 'cancelled', title: 'Cancelada', color: '#ef4444', wipLimit: null, order: 3, isDefault: true },
  ],
  phases: [
    { id: 'planning', title: 'Planificacion', color: '#6366f1', wipLimit: null, order: 0, isDefault: true },
    { id: 'active', title: 'En curso', color: '#f59e0b', wipLimit: null, order: 1, isDefault: true },
    { id: 'paused', title: 'Pausada', color: '#f97316', wipLimit: null, order: 2, isDefault: true },
    { id: 'completed', title: 'Completada', color: '#22c55e', wipLimit: null, order: 3, isDefault: true },
  ],
  incidents: [
    { id: 'reported', title: 'Reportada', color: '#ef4444', wipLimit: null, order: 0, isDefault: true },
    { id: 'analyzing', title: 'En analisis', color: '#f59e0b', wipLimit: null, order: 1, isDefault: true },
    { id: 'fixing', title: 'En correccion', color: '#f97316', wipLimit: null, order: 2, isDefault: true },
    { id: 'resolved', title: 'Resuelta', color: '#22c55e', wipLimit: null, order: 3, isDefault: true },
  ],
};

/* ===== CONSTANTES ===== */

/* ===== PLANTILLAS DE FASES POR TIPO DE PROYECTO ===== */

export interface PhaseTemplate {
  key: string;
  name: string;
  description: string;
  order: number;
}

export const PROJECT_TYPE_PHASES: Record<string, PhaseTemplate[]> = {
  'Diseño': [
    { key: 'conceptualizacion', name: 'Conceptualización', description: 'Definición del concepto arquitectónico y necesidades del cliente', order: 1 },
    { key: 'idea_basica', name: 'Idea Básica', description: 'Bocetos iniciales y esquemas de distribución', order: 2 },
    { key: 'anteproyecto', name: 'Anteproyecto', description: 'Desarrollo del esquema con plantas, cortes y fachadas preliminares', order: 3 },
    { key: 'proyecto', name: 'Proyecto', description: 'Planos ejecutivos, memorias técnicas y especificaciones', order: 4 },
    { key: 'detalles', name: 'Detalles', description: 'Detalles constructivos, cartel structural e instalaciones', order: 5 },
  ],
  'Ejecución': [
    { key: 'preliminares', name: 'Preliminares', description: 'Localización, replanteo, campamentos, vías de acceso', order: 1 },
    { key: 'excavaciones', name: 'Excavaciones', description: 'Movimiento de tierras, zapatas y cimentaciones', order: 2 },
    { key: 'obra_gris', name: 'Obra Gris', description: 'Estructura, muros, losas, columnas y vigas', order: 3 },
    { key: 'obra_blanca', name: 'Obra Blanca', description: 'Enlucidos, pisos, aplanados, pintura', order: 4 },
    { key: 'carpinteria', name: 'Carpintería', description: 'Carpintería en madera, muebles a medida, puertas', order: 5 },
    { key: 'interiorismo', name: 'Interiorismo', description: 'Acabados finales, decoración, iluminación y entrega', order: 6 },
  ],
};

export const PROJECT_TYPES = ['Diseño', 'Ejecución', 'Ambos'] as const;
export const PROJECT_TYPE_COLORS: Record<string, string> = {
  'Diseño': 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  'Ejecución': 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  'Ambos': 'bg-blue-500/10 text-blue-400 border-blue-500/30',
};

// Mantener compatibilidad con fases existentes
export const DEFAULT_PHASES = PROJECT_TYPE_PHASES['Ejecución'].map(p => p.name);

export const EXPENSE_CATS = ['Materiales', 'Mano de obra', 'Mobiliario', 'Acabados', 'Imprevistos', 'Transporte', 'Equipos', 'Servicios'];

export const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta de crédito', 'Tarjeta débito', 'Cheque', 'Otro'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const SUPPLIER_CATS = ['Materiales', 'Mobiliario', 'Iluminación', 'Acabados', 'Eléctrico', 'Plomería', 'Otro'];

export const PHOTO_CATS = ['Fachada', 'Interior', 'Obra', 'Planos', 'Renders', 'Otro'];

export const INV_UNITS = ['Unidad', 'Metro', 'Metro²', 'Metro³', 'Kilogramo', 'Litro', 'Galon', 'Rollo', 'Saco', 'Caja', 'Paquete', 'Pieza', 'Par', 'Set', 'Otro'] as const;

export const INV_WAREHOUSES = ['Almacén Principal', 'Obra en Curso', 'Bodega Reserva'] as const;

export const TRANSFER_STATUSES = ['Pendiente', 'En tránsito', 'Completada', 'Cancelada'] as const;

export const RFI_STATUSES = ['Abierto', 'En revisión', 'Respondido', 'Cerrado'] as const;
export const RFI_PRIORITIES = ['Alta', 'Media', 'Baja'] as const;

export const SUBMITTAL_STATUSES = ['Borrador', 'En revisión', 'Aprobado', 'Rechazado', 'Devuelto'] as const;

export const PUNCH_STATUSES = ['Pendiente', 'En progreso', 'Completado'] as const;
export const PUNCH_PRIORITIES = ['Alta', 'Media', 'Baja'] as const;
export const PUNCH_LOCATIONS = ['Fachada', 'Interior', 'Estructura', 'Instalaciones', 'Acabados', 'Terraza', 'Zonas comunes', 'Otro'] as const;

export const CAT_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1'];

export const RFI_STATUS_COLORS: Record<string, string> = {
  'Abierto': 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  'En revisión': 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  'Respondido': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  'Cerrado': 'bg-[var(--af-bg4)] text-[var(--muted-foreground)] border-[var(--border)]',
};

export const SUBMITTAL_STATUS_COLORS: Record<string, string> = {
  'Borrador': 'bg-gray-500/10 text-gray-400 border-gray-500/30',
  'En revisión': 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  'Aprobado': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  'Rechazado': 'bg-red-500/10 text-red-400 border-red-500/30',
  'Devuelto': 'bg-purple-500/10 text-purple-400 border-purple-500/30',
};

export const PUNCH_STATUS_COLORS: Record<string, string> = {
  'Pendiente': 'bg-red-500/10 text-red-400 border-red-500/30',
  'En progreso': 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  'Completado': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
};

export const CO_TYPES = ['alcance', 'costo', 'cronograma', 'combinado'] as const;
export const CO_STATUSES = ['borrador', 'pendiente_aprobacion', 'aprobada', 'rechazada', 'cancelada'] as const;
export type COType = typeof CO_TYPES[number];
export type COStatus = typeof CO_STATUSES[number];

export interface ChangeOrderAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedAt: any;
}

export interface ChangeOrderHistoryEntry {
  action: 'created' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
  by: string;
  byName: string;
  at: any;
  comments?: string;
}

export interface ChangeOrder {
  id: string;
  data: {
    tenantId: string;
    projectId: string;
    orderNumber: string;
    type: COType;
    status: COStatus;
    title: string;
    description: string;
    justification: string;
    costImpact?: {
      previousBudget: number;
      newBudget: number;
      difference: number;
    };
    scheduleImpact?: {
      daysExtension: number;
      reason: string;
    };
    attachments: ChangeOrderAttachment[];
    createdBy: string;
    createdByName: string;
    createdAt: FirestoreTimestamp;
    submittedAt?: FirestoreTimestamp;
    approvedBy?: string;
    approvedByName?: string;
    approvedAt?: FirestoreTimestamp;
    rejectionReason?: string;
    reviewedComments?: string;
    history: ChangeOrderHistoryEntry[];
  };
}

export const CO_STATUS_COLORS: Record<string, string> = {
  'borrador': 'bg-gray-500/10 text-gray-400 border-gray-500/30',
  'pendiente_aprobacion': 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  'aprobada': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  'rechazada': 'bg-red-500/10 text-red-400 border-red-500/30',
  'cancelada': 'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

export const CO_TYPE_COLORS: Record<string, string> = {
  'alcance': 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  'costo': 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  'cronograma': 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  'combinado': 'bg-rose-500/10 text-rose-400 border-rose-500/30',
};

export const CO_STATUS_LABELS: Record<string, string> = {
  'borrador': 'Borrador',
  'pendiente_aprobacion': 'Pendiente',
  'aprobada': 'Aprobada',
  'rechazada': 'Rechazada',
  'cancelada': 'Cancelada',
};

export const CO_TYPE_LABELS: Record<string, string> = {
  'alcance': 'Alcance',
  'costo': 'Costo',
  'cronograma': 'Cronograma',
  'combinado': 'Combinado',
};

export const ADMIN_EMAILS = ['yecos11@gmail.com'];

export const USER_ROLES = ['Admin', 'Director', 'Arquitecto', 'Interventor', 'Contratista', 'Cliente', 'Miembro'] as const;

export const ROLE_COLORS: Record<string, string> = {
  Admin: 'bg-red-500/10 text-red-400 border-red-500/30',
  Director: 'bg-[var(--af-accent)]/10 text-[var(--af-accent)] border-[var(--af-accent)]/30',
  Arquitecto: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  Interventor: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  Contratista: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  Cliente: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  Miembro: 'bg-[var(--af-bg4)] text-[var(--muted-foreground)] border-[var(--border)]',
};

export const ROLE_ICONS: Record<string, string> = {
  Admin: '👑',
  Director: '🎯',
  Arquitecto: '📐',
  Interventor: '🔍',
  Contratista: '🏗️',
  Cliente: '🤝',
  Miembro: '👤',
};

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Permisos por defecto del sistema de roles. */
export const DEFAULT_ROLE_PERMS: Record<string, string[]> = {
  'Ver Dashboard': ['Admin', 'Director', 'Arquitecto', 'Interventor', 'Contratista', 'Cliente', 'Miembro'],
  'Crear proyectos': ['Admin', 'Director', 'Arquitecto'],
  'Editar proyectos': ['Admin', 'Director', 'Arquitecto'],
  'Eliminar proyectos': ['Admin', 'Director'],
  'Crear tareas': ['Admin', 'Director', 'Arquitecto', 'Interventor', 'Contratista'],
  'Asignar tareas': ['Admin', 'Director', 'Arquitecto'],
  'Gestionar equipo': ['Admin', 'Director'],
  'Cambiar roles': ['Admin'],
  'Ver presupuestos': ['Admin', 'Director', 'Arquitecto', 'Interventor', 'Cliente'],
  'Ver inventario': ['Admin', 'Director', 'Arquitecto', 'Contratista', 'Interventor'],
  'Gestionar inventario': ['Admin', 'Director', 'Contratista'],
  'Panel Admin': ['Admin', 'Director'],
  'Chat general': ['Admin', 'Director', 'Arquitecto', 'Interventor', 'Contratista', 'Cliente', 'Miembro'],
  'Portal cliente': ['Admin', 'Director', 'Cliente'],
  'Ver RFIs': ['Admin', 'Director', 'Arquitecto', 'Interventor', 'Contratista', 'Cliente'],
  'Crear RFIs': ['Admin', 'Director', 'Arquitecto', 'Interventor', 'Contratista'],
  'Ver Submittals': ['Admin', 'Director', 'Arquitecto', 'Interventor', 'Contratista', 'Cliente'],
  'Crear Submittals': ['Admin', 'Director', 'Arquitecto', 'Interventor', 'Contratista'],
  'Revisar Submittals': ['Admin', 'Director', 'Arquitecto', 'Interventor'],
  'Ver Punch List': ['Admin', 'Director', 'Arquitecto', 'Interventor', 'Contratista', 'Cliente'],
  'Crear Punch List': ['Admin', 'Director', 'Arquitecto', 'Interventor', 'Contratista'],
  'Ver Reportes': ['Admin', 'Director', 'Arquitecto', 'Interventor', 'Cliente'],
};

/** Navegación del sidebar */
export const NAV_ITEMS = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'profile', icon: '👤', label: 'Mi Perfil' },
  { id: 'projects', icon: '📁', label: 'Proyectos' },
  { id: 'tasks', icon: '✅', label: 'Tareas' },
  { id: 'kanban', icon: '📊', label: 'Kanban' },
  { id: 'timeTracking', icon: '⏱️', label: 'Tiempo' },
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'budget', icon: '💰', label: 'Presupuestos' },
  { id: 'files', icon: '📂', label: 'Archivos' },
  { id: 'obra', label: 'Obra', icon: '🏗️' },
  { id: 'suppliers', icon: '🏪', label: 'Proveedores' },
  { id: 'team', icon: '👥', label: 'Equipo' },
  { id: 'companies', icon: '🏢', label: 'Empresas' },
  { id: 'invoices', icon: '🧾', label: 'Facturas' },
  { id: 'calendar', icon: '📅', label: 'Calendario' },
  { id: 'weeklyAgenda', icon: '📆', label: 'Agenda Semanal' },
  { id: 'portal', label: 'Portal Cliente', icon: '🤝' },
  { id: 'gallery', icon: '📸', label: 'Galería' },
  { id: 'inventory', icon: '📦', label: 'Inventario' },
  { id: 'reports', icon: '📈', label: 'Reportes' },
  { id: 'rfis', icon: '❓', label: 'RFIs' },
  { id: 'submittals', icon: '📋', label: 'Submittals' },
  { id: 'punchList', icon: '✅', label: 'Punch List' },
  { id: 'changeorders', icon: '📝', label: 'Órdenes de Cambio' },
  { id: 'admin', icon: '⚙️', label: 'Admin' },
  { id: 'superAdmin', icon: '🛡️', label: 'Super Admin' },
] as const;

export const SCREEN_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  profile: 'Mi Perfil',
  projects: 'Proyectos',
  tasks: 'Tareas',
  kanban: 'Tablero Kanban',
  timeTracking: 'Time Tracking',
  chat: 'Chat',
  budget: 'Presupuestos',
  files: 'Archivos',
  obra: 'Seguimiento de Obra',
  suppliers: 'Proveedores',
  team: 'Equipo',
  companies: 'Empresas',
  invoices: 'Facturación',
  calendar: 'Calendario',
  weeklyAgenda: 'Agenda Semanal',
  portal: 'Portal Cliente',
  gallery: 'Galería de Fotos',
  inventory: 'Inventario',
  reports: 'Reportes',
  admin: 'Panel de Administración',
  superAdmin: 'Super Administrador',
  rfis: 'RFIs',
  submittals: 'Submittals',
  punchList: 'Punch List',
  changeorders: 'Órdenes de Cambio',
};
