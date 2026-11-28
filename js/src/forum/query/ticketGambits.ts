import app from 'flarum/forum/app';
import type IGambit from 'flarum/common/query/IGambit';
import { BooleanGambit, KeyValueGambit, GambitType, type GroupedGambitSuggestion, type GambitValueOption } from 'flarum/common/query/IGambit';
import { canHandleSupportTickets } from '../utils/permissions';
import { loadCategories } from '../utils/api';
import { ticketTypes } from '../../common/ticketTypes';

export const SUPPORT_TICKETS_RESOURCE = 'linkrobins-support-tickets';

function formatMultiValueFromFilter(key: string, value: any, negate: boolean): string {
  if (Array.isArray(value)) {
    return value
      .map((v) => formatMultiValueFromFilter(key, v, negate))
      .filter(Boolean)
      .join(' ');
  }
  if (typeof value === 'string' && value) {
    return `${negate ? '-' : ''}${key}:${value}`;
  }
  return '';
}

/**
 * Filter support tickets by status: is:open, is:in-progress, is:awaiting-response, is:resolved, is:closed.
 * Accepts both kebab-case and snake_case aliases. Supports negation (e.g. -is:closed).
 */
export class StatusGambit implements IGambit<GambitType.Grouped> {
  type = GambitType.Grouped;
  predicates = false;

  key(): string[] {
    return ['open', 'in-progress', 'awaiting-response', 'resolved', 'closed'];
  }

  filterKey(): string {
    return 'status';
  }

  booleanKey(): 'is' | 'has' | 'allows' {
    return 'is';
  }

  groupKey(): string {
    return app.translator.trans('core.lib.gambits.group_keys.' + this.booleanKey(), {}, true) || 'is';
  }

  pattern(): string {
    return `${this.groupKey()}:(open|in[-_]progress|awaiting[-_](?:response|user)|resolved|closed)`;
  }

  canonicalPattern(): string {
    return 'is:(open|in[-_]progress|awaiting[-_](?:response|user)|resolved|closed)';
  }

  toFilter(matches: string[], negate: boolean): Record<string, any> {
    const key = (negate ? '-' : '') + this.filterKey();
    let val = matches[1].toLowerCase().replace(/-/g, '_');
    if (val === 'awaiting_response') {
      val = 'awaiting_user';
    }
    return {
      [key]: val,
    };
  }

  fromFilter(value: any, negate: boolean): string {
    const is = this.groupKey();
    const normalize = (v: string) => {
      if (v === 'awaiting_user' || v === 'awaiting_response') return 'awaiting-response';
      if (v === 'in_progress') return 'in-progress';
      return v;
    };
    if (Array.isArray(value)) {
      return value.map((v) => `${negate ? '-' : ''}${is}:${normalize(v)}`).join(' ');
    }
    return `${negate ? '-' : ''}${is}:${normalize(value)}`;
  }

  suggestion(): GroupedGambitSuggestion {
    return {
      group: this.groupKey(),
      key: this.key(),
    };
  }

  enabled(): boolean {
    return true;
  }
}

/**
 * Key-value assignee filter: assigned:me, assigned:none, assigned:unassigned (staff only).
 */
export class AssignedGambit extends KeyValueGambit {
  key(): string {
    return app.translator.trans('linkrobins-support.lib.gambits.tickets.assigned.key', {}, true);
  }

  canonicalKey(): string {
    return 'assigned';
  }

  hint(): string {
    return app.translator.trans('linkrobins-support.lib.gambits.tickets.assigned.hint', {}, true);
  }

  filterKey(): string {
    return 'assigned';
  }

  valuePattern(): string {
    return '(me|none|unassigned)';
  }

  gambitValueToFilterValue(value: string): string {
    const raw = value.toLowerCase();
    return raw === 'unassigned' ? 'none' : raw;
  }

  fromFilter(value: any, negate: boolean): string {
    if (value === 'me') {
      return `${negate ? '-' : ''}${this.key()}:me`;
    }
    if (value === 'none' || value === 'unassigned') {
      return `${negate ? '-' : ''}${this.key()}:none`;
    }
    return '';
  }

  values(): (string | GambitValueOption)[] {
    return [
      {
        value: 'me',
        label: app.translator.trans('linkrobins-support.lib.gambits.tickets.assigned.options.me', {}, true),
      },
      {
        value: 'none',
        label: app.translator.trans('linkrobins-support.lib.gambits.tickets.assigned.options.none', {}, true),
      },
    ];
  }

  enabled(): boolean {
    return canHandleSupportTickets();
  }
}

/**
 * Staff-only filter for own filed tickets: is:mine.
 */
export class MineGambit extends BooleanGambit {
  key(): string {
    return app.translator.trans('linkrobins-support.lib.gambits.tickets.mine.key', {}, true);
  }

  canonicalKey(): string {
    return 'mine';
  }

  hint(): string {
    return app.translator.trans('linkrobins-support.lib.gambits.tickets.mine.hint', {}, true);
  }

  filterKey(): string {
    return 'mine';
  }

  toFilter(_matches: string[], negate: boolean): Record<string, any> {
    const key = (negate ? '-' : '') + this.filterKey();
    return {
      [key]: '1',
    };
  }

  enabled(): boolean {
    return canHandleSupportTickets();
  }
}

/**
 * Filter tickets by ticket type driver: type:standard, type:appeal, etc.
 */
export class TicketTypeGambit extends KeyValueGambit {
  key(): string {
    return app.translator.trans('linkrobins-support.lib.gambits.tickets.type.key', {}, true);
  }

  canonicalKey(): string {
    return 'type';
  }

  hint(): string {
    return app.translator.trans('linkrobins-support.lib.gambits.tickets.type.hint', {}, true);
  }

  filterKey(): string {
    return 'ticketType';
  }

  values(): (string | GambitValueOption)[] {
    return ticketTypes.all().map((driver) => {
      const typeKey = `linkrobins-support.lib.gambits.tickets.type.types.${driver.id}`;
      const translated = app.translator.trans(typeKey, {}, true);
      const label = driver.name ? driver.name() : driver.id;
      return {
        value: driver.id,
        label: translated !== typeKey ? translated : label,
      };
    });
  }
}

/**
 * Staff-only filter for tickets opened by a specific username: author:<username>.
 */
export class AuthorGambit extends KeyValueGambit {
  key(): string {
    return app.translator.trans('linkrobins-support.lib.gambits.tickets.author.key', {}, true);
  }

  canonicalKey(): string {
    return 'author';
  }

  hint(): string {
    return app.translator.trans('linkrobins-support.lib.gambits.tickets.author.hint', {}, true);
  }

  filterKey(): string {
    return 'author';
  }

  enabled(): boolean {
    return canHandleSupportTickets();
  }
}

/**
 * Staff-only filter for tickets by priority: priority:urgent, priority:normal, priority:low.
 */
export class PriorityGambit extends KeyValueGambit {
  predicates = true;

  key(): string {
    return app.translator.trans('linkrobins-support.lib.gambits.tickets.priority.key', {}, true);
  }

  canonicalKey(): string {
    return 'priority';
  }

  hint(): string {
    return app.translator.trans('linkrobins-support.lib.gambits.tickets.priority.hint', {}, true);
  }

  filterKey(): string {
    return 'priority';
  }

  valuePattern(): string {
    return '([a-zA-Z0-9_,-]+)';
  }

  gambitValueToFilterValue(value: string): string[] {
    return [value.toLowerCase()];
  }

  fromFilter(value: any, negate: boolean): string {
    return formatMultiValueFromFilter(this.key(), value, negate);
  }

  values(): (string | GambitValueOption)[] {
    return [
      {
        value: 'urgent',
        label: app.translator.trans('linkrobins-support.lib.gambits.tickets.priority.levels.urgent', {}, true),
      },
      {
        value: 'normal',
        label: app.translator.trans('linkrobins-support.lib.gambits.tickets.priority.levels.normal', {}, true),
      },
      {
        value: 'low',
        label: app.translator.trans('linkrobins-support.lib.gambits.tickets.priority.levels.low', {}, true),
      },
    ];
  }

  enabled(): boolean {
    return canHandleSupportTickets();
  }
}

/**
 * Filter tickets by category slug: category:<slug> or cat:<slug>.
 */
export class CategoryGambit extends KeyValueGambit {
  predicates = true;

  private static loadingCategories = false;
  private static loadedCategories = false;
  private static lastLoadFailedAt = 0;
  private static RETRY_COOLDOWN_MS = 10000;

  key(): string {
    return app.translator.trans('linkrobins-support.lib.gambits.tickets.category.key', {}, true);
  }

  canonicalKey(): string {
    return 'category';
  }

  hint(): string {
    return app.translator.trans('linkrobins-support.lib.gambits.tickets.category.hint', {}, true);
  }

  filterKey(): string {
    return 'category';
  }

  valuePattern(): string {
    return '([a-zA-Z0-9_,-]+)';
  }

  pattern(): string {
    const key = this.key();
    const matchKey = key === 'category' ? '(?:category|cat)' : `(?:${key}|cat)`;
    return `${matchKey}:` + this.valuePattern();
  }

  canonicalPattern(): string {
    return '(?:category|cat):' + this.valuePattern();
  }

  gambitValueToFilterValue(value: string): string[] {
    return [value];
  }

  fromFilter(value: any, negate: boolean): string {
    return formatMultiValueFromFilter(this.key(), value, negate);
  }

  values(): (string | GambitValueOption)[] {
    const hasRecentlyFailed = CategoryGambit.lastLoadFailedAt && Date.now() - CategoryGambit.lastLoadFailedAt < CategoryGambit.RETRY_COOLDOWN_MS;

    if (!CategoryGambit.loadedCategories && !CategoryGambit.loadingCategories && !hasRecentlyFailed) {
      CategoryGambit.loadingCategories = true;
      loadCategories()
        .then(() => {
          CategoryGambit.loadedCategories = true;
          m.redraw();
        })
        .catch(() => {
          CategoryGambit.lastLoadFailedAt = Date.now();
        })
        .finally(() => {
          CategoryGambit.loadingCategories = false;
        });
    }

    return ((app.store.all('linkrobins-support-categories') || []) as any[])
      .map(
        (cat: any): GambitValueOption => ({
          value: cat.slug(),
          label: cat.name(),
        })
      )
      .filter((opt) => !!opt.value);
  }
}
