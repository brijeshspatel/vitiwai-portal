/**
 * The only module permitted to name an adapter.
 *
 * Everything else depends on a port. ESLint enforces this with
 * no-restricted-imports, and it is what makes phase 2 a configuration change:
 * swapping MockGatewayAdapter for a real provider touches this file alone.
 */

import { loadEnv } from '@/config/env';
import { getPool } from '@/db/client';
import { createOdooClient } from '@/adapters/odoo/client';
import { OdooCustomerAdapter } from '@/adapters/odoo/customer';
import { OdooCaseAdapter } from '@/adapters/odoo/case';
import { MeilisearchAdapter } from '@/adapters/search/meilisearch';
import { HttpOcrAdapter } from '@/adapters/ocr/http';
import { RulesIdentityAdapter } from '@/adapters/identity/rules';
import { MockGatewayAdapter } from '@/adapters/payment/mock';
import { DemoCustomerAdapter } from '@/adapters/demo/customer';
import { DemoCaseAdapter } from '@/adapters/demo/case';
import { DemoSearchAdapter } from '@/adapters/demo/search';
import { DemoPaymentAdapter } from '@/adapters/demo/payment';
import { UnavailableOcrAdapter } from '@/adapters/demo/ocr';
import type { CrmCasePort } from '@/ports/crm';
import type { ErpCustomerPort } from '@/ports/erp';
import type { SearchPort } from '@/ports/search';
import type { DocumentOcrPort } from '@/ports/ocr';
import type { IdentityDecisionPort } from '@/ports/identity';
import type { PaymentGatewayPort } from '@/ports/payment';

export interface Services {
  readonly customers: ErpCustomerPort;
  readonly cases: CrmCasePort;
  readonly search: SearchPort;
  readonly ocr: DocumentOcrPort;
  /** SIMULATED. See src/adapters/identity/rules.ts. */
  readonly identity: IdentityDecisionPort;
  /** SIMULATED in phase 1. See src/adapters/payment/mock.ts. */
  readonly payments: PaymentGatewayPort;
}

let services: Services | undefined;

export function getServices(): Services {
  if (!services) {
    const env = loadEnv();
    services = env.DEMO_MODE ? demonstration() : full(env);
  }
  return services;
}

/** The composition the local stack and every existing test use. */
function full(env: ReturnType<typeof loadEnv>): Services {
  const odoo = createOdooClient(env);
  return {
    customers: new OdooCustomerAdapter(odoo),
    cases: new OdooCaseAdapter(odoo),
    search: new MeilisearchAdapter(env),
    ocr: new HttpOcrAdapter(env.OCR_URL),
    identity: new RulesIdentityAdapter(),
    payments: new MockGatewayAdapter(env.GATEWAY_URL),
  };
}

/**
 * The composition a public demonstration uses.
 *
 * Every adapter here answers from the process or from the portal's own
 * database. Nothing reaches Odoo, Meilisearch, the OCR service or the payment
 * gateway container, so the deployed build is two services rather than eight
 * and fits hosting that costs nothing.
 *
 * This is what the rule about this file being the only module permitted to name
 * an adapter was for. Every route, every page and every domain function is
 * unchanged; the substitution is here and nowhere else.
 *
 * `identity` is shared with the full composition rather than duplicated. It was
 * always local - it decides from rules, not from a service - so a demonstration
 * copy of it would be a second implementation of the same logic, free to drift.
 */
function demonstration(): Services {
  const pool = getPool(loadEnv());
  return {
    customers: new DemoCustomerAdapter(pool),
    cases: new DemoCaseAdapter(pool),
    search: new DemoSearchAdapter(),
    ocr: new UnavailableOcrAdapter(),
    identity: new RulesIdentityAdapter(),
    payments: new DemoPaymentAdapter(),
  };
}
