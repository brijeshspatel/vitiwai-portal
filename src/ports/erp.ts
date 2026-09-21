import type { PortError, Result } from '@/domain/result';
import type {
  Customer, CustomerId, Invoice, InvoiceId, NewCustomer, PaymentReceipt, UsagePoint,
} from '@/domain/types';

export type ErpErrorKind = 'not_found' | 'unavailable' | 'rejected' | 'unauthorised';
export type ErpError = PortError<ErpErrorKind>;

/** Customers, invoices, usage and payment records. Odoo is the system of record. */
export interface ErpCustomerPort {
  createCustomer(input: NewCustomer): Promise<Result<CustomerId, ErpError>>;
  getCustomer(id: CustomerId): Promise<Result<Customer, ErpError>>;
  findCustomerByEmail(email: string): Promise<Result<Customer | null, ErpError>>;
  listInvoices(id: CustomerId): Promise<Result<readonly Invoice[], ErpError>>;
  getUsage(id: CustomerId, months: number): Promise<Result<readonly UsagePoint[], ErpError>>;
  recordPayment(invoice: InvoiceId, receipt: PaymentReceipt): Promise<Result<void, ErpError>>;
}
