import type { PortError, Result } from '@/domain/result';
import type { Page, Plan, PlanQuery } from '@/domain/types';

export type SearchErrorKind = 'unavailable' | 'invalid_query';
export type SearchError = PortError<SearchErrorKind>;

/** Plan discovery. */
export interface SearchPort {
  searchPlans(query: PlanQuery): Promise<Result<Page<Plan>, SearchError>>;
  indexPlans(plans: readonly Plan[]): Promise<Result<void, SearchError>>;
}
