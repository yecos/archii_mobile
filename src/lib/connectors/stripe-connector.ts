/**
 * stripe-connector.ts
 * Stripe integration connector for Archii Marketplace.
 *
 * Supports:
 *   - API Key authentication (secret key)
 *   - Create invoices and customers
 *   - Sync Archii invoices to Stripe
 *   - Check payment status
 *   - Webhook receiver for Stripe events
 *   - Map Archii invoices to Stripe format
 *
 * Auth: Secret API Key
 */

import {
  registerConnector,
  type IntegrationConnector,
} from '../marketplace-service';

/* ================================================================
   TYPES
   ================================================================ */

export interface StripeConfig {
  secretKey: string;
  webhookSecret?: string;
}

export interface StripeCustomer {
  id: string;
  name: string;
  email: string;
  created: number;
}

export interface StripeInvoiceItem {
  description: string;
  amount: number; // in cents
  currency: string;
}

export interface StripeInvoice {
  id: string;
  number: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  amount_due: number; // in cents
  currency: string;
  created: number;
  due_date?: number;
  hosted_invoice_url?: string;
  pdf_url?: string;
  customer: string;
  metadata?: Record<string, string>;
}

export interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'processing' | 'requires_action' | 'succeeded' | 'canceled';
  metadata?: Record<string, string>;
  created: number;
}

/* ================================================================
   STRIPE API CLIENT
   ================================================================ */

function buildHeaders(config: StripeConfig): HeadersInit {
  return {
    'Authorization': `Bearer ${config.secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

const STRIPE_API = 'https://api.stripe.com/v1';

async function stripeRequest<T>(
  config: StripeConfig,
  method: string,
  path: string,
  body?: any
): Promise<T> {
  const url = `${STRIPE_API}${path}`;

  let requestBody: string | undefined;
  if (body && method !== 'GET') {
    requestBody = typeof body === 'string' ? body : new URLSearchParams(body).toString();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method,
      headers: buildHeaders(config),
      body: requestBody,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errMsg = errorData?.error?.message || await response.text().catch(() => '');
      throw new Error(`Stripe API ${response.status}: ${errMsg.slice(0, 300)}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as T;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Timeout conectando a Stripe');
    }
    throw err;
  }
}

/* ================================================================
   CRUD OPERATIONS
   ================================================================ */

/**
 * Create a customer in Stripe.
 */
export async function createStripeCustomer(
  config: StripeConfig,
  customerData: {
    name: string;
    email: string;
    phone?: string;
    address?: { line1: string; city: string; state: string; country: string; postal_code: string };
    metadata?: Record<string, string>;
  }
): Promise<StripeCustomer> {
  const params: Record<string, string> = {
    name: customerData.name,
    email: customerData.email,
  };

  if (customerData.phone) params.phone = customerData.phone;
  if (customerData.address) {
    params['address[line1]'] = customerData.address.line1;
    params['address[city]'] = customerData.address.city;
    params['address[state]'] = customerData.address.state;
    params['address[country]'] = customerData.address.country;
    params['address[postal_code]'] = customerData.address.postal_code;
  }

  if (customerData.metadata) {
    for (const [k, v] of Object.entries(customerData.metadata)) {
      params[`metadata[${k}]`] = v;
    }
  }

  return stripeRequest<StripeCustomer>(config, 'POST', '/customers', params);
}

/**
 * Create an invoice in Stripe from Archii invoice data.
 */
export async function createStripeInvoice(
  config: StripeConfig,
  invoiceData: {
    customerId: string;
    description?: string;
    dueDate?: string;
    items: { description: string; amount: number; currency?: string }[];
    metadata?: Record<string, string>;
  }
): Promise<StripeInvoice> {
  const customerId = invoiceData.customerId;

  // Create invoice items
  for (const item of invoiceData.items) {
    const params: Record<string, string> = {
      customer: customerId,
      description: item.description,
      amount: String(Math.round(item.amount * 100)), // Convert to cents
      currency: item.currency || 'cop',
    };

    if (invoiceData.metadata) {
      for (const [k, v] of Object.entries(invoiceData.metadata)) {
        params[`metadata[${k}]`] = v;
      }
    }

    await stripeRequest(config, 'POST', '/invoiceitems', params);
  }

  // Create the invoice
  const invoiceParams: Record<string, string> = {
    customer: customerId,
    auto_advance: 'true',
  };

  if (invoiceData.description) invoiceParams.description = invoiceData.description;
  if (invoiceData.dueDate) invoiceParams['due_date'] = String(Math.floor(new Date(invoiceData.dueDate).getTime() / 1000));

  if (invoiceData.metadata) {
    for (const [k, v] of Object.entries(invoiceData.metadata)) {
      invoiceParams[`metadata[${k}]`] = v;
    }
  }

  return stripeRequest<StripeInvoice>(config, 'POST', '/invoices', invoiceParams);
}

/**
 * Check payment status for a PaymentIntent.
 */
export async function getStripePaymentStatus(
  config: StripeConfig,
  paymentIntentId: string
): Promise<StripePaymentIntent> {
  return stripeRequest<StripePaymentIntent>(
    config, 'GET', `/payment_intents/${paymentIntentId}`
  );
}

/**
 * Finalize and send a draft invoice.
 */
export async function finalizeStripeInvoice(
  config: StripeConfig,
  invoiceId: string
): Promise<StripeInvoice> {
  await stripeRequest(config, 'POST', `/invoices/${invoiceId}/finalize`);
  return stripeRequest<StripeInvoice>(config, 'POST', `/invoices/${invoiceId}/send`);
}

/* ================================================================
   MAPPERS (Archii ↔ Stripe)
   ================================================================ */

/**
 * Map an Archii invoice to Stripe invoice format.
 */
export function formatArchiiInvoice(invoice: {
  number: string;
  projectName: string;
  clientName: string;
  clientEmail?: string;
  total: number;
  currency?: string;
  dueDate: string;
  items: { concept: string; amount: number }[];
}): {
  customerData: { name: string; email: string; metadata: Record<string, string> };
  invoiceData: {
    description: string;
    dueDate: string;
    items: { description: string; amount: number; currency: string }[];
    metadata: Record<string, string>;
  };
} {
  return {
    customerData: {
      name: invoice.clientName || 'Cliente',
      email: invoice.clientEmail || '',
      metadata: {
        archii_invoice_number: invoice.number,
        source: 'archii',
      },
    },
    invoiceData: {
      description: `Factura ${invoice.number} — ${invoice.projectName}`,
      dueDate: invoice.dueDate,
      items: invoice.items.map((item) => ({
        description: item.concept,
        amount: item.amount,
        currency: invoice.currency || 'cop',
      })),
      metadata: {
        archii_invoice_id: invoice.number,
        project_name: invoice.projectName,
      },
    },
  };
}

/**
 * Sync an Archii invoice to Stripe.
 * Creates customer if needed, then invoice.
 */
export async function syncArchiiInvoice(
  invoice: {
    number: string;
    projectName: string;
    clientName: string;
    clientEmail?: string;
    total: number;
    dueDate: string;
    items: { concept: string; amount: number }[];
    stripeCustomerId?: string;
  },
  config: StripeConfig
): Promise<{ invoiceId: string; customerId: string; hostedUrl?: string }> {
  const mapped = formatArchiiInvoice(invoice);

  // Create or use existing customer
  let customerId = invoice.stripeCustomerId || '';
  if (!customerId) {
    const customer = await createStripeCustomer(config, mapped.customerData);
    customerId = customer.id;
  }

  // Create invoice
  const stripeInvoice = await createStripeInvoice(config, {
    customerId,
    ...mapped.invoiceData,
  });

  return {
    invoiceId: stripeInvoice.id,
    customerId,
    hostedUrl: stripeInvoice.hosted_invoice_url,
  };
}

/**
 * Parse an inbound Stripe webhook event.
 */
export function handleStripeWebhook(payload: any): {
  event: string;
  objectType: string;
  data: any;
} | null {
  const eventType = payload.type;
  if (!eventType) return null;

  const data = payload.data?.object;
  if (!data) return null;

  const eventMap: Record<string, string> = {
    'payment_intent.succeeded': 'invoice.paid',
    'payment_intent.failed': 'invoice.overdue',
    'invoice.paid': 'invoice.paid',
    'invoice.payment_failed': 'invoice.overdue',
    'invoice.created': 'invoice.created',
    'invoice.overdue': 'invoice.overdue',
    'customer.created': 'customer.created',
  };

  return {
    event: eventMap[eventType] || 'invoice.updated',
    objectType: payload.type.split('.')[0], // e.g. 'payment_intent', 'invoice', 'customer'
    data,
  };
}

/**
 * Verify Stripe webhook signature.
 */
export function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto');
  const elements = signature.split(',');
  const sigMap: Record<string, string> = {};
  for (const el of elements) {
    const [key, value] = el.split('=');
    sigMap[key] = value;
  }

  const timestamp = sigMap['t'];
  if (!timestamp) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(sigMap['v1']), Buffer.from(expected));
}

/* ================================================================
   CONNECTOR IMPLEMENTATION
   ================================================================ */

const stripeConnector: IntegrationConnector = {
  async dispatch(config, event, payload) {
    const stripeConfig = config as unknown as StripeConfig;

    switch (event) {
      case 'invoice.created': {
        const result = await syncArchiiInvoice(payload as any, stripeConfig);
        break;
      }
      case 'invoice.paid':
      case 'invoice.overdue':
        // These are typically handled by inbound webhooks
        break;
      default:
        break;
    }
  },

  async test(config) {
    try {
      const stripeConfig = config as unknown as StripeConfig;
      // Attempt to list recent charges to validate the key
      await stripeRequest(stripeConfig, 'GET', '/balance');
      return {
        success: true,
        message: 'Conectado a Stripe correctamente',
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
registerConnector('stripe', stripeConnector);
