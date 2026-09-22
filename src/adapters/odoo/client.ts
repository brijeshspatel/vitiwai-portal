import type { Env } from '@/config/env';
import { fromOdooFloat, type Money } from '@/domain/money';

/**
 * JSON-RPC transport for Odoo.
 *
 * Four call conventions were found by calling a running Odoo 19.0-20260908 on
 * 2026-09-21. Each one broke a probe written from the obvious assumption, and
 * each is handled here rather than in every adapter:
 *
 *   C1  `create` takes a LIST of dicts and returns a LIST of ids, even for one
 *       record. `createOne` unwraps it.
 *   C2  the search domain is ONE positional argument. `[[["a","=",1]]]` raises
 *       `Domain() invalid item in domain`. `searchRead` wraps it once, here.
 *   C3  a draft `account.move` has `name: false`, not a string. `optionalString`
 *       turns Odoo's `false` into null at the boundary.
 *   C4  authentication returns a numeric uid used on every later call. It is
 *       cached per client, not fetched per request.
 */

/** Odoo returns `false` for an empty value of any type. */
export type OdooFalse = false;
export type OdooValue = string | number | boolean | null | OdooValue[] | { [k: string]: OdooValue };

export interface OdooClient {
  authenticate(): Promise<number>;
  authenticationCount(): number;
  ping(): Promise<boolean>;
  call<T = OdooValue>(
    model: string,
    method: string,
    args: readonly unknown[],
    kwargs?: Record<string, unknown>,
  ): Promise<T>;
  createOne(model: string, values: Record<string, unknown>): Promise<string>;
  /**
   * `createOne` with an Odoo context. A wizard such as
   * `account.payment.register` reads `active_model` and `active_ids` from the
   * context rather than from its own fields, so it cannot be created without
   * one.
   */
  createOneWithContext(
    model: string,
    values: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<string>;
  searchRead<T = Record<string, OdooValue>>(
    model: string,
    domain: readonly unknown[],
    fields: readonly string[],
    options?: { limit?: number; offset?: number; order?: string },
  ): Promise<T[]>;
  createDraftInvoice(customerId: string, amount: Money): Promise<string>;
}

export class OdooRpcError extends Error {
  constructor(
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'OdooRpcError';
  }
}

/** C3: Odoo's `false` means "no value". Everything else passes through. */
export function optionalString(value: OdooValue | undefined): string | null {
  if (value === false || value === null || value === undefined || value === '') return null;
  return String(value);
}

export function odooFloatToMoney(value: OdooValue | undefined): Money {
  return typeof value === 'number' ? fromOdooFloat(value) : fromOdooFloat(0);
}

export function createOdooClient(env: Env): OdooClient {
  const endpoint = `${env.ODOO_URL.replace(/\/$/, '')}/jsonrpc`;
  let uid: number | undefined;
  let authenticationCount = 0;

  async function rpc<T>(service: string, method: string, args: readonly unknown[]): Promise<T> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { service, method, args },
        id: Math.floor(Math.random() * 1e9),
      }),
    });
    if (!response.ok) {
      throw new OdooRpcError(`Odoo returned HTTP ${response.status} from ${endpoint}`);
    }
    const body = (await response.json()) as { result?: T; error?: { data?: { message?: string } } };
    if (body.error) {
      throw new OdooRpcError(body.error.data?.message ?? 'Odoo rejected the call', body.error);
    }
    return body.result as T;
  }

  async function authenticate(): Promise<number> {
    // C4: cached for the life of the client.
    if (uid !== undefined) return uid;
    authenticationCount += 1;
    const result = await rpc<number | false>('common', 'login', [
      env.ODOO_DB,
      env.ODOO_USER,
      env.ODOO_PASSWORD,
    ]);
    if (result === false || typeof result !== 'number') {
      throw new OdooRpcError(
        `Odoo refused the credentials for database "${env.ODOO_DB}". ` +
          'Has `npm run seed` initialised it?',
      );
    }
    uid = result;
    return uid;
  }

  async function call<T>(
    model: string,
    method: string,
    args: readonly unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    const id = await authenticate();
    return rpc<T>('object', 'execute_kw', [
      env.ODOO_DB,
      id,
      env.ODOO_PASSWORD,
      model,
      method,
      args,
      kwargs,
    ]);
  }

  return {
    authenticate,
    authenticationCount: () => authenticationCount,

    async ping() {
      try {
        await rpc<unknown>('common', 'version', []);
        await authenticate();
        return true;
      } catch {
        return false;
      }
    },

    call,

    /** C1: Odoo returns a list of ids. Callers want one id. */
    async createOne(model, values) {
      const created = await call<number | number[]>(model, 'create', [[values]]);
      const id = Array.isArray(created) ? created[0] : created;
      if (typeof id !== 'number') {
        throw new OdooRpcError(`Odoo returned no id when creating ${model}`);
      }
      return String(id);
    },

    async createOneWithContext(model, values, context) {
      const created = await call<number | number[]>(model, 'create', [[values]], { context });
      const id = Array.isArray(created) ? created[0] : created;
      if (typeof id !== 'number') {
        throw new OdooRpcError(`Odoo returned no id when creating ${model}`);
      }
      return String(id);
    },

    /** C2: the domain is wrapped exactly once, here, so no caller can get it wrong. */
    async searchRead(model, domain, fields, options = {}) {
      return call(model, 'search_read', [domain], { fields: [...fields], ...options });
    },

    async createDraftInvoice(customerId, amount) {
      return this.createOne('account.move', {
        move_type: 'out_invoice',
        partner_id: Number(customerId),
        invoice_line_ids: [
          [0, 0, { name: 'Utility charges', quantity: 1, price_unit: amount / 100 }],
        ],
      });
    },
  };
}
