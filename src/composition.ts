/**
 * The only module permitted to name an adapter.
 *
 * Everything else depends on a port. ESLint enforces this with
 * no-restricted-imports, and it is what makes phase 2 a configuration change:
 * swapping MockGatewayAdapter for a real provider touches this file alone.
 */

import { loadEnv } from '@/config/env';
import { createOdooClient } from '@/adapters/odoo/client';
import { OdooCustomerAdapter } from '@/adapters/odoo/customer';
import { OdooCaseAdapter } from '@/adapters/odoo/case';
import { MeilisearchAdapter } from '@/adapters/search/meilisearch';
import { HttpOcrAdapter } from '@/adapters/ocr/http';
import { RulesIdentityAdapter } from '@/adapters/identity/rules';
import { MockGatewayAdapter } from '@/adapters/payment/mock';
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
    const odoo = createOdooClient(env);
    services = {
      customers: new OdooCustomerAdapter(odoo),
      cases: new OdooCaseAdapter(odoo),
      search: new MeilisearchAdapter(env),
      ocr: new HttpOcrAdapter(env.OCR_URL),
      identity: new RulesIdentityAdapter(),
      payments: new MockGatewayAdapter(env.GATEWAY_URL),
    };
  }
  return services;
}
