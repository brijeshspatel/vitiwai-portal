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
import type { CrmCasePort } from '@/ports/crm';
import type { ErpCustomerPort } from '@/ports/erp';
import type { SearchPort } from '@/ports/search';

export interface Services {
  readonly customers: ErpCustomerPort;
  readonly cases: CrmCasePort;
  readonly search: SearchPort;
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
    };
  }
  return services;
}
