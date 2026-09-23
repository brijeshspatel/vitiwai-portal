import { NextResponse, type NextRequest } from 'next/server';
import { getServices } from '@/composition';
import { currentSession } from '@/auth/require';
import { isOk } from '@/domain/result';
import { rejectIfForged } from '@/security/require-csrf';
import { changePlanSchema, firstProblem } from '@/security/schemas';
import { recordEvent } from '@/audit/record';
import { getPool } from '@/db/client';
import { loadEnv } from '@/config/env';
import { requestOrigin } from '@/http/origin';

/**
 * A plan change becomes an Odoo `crm.lead`.
 *
 * It is a request, not a change: nothing about the customer's account moves
 * until somebody confirms it, which is what the screen tells them. The
 * customer comes from the session, never from the request.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = requestOrigin(request);
  const user = await currentSession();
  if (user === null) return NextResponse.redirect(new URL('/signin', origin), 303);

  const form = await request.formData();
  // Reject a forged request before anything is read from it.
  const forged = await rejectIfForged(form);
  if (forged) return forged;

  const back = (params: Record<string, string>) =>
    NextResponse.redirect(
      new URL(`/account/change-plan?${new URLSearchParams(params).toString()}`, origin),
      303,
    );

  const parsed = changePlanSchema.safeParse({ planId: form.get('planId') });
  if (!parsed.success) return back({ error: firstProblem(parsed.error) });
  const { planId } = parsed.data;

  const lead = await getServices().cases.createLead({
    customerId: user.odooPartnerId,
    title: `Plan change requested by ${user.email}`,
    requestedPlanId: planId,
  });

  if (!isOk(lead)) {
    return back({ error: 'We could not send that request. Please try again shortly.' });
  }
  await recordEvent(getPool(loadEnv()), {
    action: 'planchange.requested',
    actorUser: user.userId,
    subjectType: 'lead',
    subjectId: String(lead.value),
    detail: { planId },
  });

  return back({ requested: lead.value });
}
