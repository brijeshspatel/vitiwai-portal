import type { Result } from '@/domain/result';
import type { CaseId, CustomerId, LeadId, NewCase, NewLead, SupportCase } from '@/domain/types';
import type { ErpError } from './erp';

/**
 * Support cases and sales leads.
 *
 * A case is an Odoo `project.task`, not a helpdesk ticket: `helpdesk` is an
 * Enterprise module and Odoo Community reports it uninstallable. The port name
 * stays as it is, because a case is the portal's concept and not Odoo's.
 */
export interface CrmCasePort {
  openCase(input: NewCase): Promise<Result<CaseId, ErpError>>;
  listCases(id: CustomerId): Promise<Result<readonly SupportCase[], ErpError>>;
  createLead(input: NewLead): Promise<Result<LeadId, ErpError>>;
}
