// ============================================================================
// Archii SDK - Main Client
// ============================================================================

import { SDK_VERSION } from './types';
import type {
  ArchiiConfig,
  ListParams,
  TaskFilters,
  PaginatedResponse,
  AuthStatus,
  Project,
  CreateProjectDTO,
  UpdateProjectDTO,
  Task,
  CreateTaskDTO,
  UpdateTaskDTO,
  Expense,
  CreateExpenseDTO,
  UpdateExpenseDTO,
  RFI,
  CreateRFIDTO,
  UpdateRFIDTO,
  Submittal,
  CreateSubmittalDTO,
  HealthScore,
  Webhook,
  WebhookTestResult,
  WebhookEvent,
  APIKey,
  APIKeyCreated,
  ExportOptions,
  BISchema,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
} from './types';
import {
  ArchiiError,
  AuthenticationError,
  RateLimitError,
  NetworkError,
  isArchiiError,
} from './errors';
import {
  buildQueryString,
  retryWithBackoff,
  isRetryableStatus,
  sanitizeOutput,
} from './utils';

// ---- User-Agent ----

const DEFAULT_USER_AGENT = `archii-sdk/v${SDK_VERSION}`;
const DEFAULT_BASE_URL = 'https://api.archii.io';
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 3;

// ---- Internal request options ----

interface InternalRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
}

// ============================================================================
// ArchiiClient
// ============================================================================

export class ArchiiClient {
  private readonly config: Required<
    Pick<
      ArchiiConfig,
      'apiKey' | 'baseUrl' | 'timeout' | 'maxRetries' | 'debug'
    > & { tenantId?: string; webhookSecret?: string; headers: Record<string, string> }
  >;

  private authToken?: string;
  private readonly requestInterceptors: RequestInterceptor[] = [];
  private readonly responseInterceptors: ResponseInterceptor[] = [];
  private readonly errorInterceptors: ErrorInterceptor[] = [];

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  constructor(config: ArchiiConfig) {
    if (!config.apiKey) {
      throw new ArchiiError(
        'An API key is required. Pass it via the `apiKey` config option.',
        400,
        'CONFIGURATION_ERROR'
      );
    }

    this.config = {
      apiKey: config.apiKey || '',
      baseUrl: (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''),
      tenantId: config.tenantId || '',
      webhookSecret: config.webhookSecret,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      debug: config.debug ?? false,
      headers: config.headers ?? {},
    };

    this.log('ArchiiClient initialized', {
      baseUrl: this.config.baseUrl,
      tenantId: this.config.tenantId,
    });
  }

  // -------------------------------------------------------------------------
  // Debug logger
  // -------------------------------------------------------------------------

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      // eslint-disable-next-line no-console
      console.log('[archii-sdk]', ...args);
    }
  }

  // -------------------------------------------------------------------------
  // Interceptors
  // -------------------------------------------------------------------------

  /**
   * Add a request interceptor. Interceptors are called in FIFO order.
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add a response interceptor. Interceptors are called in FIFO order.
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Add an error interceptor. Interceptors are called in FIFO order.
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor);
  }

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  /**
   * Set a bearer token for authentication (overrides API key).
   */
  authenticate(token: string): void {
    this.authToken = token;
    this.log('Bearer token authentication set');
  }

  /**
   * Get current authentication status.
   */
  getAuthStatus(): AuthStatus {
    return {
      isAuthenticated: !!(this.authToken || this.config.apiKey),
      method: this.authToken ? 'token' : 'api_key',
      tenantId: this.config.tenantId,
    };
  }

  // =========================================================================
  // Resource Namespaces
  // =========================================================================

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  readonly projects = {
    /**
     * List all projects with optional pagination and filtering.
     */
    list: async (
      params?: ListParams
    ): Promise<PaginatedResponse<Project>> => {
      return this.request<PaginatedResponse<Project>>('GET', '/projects', undefined, params);
    },

    /**
     * Get a single project by ID.
     */
    get: async (id: string): Promise<Project> => {
      return this.request<Project>('GET', `/projects/${encodeURIComponent(id)}`);
    },

    /**
     * Create a new project.
     */
    create: async (data: CreateProjectDTO): Promise<Project> => {
      return this.request<Project>('POST', '/projects', sanitizeOutput(data));
    },

    /**
     * Update an existing project.
     */
    update: async (id: string, data: UpdateProjectDTO): Promise<Project> => {
      return this.request<Project>(
        'PUT',
        `/projects/${encodeURIComponent(id)}`,
        sanitizeOutput(data)
      );
    },

    /**
     * Delete a project.
     */
    delete: async (id: string): Promise<void> => {
      await this.request<void>('DELETE', `/projects/${encodeURIComponent(id)}`);
    },
  };

  // -------------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------------

  readonly tasks = {
    /**
     * List tasks with optional filters (status, priority, assignee, etc.).
     */
    list: async (
      params?: ListParams & TaskFilters
    ): Promise<PaginatedResponse<Task>> => {
      return this.request<PaginatedResponse<Task>>('GET', '/tasks', undefined, params);
    },

    /**
     * Get a single task by ID.
     */
    get: async (id: string): Promise<Task> => {
      return this.request<Task>('GET', `/tasks/${encodeURIComponent(id)}`);
    },

    /**
     * Create a new task.
     */
    create: async (data: CreateTaskDTO): Promise<Task> => {
      return this.request<Task>('POST', '/tasks', sanitizeOutput(data));
    },

    /**
     * Update an existing task.
     */
    update: async (id: string, data: UpdateTaskDTO): Promise<Task> => {
      return this.request<Task>(
        'PUT',
        `/tasks/${encodeURIComponent(id)}`,
        sanitizeOutput(data)
      );
    },

    /**
     * Delete a task.
     */
    delete: async (id: string): Promise<void> => {
      await this.request<void>('DELETE', `/tasks/${encodeURIComponent(id)}`);
    },

    /**
     * Update a task's status.
     */
    updateStatus: async (id: string, status: string): Promise<Task> => {
      return this.request<Task>(
        'PATCH',
        `/tasks/${encodeURIComponent(id)}/status`,
        { status }
      );
    },
  };

  // -------------------------------------------------------------------------
  // Expenses
  // -------------------------------------------------------------------------

  readonly expenses = {
    /**
     * List expenses with optional pagination.
     */
    list: async (
      params?: ListParams
    ): Promise<PaginatedResponse<Expense>> => {
      return this.request<PaginatedResponse<Expense>>('GET', '/expenses', undefined, params);
    },

    /**
     * Create a new expense.
     */
    create: async (data: CreateExpenseDTO): Promise<Expense> => {
      return this.request<Expense>('POST', '/expenses', sanitizeOutput(data));
    },

    /**
     * Update an existing expense.
     */
    update: async (id: string, data: UpdateExpenseDTO): Promise<Expense> => {
      return this.request<Expense>(
        'PUT',
        `/expenses/${encodeURIComponent(id)}`,
        sanitizeOutput(data)
      );
    },

    /**
     * Delete an expense.
     */
    delete: async (id: string): Promise<void> => {
      await this.request<void>('DELETE', `/expenses/${encodeURIComponent(id)}`);
    },
  };

  // -------------------------------------------------------------------------
  // RFIs
  // -------------------------------------------------------------------------

  readonly rfis = {
    /**
     * List RFIs with optional pagination.
     */
    list: async (
      params?: ListParams
    ): Promise<PaginatedResponse<RFI>> => {
      return this.request<PaginatedResponse<RFI>>('GET', '/rfis', undefined, params);
    },

    /**
     * Get a single RFI by ID.
     */
    get: async (id: string): Promise<RFI> => {
      return this.request<RFI>('GET', `/rfis/${encodeURIComponent(id)}`);
    },

    /**
     * Create a new RFI.
     */
    create: async (data: CreateRFIDTO): Promise<RFI> => {
      return this.request<RFI>('POST', '/rfis', sanitizeOutput(data));
    },

    /**
     * Update an existing RFI.
     */
    update: async (id: string, data: UpdateRFIDTO): Promise<RFI> => {
      return this.request<RFI>(
        'PUT',
        `/rfis/${encodeURIComponent(id)}`,
        sanitizeOutput(data)
      );
    },
  };

  // -------------------------------------------------------------------------
  // Submittals
  // -------------------------------------------------------------------------

  readonly submittals = {
    /**
     * List submittals with optional pagination.
     */
    list: async (
      params?: ListParams
    ): Promise<PaginatedResponse<Submittal>> => {
      return this.request<PaginatedResponse<Submittal>>(
        'GET',
        '/submittals',
        undefined,
        params
      );
    },

    /**
     * Get a single submittal by ID.
     */
    get: async (id: string): Promise<Submittal> => {
      return this.request<Submittal>('GET', `/submittals/${encodeURIComponent(id)}`);
    },

    /**
     * Create a new submittal.
     */
    create: async (data: CreateSubmittalDTO): Promise<Submittal> => {
      return this.request<Submittal>('POST', '/submittals', sanitizeOutput(data));
    },
  };

  // -------------------------------------------------------------------------
  // Health Score
  // -------------------------------------------------------------------------

  readonly health = {
    /**
     * Get the current health score for a project.
     */
    getScore: async (projectId: string): Promise<HealthScore> => {
      return this.request<HealthScore>(
        'GET',
        `/health/${encodeURIComponent(projectId)}`
      );
    },

    /**
     * Get health score history for a project.
     */
    getHistory: async (
      projectId: string,
      days: number = 30
    ): Promise<HealthScore[]> => {
      return this.request<HealthScore[]>(
        'GET',
        `/health/${encodeURIComponent(projectId)}/history`,
        undefined,
        { days }
      );
    },

    /**
     * Recalculate health scores for all projects.
     */
    calculateAll: async (): Promise<Record<string, HealthScore>> => {
      return this.request<Record<string, HealthScore>>(
        'POST',
        '/health/calculate'
      );
    },
  };

  // -------------------------------------------------------------------------
  // BI / Export
  // -------------------------------------------------------------------------

  readonly export = {
    /**
     * Export data as CSV.
     */
    csv: async (
      collections: string[],
      options?: ExportOptions
    ): Promise<Blob> => {
      return this.request<Blob>(
        'POST',
        '/export/csv',
        { collections, ...options },
        undefined,
        true
      );
    },

    /**
     * Export data as JSON.
     */
    json: async (
      collections: string[],
      options?: ExportOptions
    ): Promise<unknown> => {
      return this.request<unknown>(
        'POST',
        '/export/json',
        { collections, ...options }
      );
    },

    /**
     * Get the BI data schema.
     */
    schema: async (): Promise<BISchema> => {
      return this.request<BISchema>('GET', '/export/schema');
    },
  };

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  readonly webhooks = {
    /**
     * List all registered webhooks.
     */
    list: async (): Promise<Webhook[]> => {
      return this.request<Webhook[]>('GET', '/webhooks');
    },

    /**
     * Register a new webhook.
     */
    create: async (
      url: string,
      events: WebhookEvent[]
    ): Promise<Webhook> => {
      return this.request<Webhook>('POST', '/webhooks', { url, events });
    },

    /**
     * Delete a webhook.
     */
    delete: async (id: string): Promise<void> => {
      await this.request<void>('DELETE', `/webhooks/${encodeURIComponent(id)}`);
    },

    /**
     * Send a test event to a webhook.
     */
    test: async (id: string): Promise<WebhookTestResult> => {
      return this.request<WebhookTestResult>(
        'POST',
        `/webhooks/${encodeURIComponent(id)}/test`
      );
    },
  };

  // -------------------------------------------------------------------------
  // API Keys
  // -------------------------------------------------------------------------

  readonly keys = {
    /**
     * List all API keys.
     */
    list: async (): Promise<APIKey[]> => {
      return this.request<APIKey[]>('GET', '/keys');
    },

    /**
     * Create a new API key.
     */
    create: async (
      name: string,
      scopes?: string[]
    ): Promise<APIKeyCreated> => {
      return this.request<APIKeyCreated>('POST', '/keys', { name, scopes });
    },

    /**
     * Revoke an API key.
     */
    revoke: async (id: string): Promise<void> => {
      await this.request<void>('DELETE', `/keys/${encodeURIComponent(id)}`);
    },
  };

  // =========================================================================
  // Core Request Engine
  // =========================================================================

  /**
   * Send an HTTP request to the Archii API.
   *
   * @param method - HTTP method
   * @param path - URL path (e.g. '/projects')
   * @param body - Request body (will be JSON-stringified)
   * @param params - Query parameters
   * @param rawResponse - If true, return the raw Blob instead of parsed JSON
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: unknown,
    rawResponse: boolean = false
  ): Promise<T> {
    const queryString = buildQueryString(params);
    const url = `${this.config.baseUrl}/v1${path}${queryString}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'application/json',
      ...this.config.headers,
    };

    // Auth header
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    } else {
      headers['X-API-Key'] = this.config.apiKey;
    }

    // Tenant header
    if (this.config.tenantId) {
      headers['X-Tenant-ID'] = this.config.tenantId;
    }

    const requestBody = body !== undefined ? JSON.stringify(body) : undefined;

    const init: RequestInit & { url: string; params?: Record<string, string> } = {
      url,
      method,
      headers,
      body: requestBody,
    };

    // Apply request interceptors
    const interceptedInit = this.requestInterceptors.reduce(
      (acc, interceptor) => interceptor(acc),
      init
    );

    this.log(`${method} ${interceptedInit.url}`, requestBody ?? '');

    // Execute with retry
    return retryWithBackoff(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout
        );

        let response: Response;
        try {
          response = await fetch(interceptedInit.url, {
            ...interceptedInit,
            signal: controller.signal,
          });
        } catch (fetchError) {
          clearTimeout(timeoutId);
          const error =
            fetchError instanceof Error ? fetchError : new Error(String(fetchError));

          // Abort means timeout
          if (error.name === 'AbortError') {
            throw new NetworkError(
              `Request to ${interceptedInit.url} timed out after ${this.config.timeout}ms`,
              error
            );
          }

          throw new NetworkError(
            `Network error: ${error.message}`,
            error
          );
        }

        clearTimeout(timeoutId);

        // Apply response interceptors
        const interceptedResponse = this.responseInterceptors.reduce(
          (acc, interceptor) => interceptor(acc, interceptedInit),
          response
        );

        // Handle errors
        if (!interceptedResponse.ok) {
          let errorBody: unknown;
          try {
            errorBody = await interceptedResponse.clone().json();
          } catch {
            errorBody = undefined;
          }

          const sdkError = await ArchiiError.fromResponse(
            interceptedResponse,
            errorBody
          );

          // Run error interceptors
          for (const interceptor of this.errorInterceptors) {
            interceptor(sdkError, interceptedInit);
          }

          // Re-throw retryable errors so retryWithBackoff can catch them
          if (isRetryableStatus(interceptedResponse.status)) {
            throw sdkError;
          }

          throw sdkError;
        }

        // Parse response
        return this.handleResponse<T>(interceptedResponse, rawResponse);
      },
      this.config.maxRetries,
      1000,
      (error: Error): boolean => {
        // Only retry on retryable SDK errors or network errors
        if (error instanceof RateLimitError) return true;
        if (error instanceof NetworkError) return true;
        if (isArchiiError(error) && isRetryableStatus(error.statusCode))
          return true;
        return false;
      }
    );
  }

  /**
   * Parse a successful HTTP response.
   */
  private async handleResponse<T>(
    response: Response,
    rawResponse: boolean
  ): Promise<T> {
    if (rawResponse) {
      return response.blob() as unknown as Promise<T>;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as unknown as T;
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const text = await response.text();
      this.log('Response', response.status, text.substring(0, 200));

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ArchiiError(
          `Failed to parse JSON response from ${response.url}`,
          502,
          'JSON_PARSE_ERROR'
        );
      }
    }

    // Fallback: return text
    return response.text() as unknown as Promise<T>;
  }
}
