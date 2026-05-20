/**
 * interfaces.ts
 * TypeScript interfaces for all main entities in Archii.
 * Uses the Firestore document pattern: { id: string; data: T }
 */

/* ===== GENERIC FIRESTORE DOCUMENT WRAPPER ===== */

export interface FirestoreDoc<T> {
  id: string;
  data: T;
}

/* ===== TASK ENTITY ===== */

export interface TaskData {
  title: string;
  description?: string;
  status: 'Por hacer' | 'En progreso' | 'Revision' | 'Completado';
  priority: 'Alta' | 'Media' | 'Baja';
  projectId: string;
  assigneeIds?: string[];
  assigneeId?: string;
  dueDate?: string;
  startDate?: string;
  phaseId?: string;
  estimatedHours?: number;
  tags?: string[];
  subtasks?: { text: string; done: boolean }[];
  completedAt?: string | { toDate: () => Date } | null;
  createdAt: string | { toDate: () => Date };
  updatedAt?: string | { toDate: () => Date };
  updatedBy?: string;
  tenantId: string;
  createdBy?: string;
  agendaMeta?: {
    dayKey: string;
    hourSlots: number[];
    participantIds: string[];
    isAgendaItem: boolean;
  };
}

/* ===== PROJECT ENTITY ===== */

export interface ProjectData {
  name: string;
  description?: string;
  status: string;
  client?: string;
  location?: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
  progress?: number;
  companyId?: string;
  tenantId: string;
  createdAt: string | { toDate: () => Date };
  updatedAt?: string | { toDate: () => Date };
  createdBy?: string;
}

/* ===== RFI ENTITY ===== */

export interface RFIData {
  number: string;
  subject: string;
  question: string;
  response?: string;
  priority: 'Alta' | 'Media' | 'Baja';
  status: 'Abierto' | 'En revision' | 'Respondido' | 'Cerrado';
  assignedTo?: string;
  dueDate?: string;
  projectId: string;
  tenantId: string;
  createdAt: string | { toDate: () => Date };
  createdBy?: string;
  updatedAt?: string | { toDate: () => Date };
  respondedBy?: string;
  respondedAt?: string | { toDate: () => Date };
  photos?: string[];
}

/* ===== SUBMITTAL ENTITY ===== */

export interface SubmittalData {
  number: string;
  title: string;
  description?: string;
  specification?: string;
  status: 'Borrador' | 'En revision' | 'Aprobado' | 'Rechazado' | 'Devuelto';
  reviewer?: string;
  submittedBy?: string;
  dueDate?: string;
  reviewNotes?: string;
  projectId: string;
  tenantId: string;
  createdAt: string | { toDate: () => Date };
  createdBy?: string;
  updatedAt?: string | { toDate: () => Date };
}

/* ===== PUNCH ITEM ENTITY ===== */

export interface PunchItemData {
  title: string;
  description?: string;
  status: 'Pendiente' | 'En progreso' | 'Completado';
  priority: 'Alta' | 'Media' | 'Baja';
  location: string;
  assignedTo?: string;
  dueDate?: string;
  photos?: string[];
  projectId: string;
  tenantId: string;
  createdAt: string | { toDate: () => Date };
  createdBy?: string;
  updatedAt?: string | { toDate: () => Date };
}

/* ===== INVOICE ENTITY ===== */

export interface InvoiceItemData {
  concept: string;
  phase?: string;
  hours?: number;
  rate?: number;
  amount: number;
}

export interface InvoiceData {
  number: string;
  projectName: string;
  clientName?: string;
  projectId?: string;
  status: 'Borrador' | 'Enviada' | 'Pagada' | 'Vencida' | 'Cancelada';
  total: number;
  subtotal?: number;
  tax?: number;
  issueDate: string;
  dueDate?: string;
  items?: InvoiceItemData[];
  notes?: string;
  tenantId: string;
  createdAt: string | { toDate: () => Date };
  createdBy?: string;
  paidDate?: string;
}

/* ===== EXPENSE ENTITY ===== */

export interface ExpenseData {
  concept: string;
  projectId?: string;
  category: string;
  amount: number;
  date: string;
  tenantId: string;
  createdAt: string | { toDate: () => Date };
  createdBy?: string;
}

/* ===== TIME ENTRY ENTITY ===== */

export interface TimeEntryData {
  description?: string;
  projectId: string;
  userId: string;
  userName?: string;
  phaseName?: string;
  hours?: number;
  startTime?: string;
  endTime?: string;
  duration?: number;
  date: string;
  activity?: string;
  billable?: boolean;
  rate?: number;
  tenantId: string;
  createdAt: string | { toDate: () => Date };
  updatedAt?: string | { toDate: () => Date };
}

/* ===== MEETING ENTITY ===== */

export interface MeetingData {
  title: string;
  description?: string;
  projectId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  attendees: string[];
  location?: string;
  time?: string;
  tenantId: string;
  createdAt: string | { toDate: () => Date };
  createdBy?: string;
  /* Recurrence fields */
  recurring?: 'weekly' | 'none';
  recurringDayOfWeek?: number; // 0=Dom, 1=Lun, ..., 6=Sab
  recurringEndDate?: string; // YYYY-MM-DD
  recurringGroupId?: string; // shared by all instances in a series
}

/* ===== USER / TENANT ENTITIES ===== */

export interface TeamUserData {
  name: string;
  email: string;
  role?: string;
  photoURL?: string;
  companyId?: string;
}

export interface TenantData {
  name: string;
  slug: string;
  plan: string;
  ownerId: string;
  members?: string[];
  createdAt: string;
}

/* ===== CHAT MESSAGE ===== */

export interface ChatMessageData {
  text: string;
  senderId: string;
  senderName?: string;
  timestamp: number;
  projectId?: string;
  tenantId: string;
  createdAt?: any;
}

/* ===== COMPANY ENTITY ===== */

export interface CompanyData {
  name: string;
  nit?: string;
  contact?: string;
  email?: string;
  phone?: string;
  address?: string;
  tenantId: string;
  createdAt: string | { toDate: () => Date };
}

/* ===== SUPPLIER ENTITY ===== */

export interface SupplierData {
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  category?: string;
  address?: string;
  website?: string;
  notes?: string;
  rating?: number;
  tenantId: string;
  createdAt: string | { toDate: () => Date };
}

/* ===== INVENTORY ENTITIES ===== */

export interface InvProductData {
  name: string;
  sku?: string;
  categoryId?: string;
  unit: string;
  price: number;
  stock?: number;
  minStock: number;
  description?: string;
  imageData?: string;
  warehouse?: string;
  warehouseStock?: Record<string, number>;
  tenantId: string;
  createdAt: string | { toDate: () => Date };
  createdBy?: string;
  updatedAt?: string | { toDate: () => Date };
}

export interface InvCategoryData {
  name: string;
  color?: string;
  description?: string;
  tenantId: string;
  createdAt: string | { toDate: () => Date };
}

export interface InvMovementData {
  type: 'Entrada' | 'Salida';
  productId: string;
  warehouse: string;
  quantity: number;
  reason?: string;
  reference?: string;
  date: string;
  tenantId: string;
  createdAt: string | { toDate: () => Date };
  createdBy?: string;
}

export interface InvTransferData {
  productId: string;
  productName?: string;
  fromWarehouse: string;
  toWarehouse: string;
  quantity: number;
  status: string;
  notes?: string;
  date: string;
  tenantId: string;
  createdAt: string | { toDate: () => Date };
  createdBy?: string;
  completedAt?: string | { toDate: () => Date };
}

/* ===== OTHER ENTITIES ===== */

export interface CommentData {
  taskId?: string;
  projectId: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  text: string;
  mentions?: string[];
  parentId?: string;
  createdAt: string | { toDate: () => Date };
  updatedAt?: string | { toDate: () => Date };
}

export interface ApprovalData {
  title: string;
  description?: string;
  status: string;
  tenantId?: string;
  createdAt: string | { toDate: () => Date };
}

export interface WorkPhaseData {
  name: string;
  description?: string;
  status: string;
  order: number;
  startDate?: string;
  endDate?: string;
  createdAt: string | { toDate: () => Date };
}

export interface DailyLogData {
  projectId: string;
  date: string;
  weather: string;
  temperature: number;
  activities: string[];
  laborCount: number;
  equipment: string[];
  materials: string[];
  observations: string;
  photos: string[];
  supervisor: string;
  createdBy: string;
  createdAt: string | { toDate: () => Date };
  updatedAt?: string | { toDate: () => Date };
}

export interface GalleryPhotoData {
  projectId: string;
  categoryName: string;
  caption: string;
  imageData: string;
  createdAt: string | { toDate: () => Date };
  createdBy: string;
}
