import { NextResponse, type NextRequest } from 'next/server';
import { loadEnv } from '@/config/env';
import { getPool } from '@/db/client';
import { getServices } from '@/composition';
import { applyForAccount } from '@/onboarding/apply';
import { rejectIfForged } from '@/security/require-csrf';
import { firstProblem, onboardingSchema } from '@/security/schemas';

/**
 * The onboarding form's handler.
 *
 * It lives at `/join/submit` rather than `/join` because a page and a route
 * handler cannot share a path in the App Router - the same reason
 * `/signin/submit` exists. Until increment 1E the form posted to `/join`
 * itself, so `POST /join` was a 404 and the account-opening workflow could not
 * be completed in a browser. Everything behind this handler already worked and
 * was tested; nothing connected the form to it.
 *
 * A plain form post, so opening an account works without JavaScript. The
 * response is a redirect rather than a rendered page, so the back button and a
 * refresh cannot resubmit an application.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.origin;
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(
      new URL(`/join?${new URLSearchParams(params).toString()}`, origin),
      303,
    );

  const form = await request.formData();
  // Reject a forged request before anything is read from it.
  const forged = await rejectIfForged(form);
  if (forged) return forged;

  const parsed = onboardingSchema.safeParse({
    fullName: form.get('fullName'),
    dateOfBirth: form.get('dateOfBirth'),
    documentNumber: form.get('documentNumber'),
    email: form.get('email'),
    password: form.get('password'),
  });
  if (!parsed.success) return back({ error: firstProblem(parsed.error) });
  const { fullName, dateOfBirth, documentNumber, email, password } = parsed.data;
  const upload = form.get('document');

  // A missing file is the applicant's mistake, not a fault. `validateUpload`
  // rejects an empty one, but it cannot be reached without something to pass.
  if (!(upload instanceof File) || upload.size === 0) {
    return back({ error: 'Attach a photograph of your identity document.' });
  }

  const result = await applyForAccount(getServices(), getPool(loadEnv()), {
    fullName,
    dateOfBirth,
    documentNumber,
    email,
    password,
    document: {
      filename: upload.name,
      mimeType: upload.type,
      bytes: new Uint8Array(await upload.arrayBuffer()),
    },
  });

  switch (result.kind) {
    case 'approved':
      return back({ outcome: 'approved' });
    case 'referred':
      return back({ outcome: 'referred', reasons: result.reasons.join(',') });
    case 'declined':
      return back({ outcome: 'declined', reasons: result.reasons.join(',') });
    case 'rejected':
      // The upload itself was not acceptable - wrong type, too large, empty.
      return back({ error: `We could not accept that file: ${result.message}` });
    case 'unavailable':
      return back({ error: `Sorry - ${result.message}` });
  }
}
