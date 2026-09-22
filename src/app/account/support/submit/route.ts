import { NextResponse, type NextRequest } from 'next/server';
import { getServices } from '@/composition';
import { currentSession } from '@/auth/require';
import { isOk } from '@/domain/result';

/**
 * A fault report becomes an Odoo `project.task`.
 *
 * `helpdesk` is an Enterprise module and Odoo Community reports it
 * uninstallable, so `project.task` is the model. The customer is taken from
 * the session, never from the request, so nobody can raise a case against
 * somebody else's account.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.origin;
  const user = await currentSession();
  if (user === null) return NextResponse.redirect(new URL('/signin', origin), 303);

  const form = await request.formData();
  const title = String(form.get('title') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();

  const back = (params: Record<string, string>) =>
    NextResponse.redirect(
      new URL(`/account/support?${new URLSearchParams(params).toString()}`, origin),
      303,
    );

  if (!title) return back({ error: 'Tell us what the problem is.' });

  const opened = await getServices().cases.openCase({
    customerId: user.odooPartnerId,
    title: title.slice(0, 120),
    description: description.slice(0, 2000),
  });

  if (!isOk(opened)) {
    return back({ error: 'We could not log that just now. Please try again shortly.' });
  }
  return back({ raised: opened.value });
}
