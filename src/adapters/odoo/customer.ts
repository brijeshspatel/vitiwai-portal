import { err, ok, type Result } from '@/domain/result';
import type { ErpCustomerPort, ErpError } from '@/ports/erp';
import type {
  Customer,
  CustomerId,
  Invoice,
  InvoiceId,
  InvoiceStatus,
  NewCustomer,
  PaymentReceipt,
  UsagePoint,
} from '@/domain/types';
import {
  odooFloatToMoney,
  OdooRpcError,
  optionalString,
  type OdooClient,
  type OdooValue,
} from './client';

const FIELDS = ['id', 'name', 'email', 'phone', 'city', 'credit'] as const;
const INVOICE_FIELDS = [
  'id',
  'name',
  'state',
  'payment_state',
  'amount_total',
  'amount_residual',
  'invoice_date_due',
] as const;

type Row = Record<string, OdooValue>;

/** Maps an Odoo failure onto the port's own error vocabulary. */
export function toErpError(error: unknown): ErpError {
  if (error instanceof OdooRpcError) {
    if (/refused the credentials/i.test(error.message)) {
      return { kind: 'unauthorised', message: error.message, cause: error };
    }
    return { kind: 'rejected', message: error.message, cause: error };
  }
  return {
    kind: 'unavailable',
    message: error instanceof Error ? error.message : 'Odoo is unreachable',
    cause: error,
  };
}

export function toInvoiceStatus(
  state: OdooValue | undefined,
  paymentState: OdooValue | undefined,
): InvoiceStatus {
  if (state === 'cancel') return 'cancelled';
  if (state === 'draft') return 'draft';
  if (paymentState === 'paid' || paymentState === 'in_payment') return 'paid';
  return 'open';
}

function toCustomer(row: Row): Customer {
  return {
    id: String(row.id),
    name: optionalString(row.name) ?? 'Unnamed',
    email: optionalString(row.email) ?? '',
    phone: optionalString(row.phone),
    city: optionalString(row.city),
    balanceMinor: odooFloatToMoney(row.credit),
  };
}

export class OdooCustomerAdapter implements ErpCustomerPort {
  constructor(private readonly client: OdooClient) {}

  async createCustomer(input: NewCustomer): Promise<Result<CustomerId, ErpError>> {
    try {
      const id = await this.client.createOne('res.partner', {
        name: input.name,
        email: input.email,
        phone: input.phone ?? false,
        city: input.city ?? false,
        street: input.street ?? false,
        customer_rank: 1,
      });
      return ok(id);
    } catch (error) {
      return err(toErpError(error));
    }
  }

  async getCustomer(id: CustomerId): Promise<Result<Customer, ErpError>> {
    try {
      const rows = await this.client.searchRead<Row>(
        'res.partner',
        [['id', '=', Number(id)]],
        FIELDS,
        { limit: 1 },
      );
      const row = rows[0];
      if (!row) return err({ kind: 'not_found', message: `no customer with id ${id}` });
      return ok(toCustomer(row));
    } catch (error) {
      return err(toErpError(error));
    }
  }

  async findCustomerByEmail(email: string): Promise<Result<Customer | null, ErpError>> {
    try {
      const rows = await this.client.searchRead<Row>(
        'res.partner',
        [['email', '=', email]],
        FIELDS,
        { limit: 1 },
      );
      const row = rows[0];
      return ok(row ? toCustomer(row) : null);
    } catch (error) {
      return err(toErpError(error));
    }
  }

  async listInvoices(id: CustomerId): Promise<Result<readonly Invoice[], ErpError>> {
    try {
      const rows = await this.client.searchRead<Row>(
        'account.move',
        [
          ['partner_id', '=', Number(id)],
          ['move_type', '=', 'out_invoice'],
        ],
        INVOICE_FIELDS,
        { order: 'id desc', limit: 50 },
      );
      return ok(
        rows.map((row) => {
          // C3: a draft invoice has `name: false`, and a freshly numbered one
          // can be "/". Neither is a reference a customer should ever see.
          const name = optionalString(row.name);
          return {
            id: String(row.id),
            reference: name === '/' ? null : name,
            status: toInvoiceStatus(row.state, row.payment_state),
            totalMinor: odooFloatToMoney(row.amount_total),
            dueMinor: odooFloatToMoney(row.amount_residual),
            dueDate: optionalString(row.invoice_date_due),
          };
        }),
      );
    } catch (error) {
      return err(toErpError(error));
    }
  }

  async getUsage(id: CustomerId, months: number): Promise<Result<readonly UsagePoint[], ErpError>> {
    // Usage is derived from posted invoices. Odoo Community has no meter-reading
    // model, and inventing one in the portal would create the second source of
    // truth that decision D10 exists to prevent.
    try {
      const rows = await this.client.searchRead<Row>(
        'account.move',
        [
          ['partner_id', '=', Number(id)],
          ['move_type', '=', 'out_invoice'],
          ['state', '=', 'posted'],
        ],
        ['id', 'invoice_date', 'amount_total'],
        { order: 'invoice_date desc', limit: months },
      );
      return ok(
        rows
          .map((row) => {
            const total = odooFloatToMoney(row.amount_total);
            return {
              month: (optionalString(row.invoice_date) ?? '').slice(0, 7),
              // FJ$2.50 per kilolitre, the tariff the seed generator uses.
              kilolitres: Math.round(total / 250),
              costMinor: total,
            };
          })
          .filter((point) => point.month !== '')
          .reverse(),
      );
    } catch (error) {
      return err(toErpError(error));
    }
  }

  async recordPayment(
    invoice: InvoiceId,
    receipt: PaymentReceipt,
  ): Promise<Result<void, ErpError>> {
    try {
      await this.client.call('account.move', 'message_post', [[Number(invoice)]], {
        body:
          `Payment ${receipt.id} recorded through the portal. ` +
          `Amount ${receipt.paidMinor} minor units. SIMULATED gateway.`,
      });
      return ok(undefined);
    } catch (error) {
      return err(toErpError(error));
    }
  }
}
