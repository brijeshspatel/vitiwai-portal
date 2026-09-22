import { NextResponse, type NextRequest } from 'next/server';
import { getServices } from '@/composition';
import { currentSession } from '@/auth/require';
import { isOk } from '@/domain/result';

/**
 * A plan change becomes an Odoo `crm.lead`.
 *
 * It is a request, not a change: nothing about the customer's account moves
 * until somebody confirms it, which is what the screen tells them. The
 * customer comes from the session, never from the request.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.origin;
  const user = await currentSession();
  if (user === null) return NextResponse.redirect(new URL('/signin', origin), 303);

  const form = await request.formData();
  const planId = String(form.get('planId') ?? '').trim();

  const back = (params: Record<string, string>) =>
    NextResponse.redirect(
      new URL(`/account/change-plan?${new URLSearchParams(params).toString()}`, origin),
      303,
    );

  if (!planId) return back({ error: 'Choose a plan first.' });

  const lead = await getServices().cases.createLead({
    customerId: user.odooPartnerId,
    title: `Plan change requested by ${user.email}`,
    requestedPlanId: planId,
  });

  if (!isOk(lead)) {
    return back({ error: 'We could not send that request. Please try again shortly.' });
  }
  return back({ requested: lead.value });
}
