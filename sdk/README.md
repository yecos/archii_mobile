# archii-sdk

**Official TypeScript SDK for the Archii Construction Management API.**

## Installation

```bash
npm install archii-sdk
```

```bash
yarn add archii-sdk
```

```bash
pnpm add archii-sdk
```

---

## Quick Start

```typescript
import { ArchiiClient } from 'archii-sdk';

const client = new ArchiiClient({
  apiKey: 'your-api-key-here',
  // baseUrl: 'https://api.archii.io',  // default
  // tenantId: 'tenant-abc123',          // optional, for multi-tenant
});

async function main() {
  // Fetch all projects
  const projects = await client.projects.list();
  console.log(`Found ${projects.pagination.total} projects`);

  // Create a new task
  const task = await client.tasks.create({
    projectId: 'proj-123',
    title: 'Install electrical conduit',
    priority: 'high',
    status: 'todo',
    dueDate: '2025-03-15',
  });
  console.log('Task created:', task.id);
}
```

---

## Authentication

The SDK supports two authentication methods:

### API Key (default)

Pass your API key in the constructor. It will be sent as `X-API-Key` header:

```typescript
const client = new ArchiiClient({
  apiKey: 'af_live_xxxxxxxxxxxxxxxx',
});
```

### Bearer Token

If you have a JWT or OAuth token, use `authenticate()`:

```typescript
const client = new ArchiiClient({
  apiKey: 'fallback-key', // required as fallback
});

client.authenticate('eyJhbGciOiJIUzI1NiIs...');
```

### Multi-Tenant

Include `tenantId` for multi-tenant setups:

```typescript
const client = new ArchiiClient({
  apiKey: 'af_live_xxxxxxxxxxxxxxxx',
  tenantId: 'tenant-abc123',
});
```

---

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | — | **Required.** Your API key. |
| `baseUrl` | `string` | `https://api.archii.io` | API base URL. |
| `tenantId` | `string` | `undefined` | Tenant ID for multi-tenant. |
| `webhookSecret` | `string` | `undefined` | Webhook signing secret. |
| `timeout` | `number` | `30000` | Request timeout in ms. |
| `maxRetries` | `number` | `3` | Retry attempts for 429/5xx errors. |
| `headers` | `object` | `{}` | Custom headers for all requests. |
| `debug` | `boolean` | `false` | Enable request/response logging. |

---

## Resources

### Projects

```typescript
// List projects with pagination
const { data, pagination } = await client.projects.list({
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
  search: 'downtown',
});

// Get a single project
const project = await client.projects.get('proj-123');

// Create a project
const newProject = await client.projects.create({
  name: 'Sunset Tower',
  description: '30-story mixed-use building',
  budget: 5_000_000,
  startDate: '2025-01-15',
  endDate: '2026-06-30',
  address: '123 Sunset Blvd, Los Angeles, CA',
});

// Update a project
await client.projects.update('proj-123', {
  status: 'active',
  budget: 5_200_000,
});

// Delete a project
await client.projects.delete('proj-123');
```

### Tasks

```typescript
// List tasks with filters
const tasks = await client.tasks.list({
  projectId: 'proj-123',
  status: 'in_progress',
  priority: 'high',
  dueDateFrom: '2025-01-01',
  dueDateTo: '2025-03-31',
});

// Create a task
const task = await client.tasks.create({
  projectId: 'proj-123',
  title: 'Foundation inspection',
  description: 'Schedule and complete foundation inspection',
  priority: 'critical',
  assigneeId: 'user-456',
  dueDate: '2025-02-15',
  estimatedHours: 4,
});

// Update task status
await client.tasks.updateStatus('task-789', 'completed');

// Delete a task
await client.tasks.delete('task-789');
```

### Expenses

```typescript
// List expenses
const expenses = await client.expenses.list({
  page: 1,
  pageSize: 50,
});

// Create an expense
const expense = await client.expenses.create({
  projectId: 'proj-123',
  description: 'Structural steel delivery',
  amount: 12500,
  category: 'materials',
  vendor: 'Acme Steel Co.',
  date: '2025-01-20',
  invoiceRef: 'INV-2025-0042',
});

// Update an expense
await client.expenses.update('exp-123', {
  status: 'approved',
});

// Delete an expense
await client.expenses.delete('exp-123');
```

### RFIs (Requests for Information)

```typescript
// List RFIs
const rfis = await client.rfis.list({ projectId: 'proj-123' });

// Create an RFI
const rfi = await client.rfis.create({
  projectId: 'proj-123',
  title: 'Clarification on floor finish spec',
  description: 'Section 09 30 00 references two conflicting finish specs.',
  priority: 'high',
  question: 'Which floor finish specification should be used?',
  dueDate: '2025-02-10',
});

// Update an RFI (e.g., add an answer)
await client.rfis.update('rfi-123', {
  answer: 'Use specification 09 30 13.2 as the primary reference.',
});
```

### Submittals

```typescript
// List submittals
const submittals = await client.submittals.list({ projectId: 'proj-123' });

// Create a submittal
const submittal = await client.submittals.create({
  projectId: 'proj-123',
  title: 'Structural Steel Shop Drawings',
  description: 'Phase 2 structural steel shop drawings review',
  submittalType: 'shop_drawing',
  specificationSection: '05 12 00',
  dueDate: '2025-02-28',
});
```

### Health Scores

```typescript
// Get current health score
const score = await client.health.getScore('proj-123');
console.log(`Overall: ${score.overall}/100`);
console.log(`Schedule: ${score.schedule}`);
console.log(`Budget: ${score.budget}`);
console.log(`Trend: ${score.trend}`);

// Get historical scores
const history = await client.health.getHistory('proj-123', 90);
// Returns array of HealthScore objects for the last 90 days

// Trigger recalculation for all projects
const allScores = await client.health.calculateAll();
```

### BI / Export

```typescript
// Export as CSV
const csvBlob = await client.export.csv(['projects', 'tasks', 'expenses'], {
  projectId: 'proj-123',
  dateFrom: '2025-01-01',
  dateTo: '2025-12-31',
  locale: 'en-US',
});

// Export as JSON
const jsonData = await client.export.json(['projects'], {
  projectId: 'proj-123',
});

// Get data schema
const schema = await client.export.schema();
console.log(`Available collections: ${schema.collections.length}`);
```

### Webhooks

```typescript
// Register a webhook
const webhook = await client.webhooks.create(
  'https://your-app.com/api/webhooks/archii',
  ['task.created', 'task.status_changed', 'project.updated']
);

// List webhooks
const webhooks = await client.webhooks.list();

// Test a webhook
const result = await client.webhooks.test(webhook.id);
console.log(`Test: ${result.success ? 'OK' : 'FAILED'}`);

// Delete a webhook
await client.webhooks.delete(webhook.id);
```

### API Keys

```typescript
// Create a new API key
const newKey = await client.keys.create('CI/CD Pipeline', ['read:projects', 'write:tasks']);
console.log(`Key: ${newKey.key}`); // Save this! Only shown once.
console.log(`Prefix: ${newKey.prefix}`);

// List existing keys
const keys = await client.keys.list();

// Revoke a key
await client.keys.revoke('key-123');
```

---

## Webhook Handling

### Express

```typescript
import express from 'express';
import { archiiWebhookMiddleware } from 'archii-sdk';

const app = express();
app.use(express.json({ verify: (req, buf) => { req.rawBody = buf.toString(); } }));

app.post('/webhooks/archii', archiiWebhookMiddleware(
  'whsec_xxxxxxxxxxxxxxxx',
  {
    'task.created': async (payload) => {
      console.log(`New task: ${payload.data.title} in project ${payload.projectId}`);
    },
    'task.status_changed': async (payload) => {
      console.log(`Task ${payload.data.id} status changed`);
      console.log('Previous:', payload.previousData?.status);
    },
    'expense.status_changed': async (payload) => {
      // Send notification, update internal systems, etc.
    },
  }
));
```

### Next.js App Router

```typescript
// app/api/webhooks/archii/route.ts
import { handleArchiiWebhook } from 'archii-sdk';

export async function POST(request: Request) {
  return handleArchiiWebhook(request, 'whsec_xxxxxxxxxxxxxxxx', {
    'project.created': async (payload) => {
      console.log('New project:', payload.data.name);
    },
    'rfi.answered': async (payload) => {
      const { data } = payload;
      // Notify the RFI submitter
    },
  });
}
```

### Manual Verification

```typescript
import { WebhookHandler } from 'archii-sdk';

const handler = new WebhookHandler('whsec_xxxxxxxxxxxxxxxx');

// Verify signature
const isValid = handler.verifySignature(rawBodyString, signatureHeader);
if (!isValid) {
  return new Response('Invalid signature', { status: 401 });
}

// Parse event
const event = handler.parseEvent<Task>(rawBodyString);
console.log(`Event: ${event.event}`);
console.log(`Data:`, event.data);
```

---

## Error Handling

The SDK provides typed error classes for all HTTP error scenarios:

```typescript
import {
  ArchiiError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  ValidationError,
  ServerError,
  NetworkError,
  isArchiiError,
} from 'archii-sdk';

try {
  const project = await client.projects.get('nonexistent-id');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log(`Resource not found: ${error.message}`);
    console.log(`Resource: ${error.resourceType} / ${error.resourceId}`);
  }

  if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after: ${error.retryAfter}s`);
  }

  if (error instanceof ValidationError) {
    for (const detail of error.details) {
      console.log(`Field "${detail.field}": ${detail.message}`);
    }
  }

  if (error instanceof AuthenticationError) {
    console.log('Check your API key or token.');
  }

  if (error instanceof NetworkError) {
    console.log(`Network issue: ${error.message}`);
    console.log(`Caused by: ${error.cause?.message}`);
  }

  if (isArchiiError(error)) {
    console.log(`[${error.code}] ${error.message}`);
    console.log(`Status: ${error.statusCode}`);
    console.log(`Request ID: ${error.requestId}`);
  }
}
```

---

## Interceptors

Add custom request, response, or error interceptors:

```typescript
// Log all requests
client.addRequestInterceptor((request) => {
  console.log(`${request.method} ${request.url}`);
  return request;
});

// Add a custom header to all requests
client.addRequestInterceptor((request) => {
  return {
    ...request,
    headers: { ...request.headers, 'X-Custom-Header': 'value' },
  };
});

// Log all responses
client.addResponseInterceptor((response, _request) => {
  console.log(`Response: ${response.status}`);
  return response;
});

// Capture all errors
client.addErrorInterceptor((error, _request) => {
  console.error(`SDK Error: [${error.code}] ${error.message}`);
});
```

---

## Auto-Retry

The SDK automatically retries requests that fail with:

- **429 Rate Limit** — waits for `Retry-After` header (or exponential backoff)
- **5xx Server Errors** — exponential backoff with jitter (default: 3 attempts)

Configure retry behavior:

```typescript
const client = new ArchiiClient({
  apiKey: 'your-key',
  maxRetries: 5, // increase from default 3
  timeout: 60000, // 60s timeout
});
```

---

## TypeScript

The SDK is written in TypeScript with strict mode enabled. All methods are fully typed with generics. Import types as needed:

```typescript
import type {
  ArchiiConfig,
  Project,
  Task,
  TaskStatus,
  TaskPriority,
  Expense,
  RFI,
  Submittal,
  HealthScore,
  WebhookPayload,
  ListParams,
  PaginatedResponse,
} from 'archii-sdk';
```

All enums are also exported:

```typescript
import {
  ProjectStatus,
  TaskStatus,
  TaskPriority,
  ExpenseStatus,
  ExpenseCategory,
  RFIStatus,
  SubmittalStatus,
  WebhookEvent,
} from 'archii-sdk';
```

---

## Version

Current version: **1.0.0**

---

## License

MIT
