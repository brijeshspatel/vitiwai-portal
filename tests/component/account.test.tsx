import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { UsageTable } from '@/app/account/UsageTable';
import { AccountSummary } from '@/app/account/AccountSummary';
import { toMinorUnits } from '@/domain/money';
import { formatMonth } from '@/domain/dates';
import type { Invoice, UsagePoint } from '@/domain/types';

afterEach(cleanup);

const points: UsagePoint[] = [
  { month: '2026-07', kilolitres: 12, costMinor: toMinorUnits(30) },
  { month: '2026-08', kilolitres: 18, costMinor: toMinorUnits(45) },
  { month: '2026-09', kilolitres: 9, costMinor: toMinorUnits(22.5) },
];

describe('the usage table', () => {
  it('states every figure as text, with no styling applied', () => {
    // The whole point of choosing a table: strip the CSS and the data is still
    // there. A canvas chart would leave nothing behind.
    const { container } = render(<UsageTable points={points} />);
    const text = container.textContent ?? '';
    for (const point of points) {
      // The month is now shown the way a customer reads it. The point of this
      // test is that every figure survives without styling, not which format
      // the month is in - but it must assert the format actually rendered, or
      // it would pass on a page that printed the raw value again.
      expect(text).toContain(formatMonth(point.month));
      expect(text).toContain(`${point.kilolitres} kL`);
    }
    expect(text).toContain('FJ$30.00');
    expect(text).toContain('FJ$45.00');
    expect(text).toContain('FJ$22.50');
  });

  it('has a caption saying what the numbers mean', () => {
    const { container } = render(<UsageTable points={points} />);
    expect(container.querySelector('caption')?.textContent).toMatch(/kilolitres/i);
  });

  it('gives every column a scoped header and every row a row header', () => {
    const { container } = render(<UsageTable points={points} />);
    expect(container.querySelectorAll('th[scope="col"]')).toHaveLength(3);
    expect(container.querySelectorAll('th[scope="row"]')).toHaveLength(points.length);
  });

  it('hides the decorative bars from assistive technology', () => {
    const { container } = render(<UsageTable points={points} />);
    const bars = container.querySelectorAll('.vw-bar');
    expect(bars.length).toBe(points.length);
    // The attribute moved from the bar to the track that holds it, which hides
    // the same subtree. Asserting the guarantee rather than where it is written
    // means the next layout change does not silently drop it.
    for (const bar of bars) {
      expect(bar.closest('[aria-hidden="true"]'), 'each bar must be in a hidden subtree').not.toBeNull();
    }
  });

  it('keeps the figure out of the bar’s track, so a full bar cannot displace it', () => {
    // The defect this replaces: the bar was a percentage of the cell it shared
    // with the figure, so the largest month - always scaled to 100% - filled the
    // cell and wrapped its own label onto a second line. That row rendered 66px
    // tall against 42px for the others, and every customer has a largest month.
    const { container } = render(<UsageTable points={points} />);

    const peak = container.querySelectorAll('.vw-usage__track .vw-bar');
    expect(peak.length).toBe(points.length);

    // Exactly one bar is at 100%, and it is the largest month, not every month.
    const widths = [...peak].map((b) => b.getAttribute('style') ?? '');
    expect(widths.filter((w) => w.includes('width: 100%'))).toHaveLength(1);

    for (const figure of container.querySelectorAll('.vw-usage__figure')) {
      expect(figure.closest('.vw-usage__track'), 'the figure must sit outside the track').toBeNull();
    }
  });

  it('explains an empty history rather than rendering an empty table', () => {
    const { container } = render(<UsageTable points={[]} />);
    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).toMatch(/no usage history/i);
  });

  it('does not divide by zero when every month is zero', () => {
    const flat: UsagePoint[] = [{ month: '2026-09', kilolitres: 0, costMinor: toMinorUnits(0) }];
    const { container } = render(<UsageTable points={flat} />);
    expect(container.querySelector('.vw-bar')?.getAttribute('style')).toContain('width: 0%');
  });
});

describe('the account summary', () => {
  const invoice: Invoice = {
    id: '42',
    reference: 'INV/2026/00007',
    status: 'open',
    totalMinor: toMinorUnits(45),
    dueMinor: toMinorUnits(45),
    dueDate: '2026-10-15',
  };

  it('shows the balance and the invoice it comes from', () => {
    const { container } = render(
      <AccountSummary balanceMinor={toMinorUnits(45)} current={invoice} />,
    );
    expect(container.textContent).toContain('FJ$45.00');
    expect(container.textContent).toContain('INV/2026/00007');
    expect(container.textContent).toContain('15 October 2026');
  });

  it('offers payment only when something is owed', () => {
    const owing = render(<AccountSummary balanceMinor={toMinorUnits(45)} current={invoice} />);
    expect(owing.container.querySelector('a[href^="/account/pay"]')).not.toBeNull();
    cleanup();
    const clear = render(<AccountSummary balanceMinor={toMinorUnits(0)} current={invoice} />);
    expect(clear.container.querySelector('a[href^="/account/pay"]')).toBeNull();
  });

  it('never prints "false" for an unissued invoice reference', () => {
    // Odoo convention C3: a draft invoice's name is the boolean false.
    const draft: Invoice = { ...invoice, reference: null, status: 'draft' };
    const { container } = render(
      <AccountSummary balanceMinor={toMinorUnits(45)} current={draft} />,
    );
    expect(container.textContent).not.toContain('false');
    expect(container.textContent).toMatch(/not yet issued/i);
  });

  it('explains a clear account rather than showing an empty box', () => {
    const { container } = render(<AccountSummary balanceMinor={toMinorUnits(0)} current={null} />);
    expect(container.textContent).toMatch(/no unpaid bills/i);
  });
});
