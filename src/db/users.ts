import type pg from 'pg';
import { hashPassword } from '@/domain/password';
import type { IdentityOutcome } from '@/domain/types';

/** A portal sign-in identity, mapped to the Odoo customer it belongs to. */
export interface PortalUser {
  readonly id: string;
  readonly email: string;
  readonly odooPartnerId: string;
}

export async function createPortalUser(
  pool: pg.Pool,
  input: { email: string; password: string; odooPartnerId: string },
): Promise<PortalUser> {
  const passwordHash = await hashPassword(input.password);
  const result = await pool.query(
    `INSERT INTO portal_user (email, password_hash, odoo_partner_id)
     VALUES ($1, $2, $3)
     RETURNING id, email, odoo_partner_id`,
    [input.email.toLowerCase(), passwordHash, input.odooPartnerId],
  );
  const row = result.rows[0] as { id: string; email: string; odoo_partner_id: string };
  return { id: String(row.id), email: row.email, odooPartnerId: row.odoo_partner_id };
}

export async function findPortalUserByEmail(
  pool: pg.Pool,
  email: string,
): Promise<(PortalUser & { passwordHash: string }) | null> {
  const result = await pool.query(
    'SELECT id, email, password_hash, odoo_partner_id FROM portal_user WHERE email = $1',
    [email.toLowerCase()],
  );
  const row = result.rows[0] as
    | { id: string; email: string; password_hash: string; odoo_partner_id: string }
    | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    email: row.email,
    odooPartnerId: row.odoo_partner_id,
    passwordHash: row.password_hash,
  };
}

/**
 * Records what happened to an application.
 *
 * `extractedText` is kept because a reviewer needs to see what was read. The
 * uploaded image is not kept, and the table has no column that could hold one.
 */
export async function recordApplication(
  pool: pg.Pool,
  input: {
    email: string;
    outcome: IdentityOutcome;
    extractedText: string | null;
    confidence: number | null;
    odooLeadId?: string | null;
  },
): Promise<string> {
  const reasons = input.outcome.kind === 'approved' ? [] : [...input.outcome.reasons];
  const result = await pool.query(
    `INSERT INTO onboarding_application (email, outcome, reasons, extracted_text, confidence, odoo_lead_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.email.toLowerCase(),
      input.outcome.kind,
      reasons,
      input.extractedText,
      input.confidence,
      input.odooLeadId ?? null,
    ],
  );
  return String((result.rows[0] as { id: string }).id);
}
