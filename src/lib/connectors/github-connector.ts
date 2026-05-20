/**
 * github-connector.ts
 * GitHub integration connector for Archii Marketplace.
 *
 * Supports:
 *   - Personal Access Token authentication
 *   - Create, update GitHub issues
 *   - Comment on pull requests
 *   - Get repository info
 *   - Webhook receiver for GitHub events (push, issues, pull_request)
 *   - Map Archii tasks to GitHub issues
 *
 * Auth: Personal Access Token
 */

import {
  registerConnector,
  type IntegrationConnector,
} from '../marketplace-service';

/* ================================================================
   TYPES
   ================================================================ */

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface GitHubIssueData {
  title: string;
  body?: string;
  assignees?: string[];
  labels?: string[];
  milestone?: number;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  labels: { name: string; color: string }[];
  assignees: { login: string }[];
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubPRComment {
  id: number;
  body: string;
  user: { login: string };
  created_at: string;
  html_url: string;
}

/* ================================================================
   GITHUB API CLIENT
   ================================================================ */

function buildHeaders(config: GitHubConfig): HeadersInit {
  return {
    'Authorization': `token ${config.token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'Archii-Marketplace/1.0',
  };
}

function buildApiUrl(config: GitHubConfig, path: string): string {
  return `https://api.github.com/repos/${config.owner}/${config.repo}${path}`;
}

async function githubRequest<T>(
  config: GitHubConfig,
  method: string,
  path: string,
  body?: any
): Promise<T> {
  const url = buildApiUrl(config, path);
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
      throw new Error(`GitHub API ${response.status}: ${errorText.slice(0, 300)}`);
    }

    // Some endpoints return 204 No Content
    if (response.status === 204) return undefined as T;
    return response.json() as T;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Timeout conectando a GitHub');
    }
    throw err;
  }
}

/* ================================================================
   CRUD OPERATIONS
   ================================================================ */

/**
 * Create a new GitHub issue.
 */
export async function createGitHubIssue(
  config: GitHubConfig,
  issueData: GitHubIssueData
): Promise<GitHubIssue> {
  return githubRequest<GitHubIssue>(config, 'POST', '/issues', issueData);
}

/**
 * Update an existing GitHub issue.
 */
export async function updateGitHubIssue(
  config: GitHubConfig,
  issueNumber: number,
  updateData: Partial<GitHubIssueData> & { state?: 'open' | 'closed' }
): Promise<GitHubIssue> {
  return githubRequest<GitHubIssue>(
    config, 'PATCH', `/issues/${issueNumber}`, updateData
  );
}

/**
 * Create a comment on a pull request or issue.
 */
export async function createPRComment(
  config: GitHubConfig,
  prNumber: number,
  comment: string
): Promise<GitHubPRComment> {
  return githubRequest<GitHubPRComment>(
    config, 'POST', `/issues/${prNumber}/comments`, { body: comment }
  );
}

/**
 * Get repository info.
 */
export async function getRepoInfo(
  config: GitHubConfig
): Promise<{ full_name: string; description: string; private: boolean; html_url: string }> {
  return githubRequest(config, 'GET', '');
}

/* ================================================================
   MAPPERS (Archii ↔ GitHub)
   ================================================================ */

const PRIORITY_LABELS: Record<string, string> = {
  Alta: 'priority: high',
  Media: 'priority: medium',
  Baja: 'priority: low',
};

const STATUS_LABELS: Record<string, string> = {
  'Por hacer': 'status: todo',
  'En progreso': 'status: in progress',
  'Revision': 'status: review',
  'Completado': 'status: done',
};

/**
 * Map an Archii task to a GitHub issue format.
 */
export function formatArchiiToGitHubIssue(task: {
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  dueDate?: string;
  tags?: string[];
  projectId?: string;
  projectName?: string;
}): GitHubIssueData {
  const labels: string[] = ['archii'];

  if (task.priority && PRIORITY_LABELS[task.priority]) {
    labels.push(PRIORITY_LABELS[task.priority]);
  }
  if (task.status && STATUS_LABELS[task.status]) {
    labels.push(STATUS_LABELS[task.status]);
  }
  if (task.tags?.length) {
    labels.push(...task.tags.slice(0, 5));
  }

  let body = '';
  if (task.description) body += `${task.description}\n\n`;
  if (task.projectName) body += `**Proyecto:** ${task.projectName}\n`;
  if (task.dueDate) body += `**Fecha límite:** ${task.dueDate}\n`;
  body += `\n---\n*Sincronizado desde Archii*`;

  return {
    title: `[Archii] ${task.title}`,
    body: body.trim() || undefined,
    labels,
  };
}

/**
 * Map a GitHub issue to an Archii task format.
 */
export function formatGitHubToArchii(issue: GitHubIssue): {
  title: string;
  description?: string;
  status: string;
  priority?: string;
  tags?: string[];
  externalKey: string;
  externalUrl: string;
} {
  // Reverse label mapping
  const reversePriority: Record<string, string> = {
    'priority: high': 'Alta',
    'priority: medium': 'Media',
    'priority: low': 'Baja',
  };

  const reverseStatus: Record<string, string> = {
    'status: todo': 'Por hacer',
    'status: in progress': 'En progreso',
    'status: review': 'Revision',
    'status: done': 'Completado',
  };

  const allLabels = issue.labels.map((l) => l.name);
  const priority = allLabels
    .map((l) => reversePriority[l])
    .find(Boolean) || 'Media';
  const status = allLabels
    .map((l) => reverseStatus[l])
    .find(Boolean) || (issue.state === 'closed' ? 'Completado' : 'Por hacer');
  const tags = allLabels.filter((l) => !l.startsWith('status:') && !l.startsWith('priority:') && l !== 'archii');

  return {
    title: issue.title.replace(/^\[Archii\]\s*/, ''),
    description: issue.body || undefined,
    status,
    priority,
    tags,
    externalKey: String(issue.number),
    externalUrl: issue.html_url,
  };
}

/* ================================================================
   WEBHOOK RECEIVER
   ================================================================ */

/**
 * Parse an inbound GitHub webhook event.
 */
export function handleGitHubWebhook(
  headers: Headers,
  payload: any
): { event: string; action: string; data: any } | null {
  const eventType = headers.get('x-github-event');
  if (!eventType) return null;

  const action = payload.action || '';

  const eventMap: Record<string, string> = {
    push: 'task.updated',
    issues: 'task.updated',
    pull_request: 'task.updated',
    issue_comment: 'comment.created',
  };

  return {
    event: eventMap[eventType] || 'task.updated',
    action,
    data: payload,
  };
}

/**
 * Verify GitHub webhook signature using SHA-256 (SEC-M08 fix).
 * GitHub now supports X-Hub-Signature-256 which uses HMAC-SHA256.
 * Also added length check before timingSafeEqual to prevent unhandled exceptions.
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto');
  // Prefer SHA-256; fall back to SHA-1 for legacy webhooks
  let expected: string;
  if (signature.startsWith('sha256=')) {
    expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  } else if (signature.startsWith('sha1=')) {
    expected = 'sha1=' + crypto.createHmac('sha1', secret).update(payload).digest('hex');
  } else {
    return false;
  }

  // Length check to prevent timingSafeEqual exception on mismatched lengths
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

/* ================================================================
   CONNECTOR IMPLEMENTATION
   ================================================================ */

const githubConnector: IntegrationConnector = {
  async dispatch(config, event, payload) {
    const ghConfig = config as unknown as GitHubConfig;

    switch (event) {
      case 'task.created': {
        const issueData = formatArchiiToGitHubIssue(payload as any);
        const issue = await createGitHubIssue(ghConfig, issueData);
        break;
      }
      case 'task.updated': {
        if (payload.githubIssueNumber) {
          const issueData = formatArchiiToGitHubIssue(payload as any);
          await updateGitHubIssue(ghConfig, Number(payload.githubIssueNumber), {
            title: issueData.title,
            body: issueData.body,
            labels: issueData.labels,
          });
        }
        break;
      }
      case 'task.completed': {
        if (payload.githubIssueNumber) {
          await updateGitHubIssue(ghConfig, Number(payload.githubIssueNumber), {
            state: 'closed',
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
      const ghConfig = config as unknown as GitHubConfig;
      const repo = await getRepoInfo(ghConfig);
      return {
        success: true,
        message: `Conectado a ${repo.full_name} (${repo.private ? 'privado' : 'público'})`,
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
registerConnector('github', githubConnector);
