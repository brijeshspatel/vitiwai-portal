import { err, ok, type Result } from '@/domain/result';
import type { CrmCasePort } from '@/ports/crm';
import type { ErpError } from '@/ports/erp';
import type {
  CaseId,
  CaseStatus,
  CustomerId,
  LeadId,
  NewCase,
  NewLead,
  SupportCase,
} from '@/domain/types';
import { optionalString, type OdooClient, type OdooValue } from './client';
import { toErpError } from './customer';

/**
 * A fault report is an Odoo `project.task`, and a plan change is a `crm.lead`.
 *
 * `helpdesk` is an Enterprise module. Odoo Community reports it
 * `uninstallable` - read from `ir.module.module` on a running 19.0 instance on
 * 2026-09-21, alongside `crm`, `account` and `project` all reporting
 * `installed`. Creating a task and a lead was verified in the same check.
 */

type Row = Record<string, OdooValue>;

const CASE_FIELDS = ['id', 'name', 'description', 'state', 'create_date'] as const;

/**
 * Maps `project.task.state` onto the portal's vocabulary.
 *
 * The six codes below are not guessed. They were read from the running
 * instance on 2026-09-21 with
 * `project.task.fields_get(['state'], ['selection'])`:
 *
 *   01_in_progress, 02_changes_requested, 03_approved,
 *   1_done, 1_canceled, 04_waiting_normal
 *
 * A newly created task is `01_in_progress`. Odoo has no `new` state, which is
 * why the portal's vocabulary has none either.
 */
const CASE_STATUS_BY_CODE: Readonly<Record<string, CaseStatus>> = {
  '01_in_progress': 'in_progress',
  '02_changes_requested': 'in_progress',
  '03_approved': 'in_progress',
  '04_waiting_normal': 'waiting',
  '1_done': 'resolved',
  '1_canceled': 'cancelled',
};

export function toCaseStatus(state: OdooValue | undefined): CaseStatus {
  const code = optionalString(state) ?? '';
  // An unrecognised code means Odoo added a state. Reporting it as waiting is
  // the honest default: it claims no progress that was not observed.
  return CASE_STATUS_BY_CODE[code] ?? 'waiting';
}

export class OdooCaseAdapter implements CrmCasePort {
  constructor(private readonly client: OdooClient) {}

  async openCase(input: NewCase): Promise<Result<CaseId, ErpError>> {
    try {
      const id = await this.client.createOne('project.task', {
        name: input.title,
        description: input.description,
        partner_id: Number(input.customerId),
      });
      return ok(id);
    } catch (error) {
      return err(toErpError(error));
    }
  }

  async listCases(id: CustomerId): Promise<Result<readonly SupportCase[], ErpError>> {
    try {
      const rows = await this.client.searchRead<Row>(
        'project.task',
        [['partner_id', '=', Number(id)]],
        CASE_FIELDS,
        { order: 'id desc', limit: 50 },
      );
      return ok(
        rows.map((row) => ({
          id: String(row.id),
          title: optionalString(row.name) ?? 'Untitled',
          description: optionalString(row.description) ?? '',
          status: toCaseStatus(row.state),
          createdAt: optionalString(row.create_date) ?? '',
        })),
      );
    } catch (error) {
      return err(toErpError(error));
    }
  }

  async createLead(input: NewLead): Promise<Result<LeadId, ErpError>> {
    try {
      const id = await this.client.createOne('crm.lead', {
        name: input.title,
        partner_id: Number(input.customerId),
        description: `Requested plan: ${input.requestedPlanId}`,
        type: 'opportunity',
      });
      return ok(id);
    } catch (error) {
      return err(toErpError(error));
    }
  }
}
