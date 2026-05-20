/**
 * jira-connector.ts
 * Jira integration connector for Archii Marketplace.
 *
 * Supports:
 *   - API Key / Basic Auth authentication
 *   - Create, update, and get Jira issues
 *   - Bidirectional task sync (Archii ↔ Jira)
 *   - Webhook receiver for Jira events
 *
 * Auth: email + API token (Basic Auth)
 */

import {
  registerConnector,
  type IntegrationConnector,
} from '../marketplace-service';

/* ================================================================
   TYPES
   ================================================================ */

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
}

export interface JiraIssueData {
  summary: string;
  description?: string;
  issueType?: string;
  priority?: string;
  assignee?: string;
  dueDate?: string;
  labels?: string[];
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: string;
    status: { name: string };
    issuetype: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string; emailAddress: string };
    duedate?: string;
    labels?: string[];
    created: string;
    updated: string;
  };
}

/* ================================================================
   JIRA API CLIENT
   ================================================================ */

function buildHeaders(config: JiraConfig): HeadersInit {
  const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  return {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

function buildUrl(config: JiraConfig, path: string): string {
  const base = config.baseUrl.replace(/\/+$/, '');
  return `${base}/rest/api/3${path}`;
}

/**
 * Make a request to the Jira API.
 */
async function jiraRequest<T>(
  config: JiraConfig,
  method: string,
  path: string,
  body?: any
): Promise<T> {
  const url = buildUrl(config, path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method,
      headers: buildHeaders(config),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Jira API ${response.status}: ${errorText.slice(0, 300)}`);
    }

    return response.json() as T;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Timeout conectando a Jira');
    }
    throw err;
  }
}

/* ================================================================
   CRUD OPERATIONS
   ================================================================ */

/**
 * Create a new issue in Jira.
 */
export async function createJiraIssue(
  config: JiraConfig,
  issueData: JiraIssueData
): Promise<{ id: string; key: string; self: string }> {
  const payload: any = {
    fields: {
      project: { key: config.projectKey },
      summary: issueData.summary,
      issuetype: { name: issueData.issueType || 'Task' },
    },
  };

  if (issueData.description) {
    payload.fields.description = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: issueData.description }],
      }],
    };
  }

  if (issueData.priority) {
    const priorityMap: Record<string, string> = {
      Alta: 'Highest',
      Media: 'Medium',
      Baja: 'Low',
    };
    payload.fields.priority = { name: priorityMap[issueData.priority] || issueData.priority };
  }

  if (issueData.assignee) {
    payload.fields.assignee = { accountId: issueData.assignee };
  }

  if (issueData.dueDate) {
    payload.fields.duedate = issueData.dueDate;
  }

  if (issueData.labels?.length) {
    payload.fields.labels = issueData.labels;
  }

  const result = await jiraRequest<{ id: string; key: string; self: string }>(
    config, 'POST', '/issue', payload
  );

  return { id: result.id, key: result.key, self: result.self };
}

/**
 * Update an existing Jira issue.
 */
export async function updateJiraIssue(
  config: JiraConfig,
  issueKey: string,
  updateData: Partial<JiraIssueData>
): Promise<void> {
  const fields: any = {};

  if (updateData.summary) fields.summary = updateData.summary;
  if (updateData.priority) {
    const priorityMap: Record<string, string> = {
      Alta: 'Highest',
      Media: 'Medium',
      Baja: 'Low',
    };
    fields.priority = { name: priorityMap[updateData.priority] || updateData.priority };
  }
  if (updateData.dueDate) fields.duedate = updateData.dueDate;

  if (updateData.description) {
    fields.description = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: updateData.description }],
      }],
    };
  }

  if (Object.keys(fields).length > 0) {
    await jiraRequest(config, 'PUT', `/issue/${issueKey}`, { fields });
  }
}

/**
 * Get a Jira issue by key.
 */
export async function getJiraIssue(
  config: JiraConfig,
  issueKey: string
): Promise<JiraIssue> {
  return jiraRequest<JiraIssue>(config, 'GET', `/issue/${issueKey}`);
}

/* ================================================================
   MAPPERS (Archii ↔ Jira)
   ================================================================ */

/**
 * Map an Archii task to a Jira issue format.
 */
export function formatArchiiToJira(task: {
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  dueDate?: string;
  tags?: string[];
}): JiraIssueData {
  return {
    summary: `[Archii] ${task.title}`,
    description: task.description || '',
    priority: task.priority || 'Media',
    issueType: 'Task',
    dueDate: task.dueDate,
    labels: (task.tags || []).concat('archii'),
  };
}

/**
 * Map a Jira issue to an Archii task format.
 */
export function formatJiraToArchii(jiraIssue: JiraIssue): {
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  dueDate?: string;
  tags?: string[];
  externalKey: string;
} {
  const statusMap: Record<string, string> = {
    'To Do': 'Por hacer',
    'In Progress': 'En progreso',
    'In Review': 'Revision',
    'Done': 'Completado',
  };

  const priorityMap: Record<string, string> = {
    'Highest': 'Alta',
    'High': 'Alta',
    'Medium': 'Media',
    'Low': 'Baja',
    'Lowest': 'Baja',
  };

  return {
    title: jiraIssue.fields.summary.replace(/^\[Archii\]\s*/, ''),
    description: jiraIssue.fields.description && typeof jiraIssue.fields.description === 'object'
      ? (jiraIssue.fields.description as any).content
          ?.map((c: any) => c.content?.map((t: any) => t.text).join('') || '')
          .join('\n') || ''
      : typeof jiraIssue.fields.description === 'string'
        ? jiraIssue.fields.description
        : undefined,
    priority: priorityMap[jiraIssue.fields.priority?.name || ''] || 'Media',
    status: statusMap[jiraIssue.fields.status?.name || ''] || 'Por hacer',
    dueDate: jiraIssue.fields.duedate || undefined,
    tags: jiraIssue.fields.labels?.filter((l: string) => l !== 'archii'),
    externalKey: jiraIssue.key,
  };
}

/* ================================================================
   BIDIRECTIONAL SYNC
   ================================================================ */

/**
 * Sync a task from Archii to Jira.
 * If the task has a jiraIssueKey, it updates; otherwise creates.
 */
export async function syncTaskToJira(
  task: {
    title: string;
    description?: string;
    priority?: string;
    status?: string;
    dueDate?: string;
    tags?: string[];
    jiraIssueKey?: string;
  },
  jiraConfig: JiraConfig
): Promise<{ key: string; created: boolean }> {
  const issueData = formatArchiiToJira(task);

  if (task.jiraIssueKey) {
    await updateJiraIssue(jiraConfig, task.jiraIssueKey, issueData);
    return { key: task.jiraIssueKey, created: false };
  }

  const result = await createJiraIssue(jiraConfig, issueData);
  return { key: result.key, created: true };
}

/**
 * Handle inbound Jira webhook events.
 * Parses the Jira webhook payload and returns a normalized event.
 */
export function handleJiraWebhook(payload: any): {
  event: string;
  issueKey: string;
  issue: any;
} | null {
  const webhookEvent = payload.webhookEvent; // e.g. 'jira:issue_created', 'jira:issue_updated'
  if (!webhookEvent) return null;

  const issue = payload.issue;
  if (!issue) return null;

  const eventMap: Record<string, string> = {
    'jira:issue_created': 'task.created',
    'jira:issue_updated': 'task.updated',
    'jira:issue_deleted': 'task.deleted',
  };

  return {
    event: eventMap[webhookEvent] || 'task.updated',
    issueKey: issue.key,
    issue,
  };
}

/* ================================================================
   CONNECTOR IMPLEMENTATION
   ================================================================ */

const jiraConnector: IntegrationConnector = {
  async dispatch(config, event, payload) {
    const jiraConfig = config as unknown as JiraConfig;
    const taskData = formatArchiiToJira(payload as any);

    switch (event) {
      case 'task.created': {
        const result = await createJiraIssue(jiraConfig, taskData);
        break;
      }
      case 'task.updated': {
        if (payload.jiraIssueKey) {
          await updateJiraIssue(jiraConfig, payload.jiraIssueKey, taskData);
        }
        break;
      }
      case 'task.completed': {
        if (payload.jiraIssueKey) {
          // Transition to Done
          await jiraRequest(jiraConfig, 'POST', `/issue/${payload.jiraIssueKey}/transitions`, {
            transition: { id: '31' }, // Typically 'Done' transition ID
          });
        }
        break;
      }
      default:
        break;
    }
  },

  async test(config) {
    try {
      const jiraConfig = config as unknown as JiraConfig;
      const response = await jiraRequest<{ name: string }>(
        jiraConfig, 'GET', '/myself'
      );
      return {
        success: true,
        message: `Conectado como ${response.name || config.email}`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Error: ${err?.message}`,
      };
    }
  },
};

// Auto-register the connector
registerConnector('jira', jiraConnector);
