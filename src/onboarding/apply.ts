import { isErr, isOk } from '@/domain/result';
import { validateUpload, type UploadError } from '@/domain/upload';
import { recordApplication, createPortalUser } from '@/db/users';
import type { Services } from '@/composition';
import type pg from 'pg';
import type { ClaimedIdentity, IdentityOutcome, UploadedFile } from '@/domain/types';

/**
 * Workflow W1 - opening an account with an identity document.
 *
 * The uploaded image lives in this function and nowhere else. It is never
 * written to disk, never put in the database and never logged. What survives
 * the request is the text that was read and the decision that followed.
 */

export interface ApplicationInput {
  readonly fullName: string;
  readonly dateOfBirth: string;
  readonly documentNumber: string;
  readonly email: string;
  readonly password: string;
  readonly document: UploadedFile;
}

export type ApplicationResult =
  | { readonly kind: 'approved'; readonly customerId: string }
  | { readonly kind: 'referred'; readonly reasons: readonly string[] }
  | { readonly kind: 'declined'; readonly reasons: readonly string[] }
  | { readonly kind: 'rejected'; readonly field: 'document'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly message: string };

export async function applyForAccount(
  services: Services,
  pool: pg.Pool,
  input: ApplicationInput,
): Promise<ApplicationResult> {
  // 1. The upload, before anything parses it.
  const validated = validateUpload(input.document);
  if (isErr(validated)) {
    const error = validated.error as UploadError;
    return { kind: 'rejected', field: 'document', message: error.message };
  }

  // 2. Read it.
  const read = await services.ocr.read(validated.value);
  if (isErr(read)) {
    if (read.error.kind === 'unavailable') {
      return {
        kind: 'unavailable',
        message: 'the document reader is not responding. Try again shortly.',
      };
    }
    // Unreadable or unsupported is an outcome for the applicant, not a fault.
    const outcome: IdentityOutcome = { kind: 'declined', reasons: ['document_unreadable'] };
    await recordApplication(pool, {
      email: input.email,
      outcome,
      extractedText: null,
      confidence: null,
    });
    return { kind: 'declined', reasons: [...outcome.reasons] };
  }

  const extracted = read.value;

  // 3. Decide.
  const claimed: ClaimedIdentity = {
    fullName: input.fullName,
    dateOfBirth: input.dateOfBirth,
    documentNumber: input.documentNumber,
  };
  const outcome = await services.identity.decide(claimed, extracted);

  if (outcome.kind === 'declined') {
    await recordApplication(pool, {
      email: input.email,
      outcome,
      extractedText: extracted.rawText,
      confidence: extracted.confidence,
    });
    return { kind: 'declined', reasons: [...outcome.reasons] };
  }

  if (outcome.kind === 'referred') {
    // A referral is a human's job, so it becomes a lead they will see.
    const lead = await services.cases.createLead({
      customerId: '0',
      title: `Onboarding referred: ${input.email}`,
      requestedPlanId: 'onboarding-review',
    });
    await recordApplication(pool, {
      email: input.email,
      outcome,
      extractedText: extracted.rawText,
      confidence: extracted.confidence,
      odooLeadId: isOk(lead) ? lead.value : null,
    });
    return { kind: 'referred', reasons: [...outcome.reasons] };
  }

  // 4. Approved. Odoo first, then the credential.
  const created = await services.customers.createCustomer({
    name: input.fullName,
    email: input.email,
  });
  if (isErr(created)) {
    return {
      kind: 'unavailable',
      message: 'the account system is not responding. Nothing was created; try again shortly.',
    };
  }

  try {
    await createPortalUser(pool, {
      email: input.email,
      password: input.password,
      odooPartnerId: created.value,
    });
  } catch (cause) {
    // The partner exists and the credential does not. Recorded rather than
    // hidden, so the orphan is visible to whoever looks (risk R-d).
    await recordApplication(pool, {
      email: input.email,
      outcome: { kind: 'referred', reasons: ['low_confidence'] },
      extractedText: extracted.rawText,
      confidence: extracted.confidence,
    });
    return {
      kind: 'unavailable',
      message: `the account was created but the sign-in could not be set up: ${
        cause instanceof Error ? cause.message : 'unknown error'
      }`,
    };
  }

  await recordApplication(pool, {
    email: input.email,
    outcome,
    extractedText: extracted.rawText,
    confidence: extracted.confidence,
  });

  return { kind: 'approved', customerId: created.value };
}
