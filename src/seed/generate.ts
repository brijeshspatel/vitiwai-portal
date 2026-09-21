/**
 * Synthetic data for Vitiwai Utilities.
 *
 * Every name, address, email and account below is invented. Nothing here
 * belongs to a real person, and nothing is copied from a real dataset. Emails
 * use the `.test` top-level domain, which RFC 2606 reserves precisely so that
 * a stray message cannot reach anybody.
 *
 * The generator is deterministic: the same seed produces the same data. That
 * is what lets a test assert on a specific customer without the suite becoming
 * flaky, and it lets two people reproduce the same demonstration.
 */

// Relative imports with explicit extensions, so Node 26 can strip the types and
// run this file directly. scripts/seed.mjs imports it, which keeps the dataset
// in one place rather than mirroring it into a second JavaScript copy.
import { toMinorUnits, type Money } from '../domain/money.ts';
import type { Customer, Plan, UsagePoint } from '../domain/types.ts';

/** A small, fast, seeded generator. Not for anything needing real randomness. */
export function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/** Invented Fijian-style given names and surnames. */
const GIVEN_NAMES = [
  'Ana', 'Sefa', 'Litia', 'Manoa', 'Salote', 'Viliame', 'Mereani', 'Josefa',
  'Talei', 'Ratu', 'Adi', 'Waisale', 'Kelera', 'Eroni', 'Siteri', 'Apisai',
  'Lusiana', 'Nemani', 'Makereta', 'Tevita', 'Asenaca', 'Inia', 'Vani', 'Peni',
] as const;

const SURNAMES = [
  'Naiqama', 'Vakatawa', 'Rokotuivuna', 'Delana', 'Tuilevu', 'Baleiwai',
  'Seruvakula', 'Ravouvou', 'Waqanivalu', 'Matai', 'Bulivou', 'Korovulavula',
  'Sivoki', 'Tikoisuva', 'Nawalowalo', 'Raitilava',
] as const;

const TOWNS = ['Suva', 'Lautoka', 'Nadi', 'Labasa', 'Ba', 'Sigatoka', 'Nausori', 'Levuka'] as const;

const STREETS = [
  'Vatuwaqa Road', 'Waimanu Lane', 'Rewa Street', 'Namaka Avenue', 'Koroivolu Road',
  'Draunibota Way', 'Nasese Crescent', 'Tamavua Rise',
] as const;

const pick = <T,>(random: () => number, items: readonly T[]): T =>
  items[Math.floor(random() * items.length)] as T;

/** The plan catalogue. Twelve plans, fixed rather than generated. */
export function generatePlans(): Plan[] {
  const water = ([
    ['Household Water Basic', 12, 28.5, 'Metered water supply for a small household.'],
    ['Household Water Plus', 20, 42.0, 'Metered water supply for a family home.'],
    ['Household Water Max', 35, 61.5, 'Metered water supply for a large household.'],
    ['Rainwater Saver', 8, 19.9, 'A lower allowance for homes with rainwater collection.'],
  ] as const).map(([name, kl, price, description], i) => ({
    id: `plan-water-${i + 1}`,
    name,
    category: 'water' as const,
    monthlyPriceMinor: toMinorUnits(price),
    includedKilolitres: kl,
    downloadMbps: null,
    description,
  }));

  const broadband = ([
    ['Fibre Broadband 50', 50, 59.0, 'Unshaped fibre broadband at 50 Mbps download.'],
    ['Fibre Broadband 100', 100, 89.0, 'Unshaped fibre broadband at 100 Mbps download.'],
    ['Fibre Broadband 200', 200, 119.0, 'Unshaped fibre broadband at 200 Mbps download.'],
    ['Fibre Broadband 500', 500, 189.0, 'Unshaped fibre broadband at 500 Mbps download.'],
  ] as const).map(([name, mbps, price, description], i) => ({
    id: `plan-broadband-${i + 1}`,
    name,
    category: 'broadband' as const,
    monthlyPriceMinor: toMinorUnits(price),
    includedKilolitres: null,
    downloadMbps: mbps,
    description,
  }));

  const bundles = ([
    ['Home Bundle Starter', 12, 50, 79.0, 'Water and broadband together for a small household.'],
    ['Home Bundle Family', 20, 100, 124.0, 'Water and broadband together for a family home.'],
    ['Home Bundle Max', 35, 200, 169.0, 'The largest water allowance with 200 Mbps broadband.'],
    ['Home Bundle Island', 12, 50, 74.0, 'A reduced rate for outer-island addresses.'],
  ] as const).map(([name, kl, mbps, price, description], i) => ({
    id: `plan-bundle-${i + 1}`,
    name,
    category: 'bundle' as const,
    monthlyPriceMinor: toMinorUnits(price),
    includedKilolitres: kl,
    downloadMbps: mbps,
    description,
  }));

  return [...water, ...broadband, ...bundles];
}

export interface SyntheticCustomer {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly city: string;
  readonly street: string;
  readonly planId: string;
  readonly usage: readonly UsagePoint[];
}

/** FJ$2.50 per kilolitre. The usage adapter divides by this same tariff. */
export const TARIFF_MINOR_PER_KILOLITRE = 250;

export function generateUsage(random: () => number, months: number, baseKilolitres: number): UsagePoint[] {
  const points: UsagePoint[] = [];
  const now = new Date(Date.UTC(2026, 8, 1));
  for (let i = months - 1; i >= 0; i -= 1) {
    const when = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    // Fiji's wet season runs November to April; usage rises a little then.
    const month = when.getUTCMonth();
    const wet = month >= 10 || month <= 3 ? 1.18 : 1;
    const kilolitres = Math.max(1, Math.round(baseKilolitres * wet * (0.8 + random() * 0.4)));
    points.push({
      month: `${when.getUTCFullYear()}-${String(month + 1).padStart(2, '0')}`,
      kilolitres,
      costMinor: (kilolitres * TARIFF_MINOR_PER_KILOLITRE) as Money,
    });
  }
  return points;
}

export function generateCustomers(count: number, seed = 20260921, months = 24): SyntheticCustomer[] {
  const random = createRandom(seed);
  const plans = generatePlans();
  const customers: SyntheticCustomer[] = [];

  for (let i = 0; i < count; i += 1) {
    const given = pick(random, GIVEN_NAMES);
    const surname = pick(random, SURNAMES);
    const city = pick(random, TOWNS);
    const plan = pick(random, plans);
    const baseKilolitres = plan.includedKilolitres ?? 10;
    customers.push({
      name: `${given} ${surname}`,
      // The index keeps every address unique even when two names collide.
      email: `${given.toLowerCase()}.${surname.toLowerCase()}.${i + 1}@example.test`,
      phone: `+679 ${String(7000000 + Math.floor(random() * 999999)).slice(0, 7)}`,
      city,
      street: `${1 + Math.floor(random() * 180)} ${pick(random, STREETS)}`,
      planId: plan.id,
      usage: generateUsage(random, months, baseKilolitres),
    });
  }

  return customers;
}

/** Everything a seed run needs, from one call. */
export function generateDataset(customerCount = 200, seed = 20260921) {
  return { plans: generatePlans(), customers: generateCustomers(customerCount, seed) };
}

export type { Customer };
