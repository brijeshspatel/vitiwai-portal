import type { Plan } from '@/domain/types';

const CATEGORIES: ReadonlyArray<{ value: Plan['category'] | ''; label: string }> = [
  { value: '', label: 'All plans' },
  { value: 'water', label: 'Water' },
  { value: 'broadband', label: 'Broadband' },
  { value: 'bundle', label: 'Bundles' },
];

/**
 * A plain GET form, so a filtered view has its own address.
 *
 * Someone can bookmark it, share it or use the back button, and it works with
 * no JavaScript at all.
 */
export function PlanFilters({
  text = '',
  category = '',
  maxPrice = '',
}: {
  text?: string;
  category?: string;
  maxPrice?: string;
}) {
  return (
    <form className="vw-card" method="get" action="/plans" role="search">
      <h2>Find a plan</h2>
      <div className="vw-filters">
        <p>
          <label htmlFor="q">Search</label>
          <br />
          <input id="q" name="q" type="search" defaultValue={text} placeholder="fibre, water" />
        </p>
        <p>
          <label htmlFor="category">Category</label>
          <br />
          <select id="category" name="category" defaultValue={category}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </p>
        <p>
          <label htmlFor="maxPrice">Most I want to pay, per month</label>
          <br />
          <input
            id="maxPrice"
            name="maxPrice"
            type="number"
            min="0"
            step="1"
            defaultValue={maxPrice}
            aria-describedby="maxPrice-help"
          />
          <br />
          <span id="maxPrice-help" className="vw-muted">
            In whole Fijian dollars. Leave empty for no limit.
          </span>
        </p>
      </div>
      <p>
        <button className="vw-button" type="submit">
          Show plans
        </button>{' '}
        <a href="/plans">Clear</a>
      </p>
    </form>
  );
}
