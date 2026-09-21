import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import RootLayout from '@/app/layout';
import { PlanCard } from '@/components/PlanCard';
import { SimulatedNotice } from '@/components/SimulatedNotice';
import { toMinorUnits } from '@/domain/money';
import type { Plan } from '@/domain/types';

// Vitest runs without global injection, so Testing Library's automatic cleanup
// does not register itself. Without this, each render stacks in the document and
// getByRole finds several matches.
afterEach(cleanup);

/**
 * RootLayout renders <html> and <body>. Testing Library mounts into a div, so
 * these assertions read the rendered markup rather than the document, which is
 * what keeps the test honest about what the component itself produces.
 */
function renderLayout() {
  const { container } = render(
    <RootLayout>
      <h1>Page heading</h1>
    </RootLayout>,
  );
  return container;
}

describe('the application shell meets the accessibility floor', () => {
  it('declares the document language', () => {
    renderLayout();
    // React 19 hoists <html> and <body> attributes onto the real document
    // rather than nesting them in the mount point, so the assertion reads the
    // document. Verified by probing what actually renders, not assumed.
    expect(document.documentElement.getAttribute('lang')).toBe('en-FJ');
  });

  it('renders exactly one main landmark, and the children inside it', () => {
    const container = renderLayout();
    const mains = container.querySelectorAll('main');
    expect(mains).toHaveLength(1);
    expect(within(mains[0] as HTMLElement).getByRole('heading', { level: 1 })).toHaveProperty(
      'textContent',
      'Page heading',
    );
  });

  it('puts a skip link first, and its target exists', () => {
    const container = renderLayout();
    const skip = container.querySelector('a.vw-skip-link');
    expect(skip?.getAttribute('href')).toBe('#main');
    // A skip link pointing at nothing is worse than none: it moves focus
    // somewhere the user cannot see.
    const targetId = skip?.getAttribute('href')?.slice(1) ?? '';
    expect(container.querySelector(`#${targetId}`)).not.toBeNull();
  });

  it('names its navigation, so two navs would still be distinguishable', () => {
    const nav = renderLayout().querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Main');
  });

  it('states on every page that the data is synthetic', () => {
    expect(renderLayout().querySelector('footer')?.textContent).toMatch(/synthetic/i);
  });
});

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
