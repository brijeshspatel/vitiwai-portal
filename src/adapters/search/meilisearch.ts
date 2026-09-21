// The class is `Meilisearch`, not `MeiliSearch`. The package renamed it, and
// the old spelling is not exported at 0.62.0 - confirmed by reading the module's
// exports rather than by trusting an older example.
import { Meilisearch, type Index } from 'meilisearch';
import { err, ok, type Result } from '@/domain/result';
import type { SearchError, SearchPort } from '@/ports/search';
import type { Page, Plan, PlanQuery } from '@/domain/types';
import type { Env } from '@/config/env';

/**
 * Plan discovery, backed by Meilisearch.
 *
 * The index settings are part of this adapter rather than a separate setup
 * step. An index without its searchable and filterable attributes does not
 * fail - it returns the wrong results, which is the harder failure to notice.
 */

export const PLANS_INDEX = 'plans';

/** Meilisearch stores documents flat. This is the stored shape. */
interface PlanDocument {
  id: string;
  name: string;
  category: Plan['category'];
  monthlyPriceMinor: number;
  includedKilolitres: number | null;
  downloadMbps: number | null;
  description: string;
}

const toDocument = (plan: Plan): PlanDocument => ({
  id: plan.id,
  name: plan.name,
  category: plan.category,
  monthlyPriceMinor: plan.monthlyPriceMinor,
  includedKilolitres: plan.includedKilolitres,
  downloadMbps: plan.downloadMbps,
  description: plan.description,
});

const toPlan = (doc: PlanDocument): Plan => ({
  id: doc.id,
  name: doc.name,
  category: doc.category,
  monthlyPriceMinor: doc.monthlyPriceMinor as Plan['monthlyPriceMinor'],
  includedKilolitres: doc.includedKilolitres,
  downloadMbps: doc.downloadMbps,
  description: doc.description,
});

function toSearchError(error: unknown): SearchError {
  const message = error instanceof Error ? error.message : 'Meilisearch is unreachable';
  if (/invalid|filter|attribute/i.test(message)) return { kind: 'invalid_query', message, cause: error };
  return { kind: 'unavailable', message, cause: error };
}

export class MeilisearchAdapter implements SearchPort {
  private readonly client: Meilisearch;

  constructor(env: Env) {
    this.client = new Meilisearch({ host: env.MEILI_URL, apiKey: env.MEILI_MASTER_KEY });
  }

  private index(): Index<PlanDocument> {
    return this.client.index<PlanDocument>(PLANS_INDEX);
  }

  /** Creates the index if absent and applies the settings the queries rely on. */
  async ensureIndex(): Promise<Result<void, SearchError>> {
    try {
      await this.client.createIndex(PLANS_INDEX, { primaryKey: 'id' }).catch(() => undefined);
      const task = await this.index().updateSettings({
        searchableAttributes: ['name', 'description', 'category'],
        filterableAttributes: ['category', 'monthlyPriceMinor', 'downloadMbps'],
        sortableAttributes: ['monthlyPriceMinor'],
      });
      // Wait on the task. Meilisearch applies settings asynchronously, so a
      // query issued immediately afterwards can run against the old settings.
      await this.client.tasks.waitForTask(task.taskUid, { timeout: 30_000 });
      return ok(undefined);
    } catch (error) {
      return err(toSearchError(error));
    }
  }

  async indexPlans(plans: readonly Plan[]): Promise<Result<void, SearchError>> {
    try {
      const prepared = await this.ensureIndex();
      if (!prepared.ok) return prepared;
      const task = await this.index().addDocuments(plans.map(toDocument));
      await this.client.tasks.waitForTask(task.taskUid, { timeout: 60_000 });
      return ok(undefined);
    } catch (error) {
      return err(toSearchError(error));
    }
  }

  async searchPlans(query: PlanQuery): Promise<Result<Page<Plan>, SearchError>> {
    try {
      const filters: string[] = [];
      if (query.category) filters.push(`category = "${query.category}"`);
      if (query.maxMonthlyPriceMinor !== undefined) {
        filters.push(`monthlyPriceMinor <= ${query.maxMonthlyPriceMinor}`);
      }

      const response = await this.index().search(query.text ?? '', {
        limit: query.limit ?? 20,
        offset: query.offset ?? 0,
        ...(filters.length > 0 ? { filter: filters.join(' AND ') } : {}),
      });

      return ok({
        items: response.hits.map(toPlan),
        total: response.estimatedTotalHits ?? response.hits.length,
      });
    } catch (error) {
      return err(toSearchError(error));
    }
  }
}
