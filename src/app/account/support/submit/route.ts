import { NextResponse, type NextRequest } from 'next/server';
import { getServices } from '@/composition';
import { currentSession } from '@/auth/require';
import { isOk } from '@/domain/result';
import { rejectIfForged } from '@/security/require-csrf';
import { supportSchema, firstProblem } from '@/security/schemas';
import { recordEvent } from '@/audit/record';
import { getPool } from '@/db/client';
import { loadEnv } from '@/config/env';
import { requestOrigin } from '@/http/origin';

/**
 * A fault report becomes an Odoo `project.task`.
 *
 * `helpdesk` is an Enterprise module and Odoo Community reports it
 * uninstallable, so `project.task` is the model. The customer is taken from
 * the session, never from the request, so nobody can raise a case against
 * somebody else's account.
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
      new URL(`/account/support?${new URLSearchParams(params).toString()}`, origin),
      303,
    );

  // Parsed before anything is done with it. Reading fields straight off the
  // form turned a missing one into an empty string and a File into
  // "[object File]".
  const parsed = supportSchema.safeParse({
    title: form.get('title'),
    description: form.get('description'),
  });
  if (!parsed.success) return back({ error: firstProblem(parsed.error) });
  const { title, description } = parsed.data;

  const opened = await getServices().cases.openCase({
    customerId: user.odooPartnerId,
    title: title.slice(0, 120),
    description: description.slice(0, 2000),
  });

  if (!isOk(opened)) {
    return back({ error: 'We could not log that just now. Please try again shortly.' });
  }
  await recordEvent(getPool(loadEnv()), {
    action: 'case.opened',
    actorUser: user.userId,
    subjectType: 'case',
    subjectId: String(opened.value),
    detail: { title },
  });

  return back({ raised: opened.value });
}
