import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PlanCard } from '@/components/PlanCard';
import { SimulatedNotice } from '@/components/SimulatedNotice';
import { toMinorUnits } from '@/domain/money';
import type { Plan } from '@/domain/types';

// Vitest runs without global injection, so Testing Library's automatic cleanup
// does not register itself. Without this, each render stacks in the document and
// getByRole finds several matches.
afterEach(cleanup);

/*
 * The application shell's assertions moved to tests/contract/shell.test.ts in
 * increment 1D.
 *
 * RootLayout now contains <Nav />, an async server component that reads the
 * session. Testing Library renders synchronously into a div and cannot await a
 * server component, so rendering the layout here produced an empty container and
 * five assertions that failed for the wrong reason.
 *
 * The five checks - document language, one main landmark, the skip link and its
 * target, the navigation's accessible name, and the synthetic-data footer - are
 * not lost. They now run against the HTML the server actually sends, on every
 * route rather than on one synthetic render, which is a stronger check than the
 * one they replace.
 */

describe('a simulated capability is labelled where the user meets it', () => {
  it('names what is simulated, in the text and in the accessible name', () => {
    render(<SimulatedNotice what="payments">No real money moves.</SimulatedNotice>);
    const notice = screen.getByRole('complementary', { name: /payments is simulated/i });
    expect(notice.textContent).toMatch(/Simulated: payments/);
    expect(notice.textContent).toMatch(/No real money moves/);
  });
});

describe('plan card', () => {
  const plan: Plan = {
    id: 'plan-bundle-2',
    name: 'Home Bundle Family',
    category: 'bundle',
    monthlyPriceMinor: toMinorUnits(124),
    includedKilolitres: 20,
    downloadMbps: 100,
    description: 'Water and broadband together for a family home.',
  };

  it('formats the price as Fijian dollars from minor units', () => {
    render(<PlanCard plan={plan} />);
    expect(screen.getByText(/FJ\$124\.00/)).toBeDefined();
  });

  it('lists only the entitlements the plan actually has', () => {
    const waterOnly: Plan = { ...plan, downloadMbps: null, name: 'Water only' };
    const { container } = render(<PlanCard plan={waterOnly} />);
    expect(container.textContent).toMatch(/20 kL water included/);
    expect(container.textContent).not.toMatch(/Mbps/);
  });

  it('gives each plan a heading, so the grid is navigable by heading', () => {
    render(<PlanCard plan={plan} />);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Home Bundle Family');
  });
});
