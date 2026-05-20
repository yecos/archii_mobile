/**
 * slack-connector.ts
 * Slack integration connector for Archii Marketplace.
 *
 * Supports:
 *   - Incoming Webhook (primary): send rich Block Kit messages to channels
 *   - Event formatting for tasks, projects, and expenses
 *   - Test connection endpoint
 *
 * Auth: webhook URL (incoming webhook, no bot required)
 */

import {
  registerConnector,
  type IntegrationConnector,
} from '../marketplace-service';

/* ================================================================
   BLOCK KIT HELPERS
   ================================================================ */

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: { type: string; text: string; emoji?: boolean }[];
  elements?: any[];
  accessory?: any;
}

interface SlackAttachment {
  color: string;
  blocks: SlackBlock[];
}

/**
 * Build a header block with the Archii branding.
 */
function headerBlock(text: string): SlackBlock {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: `*${text}*` },
  };
}

/**
 * Build a divider block.
 */
function dividerBlock(): SlackBlock {
  return { type: 'divider' };
}

/**
 * Build a fields block (up to 2 columns per row).
 */
function fieldsBlock(fields: { label: string; value: string }[]): SlackBlock {
  return {
    type: 'section',
    fields: fields.flatMap((f) => [
      { type: 'mrkdwn', text: `*${f.label}:*\n${f.value}` },
    ]),
  };
}

/**
 * Build an action button block.
 */
function actionsBlock(elements: any[]): SlackBlock {
  return { type: 'actions', elements };
}

/* ================================================================
   EVENT FORMATTERS
   ================================================================ */

/**
 * Format a task event into a Slack Block Kit payload.
 */
export function formatTaskEvent(
  event: string,
  task: {
    id: string;
    title: string;
    description?: string;
    priority?: string;
    status?: string;
    dueDate?: string;
    projectId?: string;
    projectName?: string;
    assigneeName?: string;
  }
): { blocks: SlackBlock[]; color: string } {
  const eventLabels: Record<string, string> = {
    'task.created': 'Nueva Tarea',
    'task.updated': 'Tarea Actualizada',
    'task.completed': 'Tarea Completada',
  };

  const priorityEmoji: Record<string, string> = {
    Alta: '🔴',
    Media: '🟡',
    Baja: '🟢',
  };

  const statusEmoji: Record<string, string> = {
    'Por hacer': '⬜',
    'En progreso': '🔵',
    'Revision': '🟡',
    'Completado': '✅',
  };

  const colors: Record<string, string> = {
    'task.created': '#36a64f',
    'task.updated': '#f2c744',
    'task.completed': '#2eb67d',
  };

  const blocks: SlackBlock[] = [
    headerBlock(`${eventLabels[event] || event} — Archii`),
    dividerBlock(),
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${task.title}*`,
      },
    },
  ];

  if (task.description) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `> ${task.description.slice(0, 300)}`,
      },
    });
  }

  const fields: { label: string; value: string }[] = [];
  if (task.priority) fields.push({ label: 'Prioridad', value: `${priorityEmoji[task.priority] || ''} ${task.priority}` });
  if (task.status) fields.push({ label: 'Estado', value: `${statusEmoji[task.status] || ''} ${task.status}` });
  if (task.dueDate) fields.push({ label: 'Fecha límite', value: `📅 ${task.dueDate}` });
  if (task.assigneeName) fields.push({ label: 'Asignado', value: `👤 ${task.assigneeName}` });
  if (task.projectName) fields.push({ label: 'Proyecto', value: `📁 ${task.projectName}` });

  if (fields.length > 0) {
    blocks.push(fieldsBlock(fields));
  }

  return {
    blocks,
    color: colors[event] || '#36a64f',
  };
}

/**
 * Format a project event into a Slack Block Kit payload.
 */
export function formatProjectEvent(
  event: string,
  project: {
    id: string;
    name: string;
    status?: string;
    progress?: number;
    client?: string;
    location?: string;
  }
): { blocks: SlackBlock[]; color: string } {
  const eventLabels: Record<string, string> = {
    'project.created': 'Nuevo Proyecto',
    'project.updated': 'Proyecto Actualizado',
    'project.completed': 'Proyecto Completado',
  };

  const blocks: SlackBlock[] = [
    headerBlock(`${eventLabels[event] || event} — Archii`),
    dividerBlock(),
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📁 ${project.name}*`,
      },
    },
  ];

  const fields: { label: string; value: string }[] = [];
  if (project.status) fields.push({ label: 'Estado', value: project.status });
  if (project.progress !== undefined) {
    const bar = '█'.repeat(Math.round(project.progress / 10)) + '░'.repeat(10 - Math.round(project.progress / 10));
    fields.push({ label: 'Progreso', value: `${bar} ${project.progress}%` });
  }
  if (project.client) fields.push({ label: 'Cliente', value: `🤝 ${project.client}` });
  if (project.location) fields.push({ label: 'Ubicación', value: `📍 ${project.location}` });

  if (fields.length > 0) {
    blocks.push(fieldsBlock(fields));
  }

  return {
    blocks,
    color: event === 'project.completed' ? '#2eb67d' : '#611f69',
  };
}

/**
 * Format an expense event for Slack.
 */
export function formatExpenseEvent(
  event: string,
  expense: {
    concept: string;
    amount: number;
    category: string;
    projectName?: string;
    date: string;
  }
): { blocks: SlackBlock[]; color: string } {
  const blocks: SlackBlock[] = [
    headerBlock('Nuevo Gasto Registrado — Archii'),
    dividerBlock(),
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${expense.concept}*`,
      },
    },
    fieldsBlock([
      { label: 'Monto', value: `💰 $${expense.amount.toLocaleString('es-CO')}` },
      { label: 'Categoría', value: `🏷️ ${expense.category}` },
      ...(expense.projectName ? [{ label: 'Proyecto', value: `📁 ${expense.projectName}` }] : []),
      { label: 'Fecha', value: `📅 ${expense.date}` },
    ]),
  ];

  return {
    blocks,
    color: '#e01e5a',
  };
}

/* ================================================================
   MESSAGE DISPATCH
   ================================================================ */

/**
 * Send a message to a Slack channel via Incoming Webhook.
 */
export async function sendSlackMessage(
  webhookUrl: string,
  payload: { blocks: SlackBlock[]; color?: string; text?: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!webhookUrl?.startsWith('https://hooks.slack.com/')) {
    return { ok: false, error: 'URL de webhook inválida' };
  }

  const body: any = {
    blocks: payload.blocks,
    text: payload.text || 'Notificación de Archii',
  };

  if (payload.color) {
    body.attachments = [{ color: payload.color, blocks: [] }];
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const responseBody = await response.text();

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}: ${responseBody.slice(0, 200)}` };
    }

    const parsed = JSON.parse(responseBody);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error || 'Slack rejected the message' };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Error de conexión' };
  }
}

/* ================================================================
   CONNECTOR IMPLEMENTATION
   ================================================================ */

const slackConnector: IntegrationConnector = {
  async dispatch(config, event, payload) {
    const webhookUrl = config.webhookUrl;
    if (!webhookUrl) {
      throw new Error('Slack webhook URL no configurada');
    }

    let formatted: { blocks: SlackBlock[]; color: string; text?: string };

    switch (event) {
      case 'task.created':
      case 'task.updated':
      case 'task.completed':
        formatted = formatTaskEvent(event, payload as any);
        break;

      case 'project.updated':
      case 'project.created':
        formatted = formatProjectEvent(event, payload as any);
        break;

      case 'expense.created':
        formatted = formatExpenseEvent(event, payload as any);
        break;

      default:
        formatted = {
          blocks: [
            headerBlock(`Evento: ${event}`),
            dividerBlock(),
            {
              type: 'section',
              text: { type: 'mrkdwn', text: '```' + JSON.stringify(payload, null, 2).slice(0, 1500) + '```' },
            },
          ],
          color: '#611f69',
        };
    }

    const result = await sendSlackMessage(webhookUrl, formatted);
    if (!result.ok) {
      throw new Error(result.error || 'Error enviando a Slack');
    }
  },

  async test(config) {
    const webhookUrl = config.webhookUrl;
    if (!webhookUrl) {
      return { success: false, message: 'Webhook URL no configurada' };
    }

    const testPayload = {
      blocks: [
        headerBlock('Prueba de Conexión — Archii'),
        dividerBlock(),
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '✅ *Conexión exitosa!* Tu integración con Slack está funcionando correctamente.',
          },
        },
      ],
      color: '#2eb67d',
    };

    const result = await sendSlackMessage(webhookUrl, testPayload);
    return {
      success: result.ok,
      message: result.ok ? 'Mensaje de prueba enviado correctamente' : `Error: ${result.error}`,
    };
  },
};

// Auto-register the connector
registerConnector('slack', slackConnector);
