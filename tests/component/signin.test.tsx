import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SignInForm } from '@/app/signin/SignInForm';
import { SIGNIN_FAILED } from '@/auth/messages';

afterEach(cleanup);

describe('the sign-in form', () => {
  it('labels both inputs', () => {
    const { container } = render(<SignInForm />);
    for (const input of container.querySelectorAll('input:not([type="hidden"])')) {
      const id = input.getAttribute('id');
      expect(id).toBeTruthy();
      expect(container.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
  });

  it('uses the browser autocomplete tokens a password manager expects', () => {
    const { container } = render(<SignInForm />);
    expect(container.querySelector('#email')?.getAttribute('autocomplete')).toBe('email');
    expect(container.querySelector('#password')?.getAttribute('autocomplete')).toBe(
      'current-password',
    );
  });

  it('announces a failure to assistive technology', () => {
    render(<SignInForm error={SIGNIN_FAILED} />);
    expect(screen.getByRole('alert').textContent).toBe(SIGNIN_FAILED);
  });

  it('gives one message that names neither the email nor the password', () => {
    // The enumeration guard, asserted on the message itself: it must not say
    // which half was wrong, because that tells an attacker which addresses
    // have accounts here.
    expect(SIGNIN_FAILED).not.toMatch(/unknown|no such|not found|incorrect password|wrong password/i);
    expect(SIGNIN_FAILED).toMatch(/do not match/i);
  });

  it('posts to the submit route, not to the page', () => {
    const { container } = render(<SignInForm />);
    const form = container.querySelector('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe('/signin/submit');
  });

  it('offers a way to open an account', () => {
    const { container } = render(<SignInForm />);
    expect(container.querySelector('a[href="/join"]')).not.toBeNull();
  });
});
