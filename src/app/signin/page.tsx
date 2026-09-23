import { SignInForm } from './SignInForm';
import { csrfToken } from '@/security/form';
import { loadEnv } from '@/config/env';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const env = loadEnv();

  return (
    <>
      {env.DEMO_MODE && (
        <div className="vw-card vw-prose" role="note">
          <h2>Signing in to the demonstration</h2>
          <p>
            Use <code>demo@vitiwai.example</code> with the passphrase{' '}
            <code>demo-passphrase</code>.
          </p>
          <p className="vw-muted">
            Published deliberately. It guards nothing: every customer, invoice and meter reading
            behind it is generated, and everyone who visits sees the same account. A password on
            synthetic data would only stop people seeing what they came to look at.
          </p>
        </div>
      )}
      <SignInForm error={params.error} next={params.next} csrfToken={await csrfToken()} />
    </>
  );
}
