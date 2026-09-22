import { isOk } from '@/domain/result';
import type { Services } from '@/composition';
import type { Customer, Invoice, UsagePoint } from '@/domain/types';
import type { Money } from '@/domain/money';

/**
 * Everything the dashboard shows, read in one place.
 *
 * Separated from the page so a contract test can assert the figures against
 * Odoo without rendering React. The page is then a view over this, and the
 * test does not have to parse HTML to find a number.
 */
export interface AccountOverview {
  readonly customer: Customer;
  readonly balanceMinor: Money;
  readonly current: Invoice | null;
  readonly invoices: readonly Invoice[];
  readonly usage: readonly UsagePoint[];
  /** Named so a page can explain a partial view rather than pretending. */
  readonly unavailable: readonly string[];
}

export async function loadOverview(
  services: Services,
  odooPartnerId: string,
  months = 12,
): Promise<AccountOverview | null> {
  const customerResult = await services.customers.getCustomer(odooPartnerId);
  if (!isOk(customerResult)) return null;

  const unavailable: string[] = [];

  const invoicesResult = await services.customers.listInvoices(odooPartnerId);
  const invoices = isOk(invoicesResult) ? invoicesResult.value : [];
  if (!isOk(invoicesResult)) unavailable.push('your bills');

  const usageResult = await services.customers.getUsage(odooPartnerId, months);
  const usage = isOk(usageResult) ? usageResult.value : [];
  if (!isOk(usageResult)) unavailable.push('your usage history');

  // The oldest unpaid bill is the one to pay first.
  const outstanding = invoices.filter((i) => i.dueMinor > 0 && i.status !== 'cancelled');
  const current = outstanding.length > 0 ? (outstanding[outstanding.length - 1] as Invoice) : null;

  return {
    customer: customerResult.value,
    balanceMinor: customerResult.value.balanceMinor,
    current,
    invoices,
    usage,
    unavailable,
  };
}
