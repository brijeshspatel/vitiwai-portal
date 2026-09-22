import { SignInForm } from './SignInForm';
import { csrfToken } from '@/security/form';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  return <SignInForm error={params.error} next={params.next} csrfToken={await csrfToken()} />;
}
