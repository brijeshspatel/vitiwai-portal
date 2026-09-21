import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { JoinForm } from '@/app/join/JoinForm';
import { Outcome } from '@/app/join/Outcome';

afterEach(cleanup);

describe('the onboarding form', () => {
  it('gives every input a programmatic label', () => {
    const { container } = render(<JoinForm />);
    const inputs = [...container.querySelectorAll('input')];
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      const id = input.getAttribute('id');
      expect(id, `an input has no id: ${input.outerHTML}`).toBeTruthy();
      expect(
        container.querySelector(`label[for="${id}"]`),
        `no label points at #${id}`,
      ).not.toBeNull();
    }
  });

  it('states what the file input accepts and how large a file may be', () => {
    const { container } = render(<JoinForm />);
    const file = container.querySelector('input[type="file"]');
    expect(file?.getAttribute('accept')).toContain('image/png');
    expect(file?.getAttribute('accept')).toContain('image/jpeg');

    const describedBy = file?.getAttribute('aria-describedby');
    const help = container.querySelector(`#${describedBy}`);
    expect(help?.textContent).toMatch(/PNG or JPEG/);
    expect(help?.textContent).toMatch(/5 MB/);
  });

  it('tells the applicant their photograph is not kept', () => {
    const { container } = render(<JoinForm />);
    expect(container.textContent).toMatch(/never stored/i);
  });

  it('announces a form error to assistive technology', () => {
    render(<JoinForm error="That file is not a PNG or JPEG image." />);
    expect(screen.getByRole('alert').textContent).toMatch(/not a PNG or JPEG/);
  });
});

describe('the outcome screens', () => {
  it('tells an approved applicant their account is open', () => {
    const { container } = render(<Outcome kind="approved" />);
    expect(container.textContent).toMatch(/account is open/i);
  });

  it('carries the simulated-decision notice on every outcome', () => {
    for (const kind of ['approved', 'referred', 'declined'] as const) {
      cleanup();
      render(<Outcome kind={kind} reasons={['low_confidence']} />);
      const notice = screen.getByRole('complementary', { name: /identity check is simulated/i });
      expect(notice.textContent).toMatch(/No identity bureau was consulted/);
    }
  });

  it('gives a referred applicant a general reason, not the field that failed', () => {
    const { container } = render(<Outcome kind="referred" reasons={['name_mismatch']} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/do not match your document/i);
    // U7: the field-level detail stays out of the response.
    expect(text).not.toMatch(/name_mismatch/);
    expect(text).not.toMatch(/similarity/i);
    expect(text).not.toMatch(/confidence/i);
  });

  it('does not repeat itself when two reasons share a message', () => {
    const { container } = render(
      <Outcome kind="referred" reasons={['name_mismatch', 'dob_mismatch']} />,
    );
    const matches = (container.textContent ?? '').match(/do not match your document closely enough/g);
    expect(matches).toHaveLength(1);
  });

  it('marks a decline as an alert and a referral as a status', () => {
    const declined = render(<Outcome kind="declined" reasons={['document_unreadable']} />);
    expect(within(declined.container).getByRole('alert')).toBeDefined();
    cleanup();
    const referred = render(<Outcome kind="referred" reasons={['low_confidence']} />);
    expect(within(referred.container).getByRole('status')).toBeDefined();
  });

  it('tells a declined applicant what to do next', () => {
    const { container } = render(<Outcome kind="declined" reasons={['document_unreadable']} />);
    expect(container.textContent).toMatch(/upload a clearer photograph/i);
  });
});
