import { describe, expect, it } from 'vitest';
import {
  createRandom,
  generateCustomers,
  generateDataset,
  generatePlans,
  generateUsage,
  TARIFF_MINOR_PER_KILOLITRE,
} from '@/seed/generate';

describe('the synthetic dataset is deterministic', () => {
  it('produces identical output for the same seed', () => {
    const a = generateCustomers(50, 12345);
    const b = generateCustomers(50, 12345);
    expect(a).toEqual(b);
  });

  it('produces different output for a different seed', () => {
    const a = generateCustomers(50, 12345);
    const b = generateCustomers(50, 99999);
    expect(a).not.toEqual(b);
  });

  it('gives the same sequence from the same random seed', () => {
    const r1 = createRandom(7);
    const r2 = createRandom(7);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});

describe('the dataset meets the sizes deliverable 3 requires', () => {
  it('produces at least 200 customers, 12 plans and 24 usage points each', () => {
    const { plans, customers } = generateDataset(200);
    expect(customers.length).toBeGreaterThanOrEqual(200);
    expect(plans.length).toBeGreaterThanOrEqual(12);
    for (const customer of customers) {
      expect(customer.usage.length).toBe(24);
    }
  });

  it('covers all three plan categories', () => {
    const categories = new Set(generatePlans().map((p) => p.category));
    expect([...categories].sort()).toEqual(['broadband', 'bundle', 'water']);
  });
});

describe('nothing in the dataset belongs to a real person', () => {
  const { customers } = generateDataset(200);

  it('uses only the reserved .test top-level domain for email', () => {
    for (const customer of customers) {
      expect(customer.email).toMatch(/@example\.test$/);
    }
  });

  it('gives every customer a distinct email address', () => {
    const addresses = new Set(customers.map((c) => c.email));
    expect(addresses.size).toBe(customers.length);
  });

  it('uses only Fiji telephone prefixes that are obviously invented', () => {
    for (const customer of customers) {
      expect(customer.phone).toMatch(/^\+679 \d{7}$/);
    }
  });
});

describe('usage is consistent with the tariff the adapter divides by', () => {
  it('prices every point at the declared tariff', () => {
    const points = generateUsage(createRandom(3), 24, 15);
    for (const point of points) {
      expect(point.costMinor).toBe(point.kilolitres * TARIFF_MINOR_PER_KILOLITRE);
    }
  });

  it('returns months in ascending order, oldest first', () => {
    const months = generateUsage(createRandom(3), 24, 15).map((p) => p.month);
    expect([...months].sort()).toEqual(months);
  });

  it('never reports a non-positive consumption', () => {
    const points = generateUsage(createRandom(11), 24, 1);
    for (const point of points) expect(point.kilolitres).toBeGreaterThan(0);
  });
});
