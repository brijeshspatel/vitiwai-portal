import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PlanFilters } from '@/app/plans/PlanFilters';

afterEach(cleanup);

describe('the plan filters', () => {
  it('labels every control', () => {
    const { container } = render(<PlanFilters />);
    for (const field of container.querySelectorAll('input, select')) {
      const id = field.getAttribute('id');
      expect(id, field.outerHTML).toBeTruthy();
      expect(container.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
  });

  it('is a GET form, so a filtered view has its own address', () => {
    // Bookmarkable, shareable, and it works with the back button.
    const { container } = render(<PlanFilters />);
    const form = container.querySelector('form');
    expect(form?.getAttribute('method')).toBe('get');
    expect(form?.getAttribute('action')).toBe('/plans');
  });

  it('identifies itself as a search region', () => {
    render(<PlanFilters />);
    expect(screen.getByRole('search')).toBeDefined();
  });

  it('says what unit the price limit is in', () => {
    const { container } = render(<PlanFilters />);
    const help = container.querySelector('#maxPrice-help');
    expect(help?.textContent).toMatch(/Fijian dollars/i);
    expect(container.querySelector('#maxPrice')?.getAttribute('aria-describedby')).toBe(
      'maxPrice-help',
    );
  });

  it('keeps the current search in the boxes', () => {
    const { container } = render(<PlanFilters text="fibre" category="broadband" maxPrice="90" />);
    expect(container.querySelector('#q')?.getAttribute('value')).toBe('fibre');
    expect((container.querySelector('#category') as HTMLSelectElement).value).toBe('broadband');
    expect(container.querySelector('#maxPrice')?.getAttribute('value')).toBe('90');
  });

  it('offers a way back to every plan', () => {
    const { container } = render(<PlanFilters text="fibre" />);
    expect(container.querySelector('a[href="/plans"]')).not.toBeNull();
  });
});
