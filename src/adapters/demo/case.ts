import type { Pool } from 'pg';
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

/**
 * Support cases and plan-change requests, held in Postgres.
 *
 * `OdooCaseAdapter` writes a `project.task` and a `crm.lead`. There is no Odoo
 * in a demonstration, and holding these in memory would mean a support request
 * that disappeared on the next restart - which a reviewer would read as a
 * defect in the portal rather than as an absent back end.
 *
 * A case opens `in_progress`, not `waiting` and not some `new` state. That is
 * the real behaviour: Odoo has no `new` task state and a just-created task is
 * `01_in_progress`. A demonstration that opened cases into a state the real
 * adapter cannot produce would teach the wrong thing about the real adapter.
 */

interface CaseRow {
  id: string;
  title: string;
  description: string;
  status: CaseStatus;
  created_at: Date;
}

export class DemoCaseAdapter implements CrmCasePort {
  constructor(private readonly pool: Pool) {}

  async openCase(input: NewCase): Promise<Result<CaseId, ErpError>> {
    try {
      const { rows } = await this.pool.query<{ id: string }>(
        `INSERT INTO demo_support_case (customer_id, title, description, status)
         VALUES ($1, $2, $3, 'in_progress')
         RETURNING id`,
        [input.customerId, input.title, input.description],
      );
      return ok(String(rows[0]!.id));
    } catch (cause) {
      return err({ kind: 'unavailable', message: 'the case store did not answer', cause });
    }
  }

  async listCases(id: CustomerId): Promise<Result<readonly SupportCase[], ErpError>> {
    try {
      const { rows } = await this.pool.query<CaseRow>(
        `SELECT id, title, description, status, created_at
           FROM demo_support_case
          WHERE customer_id = $1
          ORDER BY created_at DESC`,
        [id],
      );
      return ok(
        rows.map((r) => ({
          id: String(r.id),
          title: r.title,
          description: r.description,
          status: r.status,
          createdAt: r.created_at.toISOString(),
        })),
      );
    } catch (cause) {
      return err({ kind: 'unavailable', message: 'the case store did not answer', cause });
    }
  }

  async createLead(input: NewLead): Promise<Result<LeadId, ErpError>> {
    // A plan change is a sales lead in Odoo and a case here. The portal only
    // needs an identifier back and a record that survives; giving it a second
    // table to distinguish a lead from a case would be modelling Odoo's
    // taxonomy in a component that does not have Odoo.
    try {
      const { rows } = await this.pool.query<{ id: string }>(
        `INSERT INTO demo_support_case (customer_id, title, description, status)
         VALUES ($1, $2, $3, 'waiting')
         RETURNING id`,
        [input.customerId, input.title, `Requested plan: ${input.requestedPlanId}`],
      );
      return ok(String(rows[0]!.id));
    } catch (cause) {
      return err({ kind: 'unavailable', message: 'the lead store did not answer', cause });
    }
  }
}
