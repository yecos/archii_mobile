// ============================================================================
// Archii SDK - Complete TypeScript Types
// ============================================================================

// ---- SDK Version ----
export const SDK_VERSION = '1.0.0';

// ---- Enums ----

export enum ProjectStatus {
  Planning = 'planning',
  Active = 'active',
  OnHold = 'on_hold',
  Completed = 'completed',
  Cancelled = 'cancelled',
  Archived = 'archived',
}

export enum TaskStatus {
  Todo = 'todo',
  InProgress = 'in_progress',
  InReview = 'in_review',
  Blocked = 'blocked',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

export enum TaskPriority {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
  None = 'none',
}

export enum ExpenseStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
  Paid = 'paid',
  Refunded = 'refunded',
}

export enum ExpenseCategory {
  Materials = 'materials',
  Labor = 'labor',
  Equipment = 'equipment',
  Subcontractor = 'subcontractor',
  Travel = 'travel',
  Permits = 'permits',
  Insurance = 'insurance',
  Overhead = 'overhead',
  Other = 'other',
}

export enum RFIStatus {
  Draft = 'draft',
  Submitted = 'submitted',
  UnderReview = 'under_review',
  Answered = 'answered',
  Closed = 'closed',
}

export enum RFIPriority {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export enum SubmittalStatus {
  Draft = 'draft',
  Submitted = 'submitted',
  UnderReview = 'under_review',
  Approved = 'approved',
  ApprovedAsNoted = 'approved_as_noted',
  Rejected = 'rejected',
  ReviseAndResubmit = 'revise_and_resubmit',
  Returned = 'returned',
}

export enum InvoiceStatus {
  Draft = 'draft',
  Submitted = 'submitted',
  Approved = 'approved',
  PartiallyPaid = 'partially_paid',
  Paid = 'paid',
  Overdue = 'overdue',
  Cancelled = 'cancelled',
}

export enum PunchItemPriority {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export enum PunchItemStatus {
  Open = 'open',
  InProgress = 'in_progress',
  Resolved = 'resolved',
  Verified = 'verified',
  Closed = 'closed',
}

export enum WebhookEvent {
  // Project events
  ProjectCreated = 'project.created',
  ProjectUpdated = 'project.updated',
  ProjectDeleted = 'project.deleted',
  ProjectStatusChanged = 'project.status_changed',

  // Task events
  TaskCreated = 'task.created',
  TaskUpdated = 'task.updated',
  TaskDeleted = 'task.deleted',
  TaskStatusChanged = 'task.status_changed',
  TaskAssigned = 'task.assigned',

  // Expense events
  ExpenseCreated = 'expense.created',
  ExpenseUpdated = 'expense.updated',
  ExpenseDeleted = 'expense.deleted',
  ExpenseStatusChanged = 'expense.status_changed',

  // RFI events
  RFICreated = 'rfi.created',
  RFIUpdated = 'rfi.updated',
  RFIAnswered = 'rfi.answered',
  RFIClosed = 'rfi.closed',

  // Submittal events
  SubmittalCreated = 'submittal.created',
  SubmittalUpdated = 'submittal.updated',
  SubmittalApproved = 'submittal.approved',
  SubmittalRejected = 'submittal.rejected',
}

export enum IntegrationProvider {
  Procore = 'procore',
  PlanGrid = 'plangrid',
  BIM360 = 'bim360',
  Fieldwire = 'fieldwire',
  Bluebeam = 'bluebeam',
  Sage = 'sage',
  QuickBooks = 'quickbooks',
  Oracle = 'oracle',
  SharePoint = 'sharepoint',
  OneDrive = 'onedrive',
  GoogleDrive = 'google_drive',
}

// ---- Configuration Types ----

export interface ArchiiConfig {
  /** API key for authentication */
  apiKey: string;
  /** Base URL of the Archii API (default: https://api.archii.io) */
  baseUrl?: string;
  /** Tenant ID for multi-tenant mode */
  tenantId?: string;
  /** Optional webhook signing secret */
  webhookSecret?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum retry attempts for transient errors (default: 3) */
  maxRetries?: number;
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
  /** Enable request/response logging */
  debug?: boolean;
}

export interface ListParams {
  /** Page number, starting from 1 (default: 1) */
  page?: number;
  /** Number of items per page (default: 20, max: 100) */
  pageSize?: number;
  /** Field to sort by (e.g. 'createdAt', 'name') */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Full-text search query */
  search?: string;
  /** Comma-separated list of fields to include */
  fields?: string;
}

export interface TaskFilters {
  /** Filter by task status */
  status?: TaskStatus | TaskStatus[];
  /** Filter by priority */
  priority?: TaskPriority | TaskPriority[];
  /** Filter by assignee ID */
  assigneeId?: string;
  /** Filter by project ID */
  projectId?: string;
  /** Filter by due date range start */
  dueDateFrom?: string;
  /** Filter by due date range end */
  dueDateTo?: string;
  /** Filter by tag */
  tag?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ---- Core Entity Types ----

export interface Project {
  id: string;
  name: string;
  description?: string;
  code?: string;
  status: ProjectStatus;
  startDate?: string;
  endDate?: string;
  budget?: number;
  spent?: number;
  address?: string;
  latitude?: number;
  longitude?: number;
  ownerId?: string;
  memberIds?: string[];
  tags?: string[];
  coverImage?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface CreateProjectDTO {
  name: string;
  description?: string;
  code?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  address?: string;
  latitude?: number;
  longitude?: number;
  ownerId?: string;
  memberIds?: string[];
  tags?: string[];
  coverImage?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectDTO {
  name?: string;
  description?: string;
  code?: string;
  status?: ProjectStatus;
  startDate?: string;
  endDate?: string;
  budget?: number;
  address?: string;
  latitude?: number;
  longitude?: number;
  ownerId?: string;
  memberIds?: string[];
  tags?: string[];
  coverImage?: string;
  metadata?: Record<string, unknown>;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  reporterId?: string;
  dueDate?: string;
  startDate?: string;
  completedDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  tags?: string[];
  attachments?: string[];
  subtasks?: Task[];
  comments?: number;
  phase?: string;
  location?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskDTO {
  projectId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  reporterId?: string;
  dueDate?: string;
  startDate?: string;
  estimatedHours?: number;
  tags?: string[];
  attachments?: string[];
  phase?: string;
  location?: string;
}

export interface UpdateTaskDTO {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  reporterId?: string;
  dueDate?: string;
  startDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  tags?: string[];
  attachments?: string[];
  phase?: string;
  location?: string;
}

export interface Expense {
  id: string;
  projectId: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  status: ExpenseStatus;
  vendor?: string;
  invoiceRef?: string;
  date: string;
  receiptUrl?: string;
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdBy: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseDTO {
  projectId: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  vendor?: string;
  invoiceRef?: string;
  date: string;
  receiptUrl?: string;
  notes?: string;
  tags?: string[];
}

export interface UpdateExpenseDTO {
  description?: string;
  amount?: number;
  category?: ExpenseCategory;
  status?: ExpenseStatus;
  vendor?: string;
  invoiceRef?: string;
  date?: string;
  receiptUrl?: string;
  notes?: string;
  tags?: string[];
}

export interface RFI {
  id: string;
  projectId: string;
  number: string;
  title: string;
  description: string;
  status: RFIStatus;
  priority: RFIPriority;
  assignedTo?: string;
  dueDate?: string;
  question?: string;
  answer?: string;
  attachments?: string[];
  submittedBy: string;
  submittedAt?: string;
  answeredBy?: string;
  answeredAt?: string;
  closedBy?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRFIDTO {
  projectId: string;
  title: string;
  description: string;
  priority?: RFIPriority;
  assignedTo?: string;
  dueDate?: string;
  question?: string;
  attachments?: string[];
}

export interface UpdateRFIDTO {
  title?: string;
  description?: string;
  status?: RFIStatus;
  priority?: RFIPriority;
  assignedTo?: string;
  dueDate?: string;
  question?: string;
  answer?: string;
  attachments?: string[];
}

export interface Submittal {
  id: string;
  projectId: string;
  number: string;
  title: string;
  description?: string;
  status: SubmittalStatus;
  submittalType?: string;
  specificationSection?: string;
  submittedBy: string;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  dueDate?: string;
  attachments?: string[];
  comments?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubmittalDTO {
  projectId: string;
  title: string;
  description?: string;
  submittalType?: string;
  specificationSection?: string;
  dueDate?: string;
  attachments?: string[];
}

export interface PunchItem {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: PunchItemStatus;
  priority: PunchItemPriority;
  assigneeId?: string;
  location?: string;
  dueDate?: string;
  completedDate?: string;
  photos?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  projectId: string;
  number: string;
  supplierId: string;
  amount: number;
  tax?: number;
  total: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate?: string;
  paidDate?: string;
  description?: string;
  lineItems?: InvoiceLineItem[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  category?: string;
  rating?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Health Score ----

export interface HealthScore {
  projectId: string;
  overall: number;
  schedule: number;
  budget: number;
  quality: number;
  safety: number;
  rfis: number;
  submittals: number;
  tasks: number;
  calculatedAt: string;
  previous?: number;
  trend?: 'improving' | 'stable' | 'declining';
}

export interface HealthScoreHistory {
  projectId: string;
  scores: HealthScore[];
  period: string;
}

// ---- Webhook Types ----

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt?: string;
  successCount: number;
  failureCount: number;
}

export interface WebhookTestResult {
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
  responseBody?: string;
}

export interface WebhookPayload<T = unknown> {
  id: string;
  event: WebhookEvent;
  timestamp: string;
  data: T;
  previousData?: Partial<T>;
  projectId?: string;
  tenantId?: string;
  signature?: string;
}

// ---- API Keys ----

export interface APIKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

export interface APIKeyCreated {
  id: string;
  name: string;
  key: string;
  prefix: string;
  scopes: string[];
  expiresAt?: string;
  warning: string;
}

// ---- Auth ----

export interface AuthStatus {
  isAuthenticated: boolean;
  method: 'api_key' | 'token' | 'none';
  tenantId?: string;
  scopes?: string[];
  expiresAt?: string;
}

// ---- BI / Export ----

export interface ExportOptions {
  format?: 'csv' | 'json' | 'xlsx';
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
  filters?: Record<string, unknown>;
  includeHeaders?: boolean;
  locale?: string;
  timezone?: string;
}

export interface BISchema {
  collections: BICollection[];
  relationships: BIRelationship[];
  metadata: {
    version: string;
    generatedAt: string;
    totalCollections: number;
  };
}

export interface BICollection {
  name: string;
  description: string;
  fields: BICollectionField[];
  count?: number;
}

export interface BICollectionField {
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
  example?: unknown;
}

export interface BIRelationship {
  from: string;
  to: string;
  type: 'one_to_one' | 'one_to_many' | 'many_to_many';
  foreignKey: string;
}

// ---- Audit Log ----

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName?: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

// ---- Integrations ----

export interface Integration {
  id: string;
  provider: IntegrationProvider;
  name: string;
  isActive: boolean;
  connectedAt?: string;
  lastSyncAt?: string;
  config: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Interceptor Types ----

export type RequestInterceptor = (
  request: RequestInit & { url: string; params?: Record<string, string> }
) => RequestInit & { url: string; params?: Record<string, string> };

export type ResponseInterceptor = (
  response: Response,
  request: RequestInit & { url: string }
) => Response;

export type ErrorInterceptor = (
  error: any, // ArchiiError (imported from errors.ts) — using any to avoid circular dep
  request: RequestInit & { url: string }
) => void;
